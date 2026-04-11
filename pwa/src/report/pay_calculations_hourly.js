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
    isWithinTolerance,
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
                inputs: { payeTax, taxCode: null },
            }),
            lowConfidence: true,
        }
    }
    if (!parsedTaxCode.isStandardCode) {
        if (parsedTaxCode.isFlatRateCode) {
            return {
                flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_basic_rate_code, {
                    label: formatFlagLabel(
                        FLAG_CATALOG.paye_basic_rate_code.id,
                        {
                            taxCode: parsedTaxCode.normalizedCode || null,
                            region: parsedTaxCode.region || null,
                        }
                    ),
                    severity: 'notice',
                    inputs: { taxCode: parsedTaxCode.normalizedCode || null },
                }),
                lowConfidence: false,
            }
        }
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
    const annualAllowance = thresholds.personalAllowanceAnnual
    const grossForTaxTD = payrollDoc?.yearToDate?.grossForTaxTD ?? null

    const completedPeriods = parsedTaxCode.isEmergency ? 1 : periodIndex
    const hasUsableYtdGross =
        !parsedTaxCode.isEmergency && Number.isFinite(grossForTaxTD)
    const cumulativeAllowance = hasUsableYtdGross
        ? getPeriodizedAnnualAmount(
              annualAllowance,
              completedPeriods,
              periodsPerYear
          )
        : null
    const allowanceThisPeriod = getPeriodizedAnnualAmount(
        annualAllowance,
        1,
        periodsPerYear
    )

    // Determine whether earnings appear to exceed the personal allowance.
    // With YTD data we use the cumulative picture; without YTD we fall back
    // to this period only (lower confidence).
    const earningsAboveAllowance = hasUsableYtdGross
        ? Number.isFinite(cumulativeAllowance) &&
          Number(grossForTaxTD) > Number(cumulativeAllowance)
        : Number.isFinite(currentGrossForTax) &&
          currentGrossForTax > allowanceThisPeriod
    // For the YTD case, the cumulative picture is sufficient: if total
    // earnings to-date are within the cumulative allowance, no PAYE is owed
    // regardless of the current period's individual gross (which may be an
    // above-average month in a variable-pay run).
    const earningsWithinAllowance = hasUsableYtdGross
        ? Number.isFinite(cumulativeAllowance) &&
          Number(grossForTaxTD) <= Number(cumulativeAllowance)
        : Number.isFinite(currentGrossForTax) &&
          currentGrossForTax <= allowanceThisPeriod

    const payeCalculationMode = parsedTaxCode.isEmergency
        ? 'emergency-period-only'
        : hasUsableYtdGross
          ? 'period-plus-ytd-threshold'
          : 'period-only'

    const sharedInputs = {
        payeTax: roundMoney(payeTax),
        grossForTax: Number.isFinite(currentGrossForTax)
            ? currentGrossForTax
            : null,
        grossForTaxTD: Number.isFinite(grossForTaxTD) ? grossForTaxTD : null,
        periodAllowance: allowanceThisPeriod,
        cumulativeAllowance,
        periodIndex,
        taxCode: parsedTaxCode.normalizedCode,
        region: bandSelection.region,
        payeCalculationMode,
    }

    // Rule B — PAYE taken but earnings appear within the personal allowance.
    if (roundMoney(payeTax) > 0 && earningsWithinAllowance) {
        return {
            flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_taken_not_due, {
                label: formatFlagLabel(FLAG_CATALOG.paye_taken_not_due.id, {
                    payeTax,
                    grossForTax: Number.isFinite(currentGrossForTax)
                        ? currentGrossForTax
                        : null,
                    grossForTaxTD: Number.isFinite(grossForTaxTD)
                        ? grossForTaxTD
                        : null,
                    periodAllowance: allowanceThisPeriod,
                    cumulativeAllowance,
                    context: hasUsableYtdGross
                        ? 'ytd_within_allowance'
                        : 'period_within_allowance',
                }),
                severity: 'warning',
                inputs: sharedInputs,
            }),
            lowConfidence: !hasUsableYtdGross,
        }
    }

    if (roundMoney(payeTax) > 0) {
        return { flag: null, lowConfidence: false }
    }

    // Rule A — PAYE is zero: warn only when earnings appear above allowance.
    // If earnings appear within the allowance, zero PAYE is expected — no flag needed.
    if (!earningsAboveAllowance) {
        return { flag: null, lowConfidence: false }
    }

    const zeroContext = hasUsableYtdGross
        ? 'ytd_above_allowance'
        : 'period_above_allowance'

    return {
        flag: buildCatalogRuleFlag(FLAG_CATALOG.paye_zero, {
            label: formatFlagLabel(FLAG_CATALOG.paye_zero.id, {
                context: zeroContext,
                grossForTax: Number.isFinite(currentGrossForTax)
                    ? currentGrossForTax
                    : null,
                grossForTaxTD: Number.isFinite(grossForTaxTD)
                    ? grossForTaxTD
                    : null,
                periodAllowance: allowanceThisPeriod,
                cumulativeAllowance,
            }),
            severity: 'warning',
            inputs: sharedInputs,
        }),
        lowConfidence: !hasUsableYtdGross,
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
    const niPayCycle =
        record.payrollDoc?.thisPeriod?.payCycle?.cycle ||
        (Number.isFinite(entry.monthIndex) ? 'Monthly' : null)
    const niPeriodsPerYear = getPayPeriodsPerYear(niPayCycle)
    const niPrimaryThresholdForPeriod =
        niPrimaryThresholdMonthly !== null && niPeriodsPerYear !== null
            ? (niPrimaryThresholdMonthly * 12) / niPeriodsPerYear
            : null
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

    const miscDeductions = Array.isArray(record.payrollDoc?.deductions?.misc)
        ? record.payrollDoc.deductions.misc
        : []
    for (const deduction of miscDeductions) {
        const title = String(deduction?.title || '').trim()
        const amount = Number(deduction?.amount || 0)
        if (!title || amount <= 0) {
            continue
        }
        // Treat pension-like labels as part of pension validation paths.
        if (/(?:\bpension\b|\bnest\b)/i.test(title)) {
            continue
        }
        flags.push(
            buildCatalogRuleFlag(FLAG_CATALOG.unrecognised_deduction, {
                label: formatFlagLabel(FLAG_CATALOG.unrecognised_deduction.id, {
                    context: 'reported_deduction',
                    deductionTitle: title,
                    deductionAmount: amount,
                }),
                severity: FLAG_CATALOG.unrecognised_deduction.severity,
                inputs: {
                    deductionTitle: title,
                    deductionAmount: amount,
                },
            })
        )
    }

    if (
        nationalInsurance <= 0 &&
        niPrimaryThresholdForPeriod !== null &&
        canRunThresholdDrivenChecks &&
        typeof grossForNiContext === 'number' &&
        grossForNiContext > niPrimaryThresholdForPeriod
    ) {
        flags.push(
            buildCatalogRuleFlag(FLAG_CATALOG.nat_ins_zero, {
                label: formatFlagLabel(FLAG_CATALOG.nat_ins_zero.id, {
                    context: 'above_threshold_warning',
                    grossPay: grossForNiContext,
                    niPrimaryThresholdMonthly: niPrimaryThresholdForPeriod,
                }),
                severity: 'warning',
                inputs: {
                    nationalInsurance,
                    grossPay: grossForNiContext,
                    niPrimaryThresholdMonthly: niPrimaryThresholdForPeriod,
                },
            })
        )
    }

    if (
        nationalInsurance > 0 &&
        niPrimaryThresholdForPeriod !== null &&
        canRunThresholdDrivenChecks &&
        typeof grossForNiContext === 'number' &&
        grossForNiContext <= niPrimaryThresholdForPeriod
    ) {
        flags.push(
            buildCatalogRuleFlag(FLAG_CATALOG.nat_ins_taken_below_threshold, {
                label: formatFlagLabel(
                    FLAG_CATALOG.nat_ins_taken_below_threshold.id,
                    {
                        nationalInsurance,
                        grossPay: grossForNiContext,
                        niPrimaryThresholdMonthly: niPrimaryThresholdForPeriod,
                    }
                ),
                severity: 'warning',
                inputs: {
                    nationalInsurance,
                    grossPay: grossForNiContext,
                    niPrimaryThresholdMonthly: niPrimaryThresholdForPeriod,
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
