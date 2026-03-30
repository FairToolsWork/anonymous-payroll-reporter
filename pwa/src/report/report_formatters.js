/**
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 */

import {
    CONTRIBUTION_RECENCY_DAYS_THRESHOLD,
    PERSONAL_ALLOWANCE_ANNUAL,
    PERSONAL_ALLOWANCE_MONTHLY,
} from './uk_thresholds.js'

export const APRIL_BOUNDARY_NOTE =
    'April payslips may include pay accrued across the 6 April tax year boundary. <br/>' +
    'This tool cannot determine how the employer has attributed hours or amounts between tax years, ' +
    'which may cause discrepancies in year-end figures.'

export const ZERO_TAX_ALLOWANCE_NOTE =
    `PAYE Tax / National Insurance may be £0 when monthly pay is below £${PERSONAL_ALLOWANCE_MONTHLY.toLocaleString('en-GB')} ` +
    `(Personal Allowance £${PERSONAL_ALLOWANCE_ANNUAL.toLocaleString('en-GB')} per year, based on the current configured UK rate).`

export const ACCUMULATED_TOTALS_NOTE =
    'Accumulated Over / Under = Reported (EE+ER) - Payroll Contributions (EE+ER). <br/>' +
    'Positive values indicate an overpayment; negative values indicate an underpayment to your pension.'

/**
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
    const roundedValue = Number(value.toFixed(2))
    const normalizedValue = Object.is(roundedValue, -0) ? 0 : roundedValue
    return `£${normalizedValue.toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatDeduction(value) {
    return `-£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatContribution(value) {
    return `£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {PayrollPayItem | PayrollMiscDeduction | { title?: string, units?: number | null, rate?: number | null }} item
 * @returns {string}
 */
export function formatMiscLabel(item) {
    if (!item) {
        return ''
    }
    const label = item.title || ''
    if (item.units == null || item.rate == null) {
        return label
    }
    return `${label} (${Number(item.units).toFixed(2)} @ ${formatCurrency(
        Number(item.rate)
    )})`
}

/**
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @param {boolean} [allowNA=false]
 * @returns {{ totalLabel: string, eeLabel: string, erLabel: string, breakdownLabel: string }}
 */
export function buildContributionBreakdownParts(
    total,
    ee,
    er,
    allowNA = false
) {
    const formatOrNA = (/** @type {number | null} */ value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const totalLabel = allowNA ? formatOrNA(total) : formatCurrency(total ?? 0)
    const eeLabel = allowNA ? formatOrNA(ee) : formatCurrency(ee ?? 0)
    const erLabel = allowNA ? formatOrNA(er) : formatCurrency(er ?? 0)
    return {
        totalLabel,
        eeLabel,
        erLabel,
        breakdownLabel: `${eeLabel} EE / ${erLabel} ER`,
    }
}

/**
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @param {boolean} [allowNA=false]
 * @returns {string}
 */
export function formatBreakdownCell(total, ee, er, allowNA = false) {
    if (allowNA && total === null) {
        return 'N/A'
    }
    const parts = buildContributionBreakdownParts(total, ee, er, allowNA)
    return `${parts.totalLabel}<br><span class="summary-breakdown">${parts.breakdownLabel}</span>`
}

/**
 * @param {{ daysSinceContribution: number | null, lastContributionLabel: string, daysThreshold?: number } | null | undefined} contributionRecency
 * @param {number} [fallbackDaysThreshold=CONTRIBUTION_RECENCY_DAYS_THRESHOLD]
 * @returns {{ daysCount: number | null, daysLabel: string, className: string | null, color: string | null, lastContributionLabel: string, daysThreshold: number }}
 */
export function buildContributionRecencyDisplay(
    contributionRecency,
    fallbackDaysThreshold = CONTRIBUTION_RECENCY_DAYS_THRESHOLD
) {
    if (!contributionRecency) {
        return {
            daysCount: null,
            daysLabel: 'N/A',
            className: null,
            color: null,
            lastContributionLabel: 'N/A',
            daysThreshold: fallbackDaysThreshold,
        }
    }
    const daysCount =
        typeof contributionRecency.daysSinceContribution === 'number'
            ? contributionRecency.daysSinceContribution
            : null
    const daysThreshold =
        contributionRecency.daysThreshold ?? fallbackDaysThreshold
    const daysLabel = daysCount === null ? 'N/A' : `${daysCount} days`
    const isStale = daysCount !== null && daysCount > daysThreshold
    return {
        daysCount,
        daysLabel,
        className:
            daysCount === null ? null : isStale ? 'days--stale' : 'days--fresh',
        color: daysCount === null ? null : isStale ? '#c0391a' : '#2d7a4f',
        lastContributionLabel:
            contributionRecency.lastContributionLabel || 'N/A',
        daysThreshold,
    }
}

export const DIFF_POSITIVE_COLOR = '#8a6014'
export const DIFF_NEGATIVE_COLOR = '#c0391a'
export const DIFF_NEUTRAL_COLOR = '#2d7a4f'

/**
 * @param {number | null} value
 * @param {boolean} [isZeroReview=false]
 * @returns {{ text: string, className: string | null, color: string | null }}
 */
export function buildDiffDisplay(value, isZeroReview = false) {
    if (value === null) {
        return { text: 'N/A', className: null, color: null }
    }
    const roundedValue = Number(value.toFixed(2))
    const text = formatCurrency(value)
    if (isZeroReview) {
        return {
            text,
            className: 'diff--zero-review',
            color: DIFF_POSITIVE_COLOR,
        }
    }
    if (roundedValue === 0) {
        return {
            text,
            className: 'diff--neutral',
            color: DIFF_NEUTRAL_COLOR,
        }
    }
    if (roundedValue > 0) {
        return {
            text,
            className: 'diff--positive',
            color: DIFF_POSITIVE_COLOR,
        }
    }
    return {
        text,
        className: 'diff--negative',
        color: DIFF_NEGATIVE_COLOR,
    }
}

/**
 * @param {{ workerTypeLabel?: string, typicalDays?: number, statutoryHolidayDays?: number | null, leaveYearStartMonthName?: string, hasVariablePattern?: boolean } | null | undefined} workerProfile
 * @returns {{ typeValue: string, typicalDaysValue: string, entitlementValue: string, leaveYearValue: string }}
 */
export function buildWorkerProfileDisplay(workerProfile) {
    return {
        typeValue: workerProfile?.workerTypeLabel || 'Not specified',
        typicalDaysValue: workerProfile?.hasVariablePattern
            ? 'Variable pattern'
            : `${workerProfile?.typicalDays ?? 0} days/week`,
        entitlementValue:
            workerProfile?.statutoryHolidayDays != null
                ? `${workerProfile.statutoryHolidayDays} days/year`
                : 'N/A (accrual-based)',
        leaveYearValue: workerProfile?.leaveYearStartMonthName || 'April',
    }
}

/**
 * @param {{ dateLabel: string, type: string, label: string, amount: number, units?: number | null, rate?: number | null }} item
 * @returns {{ typeLabel: string, amountLabel: string, detailLabel: string }}
 */
export function buildMiscReviewDisplay(item) {
    return {
        typeLabel: item.type === 'deduction' ? 'Deduction' : 'Payment',
        amountLabel:
            item.type === 'deduction'
                ? formatDeduction(item.amount || 0)
                : formatCurrency(item.amount || 0),
        detailLabel:
            item.units == null || item.rate == null
                ? 'flat'
                : `${Number(item.units).toFixed(2)} @ ${formatCurrency(Number(item.rate))}`,
    }
}

/**
 * @param {number | null} value
 * @returns {string}
 */
export function formatContributionDifference(value) {
    const diff = buildDiffDisplay(value)
    if (diff.className === null) {
        return 'N/A'
    }
    return `<span class="${diff.className}">${diff.text}</span>`
}
