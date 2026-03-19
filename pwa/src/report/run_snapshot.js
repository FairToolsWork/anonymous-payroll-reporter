/**
 * Builds a compact, JSON-serialisable snapshot of a report run.
 * Contains no Maps, Date objects, or base64 blobs — safe for JSON.stringify.
 *
 * @param {any[]} records - Parsed payroll records
 * @param {{ entries: any[] } | null} reportContext - Report context produced by buildReport
 * @param {{ entries: any[] } | null} [contributionData] - Parsed contribution data
 * @returns {{
 *   recordCount: number,
 *   contributionEntries: number,
 *   entries: Array<{
 *     period: string,
 *     netPay: number,
 *     basicHours: number,
 *     basicRate: number | null,
 *     holidayHours: number,
 *     holidayRate: number | null,
 *     payeTax: number,
 *     pensionEE: number,
 *     flagIds: string[]
 *   }>
 * }}
 */
export function buildRunSnapshot(records, reportContext, contributionData) {
    const recordCount = Array.isArray(records) ? records.length : 0
    const contributionEntries = contributionData?.entries?.length ?? 0
    const contextEntries = reportContext?.entries ?? []

    const entries = contextEntries.map((entry) => {
        const payrollDoc = entry.record?.payrollDoc ?? {}
        const hourly = payrollDoc.payments?.hourly ?? {}
        const basic = hourly.basic ?? {}
        const holiday = hourly.holiday ?? {}
        const deductions = payrollDoc.deductions ?? {}

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
        const payeTax = deductions.payeTax?.amount ?? 0
        const pensionEE = deductions.pensionEE?.amount ?? 0
        const rawFlags = entry.validation?.flags ?? []
        const flagIds = rawFlags
            .map((/** @type {{ id: string }} */ f) => f.id)
            .sort()

        return {
            period,
            netPay,
            basicHours,
            basicRate,
            holidayHours,
            holidayRate,
            payeTax,
            pensionEE,
            flagIds,
        }
    })

    return { recordCount, contributionEntries, entries }
}
