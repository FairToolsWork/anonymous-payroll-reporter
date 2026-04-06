/**
 * Shared calculation utilities for payroll validation across all worker types.
 * Includes tolerance checks, aggregation helpers, catalog builders, date utilities,
 * PAYE mode resolution, and common tax math.
 */

/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', ruleId?: string, inputs?: Record<string, number | string | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecord, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, workerProfile?: { payrollRunStartDate?: string | null, pensionDefermentCommunicated?: boolean, pensionDefermentStartDate?: string | null, pensionDefermentEndDate?: string | null } | null }} HourlyPayEntry
 */

import { ACTIVE_PAYROLL_FORMAT } from '../parse/active_format.js'
import {
    getPeriodizedAnnualAmount,
    PAYE_VALIDATION_TOLERANCE,
    VALIDATION_TOLERANCE,
} from './uk_thresholds.js'

/**
 * @typedef {'exact' | 'sage_approx' | 'table_mode'} PayeCumulativeMode
 */

/**
 * @param {number} value
 * @returns {number}
 */
export function roundMoney(value) {
    return Math.round(value * 100) / 100
}

/**
 * Sage table-style cumulative PAYE can differ by around £1-£2 from pure formula output.
 * This tolerance is measured in pounds, so a value of `2` allows table-mode PAYE
 * results to be up to £2 away from the formula result without raising a mismatch.
 * Keep these low-level drifts from surfacing as mismatches while retaining large-variance flags.
 */
export const TABLE_MODE_PAYE_VALIDATION_TOLERANCE = 2

/**
 * @type {Record<string, PayeCumulativeMode>}
 */
export const PAYE_CUMULATIVE_DEFAULT_MODE_BY_PAYROLL_FORMAT = {
    'sage-uk': 'table_mode',
}

/**
 * @param {{ id: string, label: string, severity: 'notice' | 'warning' }} catalogEntry
 * @param {Partial<ValidationFlag>} [overrides]
 * @returns {ValidationFlag}
 */
export function buildCatalogFlag(catalogEntry, overrides = {}) {
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
export function buildCatalogRuleFlag(catalogEntry, overrides = {}) {
    return buildCatalogFlag(catalogEntry, {
        ruleId: catalogEntry.id,
        severity: catalogEntry.severity,
        ...overrides,
    })
}

/**
 * @param {ReturnType<typeof import('./uk_thresholds.js').resolveTaxYearThresholdsForContext>} thresholdResolution
 * @returns {boolean}
 */
export function hasUsableThresholds(thresholdResolution) {
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
 * @param {ReturnType<typeof import('./uk_thresholds.js').resolveTaxYearThresholdsForContext>} thresholdResolution
 * @returns {boolean}
 */
export function hasUsablePensionThresholds(thresholdResolution) {
    return (
        !!thresholdResolution?.thresholds &&
        (thresholdResolution.status === 'ok' ||
            thresholdResolution.status === 'fallback-to-previous-tax-year' ||
            thresholdResolution.status === 'partial-threshold-support')
    )
}

/**
 * @param {number} annualAmount
 * @param {number} completedPeriods
 * @param {12 | 52} periodsPerYear
 * @param {PayeCumulativeMode} [mode='exact']
 * @returns {number}
 */
export function getPeriodizedAnnualAmountByMode(
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
export function resolvePayeCumulativeMode() {
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
export function calculateTaxFromBands(
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
                  ? Math.floor(taxableInBandRaw * 100) / 100
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
export function calculatePeriodOnlyPaye(
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
 * @param {Date | null | undefined} date
 * @returns {Date | null}
 */
export function normalizeToDateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * @param {string | null | undefined} value
 * @returns {Date | null}
 */
export function parseIsoDateInput(value) {
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
export function addMonths(date, months) {
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
export function getElapsedDays(fromDate, toDate) {
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
