/**
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 */

import {
    CONTRIBUTION_RECENCY_DAYS_THRESHOLD,
    TAX_YEAR_THRESHOLDS,
    getTaxYearThresholdsByStartYear,
} from './uk_thresholds.js'

const DEFAULT_NOTE_THRESHOLDS = (() => {
    const configuredStartYears = Object.keys(TAX_YEAR_THRESHOLDS)
        .map((key) => Number.parseInt(key, 10))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a)
    if (!configuredStartYears.length) {
        return null
    }
    return getTaxYearThresholdsByStartYear(configuredStartYears[0])
})()

export const APRIL_BOUNDARY_NOTE =
    'April payslips may include pay accrued across the 6 April tax year boundary. <br/>' +
    'This tool cannot determine how the employer has attributed hours or amounts between tax years, ' +
    'which may cause discrepancies in year-end figures.'

/**
 * @param {{ personalAllowanceAnnual: number, personalAllowanceMonthly: number } | null} [thresholds=null]
 * @returns {string}
 */
export function buildZeroTaxAllowanceNote(thresholds = null) {
    const resolved = thresholds || DEFAULT_NOTE_THRESHOLDS
    if (!resolved) {
        return 'PAYE Tax / National Insurance context note unavailable.'
    }
    return (
        `PAYE Tax / National Insurance may be £0 when monthly pay is below £${resolved.personalAllowanceMonthly.toLocaleString('en-GB')} ` +
        `(Personal Allowance £${resolved.personalAllowanceAnnual.toLocaleString('en-GB')} per year, based on the current configured UK rate).`
    )
}

export const ZERO_TAX_ALLOWANCE_NOTE = buildZeroTaxAllowanceNote()

export const ACCUMULATED_TOTALS_NOTE =
    'Accumulated Over / Under = Reported (EE+ER) - Payroll Contributions (EE+ER). <br/>' +
    'Positive values indicate an overpayment; negative values indicate an underpayment to your pension.'

export const CONTRACT_TYPE_MISMATCH_HOURLY_WARNING =
    'Some payslips contain salaried pay (Basic Salary) but your worker profile is set to <b>Hourly</b>. If your contract changed part-way through, consider running separate reports for each contract period for accurate results.'

export const CONTRACT_TYPE_MISMATCH_SALARIED_WARNING =
    'Some payslips contain hourly pay (Basic Hours) but your worker profile is set to <b>Salaried</b>. If your contract changed part-way through, consider running separate reports for each contract period for accurate results.'

export const ACCRUAL_METHOD_HOURLY_LABEL = '12.07% accrual (leave-year basis)'
export const ACCRUAL_METHOD_AVG_WEEK_LABEL = '5.6 week avg. method'
export const FIXED_DAYS_PROFILE_LABEL = 'Fixed-days profile method'
export const OVERRUN_SUFFIX = ' (entitlement exceeded)'
export const VARIABLE_PATTERN_DAYS_NOTE =
    'Days estimate not shown — variable work pattern'
export const ANNUAL_CROSS_CHECK_TITLE = 'Annual holiday pay cross-check'
export const YEAR_SUMMARY_TITLE = 'Year Summary'
export const ACCUMULATED_TOTALS_TITLE = 'Accumulated Totals'
export const MISC_REVIEW_TITLE = 'Misc entries to review'
export const FLAG_NOTES_TITLE = 'Flag notes'
export const LOW_CONFIDENCE_PREFACE_TEXT =
    'The figures on this period may be worth reviewing.'

/**
 * @param {{ periodsCounted: number, totalWeeks: number }} params
 * @returns {string}
 */
export function buildCoverageWarningMessage({ periodsCounted, totalWeeks }) {
    if (periodsCounted < 3) {
        return `Limited holiday-reference coverage: fewer than 3 eligible pay periods (${periodsCounted}) were found, so holiday-rate checks are limited for this year.`
    }
    return `Limited holiday-reference coverage: ${Math.round(
        totalWeeks
    )} weeks from ${periodsCounted} eligible pay periods are available (up to 52 weeks recommended).`
}

/**
 * @param {string[]} affectedYears
 * @returns {string}
 */
export function buildGlobalCoverageNoticeMessage(affectedYears) {
    if (!affectedYears.length) {
        return ''
    }
    const yearList = affectedYears.join(', ')
    return `Holiday-reference coverage is limited for: ${yearList}. Year-level notices below explain where holiday-rate checks are constrained.`
}

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
 * @param {{ workerTypeLabel?: string, typicalDays?: number, statutoryHolidayDays?: number | null, leaveYearStartMonthName?: string, hasVariablePattern?: boolean } | null | undefined} workerProfile
 * @returns {Array<{ label: string, value: string }>}
 */
export function buildWorkerProfileSummaryFields(workerProfile) {
    const display = buildWorkerProfileDisplay(workerProfile)
    return [
        { label: 'Type', value: display.typeValue },
        { label: 'Typical days', value: display.typicalDaysValue },
        { label: 'Holiday entitlement', value: display.entitlementValue },
        { label: 'Leave year starts', value: display.leaveYearValue },
    ]
}

/**
 * Shared holiday display copy must stay ASCII-friendly because jsPDF's built-in
 * Helvetica font cannot reliably render symbols like U+2248.
 * @param {any} holidaySummary
 * @returns {{ primaryLabel: string, detailLines: string[] }}
 */
export function buildHolidaySummaryDisplay(holidaySummary) {
    /** @type {string[]} */
    const detailLines = []
    const holidayHours =
        typeof holidaySummary?.holidayHours === 'number'
            ? holidaySummary.holidayHours
            : 0
    let primaryLabel = `${holidayHours.toFixed(2)} hrs`

    if (holidaySummary.kind === 'salary_days') {
        primaryLabel = formatCurrency(holidaySummary.holidayAmount)
        detailLines.push(
            `~${holidaySummary.daysTaken.toFixed(1)} days taken / ${holidaySummary.daysRemaining.toFixed(1)} remaining${holidaySummary.overrun ? OVERRUN_SUFFIX : ''}`
        )
    } else if (holidaySummary.kind === 'salary_amount') {
        primaryLabel = formatCurrency(holidaySummary.holidayAmount)
    } else if (holidaySummary.kind === 'hourly_days') {
        primaryLabel = `${holidaySummary.holidayHours.toFixed(2)} hrs taken`
        detailLines.push(
            `~${holidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement`,
            `${holidaySummary.hoursRemaining.toFixed(1)} hrs remaining${holidaySummary.overrun ? OVERRUN_SUFFIX : ''}`,
            `~${holidaySummary.daysTaken.toFixed(1)} days taken / ${holidaySummary.daysRemaining.toFixed(1)} remaining`,
            FIXED_DAYS_PROFILE_LABEL
        )
    } else if (holidaySummary.kind === 'hourly_hours') {
        primaryLabel = `${holidaySummary.holidayHours.toFixed(2)} hrs taken`
        detailLines.push(
            `~${holidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement`,
            `${holidaySummary.hoursRemaining.toFixed(1)} hrs remaining${holidaySummary.overrun ? OVERRUN_SUFFIX : ''}`,
            holidaySummary.useAccrualMethod
                ? ACCRUAL_METHOD_HOURLY_LABEL
                : ACCRUAL_METHOD_AVG_WEEK_LABEL
        )
    } else if (holidaySummary.hasVariablePattern) {
        detailLines.push(VARIABLE_PATTERN_DAYS_NOTE)
    }

    if (holidaySummary.leaveYearLabel) {
        detailLines.push(holidaySummary.leaveYearLabel)
    }

    return { primaryLabel, detailLines }
}

/**
 * @param {any} summary
 * @returns {string[]}
 */
export function buildTotalHolidayBreakdownLines(summary) {
    if (!summary) {
        return []
    }
    if (summary.kind === 'salary_days') {
        return [
            `~${summary.daysTaken.toFixed(1)} days taken / ${summary.daysRemaining.toFixed(1)} remaining${summary.overrun ? OVERRUN_SUFFIX : ''}`,
        ]
    }
    if (summary.kind === 'hourly_days') {
        return [
            `~${summary.entitlementHours.toFixed(1)} hrs/yr entitlement`,
            `${summary.hoursRemaining.toFixed(1)} hrs remaining${summary.overrun ? OVERRUN_SUFFIX : ''}`,
            `~${summary.daysTaken.toFixed(1)} days taken / ${summary.daysRemaining.toFixed(1)} remaining`,
            FIXED_DAYS_PROFILE_LABEL,
        ]
    }
    if (summary.kind === 'hourly_hours') {
        return [
            `~${summary.entitlementHours.toFixed(1)} hrs/yr entitlement`,
            `${summary.hoursRemaining.toFixed(1)} hrs remaining${summary.overrun ? OVERRUN_SUFFIX : ''}`,
            summary.useAccrualMethod
                ? ACCRUAL_METHOD_HOURLY_LABEL
                : ACCRUAL_METHOD_AVG_WEEK_LABEL,
        ]
    }
    return []
}

/**
 * @param {any} holidaySummary
 * @returns {{ primaryLabel: string, detailLines: string[], detailMode: 'inline' | 'block' }}
 */
export function buildYearRowHolidayDisplay(holidaySummary) {
    if (holidaySummary.kind === 'hours_days') {
        return {
            primaryLabel: `${holidaySummary.holidayHours.toFixed(2)} hrs`,
            detailLines: [
                `(~ ${holidaySummary.estimatedDays.toFixed(1)} days)`,
            ],
            detailMode: 'inline',
        }
    }
    if (
        holidaySummary.kind === 'hours_only' &&
        holidaySummary.accruedHours !== null &&
        holidaySummary.accruedHours > 0
    ) {
        return {
            primaryLabel: `${holidaySummary.holidayHours.toFixed(2)} hrs`,
            detailLines: [
                `+${holidaySummary.accruedHours.toFixed(1)} hrs accrued`,
            ],
            detailMode: 'block',
        }
    }
    return {
        primaryLabel: `${holidaySummary.holidayHours.toFixed(2)} hrs`,
        detailLines: [],
        detailMode: 'inline',
    }
}

/**
 * @param {'high' | 'medium' | 'low'} level
 * @returns {string}
 */
function formatConfidenceLevel(level) {
    if (level === 'high') {
        return 'High'
    }
    if (level === 'low') {
        return 'Low'
    }
    return 'Medium'
}

/**
 * @param {'aligned' | 'review' | 'mismatch'} status
 * @returns {string}
 */
function formatAnnualStatus(status) {
    if (status === 'mismatch') {
        return 'Material mismatch'
    }
    if (status === 'review') {
        return 'Review'
    }
    return 'Aligned'
}

/**
 * @param {any} annualCrossCheck
 * @param {number} holidayHours
 * @returns {{ title: string, statusLabel: string, summaryLines: string[] }}
 */
export function buildAnnualCrossCheckDisplay(annualCrossCheck, holidayHours) {
    if (!annualCrossCheck) {
        return {
            title: ANNUAL_CROSS_CHECK_TITLE,
            statusLabel: 'Not available',
            summaryLines: [],
        }
    }

    const payDirection =
        annualCrossCheck.payVarianceAmount < 0
            ? 'below'
            : annualCrossCheck.payVarianceAmount > 0
              ? 'above'
              : 'in line with'
    const payVarianceLabel =
        annualCrossCheck.payVarianceAmount === 0
            ? 'Expected and actual holiday pay are aligned.'
            : `Actual holiday pay is ${formatCurrency(Math.abs(annualCrossCheck.payVarianceAmount))} ${payDirection} expected (${Math.abs(annualCrossCheck.payVariancePercent).toFixed(1)}%).`
    const remaining = annualCrossCheck.remainingHoursComparison
    const remainingSummary =
        annualCrossCheck.remainingComparisonHasIndependentSource
            ? `Remaining hours: reported ${remaining.recordedRemaining.toFixed(1)} hrs vs expected ${remaining.expectedRemaining.toFixed(1)} hrs.`
            : `Remaining hours are model-derived (${remaining.recordedRemaining.toFixed(1)} hrs), with expected ${remaining.expectedRemaining.toFixed(1)} hrs (informational only).`
    const confidenceReasons = annualCrossCheck.confidence.reasons.length
        ? `: ${annualCrossCheck.confidence.reasons.join('; ')}`
        : ''

    return {
        title: ANNUAL_CROSS_CHECK_TITLE,
        statusLabel: formatAnnualStatus(annualCrossCheck.status),
        summaryLines: [
            `Recorded ${holidayHours.toFixed(2)} holiday hrs; pay received implies ${annualCrossCheck.impliedHolidayHours.toFixed(2)} hrs at the baseline rate.`,
            `${payVarianceLabel} ${remainingSummary}`,
            `Confidence: ${formatConfidenceLevel(annualCrossCheck.confidence.level)}${confidenceReasons}`,
        ],
    }
}

/**
 * @param {any} monthBreakdownEntry
 * @returns {{ referenceLabel: string, mixedMonthLabel: string, signalsLabel: string }}
 */
export function buildAnnualMonthBreakdownDisplay(monthBreakdownEntry) {
    const reference = monthBreakdownEntry?.referenceState
    const referenceLabel = !reference?.hasBaseline
        ? 'No baseline'
        : `${(reference.avgWeeklyHours ?? 0).toFixed(2)} hrs/wk @ ${formatCurrency(reference.avgRatePerHour ?? 0)} (${reference.confidenceLevel || 'unknown'})`
    const signalsLabel = (monthBreakdownEntry?.signalsFired || []).length
        ? monthBreakdownEntry.signalsFired
              .map((/** @type {{ label: string }} */ signal) => signal.label)
              .join('; ')
        : 'None'
    return {
        referenceLabel,
        mixedMonthLabel: monthBreakdownEntry?.mixedMonthIncluded
            ? 'Included'
            : 'No',
        signalsLabel,
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
 * @param {{ dateLabel: string, type: string, label: string, amount: number, units?: number | null, rate?: number | null }} item
 * @returns {string}
 */
export function buildMiscReviewLine(item) {
    const display = buildMiscReviewDisplay(item)
    return `${item.dateLabel}: ${display.typeLabel}: ${item.label} (${display.detailLabel}): ${display.amountLabel}`
}
