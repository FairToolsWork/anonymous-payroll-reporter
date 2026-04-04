/**
 * Builds a compact, JSON-serialisable snapshot of a report run.
 * Contains no Maps, Date objects, or base64 blobs — safe for JSON.stringify.
 *
 * @param {any[]} records - Parsed payroll records
 * @param {{ entries: any[] } | null} reportContext - Report context produced by buildReport
 * @param {{ entries: any[] } | null} [contributionData] - Parsed contribution data
 * @param {{ includeFlagDetails?: boolean, includePayeDiagnostics?: boolean } | null} [options] - Optional snapshot expansion controls
 * @returns {{
 *   recordCount: number,
 *   contributionEntries: number,
 *   payeMismatchDiagnostics?: Array<{
 *     period: string,
 *     taxCode: string | null,
 *     region: string | null,
 *     periodIndex: number | null,
 *     payeTax: number | null,
 *     expectedPaye: number | null,
 *     payeDifference: number | null,
 *     cumulativeAllowance: number | null,
 *     taxableYtd: number | null,
 *     expectedTaxYtd: number | null,
 *     priorTaxPaid: number | null,
 *     calculationMode: string | null,
 *     cumulativeMode: string | null,
 *     expectedPayeExact: number | null,
 *     expectedPayeSageApprox: number | null,
 *     expectedPayeTableMode: number | null,
 *     expectedTaxYtdExact: number | null,
 *     expectedTaxYtdSageApprox: number | null,
 *     expectedTaxYtdTableMode: number | null
 *   }>,
 *   entries: Array<{
 *     period: string,
 *     netPay: number,
 *     basicHours: number,
 *     basicRate: number | null,
 *     holidayHours: number,
 *     holidayRate: number | null,
 *     salariedPay: number,
 *     payeTax: number,
 *     pensionEE: number,
 *     flagIds: string[],
 *     flagDetails?: Array<{
 *       id: string,
 *       label: string,
 *       severity: 'notice' | 'warning' | null,
 *       ruleId: string | null,
 *       inputs: Record<string, number | string | null>
 *     }>
 *   }>
 * }}
 */
export function buildRunSnapshot(
    records,
    reportContext,
    contributionData,
    options = null
) {
    const recordCount = Array.isArray(records) ? records.length : 0
    const contributionEntries = contributionData?.entries?.length ?? 0
    const contextEntries = reportContext?.entries ?? []
    const includeFlagDetails = options?.includeFlagDetails === true
    const includePayeDiagnostics = options?.includePayeDiagnostics === true

    /**
     * @typedef {{
     *   id: string,
     *   label: string,
     *   severity: 'notice' | 'warning' | null,
     *   ruleId: string | null,
     *   inputs: Record<string, number | string | null>
     * }} FlagDetail
     */

    /**
     * @typedef {{
     *   period: string,
     *   netPay: number,
     *   basicHours: number,
     *   basicRate: number | null,
     *   holidayHours: number,
     *   holidayRate: number | null,
     *   salariedPay: number,
     *   payeTax: number,
     *   pensionEE: number,
     *   flagIds: string[],
     *   flagDetails?: FlagDetail[]
     * }} SnapshotEntry
     */

    /**
     * @typedef {{
     *   period: string,
     *   taxCode: string | null,
     *   region: string | null,
     *   periodIndex: number | null,
     *   payeTax: number | null,
     *   expectedPaye: number | null,
     *   payeDifference: number | null,
     *   cumulativeAllowance: number | null,
     *   taxableYtd: number | null,
     *   expectedTaxYtd: number | null,
     *   priorTaxPaid: number | null,
     *   calculationMode: string | null,
     *   cumulativeMode: string | null,
     *   expectedPayeExact: number | null,
     *   expectedPayeSageApprox: number | null,
     *   expectedPayeTableMode: number | null,
     *   expectedTaxYtdExact: number | null,
     *   expectedTaxYtdSageApprox: number | null,
     *   expectedTaxYtdTableMode: number | null
     * }} PayeMismatchDiagnostic
     */

    /** @type {PayeMismatchDiagnostic[]} */
    const payeMismatchDiagnostics = []

    const entries = contextEntries.map((entry) => {
        const payrollDoc = entry.record?.payrollDoc ?? {}
        const hourly = payrollDoc.payments?.hourly ?? {}
        const basic = hourly.basic ?? {}
        const holiday = hourly.holiday ?? {}
        const deductions = payrollDoc.deductions ?? {}

        const salariedBasic = payrollDoc.payments?.salary?.basic ?? {}
        const period = payrollDoc.processDate?.date ?? 'Unknown'
        const netPay = payrollDoc.netPay?.amount ?? 0
        const basicHours = basic.units ?? 0
        const basicAmount = basic.amount ?? 0
        const basicRate =
            basic.rate != null
                ? basic.rate
                : basicHours > 0 && basicAmount > 0
                  ? basicAmount / basicHours
                  : null
        const holidayHours = holiday.units ?? 0
        const holidayAmount = holiday.amount ?? 0
        const holidayRate =
            holiday.rate != null
                ? holiday.rate
                : holidayHours > 0 && holidayAmount > 0
                  ? holidayAmount / holidayHours
                  : null
        const salariedPay = salariedBasic.amount ?? 0
        const payeTax = deductions.payeTax?.amount ?? 0
        const pensionEE = deductions.pensionEE?.amount ?? 0
        const rawFlags = entry.validation?.flags ?? []
        const flagIds = rawFlags
            .map((/** @type {{ id: string }} */ f) => f.id)
            .sort()
        const flagDetails = /** @type {FlagDetail[]} */ (
            rawFlags
                .map(
                    (
                        /** @type {{ id?: string, label?: string, severity?: string, ruleId?: string, inputs?: Record<string, unknown> }} */ flag
                    ) => {
                        const severity =
                            flag?.severity === 'notice' ||
                            flag?.severity === 'warning'
                                ? flag.severity
                                : null
                        const inputs =
                            /** @type {Record<string, number | string | null>} */ ({})
                        if (flag?.inputs && typeof flag.inputs === 'object') {
                            Object.entries(flag.inputs).forEach(
                                ([key, value]) => {
                                    if (
                                        typeof value === 'number' ||
                                        typeof value === 'string' ||
                                        value === null
                                    ) {
                                        inputs[key] = value
                                    }
                                }
                            )
                        }
                        return {
                            id: String(flag?.id || 'unknown_flag'),
                            label: String(flag?.label || ''),
                            severity,
                            ruleId: flag?.ruleId ? String(flag.ruleId) : null,
                            inputs,
                        }
                    }
                )
                .sort(
                    (
                        /** @type {FlagDetail} */ a,
                        /** @type {FlagDetail} */ b
                    ) => a.id.localeCompare(b.id)
                )
        )

        const snapshotEntry = /** @type {SnapshotEntry} */ ({
            period,
            netPay,
            basicHours,
            basicRate,
            holidayHours,
            holidayRate,
            salariedPay,
            payeTax,
            pensionEE,
            flagIds,
        })

        if (includeFlagDetails) {
            snapshotEntry.flagDetails = flagDetails
        }

        if (includePayeDiagnostics) {
            const payeMismatchFlag = flagDetails.find(
                (flag) => flag.id === 'paye_mismatch'
            )
            if (payeMismatchFlag) {
                const inputs = payeMismatchFlag.inputs || {}
                /** @param {string} key */
                const valueOrNull = (key) => {
                    const value = inputs[key]
                    return typeof value === 'number' ? value : null
                }
                /** @param {string} key */
                const stringOrNull = (key) => {
                    const value = inputs[key]
                    return typeof value === 'string' ? value : null
                }
                payeMismatchDiagnostics.push({
                    period,
                    taxCode: stringOrNull('taxCode'),
                    region: stringOrNull('region'),
                    periodIndex: valueOrNull('periodIndex'),
                    payeTax: valueOrNull('payeTax'),
                    expectedPaye: valueOrNull('expectedPaye'),
                    payeDifference: valueOrNull('payeDifference'),
                    cumulativeAllowance: valueOrNull('cumulativeAllowance'),
                    taxableYtd: valueOrNull('taxableYtd'),
                    expectedTaxYtd: valueOrNull('expectedTaxYtd'),
                    priorTaxPaid: valueOrNull('priorTaxPaid'),
                    calculationMode: stringOrNull('payeCalculationMode'),
                    cumulativeMode: stringOrNull('payeCumulativeMode'),
                    expectedPayeExact: valueOrNull('expectedPayeExact'),
                    expectedPayeSageApprox: valueOrNull(
                        'expectedPayeSageApprox'
                    ),
                    expectedPayeTableMode: valueOrNull('expectedPayeTableMode'),
                    expectedTaxYtdExact: valueOrNull('expectedTaxYtdExact'),
                    expectedTaxYtdSageApprox: valueOrNull(
                        'expectedTaxYtdSageApprox'
                    ),
                    expectedTaxYtdTableMode: valueOrNull(
                        'expectedTaxYtdTableMode'
                    ),
                })
            }
        }

        return snapshotEntry
    })

    const snapshot = /** @type {{
     *   recordCount: number,
     *   contributionEntries: number,
     *   entries: SnapshotEntry[],
     *   payeMismatchDiagnostics?: PayeMismatchDiagnostic[]
     * }} */ ({
        recordCount,
        contributionEntries,
        entries,
    })
    if (includePayeDiagnostics) {
        snapshot.payeMismatchDiagnostics = payeMismatchDiagnostics
    }

    return snapshot
}
