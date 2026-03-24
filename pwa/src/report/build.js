/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 */

import {
    buildMissingMonthsHtml,
    buildMissingMonthsLabel,
    formatMonthLabel,
} from '../parse/parser_config.js'
import {
    buildHolidayPayFlags,
    buildYearHolidayContext,
} from './holiday_calculations.js'
import { buildValidation } from './hourly_pay_calculations.js'
import { buildContributionSummary } from './pension_calculations.js'
import { buildReportEntries } from './report_calculations.js'
import {
    APRIL_BOUNDARY_NOTE,
    buildContributionRecencyDisplay,
    buildDiffDisplay,
    buildMiscReviewDisplay,
    buildWorkerProfileDisplay,
    formatBreakdownCell,
    formatContribution,
    formatContributionDifference,
    formatCurrency,
    formatDeduction,
    ZERO_TAX_ALLOWANCE_NOTE,
} from './report_formatters.js'
import {
    buildPayslipViewModel,
    buildSummaryViewModel,
    buildYearViewModel,
} from './report_view_model.js'
import {
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getCalendarMonthFromFiscalIndex,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
} from './tax_year_utils.js'
import { buildLeaveYearGroups } from './year_holiday_summary.js'

const timing = /** @type {any} */ (globalThis).__payrollTiming || null

/**
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ date: Date | null, type: string, amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number, balance: number }} ContributionMonthSummary
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number }} ContributionYearTotals
 * @typedef {{ months: Map<number, ContributionMonthSummary>, totals: ContributionYearTotals, yearEndBalance: number }} ContributionYearSummary
 * @typedef {{ years: Map<string, ContributionYearSummary>, balance: number, sourceFiles: string[] }} ContributionSummary
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 * @typedef {ReportEntry[] & { yearKey?: string, reconciliation?: ContributionYearSummary | null }} YearEntries
 * @typedef {PayrollRecord[] & { contributionData?: ContributionData }} PayrollRecordCollection
 * @typedef {{ fileCount: number, recordCount: number, dateRangeLabel: string }} ContributionMeta
 * @typedef {{ workerType: string | null, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }} WorkerProfileContext
 * @typedef {{ flaggedCount: number, lowConfidenceCount: number, flaggedPeriods: string[] }} ValidationSummary
 * @typedef {{ dateRangeLabel: string, missingMonthsLabel: string, missingMonthsHtml: string, missingMonthsByYear: Record<string, string[]>, contributionMeta: ContributionMeta, validationSummary: ValidationSummary }} ReportStats
 * @typedef {{ entries: ReportEntry[], yearGroups: Map<string, YearEntries>, yearKeys: string[], contributionSummary: ContributionSummary | null, contributionMeta: ContributionMeta, reportGeneratedLabel: string, missingMonths: { missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }, validationSummary: { flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }, contributionTotals: { payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }, contributionRecency: { lastContributionLabel: string, daysSinceContribution: number | null, daysThreshold: number }, workerProfile: { workerType: string | null, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }, contractTypeMismatchWarning: string | null, leaveYearGroups: Map<string, YearEntries> }} ReportContext
 */

const APRIL_BOUNDARY_NOTE_HTML = `<b>Note:</b> <i>${APRIL_BOUNDARY_NOTE}</i>`
const ZERO_TAX_ALLOWANCE_NOTE_HTML = `<b>Note:</b> <i>${ZERO_TAX_ALLOWANCE_NOTE}</i>`

/**
 * @param {string | number} yearKey
 * @returns {string}
 */
function formatYearAnchor(yearKey) {
    return String(yearKey || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
}

/**
 * @param {{ workerTypeLabel: string, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonthName: string }} workerProfile
 * @returns {string}
 */
function formatWorkerProfileHtml(workerProfile) {
    const display = buildWorkerProfileDisplay(workerProfile)
    return `<b>Type:</b> ${display.typeValue} &nbsp;·&nbsp; <b>Typical days:</b> ${display.typicalDaysValue} &nbsp;·&nbsp; <b>Holiday entitlement:</b> ${display.entitlementValue} &nbsp;·&nbsp; <b>Leave year starts:</b> ${display.leaveYearValue}`
}

/**
 * @param {any} summary
 * @returns {string}
 */
function formatTotalHolidayBreakdown(summary) {
    if (!summary) return ''
    if (summary.kind === 'salary_days') {
        return (
            `<br><span class="summary-breakdown">` +
            `≈${summary.daysTaken.toFixed(1)} days taken` +
            ` / ${summary.daysRemaining.toFixed(1)} remaining${summary.overrun ? ' (entitlement exceeded)' : ''}` +
            `</span>`
        )
    }
    if (summary.kind === 'hourly_days') {
        return (
            `<br><span class="summary-breakdown">` +
            `≈${summary.entitlementHours.toFixed(1)} hrs/yr entitlement` +
            `<br>${summary.hoursRemaining.toFixed(1)} hrs remaining${summary.overrun ? ' (entitlement exceeded)' : ''}` +
            `<br>≈${summary.daysTaken.toFixed(1)} days taken` +
            ` / ${summary.daysRemaining.toFixed(1)} remaining` +
            `</span>`
        )
    }
    if (summary.kind === 'hourly_hours') {
        return (
            `<br><span class="summary-breakdown">` +
            `≈${summary.entitlementHours.toFixed(1)} hrs/yr entitlement` +
            `<br>${summary.hoursRemaining.toFixed(1)} hrs remaining${summary.overrun ? ' (entitlement exceeded)' : ''}` +
            `<br><em>${summary.useAccrualMethod ? '12.07% accrual method' : '5.6 week avg. method'}</em>` +
            `</span>`
        )
    }
    return ''
}

/**
 * @param {any} holidaySummary
 * @returns {string}
 */
function formatYearSummaryHolidayHtml(holidaySummary) {
    const leaveYearNote = holidaySummary.leaveYearLabel
        ? `<br><span class="summary-breakdown">${holidaySummary.leaveYearLabel}</span>`
        : ''
    if (holidaySummary.kind === 'salary_days') {
        return (
            `${formatCurrency(holidaySummary.holidayAmount)}<br>` +
            `<span class="summary-breakdown">≈${holidaySummary.daysTaken.toFixed(1)} days taken` +
            ` / ${holidaySummary.daysRemaining.toFixed(1)} remaining${holidaySummary.overrun ? ' (entitlement exceeded)' : ''}</span>` +
            leaveYearNote
        )
    }
    if (holidaySummary.kind === 'salary_amount') {
        return formatCurrency(holidaySummary.holidayAmount) + leaveYearNote
    }
    if (holidaySummary.kind === 'hourly_days') {
        return (
            `${holidaySummary.holidayHours.toFixed(2)} hrs taken<br>` +
            `<span class="summary-breakdown">` +
            `≈${holidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement<br>` +
            `${holidaySummary.hoursRemaining.toFixed(1)} hrs remaining${holidaySummary.overrun ? ' (entitlement exceeded)' : ''}<br>` +
            `≈${holidaySummary.daysTaken.toFixed(1)} days taken` +
            ` / ${holidaySummary.daysRemaining.toFixed(1)} remaining` +
            `</span>` +
            leaveYearNote
        )
    }
    if (holidaySummary.kind === 'hourly_hours') {
        return (
            `${holidaySummary.holidayHours.toFixed(2)} hrs taken<br>` +
            `<span class="summary-breakdown">` +
            `≈${holidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement<br>` +
            `${holidaySummary.hoursRemaining.toFixed(1)} hrs remaining${holidaySummary.overrun ? ' (entitlement exceeded)' : ''}<br>` +
            `<em>${holidaySummary.useAccrualMethod ? '12.07% accrual method' : '5.6 week avg. method'}</em>` +
            `</span>` +
            leaveYearNote
        )
    }
    const variablePatternNote = holidaySummary.hasVariablePattern
        ? `<br><span class="summary-breakdown">Days estimate not shown — variable work pattern</span>`
        : ''
    return `${holidaySummary.holidayHours.toFixed(2)} hrs${leaveYearNote}${variablePatternNote}`
}

/**
 * @param {any} holidaySummary
 * @returns {string}
 */
function formatYearRowHolidayHtml(holidaySummary) {
    if (holidaySummary.kind === 'hours_days') {
        return `${holidaySummary.holidayHours.toFixed(2)} hrs<br><span class="summary-breakdown">≈${holidaySummary.estimatedDays.toFixed(1)} days</span>`
    }
    if (
        holidaySummary.kind === 'hours_only' &&
        holidaySummary.accruedHours !== null &&
        holidaySummary.accruedHours > 0
    ) {
        return `${holidaySummary.holidayHours.toFixed(2)} hrs<br><span class="summary-breakdown">+${holidaySummary.accruedHours.toFixed(1)} hrs accrued</span>`
    }
    return `${holidaySummary.holidayHours.toFixed(2)} hrs`
}

/**
 * @param {{ dateLabel: string, type: string, label: string, amount: number, units: number | null, rate: number | null }} item
 * @returns {string}
 */
function formatMiscReviewHtml(item) {
    const display = buildMiscReviewDisplay(item)
    return `<li>${item.dateLabel}: ${display.typeLabel}: ${item.label} (${display.detailLabel}): ${display.amountLabel}</li>`
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}${month}${day}${hours}${minutes}${seconds}`
}

/**
 * @param {PayrollRecordCollection} records
 * @param {string[]} [failedPayPeriods=[]]
 * @param {ContributionData | null} [contributionData=null]
 * @param {{ typicalDays?: number, workerType?: string, statutoryHolidayDays?: number | null, leaveYearStartMonth?: number } | null} [workerProfile=null]
 * @returns {{ html: string, filename: string, stats: ReportStats, context: ReportContext }}
 */
export function buildReport(
    records,
    failedPayPeriods = [],
    contributionData = null,
    workerProfile = null
) {
    if (!records.length) {
        throw new Error('No payroll records provided')
    }
    /**
     * @template T
     * @param {string} label
     * @param {() => T} callback
     * @param {Record<string, any> | null} [meta=null]
     * @returns {T}
     */
    const timeBuildPhase = (label, callback, meta = null) => {
        if (!timing?.enabled) {
            return callback()
        }
        timing.start(label, meta)
        try {
            return callback()
        } finally {
            timing.end(label)
        }
    }
    if (timing?.enabled) {
        timing.start('buildReport.total')
        timing.increment('buildReport.calls')
        timing.setMeta('buildReport.records', records.length)
    }
    try {
        const reportRunDate = new Date()
        const rawLeaveYear = workerProfile?.leaveYearStartMonth ?? 4
        const leaveYearStartMonth =
            Number.isInteger(rawLeaveYear) &&
            rawLeaveYear >= 1 &&
            rawLeaveYear <= 12
                ? rawLeaveYear
                : 4
        /** @type {ReportEntry[]} */
        const entries = timeBuildPhase('buildReport.entries', () =>
            buildReportEntries(records, leaveYearStartMonth)
        )

        timeBuildPhase('buildReport.validation', () => {
            entries.forEach((entry) => {
                entry.validation = buildValidation(entry)
            })
        })
        const workerType = workerProfile?.workerType ?? null
        const typicalDays = workerProfile?.typicalDays ?? 0
        const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? null

        timeBuildPhase('buildReport.holidayFlags', () => {
            buildHolidayPayFlags(entries)
        })
        timeBuildPhase('buildReport.holidayContext', () => {
            buildYearHolidayContext(entries, workerProfile)
        })

        let contractTypeMismatchWarning = null
        if (workerType === 'hourly') {
            const hasSalaryPayslip = entries.some(
                (entry) =>
                    (entry.record.payrollDoc?.payments?.salary?.basic?.amount ??
                        0) > 0
            )
            if (hasSalaryPayslip) {
                contractTypeMismatchWarning =
                    'Some payslips contain salaried pay (Basic Salary) but your worker profile is set to <b>Hourly</b>. If your contract changed part-way through, consider running separate reports for each contract period for accurate results.'
            }
        } else if (workerType === 'salary') {
            const hasHourlyPayslip = entries.some(
                (entry) =>
                    (entry.record.payrollDoc?.payments?.hourly?.basic?.units ??
                        0) > 0 ||
                    (entry.record.payrollDoc?.payments?.hourly?.holiday
                        ?.units ?? 0) > 0
            )
            if (hasHourlyPayslip) {
                contractTypeMismatchWarning =
                    'Some payslips contain hourly pay (Basic Hours) but your worker profile is set to <b>Salaried</b>. If your contract changed part-way through, consider running separate reports for each contract period for accurate results.'
            }
        }

        const yearGroups = timeBuildPhase('buildReport.grouping', () => {
            entries.sort((a, b) => {
                const yearA = getTaxYearSortKey(a.yearKey ?? 'Unknown')
                const yearB = getTaxYearSortKey(b.yearKey ?? 'Unknown')
                if (yearA !== yearB) {
                    return yearA - yearB
                }
                if (a.monthIndex !== b.monthIndex) {
                    return a.monthIndex - b.monthIndex
                }
                const fallbackA =
                    a.record.payrollDoc?.processDate?.date || 'Unknown'
                const fallbackB =
                    b.record.payrollDoc?.processDate?.date || 'Unknown'
                return fallbackA.localeCompare(fallbackB)
            })

            const groups = new Map()
            entries.forEach((entry) => {
                const key = entry.yearKey ?? 'Unknown'
                if (!groups.has(key)) {
                    groups.set(key, [])
                }
                const yearEntries = groups.get(key)
                if (yearEntries) {
                    yearEntries.push(entry)
                }
            })
            return groups
        })
        const leaveYearGroups = buildLeaveYearGroups(entries)
        const yearKeys = Array.from(yearGroups.keys())
        const contributionSummary = timeBuildPhase(
            'buildReport.contributions',
            () => {
                const summary = buildContributionSummary(
                    entries,
                    contributionData,
                    yearKeys
                )
                yearGroups.forEach(
                    (
                        /** @type {ReportEntry[]} */ entriesForYear,
                        /** @type {string} */ yearKey
                    ) => {
                        const yearEntriesWithReconciliation =
                            /** @type {YearEntries} */ (entriesForYear)
                        yearEntriesWithReconciliation.reconciliation =
                            summary?.years.get(yearKey) || null
                    }
                )
                return summary
            }
        )

        const derivedSummaryData = timeBuildPhase(
            'buildReport.derivedSummaries',
            () => {
                const parsedDates = entries
                    .map((entry) => entry.parsedDate)
                    .filter(
                        /** @returns {date is Date} */ (date) =>
                            date instanceof Date
                    )
                    .sort((a, b) => a.getTime() - b.getTime())
                const failedDates = failedPayPeriods
                    .map((period) => parsePayPeriodStart(period))
                    .filter((date) => date instanceof Date)
                const rangeStart = parsedDates[0] || null
                const rangeEnd = parsedDates[parsedDates.length - 1] || null
                const dateRangeLabel =
                    rangeStart && rangeEnd
                        ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
                        : 'Unknown'
                const contributionEntries = contributionData?.entries || []
                const contributionDates = contributionEntries
                    .map((entry) => entry.date)
                    .filter(
                        /** @returns {date is Date} */ (date) =>
                            date instanceof Date
                    )
                const lastContributionDate = contributionDates.length
                    ? new Date(
                          Math.max(
                              ...contributionDates.map((date) => date.getTime())
                          )
                      )
                    : null
                let contributionRangeLabel = 'None'
                if (contributionDates.length) {
                    const minContribution = new Date(
                        Math.min(
                            ...contributionDates.map((date) => date.getTime())
                        )
                    )
                    const maxContribution = new Date(
                        Math.max(
                            ...contributionDates.map((date) => date.getTime())
                        )
                    )
                    contributionRangeLabel = `${formatMonthYearLabel(minContribution)} – ${formatMonthYearLabel(maxContribution)}`
                } else if ((contributionData?.sourceFiles || []).length) {
                    contributionRangeLabel = 'Unknown'
                }
                const contributionMeta = {
                    fileCount: contributionData?.sourceFiles?.length || 0,
                    recordCount: contributionData?.entries?.length || 0,
                    dateRangeLabel: contributionRangeLabel,
                }
                const miscFootnotes =
                    /** @type {Array<{ type: string, dateLabel: string, item: PayrollPayItem | PayrollMiscDeduction }>} */ (
                        entries.reduce((/** @type {any[]} */ acc, entry) => {
                            const dateLabel = entry.parsedDate
                                ? formatDateLabel(entry.parsedDate)
                                : entry.record.payrollDoc?.processDate?.date ||
                                  'Unknown'
                            const miscPayments =
                                entry.record.payrollDoc?.payments?.misc || []
                            const miscDeductions =
                                entry.record.payrollDoc?.deductions?.misc || []
                            miscPayments.forEach((item) => {
                                acc.push({
                                    type: 'payment',
                                    dateLabel,
                                    item,
                                })
                            })
                            miscDeductions.forEach((item) => {
                                acc.push({
                                    type: 'deduction',
                                    dateLabel,
                                    item,
                                })
                            })
                            return acc
                        }, [])
                    )
                const missingMonths = buildMissingMonths(
                    yearGroups,
                    failedDates
                )
                const validationSummary = buildValidationSummary(entries)
                const hasLowPretaxPay = entries.some((entry) => {
                    const totalGrossPay =
                        entry.record.payrollDoc?.thisPeriod?.totalGrossPay
                            ?.amount
                    return (
                        typeof totalGrossPay === 'number' &&
                        totalGrossPay < 1048
                    )
                })
                const contributionTotalsResult = buildContributionTotals(
                    entries,
                    contributionSummary
                )
                const daysThreshold = 30
                const contributionRecency = buildContributionRecency(
                    lastContributionDate,
                    reportRunDate,
                    daysThreshold
                )
                return {
                    rangeStart,
                    rangeEnd,
                    dateRangeLabel,
                    contributionMeta,
                    miscFootnotes,
                    missingMonths,
                    validationSummary,
                    hasLowPretaxPay,
                    contributionTotalsResult,
                    daysThreshold,
                    contributionRecency,
                }
            }
        )
        const {
            rangeStart,
            rangeEnd,
            dateRangeLabel,
            contributionMeta,
            miscFootnotes,
            missingMonths,
            validationSummary,
            hasLowPretaxPay,
            contributionTotalsResult,
            daysThreshold,
            contributionRecency,
        } = derivedSummaryData
        const {
            missingMonthsByYear,
            hasMissingMonths,
            missingMonthsLabel,
            missingMonthsHtml,
        } = missingMonths
        const {
            flaggedEntries,
            lowConfidenceEntries,
            flaggedPeriods,
            validationPill,
        } = validationSummary
        const {
            payrollEE,
            payrollER,
            payrollContribution,
            pensionEE,
            pensionER,
            reportedContribution,
            contributionDifference,
        } = contributionTotalsResult
        const { daysSinceContribution, lastContributionLabel } =
            contributionRecency

        const employeeName = records[0].employee?.name || 'Unknown'
        /** @type {string[]} */
        const reportSections = []
        const formatOrNA = (/** @type {number | null} */ value) =>
            value === null ? 'N/A' : formatCurrency(value)
        const formatDifference = () => {
            return formatContributionDifference(contributionDifference)
        }
        const formatYearDiff = (
            /** @type {number | null} */ value,
            isZeroReview = false
        ) => {
            const diff = buildDiffDisplay(value, isZeroReview)
            if (diff.className === null) {
                return 'N/A'
            }
            return `<span class="${diff.className}">${diff.text}</span>`
        }
        const formatDaysSince = () => {
            if (daysSinceContribution === null) {
                return 'N/A'
            }
            const daysClass =
                daysSinceContribution > daysThreshold
                    ? 'days--stale'
                    : 'days--fresh'
            return `<span class="${daysClass}">${daysSinceContribution} days</span>`
        }

        const reportGeneratedLabel = reportRunDate.toLocaleString('en-GB')
        const pdfCountLabel = `${records.length} PDF${records.length === 1 ? '' : 's'}`
        const pensionFileLabel = contributionMeta.fileCount
            ? `${contributionMeta.fileCount} file${contributionMeta.fileCount === 1 ? '' : 's'} (${contributionMeta.recordCount} records)`
            : 'None'

        const monthNames = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ]
        const leaveYearStartMonthName =
            monthNames[leaveYearStartMonth - 1] || 'April'
        const workerTypeLabel = workerType
            ? workerType.charAt(0).toUpperCase() + workerType.slice(1)
            : 'Not specified'

        const workerProfileHtml = formatWorkerProfileHtml({
            workerTypeLabel,
            typicalDays,
            statutoryHolidayDays,
            leaveYearStartMonthName,
        })
        const summaryViewModel = buildSummaryViewModel(
            {
                entries,
                yearGroups,
                contributionSummary,
                reportGeneratedLabel,
                contributionMeta,
                missingMonths: {
                    missingMonthsByYear,
                },
                validationSummary: {
                    flaggedPeriods,
                    lowConfidenceEntries,
                },
                contributionTotals: contributionTotalsResult,
                contributionRecency: {
                    ...contributionRecency,
                    daysThreshold,
                },
                workerProfile: {
                    workerType,
                    typicalDays,
                    statutoryHolidayDays,
                    leaveYearStartMonth,
                },
                contractTypeMismatchWarning,
                leaveYearGroups,
            },
            {
                employeeName,
                dateRangeLabel,
            }
        )
        /**
         * @param {Array<{ year: string, months: string[] }>} groupedMonths
         * @param {string} emptyLabel
         * @returns {string}
         */
        const formatGroupedMonthsHtml = (groupedMonths, emptyLabel) => {
            if (!groupedMonths || !groupedMonths.length) {
                return `<span class="validation-none">${emptyLabel}</span>`
            }
            return groupedMonths
                .map(
                    (
                        /** @type {{ year: string, months: string[] }} */ group
                    ) => {
                        const { year, months } = group
                        return `<span class="missing-year">${year}:</span> ${months.map((/** @type {string} */ m) => `<span class="pill pill--warn inline">${m}</span>`).join(' ')}`
                    }
                )
                .join('<br>')
        }
        /**
         * @param {Array<{ year: string, items: string[] }>} groupedPeriods
         * @param {string} emptyLabel
         * @returns {string}
         */
        const formatGroupedPeriodsHtml = (groupedPeriods, emptyLabel) => {
            if (!groupedPeriods || !groupedPeriods.length) {
                return `<span class="validation-none">${emptyLabel}</span>`
            }
            return groupedPeriods
                .map(
                    (
                        /** @type {{ year: string, items: string[] }} */ group
                    ) => {
                        const { year, items } = group
                        return `<span class="missing-year">${year}:</span> <span class="meta-pills">${items.map((/** @type {string} */ item) => `<span class="pill pill--warn inline">${item}</span>`).join(' ')}</span>`
                    }
                )
                .join('<br>')
        }
        const summaryMetaRowsHtml = summaryViewModel.metaRows
            .map((/** @type {any} */ row) => {
                let value = row.displayValue ?? row.value ?? ''
                if (row.id === 'worker-profile') {
                    value = workerProfileHtml
                } else if (row.id === 'missing-payroll-months') {
                    value = formatGroupedMonthsHtml(
                        row.groupedMonths,
                        row.emptyLabel || 'None'
                    )
                } else if (row.id === 'flagged-periods') {
                    value = formatGroupedPeriodsHtml(
                        row.groupedPeriods,
                        row.emptyLabel || 'None'
                    )
                } else if (row.id === 'low-confidence-periods') {
                    value = formatGroupedPeriodsHtml(
                        row.groupedPeriods,
                        row.emptyLabel || '0'
                    )
                }
                return `<tr><th>${row.label}:</th><td>${value}</td></tr>`
            })
            .join('')
        const summaryYearRowsHtml = summaryViewModel.yearSummaryRows
            .map((/** @type {any} */ row) => {
                const flagIcon = row.hasFlags ? '⚠︎' : '—'
                return (
                    '<tr>' +
                    `<th><a href="#${row.anchorId}">${row.yearKey}</a></th>` +
                    `<td>${row.hours.toFixed(2)}</td>` +
                    `<td>${formatYearSummaryHolidayHtml(row.holidaySummary)}</td>` +
                    `<td>${formatBreakdownCell(
                        row.payrollContribution.total,
                        row.payrollContribution.ee,
                        row.payrollContribution.er
                    )}</td>` +
                    `<td>${formatBreakdownCell(
                        row.reportedContribution.total,
                        row.reportedContribution.ee,
                        row.reportedContribution.er,
                        true
                    )}</td>` +
                    `<td>${formatYearDiff(row.overUnder, row.zeroReview)}</td>` +
                    `<td>${flagIcon}</td>` +
                    '</tr>'
                )
            })
            .join('')
        const summaryAccumulatedTotals = summaryViewModel.accumulatedTotals
        const summaryRecencyDisplay = buildContributionRecencyDisplay(
            summaryAccumulatedTotals.contributionRecency,
            daysThreshold
        )
        const summaryDaysHtml = summaryRecencyDisplay.className
            ? `<span class="${summaryRecencyDisplay.className}">${summaryRecencyDisplay.daysLabel}</span>`
            : summaryRecencyDisplay.daysLabel
        const summaryMiscReviewHtml = summaryViewModel.miscReviewItems.length
            ? `<div class="report-footnote"><p>† Misc entries to review</p><ul>${summaryViewModel.miscReviewItems.map((/** @type {any} */ item) => formatMiscReviewHtml(item)).join('')}</ul></div>`
            : ''
        const summaryNotesHtml = summaryViewModel.notes
            .map(
                (/** @type {any} */ note) =>
                    `<div class="report-footnote"><b>Note:</b> <i>${note.text}</i></div>`
            )
            .join('')

        timeBuildPhase('buildReport.annualRender', () => {
            const summaryHeading = summaryViewModel.heading
            reportSections.push('<div class="page">')
            reportSections.push(
                `<div class="report-meta">` +
                    `<h2>Payroll Report — ${summaryHeading.employeeName}</h2>` +
                    `<p class="report-range">${summaryHeading.dateRangeLabel}</p>` +
                    `<p class="report-meta-generated"><b>Generated:</b> ${summaryHeading.generatedLabel || 'Unknown'}</p>` +
                    `<div class="report-meta-table-container notice no-left-border">` +
                    `<table class="report-meta-table ">` +
                    `${summaryMetaRowsHtml}` +
                    `</table>` +
                    `</div>` +
                    `</div>`
            )
            if (summaryViewModel.contractTypeMismatchWarning) {
                reportSections.push(
                    `<div class="report-warning-banner"><span class="warning-icon">⚠︎</span> ${summaryViewModel.contractTypeMismatchWarning}</div>`
                )
            }
            reportSections.push(
                `<h2>Annual Totals:    (${summaryHeading.dateRangeLabel})</h2>`
            )

            if (summaryYearRowsHtml) {
                reportSections.push(
                    '<table class="summary-table"><thead><tr>' +
                        '<th>Tax Year</th><th>Hours</th><th>Holiday <span class="summary-breakdown">(hrs / est. days)</span></th>' +
                        '<th>Payroll Cont. <span class="summary-breakdown">(EE+ER)</span></th><th>Reported <span class="summary-breakdown">(EE+ER)</span></th>' +
                        '<th>YE Over / Under</th><th>Flags</th>' +
                        '</tr></thead>' +
                        `<tbody>${summaryYearRowsHtml}</tbody>` +
                        '</table>'
                )
            }

            reportSections.push(`<h3>Accumulated Pension:</h3>`)

            reportSections.push(
                '<table class="summary-table"><thead><tr>' +
                    '<th colspan="2">Date Range</th><th>Payroll Cont. (EE+ER)</th>' +
                    '<th>Reported (EE+ER)</th><th>Accumulated Over/Under</th>' +
                    '<th>Last Contribution Date</th></tr></thead>' +
                    '<tbody><tr>' +
                    `<td colspan="2">${summaryAccumulatedTotals.dateRangeLabel}</td>` +
                    `<td>${formatBreakdownCell(summaryAccumulatedTotals.payrollContribution.total, summaryAccumulatedTotals.payrollContribution.ee, summaryAccumulatedTotals.payrollContribution.er)}</td>` +
                    `<td>${formatBreakdownCell(
                        summaryAccumulatedTotals.reportedContribution.total,
                        summaryAccumulatedTotals.reportedContribution.ee,
                        summaryAccumulatedTotals.reportedContribution.er,
                        true
                    )}</td>` +
                    `<td>${formatContributionDifference(summaryAccumulatedTotals.contributionDifference)}</td>` +
                    `<td>${summaryRecencyDisplay.lastContributionLabel}<br>${summaryDaysHtml}</td>` +
                    '</tr></tbody>' +
                    '</table>'
            )

            if (summaryMiscReviewHtml) {
                reportSections.push(summaryMiscReviewHtml)
            }
            reportSections.push(summaryNotesHtml)
            reportSections.push('</div>')
        })

        timeBuildPhase('buildReport.yearPages', () => {
            Array.from(yearGroups.keys()).forEach((yearKey) => {
                const entriesForYear = yearGroups.get(yearKey)
                if (!entriesForYear) {
                    return
                }
                /** @type {any} */ entriesForYear.yearKey = yearKey
                const yearKeys2 = Array.from(yearGroups.keys())
                const yearIndex2 = yearKeys2.indexOf(yearKey)
                let openingBalance2 = 0
                if (yearIndex2 > 0 && contributionSummary) {
                    for (let i = 0; i < yearIndex2; i += 1) {
                        openingBalance2 +=
                            contributionSummary.years.get(yearKeys2[i])?.totals
                                ?.delta ?? 0
                    }
                }
                const yearViewModel = buildYearViewModel(
                    entriesForYear,
                    String(yearKey),
                    {
                        entries,
                        missingMonths: {
                            missingMonthsByYear,
                        },
                        workerProfile,
                    },
                    openingBalance2
                )
                reportSections.push('<div class="page">')
                reportSections.push(
                    `<h2 id="${yearViewModel.heading.anchorId}">${yearViewModel.heading.yearKey} Summary: ${employeeName}</h2>`
                )
                if (yearViewModel.missingMonths.length) {
                    const yearMissingPill = `Missing months: <span class="missing-months">${yearViewModel.missingMonths.join(', ')}</span>`
                    reportSections.push(
                        `<p class="report-missing">${yearMissingPill}</p>`
                    )
                }
                reportSections.push(
                    renderYearSummaryFromViewModel(yearViewModel)
                )
                if (yearViewModel.flagNotes.length) {
                    const noteItems = yearViewModel.flagNotes
                        .map(
                            (
                                /** @type {{ index: number, label: string }} */ note
                            ) => `<li>${note.index} ${note.label}</li>`
                        )
                        .join('')
                    reportSections.push(
                        `<div class="report-footnote">` +
                            '<p>† Flag notes</p>' +
                            `<ul>${noteItems}</ul>` +
                            '</div>'
                    )
                }
                yearViewModel.notes.forEach(
                    (/** @type {{ text: string }} */ note) => {
                        reportSections.push(
                            `<p class="report-footnote"><b>Note:</b> <i>${note.text}</i></p>`
                        )
                    }
                )
                reportSections.push('</div>')
            })
        })

        timeBuildPhase('buildReport.payslipPages', () => {
            Array.from(yearGroups.keys()).forEach((yearKey) => {
                const entriesForYear = yearGroups.get(yearKey)
                if (!entriesForYear) {
                    return
                }
                const yearLabel =
                    yearKey === 'Unknown' ? 'Unknown Year' : yearKey
                const yearAnchor = `year-monthly-${formatYearAnchor(yearKey)}`
                const monthAnchors = new Set()

                entriesForYear.forEach(
                    (
                        /** @type {ReportEntry} */ entry,
                        /** @type {number} */ index
                    ) => {
                        reportSections.push('<div class="page">')
                        if (index === 0) {
                            reportSections.push(
                                `<h2 class="year-header" id="${yearAnchor}">Payslips: ${yearLabel}</h2>`
                            )
                        }
                        const monthIndex = entry.monthIndex
                        if (
                            monthIndex >= 1 &&
                            monthIndex <= 12 &&
                            !monthAnchors.has(monthIndex)
                        ) {
                            const monthAnchor = `year-monthly-${formatYearAnchor(
                                yearKey
                            )}-${String(monthIndex).padStart(2, '0')}`
                            reportSections.push(
                                `<div id="${monthAnchor}"></div>`
                            )
                            monthAnchors.add(monthIndex)
                        }
                        reportSections.push(renderReportCell(entry))
                        reportSections.push('</div>')
                    }
                )
            })
        })

        const reportResult = timeBuildPhase('buildReport.finalize', () => {
            const timestamp = formatTimestamp(reportRunDate)
            const dateStart = rangeStart ? formatDateKey(rangeStart) : 'unknown'
            const dateFinish = rangeEnd ? formatDateKey(rangeEnd) : 'unknown'
            const employeeSlug = employeeName.trim().replace(/\s+/g, '-')
            const filename = `${timestamp}-${employeeSlug}_${dateStart}-${dateFinish}.pdf`

            const validationSummaryResult = {
                flaggedEntries,
                lowConfidenceEntries,
                flaggedPeriods,
                validationPill,
            }
            const missingMonthsResult = {
                missingMonthsByYear,
                hasMissingMonths,
                missingMonthsLabel,
                missingMonthsHtml,
            }
            return {
                html: reportSections.join('\n'),
                filename,
                stats: {
                    dateRangeLabel,
                    missingMonthsLabel,
                    missingMonthsHtml,
                    missingMonthsByYear,
                    contributionMeta,
                    validationSummary: {
                        flaggedCount: flaggedEntries.length,
                        lowConfidenceCount: lowConfidenceEntries.length,
                        flaggedPeriods,
                    },
                },
                context: {
                    entries,
                    yearGroups,
                    yearKeys,
                    contributionSummary,
                    reportGeneratedLabel,
                    contributionMeta,
                    missingMonths: missingMonthsResult,
                    validationSummary: validationSummaryResult,
                    contributionTotals: contributionTotalsResult,
                    contributionRecency: {
                        ...contributionRecency,
                        daysThreshold,
                    },
                    workerProfile: {
                        workerType,
                        typicalDays,
                        statutoryHolidayDays,
                        leaveYearStartMonth,
                    },
                    contractTypeMismatchWarning,
                    leaveYearGroups: /** @type {Map<string, YearEntries>} */ (
                        leaveYearGroups
                    ),
                },
            }
        })
        if (timing?.enabled) {
            timing.setMeta('buildReport.entriesCount', entries.length)
            timing.setMeta('buildReport.yearGroups', yearKeys.length)
        }
        return reportResult
    } finally {
        if (timing?.enabled) {
            timing.end('buildReport.total')
        }
    }
}

/**
 * @param {Map<string | number, YearEntries>} yearGroups
 * @param {Date[]} failedDates
 * @returns {{ missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }}
 */
function buildMissingMonths(yearGroups, failedDates) {
    /** @type {Record<string, number[]>} */
    const failedMonthsByYear = {}
    failedDates.forEach((date) => {
        const yearKey = getTaxYearKey(date)
        const monthIndex = getFiscalMonthIndex(date)
        if (!yearKey || yearKey === 'Unknown' || !monthIndex) {
            return
        }
        if (!failedMonthsByYear[yearKey]) {
            failedMonthsByYear[yearKey] = []
        }
        if (!failedMonthsByYear[yearKey].includes(monthIndex)) {
            failedMonthsByYear[yearKey].push(monthIndex)
        }
    })

    const currentDate = new Date()
    const currentYearKey = getTaxYearKey(currentDate)
    const currentMonthIndex = getFiscalMonthIndex(currentDate)
    /** @type {Record<string, string[]>} */
    const missingMonthsByYear = {}
    yearGroups.forEach(
        (
            /** @type {ReportEntry[]} */ entriesForYear,
            /** @type {string | number} */ yearKey
        ) => {
            const presentMonths = entriesForYear
                .map((entry) => entry.monthIndex)
                .filter((month) => month >= 1 && month <= 12)
            const failedMonths = failedMonthsByYear[yearKey] || []
            const combinedMonths = presentMonths.concat(failedMonths)
            const maxMonth =
                yearKey === currentYearKey && currentMonthIndex
                    ? currentMonthIndex - 1
                    : 12
            if (maxMonth <= 0) {
                missingMonthsByYear[yearKey] = []
                return
            }
            if (!combinedMonths.length) {
                missingMonthsByYear[yearKey] = []
                return
            }
            const present = new Set([...presentMonths, ...failedMonths])
            const missing = []
            for (let month = 1; month <= maxMonth; month += 1) {
                if (!present.has(month)) {
                    const calendarMonth = getCalendarMonthFromFiscalIndex(month)
                    if (calendarMonth) {
                        missing.push(formatMonthLabel(calendarMonth))
                    }
                }
            }
            missingMonthsByYear[yearKey] = missing
        }
    )

    const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear)
    const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear)
    const hasMissingMonths = Object.values(missingMonthsByYear).some(
        (/** @type {string[]} */ months) => months.length
    )

    return {
        missingMonthsByYear,
        hasMissingMonths,
        missingMonthsLabel,
        missingMonthsHtml,
    }
}

/**
 * @param {ReportEntry[]} entries
 * @returns {{ flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }}
 */
function buildValidationSummary(entries) {
    const flaggedEntries = entries.filter(
        (entry) => entry.validation?.flags && entry.validation.flags.length
    )
    const lowConfidenceEntries = entries.filter(
        (entry) => entry.validation?.lowConfidence
    )
    const flaggedPeriods = flaggedEntries.map((entry) =>
        entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
    )
    const validationPill = flaggedEntries.length
        ? `Flags: <span class="validation-count">${flaggedEntries.length}</span> | ` +
          `Low confidence: <span class="validation-count">${lowConfidenceEntries.length}</span>`
        : 'Validation flags: None'
    return {
        flaggedEntries,
        lowConfidenceEntries,
        flaggedPeriods,
        validationPill,
    }
}

/**
 * @param {ReportEntry[]} entries
 * @param {ContributionSummary | null} contributionSummary
 * @returns {{ payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }}
 */
function buildContributionTotals(entries, contributionSummary) {
    const totals = entries.reduce(
        (acc, entry) => {
            acc.nestEmployee +=
                entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
            acc.nestEmployer +=
                entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
            // acc.miscPayments += sumMiscAmounts(
            //     entry.record.payrollDoc?.payments?.misc || []
            // )
            // acc.miscDeductions += sumMiscAmounts(
            //     entry.record.payrollDoc?.deductions?.misc || []
            // )
            return acc
        },
        {
            nestEmployee: 0,
            nestEmployer: 0,
            // TODO: miscPayments and miscDeductions aggregates are computed here
            // for potential use as summary table columns (e.g. "Misc Pay" / "Misc Ded."
            // per year). Not implemented yet — misc items are already shown via the
            // per-payslip card and the per-year/global footnote sections.

            // miscPayments: 0,
            // miscDeductions: 0,
        }
    )

    const payrollEE = totals.nestEmployee
    const payrollER = totals.nestEmployer
    const payrollContribution = payrollEE + payrollER

    let pensionEE = null
    let pensionER = null
    let reportedContribution = null
    let contributionDifference = null

    if (contributionSummary) {
        const pensionTotals = Array.from(
            contributionSummary.years.values()
        ).reduce(
            (acc, yearData) => {
                acc.ee += yearData.totals.actualEE || 0
                acc.er += yearData.totals.actualER || 0
                return acc
            },
            { ee: 0, er: 0 }
        )
        pensionEE = pensionTotals.ee
        pensionER = pensionTotals.er
        reportedContribution = pensionEE + pensionER
        contributionDifference = reportedContribution - payrollContribution
    }

    return {
        payrollEE,
        payrollER,
        payrollContribution,
        pensionEE,
        pensionER,
        reportedContribution,
        contributionDifference,
    }
}

/**
 * @param {Date | null} lastContributionDate
 * @param {Date} reportRunDate
 * @param {number} daysThreshold
 * @returns {{ daysSinceContribution: number | null, lastContributionLabel: string }}
 */
function buildContributionRecency(
    lastContributionDate,
    reportRunDate,
    daysThreshold
) {
    let daysSinceContribution = null
    let lastContributionLabel = 'N/A'
    if (lastContributionDate) {
        const millisecondsSince =
            reportRunDate.getTime() - lastContributionDate.getTime()
        const dayCount = Math.floor(millisecondsSince / (1000 * 60 * 60 * 24))
        daysSinceContribution = Math.max(0, dayCount)
        lastContributionLabel = formatDateLabel(lastContributionDate)
    }
    return { daysSinceContribution, lastContributionLabel }
}

/**
 * @param {ReportEntry} entry
 * @returns {string}
 */
function renderReportCell(entry) {
    const record = entry.record
    const payslipViewModel = buildPayslipViewModel(entry)
    const noImages = Boolean(
        globalThis?.location &&
        new URLSearchParams(globalThis.location.search).get('noimg') === '1'
    )
    const imageHtml =
        !noImages && payslipViewModel.imageData
            ? `<img class="report-image" src="${payslipViewModel.imageData}" alt="${payslipViewModel.dateLabel}" />`
            : ''
    const corePaymentRows = payslipViewModel.paymentRows.filter(
        (row) => row.group === 'core'
    )
    const miscPaymentRows = payslipViewModel.paymentRows.filter(
        (row) => row.group === 'misc'
    )
    const coreDeductionRows = payslipViewModel.deductionRows.filter(
        (row) => row.group === 'core'
    )
    const miscDeductionRows = payslipViewModel.deductionRows.filter(
        (row) => row.group === 'misc'
    )
    const summaryDeductionRows = payslipViewModel.deductionRows.filter(
        (row) => row.group === 'summary'
    )
    const warningItems = payslipViewModel.warnings.map(
        (/** @type {string} */ warning) => `<li>${warning}</li>`
    )
    const warningsHtml = warningItems.length
        ? `<div class="notice callout"><ul class="report-warning-list">${warningItems.join('')}</ul></div>`
        : ''

    const rows = [
        '<table class="report-table">',
        `<tr class="report-row--section-start"><th class="row-header" align="left">Date</th><td>${payslipViewModel.dateLabel}</td></tr>`,
        '<tr><th class="row-header" align="left" colspan="2">Payments</th></tr>',
    ]

    for (const item of corePaymentRows) {
        const breakdown =
            item.units != null && item.rate != null && item.rate !== 0
                ? ` (${Number(item.units).toFixed(2)} @ ${formatCurrency(Number(item.rate))})`
                : ''
        const estSuffix = item.holidayEstimatedDaysSuffix
            ? ` <span class="holiday-est-days">${item.holidayEstimatedDaysSuffix}</span>`
            : ''
        rows.push(
            `<tr><th align="left">${item.label}${breakdown}${estSuffix}</th><td>${formatCurrency(
                item.amount || 0
            )}</td></tr>`
        )
    }

    if (miscPaymentRows.length) {
        rows.push(
            '<tr><th class="row-header" align="left" colspan="2">Misc Earnings</th></tr>',
            ...miscPaymentRows.map(
                (item) =>
                    `<tr><th align="left">${item.label}</th><td>${formatCurrency(
                        item.amount || 0
                    )}</td></tr>`
            )
        )
    }

    rows.push(
        '<tr><th class="row-header" align="left" colspan="2">Deductions</th></tr>'
    )
    coreDeductionRows.forEach((item) => {
        const amountLabel =
            item.amountType === 'deduction'
                ? formatDeduction(item.amount || 0)
                : `( ${formatContribution(item.amount || 0)} )`
        const amountClass =
            (item.id === 'nest-ee' || item.id === 'nest-er') &&
            item.amount === 0
                ? 'pension-zero'
                : ''
        const marker = item.marker ? ` <sup>${item.marker}</sup>` : ''
        rows.push(
            `<tr><th align="left">${item.label}${marker}</th><td class="${amountClass}">${amountLabel}</td></tr>`
        )
    })

    if (miscDeductionRows.length) {
        rows.push(
            '<tr><th class="row-header" align="left" colspan="2">Misc Deductions</th></tr>',
            ...miscDeductionRows.map(
                (item) =>
                    `<tr><th align="left">${item.label}</th><td>${formatDeduction(
                        item.amount
                    )}</td></tr>`
            )
        )
    }

    summaryDeductionRows.forEach((item) => {
        const rowClass =
            item.id === 'net-pay' ? ' class="report-row--total"' : ''
        rows.push(
            `<tr${rowClass}><th class="row-header" align="left">${item.label}</th><td>${formatCurrency(item.amount || 0)}</td></tr>`
        )
    })
    rows.push('</table>')

    let holidayAnalysisFootnote = ''
    if (payslipViewModel.holidayAnalysis) {
        const holidayAnalysis = payslipViewModel.holidayAnalysis
        const avgHrsPerDay = holidayAnalysis.avgHoursPerDay.toFixed(2)
        const avgHrsPerWeek = holidayAnalysis.avgHoursPerWeek.toFixed(2)
        const days = holidayAnalysis.typicalDays
        holidayAnalysisFootnote =
            `<div class="notice">` +
            `<p><b>Holiday analysis</b> (year average, <i>estimate only</i>):</p>` +
            `<ul><li>Avg ${avgHrsPerWeek}\u00a0hrs/week over ${days}\u00a0days \u2192 1\u00a0day\u00a0\u2248\u00a0${avgHrsPerDay}\u00a0hrs.</li>` +
            `<li>This payslip: ${holidayAnalysis.holidayHours.toFixed(2)}\u00a0hrs\u00a0\u2248\u00a0${holidayAnalysis.estimatedDays}\u00a0days.</li></ul>` +
            `<p>If <b>${holidayAnalysis.estimatedDays}</b>\u00a0days doesn\u2019t match the days you agreed, ask your employer how they calculated the number of hours for holiday.</p>` +
            `</div>`
    }

    const cellClass = payslipViewModel.flags.lowConfidence
        ? 'report-cell is-low-confidence'
        : 'report-cell'
    const employerContributionNote = payslipViewModel.footerNotes.find(
        (note) => note.id === 'employer-contribution'
    )
    const aprilBoundaryNote = payslipViewModel.footerNotes.find(
        (note) => note.id === 'april-boundary'
    )
    const erFootnote = employerContributionNote
        ? `<p class="report-footnote-row"><sup>${employerContributionNote.marker}</sup> ${employerContributionNote.text}</p>`
        : ''
    const aprilBoundaryFootnote = aprilBoundaryNote
        ? `<p class="report-footnote-row">${APRIL_BOUNDARY_NOTE_HTML}</p>`
        : ''

    return `
    <div class="${cellClass}">
      <div class="report-cell-image">${imageHtml}</div>
      <div class="report-cell-main">
        ${rows.join('\n')}
        ${warningsHtml}
        ${holidayAnalysisFootnote}
      </div>
      <div class="report-cell-footer">
        ${erFootnote}
        ${aprilBoundaryFootnote}
      </div>
    </div>
  `
}

/**
 * @param {any} yearViewModel
 * @returns {string}
 */
function renderYearSummaryFromViewModel(yearViewModel) {
    const formatDiff = (
        /** @type {number | null} */ value,
        isZeroReview = false
    ) => {
        const diff = buildDiffDisplay(value, isZeroReview)
        if (diff.className === null) {
            return 'N/A'
        }
        return `<span class="${diff.className}">${diff.text}</span>`
    }
    const bodyRows = yearViewModel.rows.map((/** @type {any} */ row) => {
        const monthCell =
            row.kind === 'entry'
                ? `<a href="#${row.monthAnchorId}">${row.monthLabel}</a>`
                : row.monthLabel
        const flagSummary = row.flagRefs.length ? row.flagRefs.join('; ') : '—'
        const flagClass = row.flagRefs.length ? 'summary-warning' : ''
        return (
            '<tr>' +
            `<th>${monthCell}</th>` +
            `<td>${row.hours.toFixed(2)}</td>` +
            `<td>${formatYearRowHolidayHtml(row.holidaySummary)}</td>` +
            `<td>${formatBreakdownCell(
                row.payrollContribution.total,
                row.payrollContribution.ee,
                row.payrollContribution.er
            )}</td>` +
            `<td>${formatBreakdownCell(
                row.reportedContribution.total,
                row.reportedContribution.ee,
                row.reportedContribution.er,
                true
            )}</td>` +
            `<td>${formatDiff(row.overUnder, row.zeroReview)}</td>` +
            `<td class="${flagClass}">${flagSummary}</td>` +
            '</tr>'
        )
    })
    const footerRows = yearViewModel.footerRows.map(
        (/** @type {any} */ row) => {
            if (row.id === 'total') {
                return (
                    '<tr>' +
                    `<th>${row.label}</th>` +
                    `<td>${row.hours.toFixed(2)}</td>` +
                    `<td>${row.holidayHours.toFixed(2)}${formatTotalHolidayBreakdown(row.yearHolidaySummary)}</td>` +
                    `<td>${formatBreakdownCell(
                        row.payrollContribution.total,
                        row.payrollContribution.ee,
                        row.payrollContribution.er
                    )}</td>` +
                    `<td>${formatBreakdownCell(
                        row.reportedContribution.total,
                        row.reportedContribution.ee,
                        row.reportedContribution.er,
                        true
                    )}</td>` +
                    `<td>${formatDiff(row.overUnder, row.zeroReview)}</td>` +
                    '<td>—</td>' +
                    '</tr>'
                )
            }
            return (
                '<tr>' +
                `<th>${row.label}</th>` +
                '<td colspan="4"></td>' +
                `<td colspan="1">${formatDiff(row.overUnder, row.zeroReview)}</td>` +
                '<td>—</td>' +
                '</tr>'
            )
        }
    )
    const sections = [
        '<table class="summary-table">' +
            '<thead><tr>' +
            '<th>Month</th><th>Hours</th><th>Holiday <span class="summary-breakdown">(hrs / est. days)</span></th>' +
            '<th>Payroll Cont. (EE+ER)</th><th>Reported (EE+ER)</th>' +
            '<th>Over / Under</th><th>Flags</th>' +
            '</tr></thead>' +
            `<tbody>${bodyRows.join('')}</tbody>` +
            '<tfoot>' +
            `${footerRows.join('')}` +
            '</tfoot>' +
            '</table>',
    ]

    if (yearViewModel.miscReviewItems.length) {
        const footnoteItems = yearViewModel.miscReviewItems
            .map((/** @type {any} */ item) => formatMiscReviewHtml(item))
            .join('')
        sections.push(
            `<div class="report-footnote">` +
                '<p>† Misc entries to review</p>' +
                `<ul>${footnoteItems}</ul>` +
                '</div>'
        )
    }

    return sections.join('')
}

export {
    buildContributionTotals,
    buildMissingMonths,
    buildValidationSummary,
    formatBreakdownCell,
    formatContributionDifference,
}
