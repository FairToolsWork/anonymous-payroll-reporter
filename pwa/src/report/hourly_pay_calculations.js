/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', ruleId?: string, inputs?: Record<string, number | string | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecord, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult }} HourlyPayEntry
 */

import { resolveFlagLabel } from './flag_catalog.js'
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
 * @param {number | null | undefined} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    if (!Number.isFinite(amount)) {
        return 'Unknown'
    }
    return Number(amount).toLocaleString('en-GB', {
        style: 'currency',
        currency: 'GBP',
    })
}

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

/** @type {Record<string, PayeCumulativeMode>} */
const PAYE_CUMULATIVE_DEFAULT_MODE_BY_PAYROLL_FORMAT = {
    'sage-uk': 'table_mode',
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
    if (!thresholds || thresholdResolution.status !== 'ok') {
        return {
            flag: null,
            lowConfidence: thresholdResolution.status !== 'ok',
        }
    }

    const payrollDoc = entry.record?.payrollDoc || {}
    const payCycle =
        payrollDoc?.thisPeriod?.payCycle?.cycle ||
        (Number.isFinite(entry.monthIndex) ? 'Monthly' : null)
    const periodsPerYear = getPayPeriodsPerYear(payCycle)
    if (periodsPerYear === null) {
        return { flag: null, lowConfidence: false }
    }

    const parsedTaxCode = parsePayeTaxCode(payrollDoc?.taxCode?.code || '')
    if (!parsedTaxCode.normalizedCode) {
        if (payeTax > 0) {
            return { flag: null, lowConfidence: false }
        }
        return {
            flag: {
                id: 'paye_zero',
                label: 'PAYE Tax is £0 and the tax code is missing, so the exact PAYE check could not be completed for this payslip.',
                ruleId: 'paye_zero',
                severity: 'warning',
                inputs: {
                    payeTax,
                    expectedPaye: null,
                    taxCode: null,
                },
            },
            lowConfidence: true,
        }
    }
    if (!parsedTaxCode.isStandardCode) {
        return {
            flag: {
                id: 'paye_tax_code_unsupported',
                label: `${resolveFlagLabel('paye_tax_code_unsupported')} Reported tax code: ${parsedTaxCode.normalizedCode || 'Unknown'}.`,
                ruleId: 'paye_tax_code_unsupported',
                severity: 'warning',
                inputs: { taxCode: parsedTaxCode.normalizedCode || null },
            },
            lowConfidence: true,
        }
    }

    const bandSelection = getIncomeTaxBandsForRegion(
        thresholds,
        parsedTaxCode.region
    )
    if (!bandSelection) {
        return {
            flag: {
                id: 'paye_tax_code_unsupported',
                label: 'PAYE region could not be determined from the tax code, so standard PAYE checks were skipped.',
                ruleId: 'paye_tax_code_unsupported',
                severity: 'warning',
                inputs: { taxCode: parsedTaxCode.normalizedCode || null },
            },
            lowConfidence: true,
        }
    }

    const periodIndex = parsedTaxCode.isEmergency
        ? 1
        : getPayPeriodIndexForDate(entry.parsedDate, periodsPerYear)
    if (periodIndex === null) {
        return {
            flag: {
                id: 'paye_pay_cycle_unsupported',
                label: 'PAYE period position could not be determined for this payslip, so standard PAYE checks were skipped.',
                ruleId: 'paye_pay_cycle_unsupported',
                severity: 'warning',
                inputs: { payCycle: String(payCycle || 'unknown') },
            },
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
        explanation = `Emergency code ${parsedTaxCode.normalizedCode} uses period-only PAYE with ${formatCurrency(periodOnlyPaye.allowanceThisPeriod)} tax-free pay this ${String(payCycle).toLowerCase()} period.`
    } else {
        if (!Number.isFinite(grossForTaxTD) || !Number.isFinite(taxPaidTD)) {
            if (payeTax > 0) {
                return { flag: null, lowConfidence: false }
            }
            calculationMode = 'period-only-approximation'
            expectedPaye = periodOnlyPaye.expectedPaye
            explanation = `Gross for Tax TD and Tax Paid TD are missing, so this uses a period-only approximation with ${formatCurrency(periodOnlyPaye.allowanceThisPeriod)} tax-free pay.`
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
            explanation = `Cumulative PAYE for ${parsedTaxCode.normalizedCode} uses Gross for Tax TD ${formatCurrency(grossForTaxTD)} less cumulative allowance ${formatCurrency(cumulativeAllowance)} in the ${bandSelection.region} tax bands.`
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
    const isZeroFlag = payeTax <= 0
    const isSignificantMismatch = Math.abs(difference) > payeTolerance
    const severity = isSignificantMismatch ? 'warning' : 'notice'
    const discrepancyDirection =
        difference < 0
            ? 'under the expected PAYE amount'
            : 'above the expected PAYE amount'
    const label = isZeroFlag
        ? isSignificantMismatch
            ? `PAYE Tax is ${formatCurrency(payeTax)} but standard PAYE for this payslip is about ${formatCurrency(expectedPaye)}. ${explanation}`
            : `PAYE Tax is ${formatCurrency(payeTax)} and standard PAYE also works out to about ${formatCurrency(expectedPaye)} for this payslip. ${explanation}`
        : `PAYE Tax ${formatCurrency(payeTax)} is ${formatCurrency(Math.abs(difference))} ${discrepancyDirection}; standard PAYE is about ${formatCurrency(expectedPaye)}. ${explanation}`

    return {
        flag: {
            id: isZeroFlag ? 'paye_zero' : 'paye_mismatch',
            label,
            ruleId: isZeroFlag ? 'paye_zero' : 'paye_mismatch',
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
        },
        lowConfidence: false,
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

    if (thresholdResolution.status !== 'ok') {
        const warningLabel =
            thresholdResolution.status === 'unsupported-tax-year'
                ? `Tax-year thresholds are not configured for ${formatTaxYearLabelFromStartYear(thresholdResolution.taxYearStart)}. Threshold-based checks were skipped for this payslip.`
                : thresholdResolution.status === 'partial-threshold-support'
                  ? 'Threshold-based checks are only partially supported before 6 July 2022, so threshold-driven validations were skipped for this payslip.'
                  : 'Tax year could not be determined for this payslip. Threshold-based checks were skipped.'
        flags.push({
            id:
                thresholdResolution.status === 'partial-threshold-support'
                    ? 'tax_year_thresholds_partial_support'
                    : 'tax_year_thresholds_unavailable',
            label: warningLabel,
            ruleId:
                thresholdResolution.status === 'partial-threshold-support'
                    ? 'tax_year_thresholds_partial_support'
                    : 'tax_year_thresholds_unavailable',
            severity: 'warning',
            inputs: {
                taxYearStart:
                    thresholdResolution.taxYearStart === null
                        ? null
                        : thresholdResolution.taxYearStart,
            },
        })
    }

    if (!natInsNumber) {
        flags.push({
            id: 'missing_nat_ins',
            label: resolveFlagLabel('missing_nat_ins', 'Missing NAT INS No'),
        })
    }
    if (!taxCode) {
        flags.push({
            id: 'missing_tax_code',
            label: resolveFlagLabel('missing_tax_code', 'Missing tax code'),
        })
    }
    const payeValidation = buildPayeValidationFlag(
        entry,
        thresholdResolution,
        payeTax
    )
    if (payeValidation.flag) {
        flags.push(payeValidation.flag)
    }
    if (
        nationalInsurance <= 0 &&
        niPrimaryThresholdMonthly !== null &&
        thresholdResolution.status === 'ok'
    ) {
        const isNiWarning =
            typeof grossForNiContext === 'number' &&
            grossForNiContext > niPrimaryThresholdMonthly
        const grossPayLabel =
            typeof grossForNiContext === 'number'
                ? grossForNiContext.toLocaleString('en-GB', {
                      style: 'currency',
                      currency: 'GBP',
                  })
                : 'Unknown'
        const thresholdLabel = niPrimaryThresholdMonthly.toLocaleString(
            'en-GB',
            {
                style: 'currency',
                currency: 'GBP',
            }
        )
        const niLabel = isNiWarning
            ? `National Insurance missing or £0 while gross pay ${grossPayLabel} is above the primary threshold of ${thresholdLabel}`
            : `NI deductions not taken as gross pay ${grossPayLabel} is at or below the primary threshold of ${thresholdLabel}`
        flags.push({
            id: 'nat_ins_zero',
            label: niLabel,
            ruleId: 'nat_ins_zero',
            severity: isNiWarning ? 'warning' : 'notice',
            inputs: {
                nationalInsurance,
                grossPay: grossForNiContext,
                niPrimaryThresholdMonthly,
            },
        })
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
                flags.push({
                    id: 'payment_line_mismatch',
                    label: resolveFlagLabel(
                        'payment_line_mismatch',
                        'A payment line units × rate does not match its amount'
                    ),
                    ruleId: 'payment_line_mismatch',
                    inputs: { computed: expected, reported: item.amount },
                })
                break
            }
        }
    }

    const hasPaymentLineMismatch = flags.some(
        (f) => f.id === 'payment_line_mismatch'
    )

    let grossMismatch = false
    if (totalGrossPay !== null && !hasPaymentLineMismatch) {
        grossMismatch = !isWithinTolerance(paymentsTotal, totalGrossPay)
        if (grossMismatch) {
            flags.push({
                id: 'gross_mismatch',
                label: resolveFlagLabel(
                    'gross_mismatch',
                    'Payments total does not match Total Gross Pay'
                ),
                ruleId: 'gross_mismatch',
                inputs: { computed: paymentsTotal, reported: totalGrossPay },
            })
        }
    }

    let netMismatch = false
    if (netPay !== null && !hasPaymentLineMismatch && !grossMismatch) {
        const expectedNet = paymentsTotal - deductionsTotal
        netMismatch = !isWithinTolerance(expectedNet, netPay)
        if (netMismatch) {
            flags.push({
                id: 'net_mismatch',
                label: resolveFlagLabel(
                    'net_mismatch',
                    'Net Pay does not match payments less deductions'
                ),
                ruleId: 'net_mismatch',
                inputs: { computed: expectedNet, reported: netPay },
            })
        }
    }

    return {
        flags,
        lowConfidence:
            grossMismatch ||
            netMismatch ||
            thresholdResolution.status !== 'ok' ||
            payeValidation.lowConfidence,
    }
}
