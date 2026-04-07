/**
 * @fileoverview Hourly worker-specific validation functions.
 * Handles PAYE cumulative calculations, pension auto-enrolment timing,
 * and pension deferment logic. These validators apply only to hourly records.
 *
 * Phase 2 of calculation module seam extraction.
 */

/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', ruleId?: string, inputs?: Record<string, number | string | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecord, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, workerProfile?: { payrollRunStartDate?: string | null, pensionDefermentCommunicated?: boolean, pensionDefermentStartDate?: string | null, pensionDefermentEndDate?: string | null } | null }} HourlyPayEntry
 */

import {
    roundMoney,
    buildCatalogFlag,
    buildCatalogRuleFlag,
    hasUsableThresholds,
    hasUsablePensionThresholds,
    getPeriodizedAnnualAmountByMode,
    resolvePayeCumulativeMode,
    calculateTaxFromBands,
    calculatePeriodOnlyPaye,
    isWithinPayeTolerance,
    isWithinTolerance,
    TABLE_MODE_PAYE_VALIDATION_TOLERANCE,
    sumPayments,
    sumDeductionsForNetPay,
    normalizeToDateOnly,
    parseIsoDateInput,
    addMonths,
    getElapsedDays,
} from './pay_calculations_shared.js'
import { FLAG_CATALOG, formatFlagLabel } from './flag_catalog.js'
import {
    resolveTaxYearThresholdsForContext,
    getPeriodizedAnnualAmount,
    getPayPeriodsPerYear,
    parsePayeTaxCode,
    getIncomeTaxBandsForRegion,
    getPayPeriodIndexForDate,
    formatTaxYearLabelFromStartYear,
    PAYE_VALIDATION_TOLERANCE,
} from './uk_thresholds.js'

/**
 * Determines pension enrollment timing context from worker profile.
 * @param {HourlyPayEntry} entry
 * @returns {{
 *   payrollRunStartDate: string | null,
 *   elapsedRunDays: number | null,
 *   exceedsSixWeekWindow: boolean,
 *   exceedsThreeMonthWindow: boolean,
 * }}
 */
export function resolvePensionTimingContext(entry) {
    const profile = entry.workerProfile || null
    const payrollRunStartDate =
        typeof profile?.payrollRunStartDate === 'string' &&
        profile.payrollRunStartDate.trim()
            ? profile.payrollRunStartDate.trim()
            : null
    const parsedRunStartDate = parseIsoDateInput(payrollRunStartDate)
    const parsedEntryDate = normalizeToDateOnly(entry.parsedDate)
    const hasElapsedRunTiming =
        !!parsedRunStartDate &&
        !!parsedEntryDate &&
        parsedEntryDate.getTime() >= parsedRunStartDate.getTime()
    const elapsedRunDays = hasElapsedRunTiming
        ? getElapsedDays(parsedRunStartDate, parsedEntryDate)
        : null
    const exceedsSixWeekWindow = elapsedRunDays !== null && elapsedRunDays > 42
    const exceedsThreeMonthWindow =
        hasElapsedRunTiming &&
        parsedEntryDate.getTime() >= addMonths(parsedRunStartDate, 3).getTime()
    return {
        payrollRunStartDate,
        elapsedRunDays,
        exceedsSixWeekWindow,
        exceedsThreeMonthWindow,
    }
}

/**
 * Determines if pension deferment information is incomplete or problematic.
 * @param {HourlyPayEntry} entry
 * @returns {boolean}
 */
export function isDefermentProblematicForPension(entry) {
    const profile = entry.workerProfile || null
    const pensionDefermentCommunicated =
        profile?.pensionDefermentCommunicated ?? false
    const startDateStr = profile?.pensionDefermentStartDate
    const endDateStr = profile?.pensionDefermentEndDate

    if (!pensionDefermentCommunicated) {
        return false
    }

    const parsedStartDate = parseIsoDateInput(startDateStr)
    const parsedEndDate = parseIsoDateInput(endDateStr)

    if (!parsedStartDate || !parsedEndDate || parsedEndDate < parsedStartDate) {
        return true
    }

    return false
}

/**
 * Builds PAYE tax validation flags for hourly workers.
 * @param {HourlyPayEntry} entry
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @param {number} payeTax
 * @returns {{ flag: ValidationFlag | null, lowConfidence: boolean }}
 */
export function buildPayeValidationFlag(entry, thresholdResolution, payeTax) {
    const thresholds = thresholdResolution.thresholds
    if (!hasUsableThresholds(thresholdResolution)) {
        return {
            flag: null,
            lowConfidence: thresholdResolution.status !== 'ok',
        }
    }
    if (!thresholds) {
        throw new Error(
            'buildPayeValidationFlag: usable thresholds missing after hasUsableThresholds check'
        )
    }

    const payrollDoc = entry.record?.payrollDoc || {}
    const payCycle =
        payrollDoc?.thisPeriod?.payCycle?.cycle ||
        (Number.isFinite(entry.monthIndex) ? 'Monthly' : null)
    const periodsPerYear = getPayPeriodsPerYear(payCycle)
    if (periodsPerYear === null) {
        return {
            flag: buildCatalogRuleFlag(
                FLAG_CATALOG.paye_pay_cycle_unsupported,
                {
                    label: formatFlagLabel(
                        FLAG_CATALOG.paye_pay_cycle_unsupported.id,
                        {
                            context: 'reported_pay_cycle',
                            payCycle: String(payCycle || 'Unknown'),
                        }
                    ),
                    severity: 'warning',
                    inputs: {
                        payCycle: String(payCycle || 'unknown'),
                        payeTax,
                    },
                }
            ),
            lowConfidence: true,
        }
    }

    const parsedTaxCode = parsePayeTaxCode(payrollDoc?.taxCode?.code || '')
    if (!parsedTaxCode.normalizedCode) {
        if (payeTax > 0) {
            return { flag: null, lowConfidence: false }
        }
        return {
            flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_zero, {
                label: formatFlagLabel(FLAG_CATALOG.paye_zero.id, {
                    context: 'missing_tax_code',
                }),
                severity: 'warning',
                inputs: {
                    payeTax,
                    expectedPaye: null,
                    taxCode: null,
                },
            }),
            lowConfidence: true,
        }
    }
    if (!parsedTaxCode.isStandardCode) {
        return {
            flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_tax_code_unsupported, {
                label: formatFlagLabel(
                    FLAG_CATALOG.paye_tax_code_unsupported.id,
                    {
                        context: 'reported_tax_code',
                        taxCode: parsedTaxCode.normalizedCode || 'Unknown',
                    }
                ),
                severity: 'warning',
                inputs: { taxCode: parsedTaxCode.normalizedCode || null },
            }),
            lowConfidence: true,
        }
    }

    const bandSelection = getIncomeTaxBandsForRegion(
        thresholds,
        parsedTaxCode.region
    )
    if (!bandSelection) {
        return {
            flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_tax_code_unsupported, {
                label: formatFlagLabel(
                    FLAG_CATALOG.paye_tax_code_unsupported.id,
                    {
                        context: 'region_unknown',
                    }
                ),
                severity: 'warning',
                inputs: { taxCode: parsedTaxCode.normalizedCode || null },
            }),
            lowConfidence: true,
        }
    }

    const periodIndex = parsedTaxCode.isEmergency
        ? 1
        : getPayPeriodIndexForDate(entry.parsedDate, periodsPerYear)
    if (periodIndex === null) {
        return {
            flag: buildCatalogRuleFlag(
                FLAG_CATALOG.paye_pay_cycle_unsupported,
                {
                    label: formatFlagLabel(
                        FLAG_CATALOG.paye_pay_cycle_unsupported.id,
                        {
                            context: 'period_position_unknown',
                        }
                    ),
                    severity: 'warning',
                    inputs: { payCycle: String(payCycle || 'unknown') },
                }
            ),
            lowConfidence: true,
        }
    }

    const currentGrossForTax =
        payrollDoc?.thisPeriod?.grossForTax?.amount ??
        payrollDoc?.thisPeriod?.totalGrossPay?.amount ??
        sumPayments(entry.record)
    const grossForTaxTD = payrollDoc?.yearToDate?.grossForTaxTD ?? null
    const taxPaidTD = payrollDoc?.yearToDate?.taxPaidTD ?? null
    const annualAllowance = thresholds.personalAllowanceAnnual
    const completedPeriods = parsedTaxCode.isEmergency ? 1 : periodIndex
    const payeCumulativeMode = resolvePayeCumulativeMode()

    const periodOnlyPaye = calculatePeriodOnlyPaye(
        currentGrossForTax,
        annualAllowance,
        bandSelection.bands,
        periodsPerYear,
        payeCumulativeMode
    )

    let expectedPaye = null
    let explanation = ''
    let calculationMode = 'cumulative'
    let cumulativeAllowance = null
    let taxableYtd = null
    let expectedTaxYtd = null
    let priorTaxPaid = null
    let expectedPayeExact = null
    let expectedPayeSageApprox = null
    let expectedTaxYtdExact = null
    let expectedTaxYtdSageApprox = null
    let expectedPayeTableMode = null
    let expectedTaxYtdTableMode = null

    if (parsedTaxCode.isEmergency) {
        calculationMode = 'emergency-period-only'
        expectedPaye = periodOnlyPaye.expectedPaye
        explanation = formatFlagLabel(FLAG_CATALOG.paye_mismatch.id, {
            context: 'explanation_emergency',
            taxCode: parsedTaxCode.normalizedCode,
            periodTrigger: periodOnlyPaye.allowanceThisPeriod,
            payCycle: String(payCycle),
        })
    } else if (!Number.isFinite(grossForTaxTD) || !Number.isFinite(taxPaidTD)) {
        if (payeTax > 0) {
            return { flag: null, lowConfidence: true }
        }
        calculationMode = 'period-only-approximation'
        expectedPaye = periodOnlyPaye.expectedPaye
        explanation = formatFlagLabel(FLAG_CATALOG.paye_mismatch.id, {
            context: 'explanation_period_only',
            periodTrigger: periodOnlyPaye.allowanceThisPeriod,
        })
    } else {
        const cumulativeAllowanceExact = getPeriodizedAnnualAmountByMode(
            annualAllowance,
            completedPeriods,
            periodsPerYear,
            'exact'
        )
        const cumulativeAllowanceSageApprox = getPeriodizedAnnualAmountByMode(
            annualAllowance,
            completedPeriods,
            periodsPerYear,
            'sage_approx'
        )
        const cumulativeAllowanceTableMode = getPeriodizedAnnualAmountByMode(
            annualAllowance,
            completedPeriods,
            periodsPerYear,
            'table_mode'
        )
        const taxableYtdExact = Math.max(
            0,
            grossForTaxTD - cumulativeAllowanceExact
        )
        const taxableYtdSageApprox = Math.max(
            0,
            grossForTaxTD - cumulativeAllowanceSageApprox
        )
        const taxableYtdTableMode = Math.max(
            0,
            Math.floor(grossForTaxTD - cumulativeAllowanceTableMode)
        )
        expectedTaxYtdExact = calculateTaxFromBands(
            taxableYtdExact,
            bandSelection.bands,
            completedPeriods,
            periodsPerYear,
            'exact'
        )
        expectedTaxYtdSageApprox = calculateTaxFromBands(
            taxableYtdSageApprox,
            bandSelection.bands,
            completedPeriods,
            periodsPerYear,
            'sage_approx'
        )
        expectedTaxYtdTableMode = calculateTaxFromBands(
            taxableYtdTableMode,
            bandSelection.bands,
            completedPeriods,
            periodsPerYear,
            'table_mode'
        )
        priorTaxPaid = roundMoney(taxPaidTD - payeTax)
        expectedPayeExact = roundMoney(expectedTaxYtdExact - priorTaxPaid)
        expectedPayeSageApprox = roundMoney(
            expectedTaxYtdSageApprox - priorTaxPaid
        )
        expectedPayeTableMode = roundMoney(
            expectedTaxYtdTableMode - priorTaxPaid
        )

        if (payeCumulativeMode === 'sage_approx') {
            cumulativeAllowance = cumulativeAllowanceSageApprox
            taxableYtd = taxableYtdSageApprox
            expectedTaxYtd = expectedTaxYtdSageApprox
            expectedPaye = expectedPayeSageApprox
        } else if (payeCumulativeMode === 'table_mode') {
            cumulativeAllowance = cumulativeAllowanceTableMode
            taxableYtd = taxableYtdTableMode
            expectedTaxYtd = expectedTaxYtdTableMode
            expectedPaye = expectedPayeTableMode
        } else {
            cumulativeAllowance = cumulativeAllowanceExact
            taxableYtd = taxableYtdExact
            expectedTaxYtd = expectedTaxYtdExact
            expectedPaye = expectedPayeExact
        }
        explanation = formatFlagLabel(FLAG_CATALOG.paye_mismatch.id, {
            context: 'explanation_cumulative',
            taxCode: parsedTaxCode.normalizedCode,
            grossForTaxTD,
            cumulativeAllowance,
            region: bandSelection.region,
        })
    }

    if (!Number.isFinite(expectedPaye)) {
        return { flag: null, lowConfidence: false }
    }

    const payeTolerance =
        calculationMode === 'cumulative' && payeCumulativeMode === 'table_mode'
            ? TABLE_MODE_PAYE_VALIDATION_TOLERANCE
            : PAYE_VALIDATION_TOLERANCE

    if (
        calculationMode === 'cumulative' &&
        roundMoney(payeTax) > 0 &&
        roundMoney(expectedPaye) <= 0 &&
        Number.isFinite(currentGrossForTax) &&
        currentGrossForTax <= periodOnlyPaye.allowanceThisPeriod
    ) {
        return {
            flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_taken_not_due, {
                label: formatFlagLabel(FLAG_CATALOG.paye_taken_not_due.id, {
                    payeTax,
                    expectedPaye,
                    explanation,
                }),
                severity: 'warning',
                inputs: {
                    payeTax,
                    expectedPaye,
                    periodIndex,
                    grossForTax: Number.isFinite(currentGrossForTax)
                        ? currentGrossForTax
                        : null,
                    grossForTaxTD: Number.isFinite(grossForTaxTD)
                        ? grossForTaxTD
                        : null,
                    taxPaidTD: Number.isFinite(taxPaidTD) ? taxPaidTD : null,
                    taxCode: parsedTaxCode.normalizedCode,
                    region: bandSelection.region,
                    payeCalculationMode: calculationMode,
                    payeCumulativeMode,
                    cumulativeAllowance,
                    taxableYtd,
                    expectedTaxYtd,
                },
            }),
            lowConfidence: false,
        }
    }

    if (
        roundMoney(payeTax) !== 0 &&
        isWithinPayeTolerance(payeTax, expectedPaye, payeTolerance)
    ) {
        return {
            flag: null,
            lowConfidence: calculationMode === 'period-only-approximation',
        }
    }

    const difference = roundMoney(payeTax - expectedPaye)
    const isZeroFlag = roundMoney(payeTax) === 0
    const isSignificantMismatch = Math.abs(difference) > payeTolerance
    const severity = isSignificantMismatch ? 'warning' : 'notice'
    const label = formatFlagLabel(FLAG_CATALOG.paye_mismatch.id, {
        context: 'zero_or_mismatch',
        payeTax,
        expectedPaye,
        payeDifference: difference,
        isSignificantMismatch,
        explanation,
    })

    const payeCatalogEntry = isZeroFlag
        ? FLAG_CATALOG.paye_zero
        : FLAG_CATALOG.paye_mismatch

    return {
        flag: buildCatalogRuleFlag(payeCatalogEntry, {
            label,
            severity,
            inputs: {
                payeTax,
                expectedPaye,
                payeDifference: difference,
                periodIndex,
                grossForTax: Number.isFinite(currentGrossForTax)
                    ? currentGrossForTax
                    : null,
                grossForTaxTD: Number.isFinite(grossForTaxTD)
                    ? grossForTaxTD
                    : null,
                taxPaidTD: Number.isFinite(taxPaidTD) ? taxPaidTD : null,
                taxCode: parsedTaxCode.normalizedCode,
                region: bandSelection.region,
                payeCalculationMode: calculationMode,
                payeCumulativeMode:
                    calculationMode === 'cumulative'
                        ? payeCumulativeMode
                        : null,
                cumulativeAllowance,
                taxableYtd,
                expectedTaxYtd,
                priorTaxPaid,
                expectedTaxYtdExact,
                expectedTaxYtdSageApprox,
                expectedTaxYtdTableMode,
                expectedPayeExact,
                expectedPayeSageApprox,
                expectedPayeTableMode,
            },
        }),
        lowConfidence: calculationMode === 'period-only-approximation',
    }
}

/**
 * Builds pension validation flags for hourly workers.
 * @param {HourlyPayEntry} entry
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @param {number} paymentsTotal
 * @returns {{ flags: ValidationFlag[], lowConfidence: boolean }}
 */
export function buildPensionValidationFlags(
    entry,
    thresholdResolution,
    paymentsTotal
) {
    const defermentLowConfidence = isDefermentProblematicForPension(entry)
    const thresholds = thresholdResolution.thresholds
    if (!hasUsablePensionThresholds(thresholdResolution)) {
        return { flags: [], lowConfidence: false }
    }
    if (!thresholds) {
        throw new Error('Invariant violated: usable pension thresholds missing')
    }

    const payrollDoc = entry.record?.payrollDoc || {}
    const earnings =
        payrollDoc?.thisPeriod?.totalGrossPay?.amount ??
        (Number.isFinite(paymentsTotal)
            ? paymentsTotal
            : sumPayments(entry.record))
    if (!Number.isFinite(earnings)) {
        return { flags: [], lowConfidence: false }
    }

    const pensionEE = payrollDoc?.deductions?.pensionEE?.amount || 0
    const pensionER = payrollDoc?.deductions?.pensionER?.amount || 0
    const hasPensionDeductionEvidence = pensionEE > 0 || pensionER > 0

    const payCycle =
        payrollDoc?.thisPeriod?.payCycle?.cycle ||
        (Number.isFinite(entry.monthIndex) ? 'Monthly' : null)
    const periodsPerYear = getPayPeriodsPerYear(payCycle)
    if (periodsPerYear === null) {
        return { flags: [], lowConfidence: false }
    }
    const periodLabel = periodsPerYear === 52 ? 'weekly' : 'monthly'

    const autoEnrolmentTrigger = getPeriodizedAnnualAmount(
        thresholds.pensionAutoEnrolmentTriggerAnnual,
        1,
        periodsPerYear
    )
    const qualifyingLower = getPeriodizedAnnualAmount(
        thresholds.pensionQualifyingEarningsLowerAnnual,
        1,
        periodsPerYear
    )
    const qualifyingUpper = getPeriodizedAnnualAmount(
        thresholds.pensionQualifyingEarningsUpperAnnual,
        1,
        periodsPerYear
    )

    const timingContext = resolvePensionTimingContext(entry)
    const sharedInputs = {
        earnings,
        periodAutoEnrolmentTrigger: autoEnrolmentTrigger,
        periodQualifyingEarningsLower: qualifyingLower,
        periodQualifyingEarningsUpper: qualifyingUpper,
        annualAutoEnrolmentTrigger:
            thresholds.pensionAutoEnrolmentTriggerAnnual,
        annualQualifyingEarningsLower:
            thresholds.pensionQualifyingEarningsLowerAnnual,
        annualQualifyingEarningsUpper:
            thresholds.pensionQualifyingEarningsUpperAnnual,
        pensionEE,
        pensionER,
        payrollRunStartDate: timingContext.payrollRunStartDate,
        elapsedRunDays:
            timingContext.elapsedRunDays === null
                ? null
                : timingContext.elapsedRunDays,
        exceedsSixWeekWindow: timingContext.exceedsSixWeekWindow ? 'yes' : 'no',
        exceedsThreeMonthWindow: timingContext.exceedsThreeMonthWindow
            ? 'yes'
            : 'no',
        taxYearStart:
            thresholdResolution.taxYearStart === null
                ? null
                : thresholdResolution.taxYearStart,
        periodLabel,
    }

    if (pensionER > 0 && earnings < qualifyingLower) {
        return {
            flags: [
                buildCatalogRuleFlag(
                    FLAG_CATALOG.pension_employer_contrib_not_required,
                    {
                        label: formatFlagLabel(
                            FLAG_CATALOG.pension_employer_contrib_not_required
                                .id,
                            {
                                earnings,
                                qualifyingLower,
                                periodLabel,
                                pensionER,
                            }
                        ),
                        severity: 'warning',
                        inputs: sharedInputs,
                    }
                ),
            ],
            lowConfidence: false,
        }
    }

    if (hasPensionDeductionEvidence) {
        return { flags: [], lowConfidence: false }
    }

    const pensionAutoEnrolmentMissingDeductionsCatalog =
        FLAG_CATALOG.pension_auto_enrolment_missing_deductions
    const pensionOptInPossibleCatalog = FLAG_CATALOG.pension_opt_in_possible
    const pensionJoinNoMandatoryEmployerContribCatalog =
        FLAG_CATALOG.pension_join_no_mandatory_employer_contrib

    if (earnings >= autoEnrolmentTrigger) {
        if (timingContext.exceedsThreeMonthWindow) {
            return {
                flags: [
                    buildCatalogRuleFlag(
                        pensionAutoEnrolmentMissingDeductionsCatalog,
                        {
                            label: formatFlagLabel(
                                pensionAutoEnrolmentMissingDeductionsCatalog.id,
                                {
                                    context: 'three_month_warning',
                                    earnings,
                                    periodTrigger: autoEnrolmentTrigger,
                                    elapsedRunDays:
                                        timingContext.elapsedRunDays,
                                }
                            ),
                            severity: 'warning',
                            inputs: sharedInputs,
                        }
                    ),
                ],
                lowConfidence: defermentLowConfidence,
            }
        }

        if (timingContext.exceedsSixWeekWindow) {
            return {
                flags: [
                    buildCatalogRuleFlag(
                        pensionAutoEnrolmentMissingDeductionsCatalog,
                        {
                            label: formatFlagLabel(
                                pensionAutoEnrolmentMissingDeductionsCatalog.id,
                                {
                                    context: 'six_week_notice',
                                    earnings,
                                    periodTrigger: autoEnrolmentTrigger,
                                    elapsedRunDays:
                                        timingContext.elapsedRunDays,
                                }
                            ),
                            severity: 'notice',
                            inputs: sharedInputs,
                        }
                    ),
                ],
                lowConfidence: defermentLowConfidence,
            }
        }

        if (timingContext.elapsedRunDays !== null) {
            return {
                flags: [
                    buildCatalogRuleFlag(
                        pensionAutoEnrolmentMissingDeductionsCatalog,
                        {
                            label: formatFlagLabel(
                                pensionAutoEnrolmentMissingDeductionsCatalog.id,
                                {
                                    context: 'pre_enrolment_notice',
                                    earnings,
                                    periodTrigger: autoEnrolmentTrigger,
                                }
                            ),
                            severity: 'notice',
                            inputs: sharedInputs,
                        }
                    ),
                ],
                lowConfidence: defermentLowConfidence,
            }
        }

        return {
            flags: [
                buildCatalogRuleFlag(
                    pensionAutoEnrolmentMissingDeductionsCatalog,
                    {
                        label: formatFlagLabel(
                            pensionAutoEnrolmentMissingDeductionsCatalog.id,
                            {
                                context: 'default_warning',
                                earnings,
                                periodTrigger: autoEnrolmentTrigger,
                            }
                        ),
                        severity: 'warning',
                        inputs: sharedInputs,
                    }
                ),
            ],
            lowConfidence: defermentLowConfidence,
        }
    }

    if (earnings >= qualifyingLower) {
        return {
            flags: [
                buildCatalogRuleFlag(pensionOptInPossibleCatalog, {
                    label: formatFlagLabel(pensionOptInPossibleCatalog.id, {
                        earnings,
                        qualifyingLower,
                        autoEnrolmentTrigger,
                    }),
                    severity: 'notice',
                    inputs: sharedInputs,
                }),
            ],
            lowConfidence: defermentLowConfidence,
        }
    }

    return {
        flags: [
            buildCatalogRuleFlag(pensionJoinNoMandatoryEmployerContribCatalog, {
                label: formatFlagLabel(
                    pensionJoinNoMandatoryEmployerContribCatalog.id,
                    {
                        earnings,
                        qualifyingLower,
                    }
                ),
                severity: 'notice',
                inputs: sharedInputs,
            }),
        ],
        lowConfidence: defermentLowConfidence,
    }
}

/**
 * Validates a payroll entry and returns a set of flags describing anomalies.
 *
 * Flag priority cascade (to avoid redundant overlapping warnings):
 * - payment_line_mismatch fires → gross_mismatch and net_mismatch suppressed
 * - gross_mismatch fires → net_mismatch suppressed
 *
 * @param {HourlyPayEntry} entry
 * @returns {ValidationResult}
 */
export function buildValidation(entry) {
    const record = entry.record
    const flags = /** @type {ValidationFlag[]} */ ([])
    const natInsNumber = record.employee?.natInsNumber || ''
    const taxCode = record.payrollDoc?.taxCode?.code || ''
    const payeTax = record.payrollDoc?.deductions?.payeTax?.amount || 0
    const nationalInsurance = record.payrollDoc?.deductions?.natIns?.amount || 0
    const totalGrossPay =
        record.payrollDoc?.thisPeriod?.totalGrossPay?.amount ?? null
    const netPay = record.payrollDoc?.netPay?.amount ?? null
    const paymentsTotal = sumPayments(record)
    const deductionsTotal = sumDeductionsForNetPay(record)
    const thresholdResolution = resolveTaxYearThresholdsForContext(
        entry.parsedDate,
        entry.yearKey
    )
    const thresholds = thresholdResolution.thresholds
    const niPrimaryThresholdMonthly =
        thresholds?.niPrimaryThresholdMonthly ?? null
    const grossForNiContext =
        typeof totalGrossPay === 'number' ? totalGrossPay : paymentsTotal
    const canRunThresholdDrivenChecks = hasUsableThresholds(thresholdResolution)

    if (thresholdResolution.status !== 'ok') {
        const thresholdCatalogEntry =
            thresholdResolution.status === 'partial-threshold-support'
                ? FLAG_CATALOG.tax_year_thresholds_partial_support
                : FLAG_CATALOG.tax_year_thresholds_unavailable
        const warningLabel = formatFlagLabel(thresholdCatalogEntry.id, {
            context:
                thresholdResolution.status === 'fallback-to-previous-tax-year'
                    ? 'fallback-to-previous-tax-year'
                    : thresholdResolution.status === 'unsupported-tax-year'
                      ? 'unsupported-tax-year'
                      : thresholdResolution.status ===
                          'partial-threshold-support'
                        ? 'partial-threshold-support'
                        : 'unknown-tax-year',
            taxYearStartLabel: formatTaxYearLabelFromStartYear(
                thresholdResolution.taxYearStart
            ),
            fallbackTaxYearStartLabel: formatTaxYearLabelFromStartYear(
                thresholdResolution.fallbackTaxYearStart
            ),
        })
        flags.push({
            ...buildCatalogRuleFlag(thresholdCatalogEntry, {
                label: warningLabel,
                severity: thresholdCatalogEntry.severity,
                inputs: {
                    taxYearStart:
                        thresholdResolution.taxYearStart === null
                            ? null
                            : thresholdResolution.taxYearStart,
                    fallbackTaxYearStart:
                        thresholdResolution.fallbackTaxYearStart === null
                            ? null
                            : thresholdResolution.fallbackTaxYearStart,
                },
            }),
        })
    }

    if (!natInsNumber) {
        flags.push(buildCatalogFlag(FLAG_CATALOG.missing_nat_ins))
    }
    if (!taxCode) {
        flags.push(buildCatalogFlag(FLAG_CATALOG.missing_tax_code))
    }
    const payeValidation = buildPayeValidationFlag(
        entry,
        thresholdResolution,
        payeTax
    )
    if (payeValidation.flag) {
        flags.push(payeValidation.flag)
    }

    const pensionValidation = buildPensionValidationFlags(
        entry,
        thresholdResolution,
        paymentsTotal
    )
    if (pensionValidation.flags.length) {
        flags.push(...pensionValidation.flags)
    }

    if (
        nationalInsurance <= 0 &&
        niPrimaryThresholdMonthly !== null &&
        canRunThresholdDrivenChecks
    ) {
        const isNiWarning =
            typeof grossForNiContext === 'number' &&
            grossForNiContext > niPrimaryThresholdMonthly
        const niLabel = formatFlagLabel(FLAG_CATALOG.nat_ins_zero.id, {
            context: isNiWarning
                ? 'above_threshold_warning'
                : 'at_or_below_threshold_notice',
            grossPay: grossForNiContext,
            niPrimaryThresholdMonthly,
        })
        flags.push(
            buildCatalogRuleFlag(FLAG_CATALOG.nat_ins_zero, {
                label: niLabel,
                severity: isNiWarning ? 'warning' : 'notice',
                inputs: {
                    nationalInsurance,
                    grossPay: grossForNiContext,
                    niPrimaryThresholdMonthly,
                },
            })
        )
    }

    if (
        nationalInsurance > 0 &&
        niPrimaryThresholdMonthly !== null &&
        canRunThresholdDrivenChecks &&
        typeof grossForNiContext === 'number' &&
        grossForNiContext <= niPrimaryThresholdMonthly
    ) {
        flags.push(
            buildCatalogRuleFlag(FLAG_CATALOG.nat_ins_taken_below_threshold, {
                label: formatFlagLabel(
                    FLAG_CATALOG.nat_ins_taken_below_threshold.id,
                    {
                        nationalInsurance,
                        grossPay: grossForNiContext,
                        niPrimaryThresholdMonthly,
                    }
                ),
                severity: 'warning',
                inputs: {
                    nationalInsurance,
                    grossPay: grossForNiContext,
                    niPrimaryThresholdMonthly,
                },
            })
        )
    }

    const hourly = record?.payrollDoc?.payments?.hourly
    const salaryHoliday = record?.payrollDoc?.payments?.salary?.holiday
    const hourlyItems = [hourly?.basic, hourly?.holiday, salaryHoliday]
    for (const item of hourlyItems) {
        if (
            item &&
            item.units !== null &&
            item.units !== undefined &&
            item.rate !== null &&
            item.rate !== undefined &&
            item.amount !== null &&
            item.amount !== undefined
        ) {
            const expected = Math.round(item.units * item.rate * 100) / 100
            if (!isWithinTolerance(expected, item.amount)) {
                flags.push(
                    buildCatalogRuleFlag(FLAG_CATALOG.payment_line_mismatch, {
                        inputs: { computed: expected, reported: item.amount },
                    })
                )
                break
            }
        }
    }

    const hasPaymentLineMismatch = flags.some(
        (f) => f.id === FLAG_CATALOG.payment_line_mismatch.id
    )

    let grossMismatch = false
    if (totalGrossPay !== null && !hasPaymentLineMismatch) {
        grossMismatch = !isWithinTolerance(paymentsTotal, totalGrossPay)
        if (grossMismatch) {
            flags.push(
                buildCatalogRuleFlag(FLAG_CATALOG.gross_mismatch, {
                    inputs: {
                        computed: paymentsTotal,
                        reported: totalGrossPay,
                    },
                })
            )
        }
    }

    let netMismatch = false
    if (netPay !== null && !hasPaymentLineMismatch && !grossMismatch) {
        const expectedNet = paymentsTotal - deductionsTotal
        netMismatch = !isWithinTolerance(expectedNet, netPay)
        if (netMismatch) {
            flags.push(
                buildCatalogRuleFlag(FLAG_CATALOG.net_mismatch, {
                    inputs: { computed: expectedNet, reported: netPay },
                })
            )
        }
    }

    return {
        flags,
        lowConfidence:
            grossMismatch ||
            netMismatch ||
            thresholdResolution.status !== 'ok' ||
            payeValidation.lowConfidence ||
            pensionValidation.lowConfidence,
    }
}
