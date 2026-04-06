/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', ruleId?: string, inputs?: Record<string, number | string | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecord, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, workerProfile?: { payrollRunStartDate?: string | null, pensionDefermentCommunicated?: boolean, pensionDefermentStartDate?: string | null, pensionDefermentEndDate?: string | null } | null }} HourlyPayEntry
 */

import { FLAG_CATALOG, formatFlagLabel } from './flag_catalog.js'
import { ACTIVE_PAYROLL_FORMAT } from '../parse/active_format.js'
import {
    getIncomeTaxBandsForRegion,
    getPayPeriodIndexForDate,
    getPayPeriodsPerYear,
    getPeriodizedAnnualAmount,
    formatTaxYearLabelFromStartYear,
    PAYE_VALIDATION_TOLERANCE,
    parsePayeTaxCode,
    resolveTaxYearThresholdsForContext,
    VALIDATION_TOLERANCE,
} from './uk_thresholds.js'

/**
 * @param {number} value
 * @returns {number}
 */
function roundMoney(value) {
    return Math.round(value * 100) / 100
}

/**
 * Sage table-style cumulative PAYE can differ by around £1-£2 from pure formula output.
 * Keep these low-level drifts from surfacing as mismatches while retaining large-variance flags.
 */
const TABLE_MODE_PAYE_VALIDATION_TOLERANCE = 2

/**
 * @param {{ id: string, label: string, severity: 'notice' | 'warning' }} catalogEntry
 * @param {Partial<ValidationFlag>} [overrides]
 * @returns {ValidationFlag}
 */
function buildCatalogFlag(catalogEntry, overrides = {}) {
    return {
        id: catalogEntry.id,
        label: catalogEntry.label,
        ...overrides,
    }
}

/**
 * @param {{ id: string, label: string, severity: 'notice' | 'warning' }} catalogEntry
 * @param {Partial<ValidationFlag>} [overrides]
 * @returns {ValidationFlag}
 */
function buildCatalogRuleFlag(catalogEntry, overrides = {}) {
    return buildCatalogFlag(catalogEntry, {
        ruleId: catalogEntry.id,
        severity: catalogEntry.severity,
        ...overrides,
    })
}

/** @type {Record<string, PayeCumulativeMode>} */
export const PAYE_CUMULATIVE_DEFAULT_MODE_BY_PAYROLL_FORMAT = {
    'sage-uk': 'table_mode',
}

/**
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @returns {boolean}
 */
function hasUsableThresholds(thresholdResolution) {
    return (
        !!thresholdResolution?.thresholds &&
        (thresholdResolution.status === 'ok' ||
            thresholdResolution.status === 'fallback-to-previous-tax-year')
    )
}

/**
 * Pension auto-enrolment checks can continue in Apr-Jun 2022 using available
 * annual trigger/qualifying thresholds even when NI/PAYE are marked partial.
 *
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @returns {boolean}
 */
function hasUsablePensionThresholds(thresholdResolution) {
    return (
        !!thresholdResolution?.thresholds &&
        (thresholdResolution.status === 'ok' ||
            thresholdResolution.status === 'fallback-to-previous-tax-year' ||
            thresholdResolution.status === 'partial-threshold-support')
    )
}

/**
 * @typedef {'exact' | 'sage_approx' | 'table_mode'} PayeCumulativeMode
 */

/**
 * @param {number} annualAmount
 * @param {number} completedPeriods
 * @param {12 | 52} periodsPerYear
 * @param {PayeCumulativeMode} [mode='exact']
 * @returns {number}
 */
function getPeriodizedAnnualAmountByMode(
    annualAmount,
    completedPeriods,
    periodsPerYear,
    mode = 'exact'
) {
    if (
        !Number.isFinite(annualAmount) ||
        !Number.isFinite(completedPeriods) ||
        !Number.isFinite(periodsPerYear) ||
        periodsPerYear <= 0
    ) {
        return 0
    }
    if (mode === 'sage_approx') {
        return Math.floor((annualAmount * completedPeriods) / periodsPerYear)
    }
    if (mode === 'table_mode') {
        return getPeriodizedAnnualAmount(
            annualAmount,
            completedPeriods,
            periodsPerYear
        )
    }
    return getPeriodizedAnnualAmount(
        annualAmount,
        completedPeriods,
        periodsPerYear
    )
}

/**
 * Resolves PAYE cumulative mode from debug override first, then payroll format defaults.
 * Consumers can override with globalThis.__payeCumulativeMode.
 *
 * @returns {PayeCumulativeMode}
 */
function resolvePayeCumulativeMode() {
    const override = String(
        /** @type {any} */ (globalThis).__payeCumulativeMode
    )
        .trim()
        .toLowerCase()
    if (override === 'exact') {
        return 'exact'
    }
    if (override === 'sage_approx') {
        return 'sage_approx'
    }
    if (override === 'table_mode') {
        return 'table_mode'
    }

    const formatId = String(ACTIVE_PAYROLL_FORMAT?.id || '')
    const defaultMode =
        PAYE_CUMULATIVE_DEFAULT_MODE_BY_PAYROLL_FORMAT[formatId] || 'exact'
    return defaultMode
}

/**
 * @param {number} taxableAmount
 * @param {{ rate: number, upper: number | null }[]} bands
 * @param {number} completedPeriods
 * @param {12 | 52} periodsPerYear
 * @param {PayeCumulativeMode} [mode='exact']
 * @returns {number}
 */
function calculateTaxFromBands(
    taxableAmount,
    bands,
    completedPeriods,
    periodsPerYear,
    mode = 'exact'
) {
    if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) {
        return 0
    }

    let remaining = taxableAmount
    let previousUpperAnnual = 0
    let tax = 0

    for (const band of bands) {
        if (remaining <= 0) {
            break
        }
        if (band.upper === null) {
            const topSlice =
                mode === 'sage_approx' ? roundMoney(remaining) : remaining
            const topTax = topSlice * (band.rate / 100)
            if (mode === 'table_mode') {
                tax += Math.floor(topTax * 100) / 100
            } else {
                tax += mode === 'sage_approx' ? roundMoney(topTax) : topTax
            }
            break
        }

        const annualWidth = band.upper - previousUpperAnnual
        const periodWidth = getPeriodizedAnnualAmountByMode(
            annualWidth,
            completedPeriods,
            periodsPerYear,
            mode
        )
        const taxableInBandRaw = Math.min(remaining, periodWidth)
        const taxableInBand =
            mode === 'sage_approx'
                ? roundMoney(taxableInBandRaw)
                : mode === 'table_mode'
                  ? Math.floor(taxableInBandRaw)
                  : taxableInBandRaw
        const bandTaxRaw = taxableInBand * (band.rate / 100)
        if (mode === 'table_mode') {
            tax += Math.floor(bandTaxRaw * 100) / 100
        } else {
            tax += mode === 'sage_approx' ? roundMoney(bandTaxRaw) : bandTaxRaw
        }
        remaining -= taxableInBandRaw
        previousUpperAnnual = band.upper
    }

    return roundMoney(tax)
}

/**
 * @param {number} grossForTax
 * @param {number} annualAllowance
 * @param {{ rate: number, upper: number | null }[]} bands
 * @param {12 | 52} periodsPerYear
 * @param {PayeCumulativeMode} [mode='exact']
 * @returns {{ expectedPaye: number, allowanceThisPeriod: number }}
 */
function calculatePeriodOnlyPaye(
    grossForTax,
    annualAllowance,
    bands,
    periodsPerYear,
    mode = 'exact'
) {
    const allowanceThisPeriod = getPeriodizedAnnualAmountByMode(
        annualAllowance,
        1,
        periodsPerYear,
        mode
    )
    const taxableThisPeriod = Math.max(0, grossForTax - allowanceThisPeriod)
    return {
        allowanceThisPeriod,
        expectedPaye: calculateTaxFromBands(
            taxableThisPeriod,
            bands,
            1,
            periodsPerYear,
            mode
        ),
    }
}

/**
 * @param {HourlyPayEntry} entry
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @param {number} payeTax
 * @returns {{ flag: ValidationFlag | null, lowConfidence: boolean }}
 */
function buildPayeValidationFlag(entry, thresholdResolution, payeTax) {
    const thresholds = thresholdResolution.thresholds
    if (!hasUsableThresholds(thresholdResolution)) {
        return {
            flag: null,
            lowConfidence: thresholdResolution.status !== 'ok',
        }
    }
    // hasUsableThresholds guarantees thresholds is present for usable statuses.
    if (!thresholds) {
        throw new Error('Invariant violated: usable thresholds missing')
    }
    const thresholdsForValidation = thresholds

    const payrollDoc = entry.record?.payrollDoc || {}
    const payCycle = payrollDoc?.thisPeriod?.payCycle?.cycle ?? null
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
    const annualAllowance = thresholdsForValidation.personalAllowanceAnnual
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
    /** @type {'emergency-period-only' | 'period-only-approximation' | 'cumulative'} */
    let calculationMode = 'cumulative'
    /** @type {number | null} */
    let cumulativeAllowance = null
    /** @type {number | null} */
    let taxableYtd = null
    /** @type {number | null} */
    let expectedTaxYtd = null
    /** @type {number | null} */
    let priorTaxPaid = null
    /** @type {number | null} */
    let expectedPayeExact = null
    /** @type {number | null} */
    let expectedPayeSageApprox = null
    /** @type {number | null} */
    let expectedTaxYtdExact = null
    /** @type {number | null} */
    let expectedTaxYtdSageApprox = null
    /** @type {number | null} */
    let expectedPayeTableMode = null
    /** @type {number | null} */
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
    } else {
        if (!Number.isFinite(grossForTaxTD) || !Number.isFinite(taxPaidTD)) {
            if (payeTax > 0) {
                return { flag: null, lowConfidence: false }
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
            const cumulativeAllowanceSageApprox =
                getPeriodizedAnnualAmountByMode(
                    annualAllowance,
                    completedPeriods,
                    periodsPerYear,
                    'sage_approx'
                )
            const cumulativeAllowanceTableMode =
                getPeriodizedAnnualAmountByMode(
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
                Math.floor(grossForTaxTD) - cumulativeAllowanceTableMode
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
    }

    if (!Number.isFinite(expectedPaye)) {
        return { flag: null, lowConfidence: false }
    }

    const payeTolerance =
        calculationMode === 'cumulative' && payeCumulativeMode === 'table_mode'
            ? TABLE_MODE_PAYE_VALIDATION_TOLERANCE
            : PAYE_VALIDATION_TOLERANCE

    if (
        payeTax > 0 &&
        isWithinPayeTolerance(payeTax, expectedPaye, payeTolerance)
    ) {
        return { flag: null, lowConfidence: false }
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
        lowConfidence: false,
    }
}

/**
 * @param {Date | null | undefined} date
 * @returns {Date | null}
 */
function normalizeToDateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * @param {string | null | undefined} value
 * @returns {Date | null}
 */
function parseIsoDateInput(value) {
    const text = String(value || '').trim()
    if (!text) {
        return null
    }
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) {
        return null
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const parsed = new Date(year, month - 1, day)
    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return null
    }
    return parsed
}

/**
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
function addMonths(date, months) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const day = date.getDate()
    const totalMonthIndex = month + months
    const targetYear = year + Math.floor(totalMonthIndex / 12)
    const targetMonth = ((totalMonthIndex % 12) + 12) % 12
    const lastDayOfTargetMonth = new Date(
        targetYear,
        targetMonth + 1,
        0
    ).getDate()
    return new Date(
        targetYear,
        targetMonth,
        Math.min(day, lastDayOfTargetMonth)
    )
}

/**
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {number}
 */
function getElapsedDays(fromDate, toDate) {
    const fromUtcDay = Date.UTC(
        fromDate.getFullYear(),
        fromDate.getMonth(),
        fromDate.getDate()
    )
    const toUtcDay = Date.UTC(
        toDate.getFullYear(),
        toDate.getMonth(),
        toDate.getDate()
    )
    return Math.floor((toUtcDay - fromUtcDay) / (24 * 60 * 60 * 1000))
}

/**
 * @param {HourlyPayEntry} entry
 * @returns {{
 *   payrollRunStartDate: string | null,
 *   elapsedRunDays: number | null,
 *   exceedsSixWeekWindow: boolean,
 *   exceedsThreeMonthWindow: boolean,
 * }}
 */
function resolvePensionTimingContext(entry) {
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
 * Checks if pension deferment fields create uncertainty about deduction expectations.
 * Returns true if deferment is communicated but dates are incomplete.
 * Complete dates provide clear expectations about when deductions may not appear.
 * @param {HourlyPayEntry} entry
 * @returns {boolean}
 */
function isDefermentProblematicForPension(entry) {
    const profile = entry.workerProfile || null
    const pensionDefermentCommunicated =
        profile?.pensionDefermentCommunicated ?? false
    const startDateStr = profile?.pensionDefermentStartDate
    const endDateStr = profile?.pensionDefermentEndDate

    if (!pensionDefermentCommunicated) {
        return false
    }

    // Incomplete deferment dates → uncertainty about deduction expectations
    // Complete dates provide clear timeline, even if entry is within the deferment period
    const parsedStartDate = parseIsoDateInput(startDateStr)
    const parsedEndDate = parseIsoDateInput(endDateStr)

    if (!parsedStartDate || !parsedEndDate) {
        return true
    }

    return false
}

/**
 * @param {HourlyPayEntry} entry
 * @param {ReturnType<typeof resolveTaxYearThresholdsForContext>} thresholdResolution
 * @param {number} paymentsTotal
 * @returns {{ flags: ValidationFlag[], lowConfidence: boolean }}
 */
function buildPensionValidationFlags(
    entry,
    thresholdResolution,
    paymentsTotal
) {
    // Deferment issues reduce confidence in pension deduction expectations
    const defermentLowConfidence = isDefermentProblematicForPension(entry)
    const thresholds = thresholdResolution.thresholds
    if (!hasUsablePensionThresholds(thresholdResolution)) {
        return { flags: [], lowConfidence: false }
    }
    // hasUsablePensionThresholds guarantees thresholds is present for usable statuses.
    if (!thresholds) {
        throw new Error('Invariant violated: usable pension thresholds missing')
    }
    const thresholdsForValidation = thresholds

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
    if (hasPensionDeductionEvidence) {
        return { flags: [], lowConfidence: false }
    }

    const payCycle = payrollDoc?.thisPeriod?.payCycle?.cycle ?? null
    const periodsPerYear = getPayPeriodsPerYear(payCycle)
    if (periodsPerYear === null) {
        return { flags: [], lowConfidence: true }
    }

    const autoEnrolmentTrigger = getPeriodizedAnnualAmount(
        thresholdsForValidation.pensionAutoEnrolmentTriggerAnnual,
        1,
        periodsPerYear
    )
    const qualifyingLower = getPeriodizedAnnualAmount(
        thresholdsForValidation.pensionQualifyingEarningsLowerAnnual,
        1,
        periodsPerYear
    )
    const qualifyingUpper = getPeriodizedAnnualAmount(
        thresholdsForValidation.pensionQualifyingEarningsUpperAnnual,
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
            thresholdsForValidation.pensionAutoEnrolmentTriggerAnnual,
        annualQualifyingEarningsLower:
            thresholdsForValidation.pensionQualifyingEarningsLowerAnnual,
        annualQualifyingEarningsUpper:
            thresholdsForValidation.pensionQualifyingEarningsUpperAnnual,
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
 * @param {number | null | undefined} actual
 * @param {number | null | undefined} expected
 * @returns {boolean}
 */
export function isWithinTolerance(actual, expected) {
    if (
        actual === null ||
        actual === undefined ||
        expected === null ||
        expected === undefined
    ) {
        return false
    }
    return Math.abs(actual - expected) <= VALIDATION_TOLERANCE
}

/**
 * @param {number | null | undefined} actual
 * @param {number | null | undefined} expected
 * @param {number} [tolerance=PAYE_VALIDATION_TOLERANCE]
 * @returns {boolean}
 */
export function isWithinPayeTolerance(
    actual,
    expected,
    tolerance = PAYE_VALIDATION_TOLERANCE
) {
    if (
        actual === null ||
        actual === undefined ||
        expected === null ||
        expected === undefined
    ) {
        return false
    }
    return Math.abs(Math.round((actual - expected) * 100) / 100) <= tolerance
}

/**
 * @param {Array<{ amount: number | null }>} items
 * @returns {number}
 */
export function sumMiscAmounts(items) {
    if (!items || !items.length) {
        return 0
    }
    return items.reduce((sum, item) => sum + (item.amount || 0), 0)
}

/**
 * @param {PayrollRecord} record
 * @returns {number}
 */
export function sumPayments(record) {
    const hourly = /** @type {PayrollPayments["hourly"]} */ (
        record?.payrollDoc?.payments?.hourly || {}
    )
    const salary = /** @type {PayrollPayments["salary"]} */ (
        record?.payrollDoc?.payments?.salary || {}
    )
    const misc = record?.payrollDoc?.payments?.misc || []
    return (
        (hourly.basic?.amount || 0) +
        (hourly.holiday?.amount || 0) +
        (salary.basic?.amount || 0) +
        (salary.holiday?.amount || 0) +
        sumMiscAmounts(misc)
    )
}

/**
 * @param {PayrollRecord} record
 * @returns {number}
 */
export function sumDeductionsForNetPay(record) {
    const deductions = /** @type {PayrollDeductions} */ (
        record?.payrollDoc?.deductions || {}
    )
    return (
        (deductions.payeTax?.amount || 0) +
        (deductions.natIns?.amount || 0) +
        (deductions.pensionEE?.amount || 0) +
        sumMiscAmounts(deductions.misc || [])
    )
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
