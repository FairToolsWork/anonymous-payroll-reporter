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
    ACCUMULATED_TOTALS_NOTE,
    APRIL_BOUNDARY_NOTE,
    formatBreakdownCell,
    formatContribution,
    formatContributionDifference,
    formatCurrency,
    formatDeduction,
    formatMiscLabel,
    ZERO_TAX_ALLOWANCE_NOTE,
} from './report_formatters.js'
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
import {
    buildEntryHolidaySummary,
    buildLeaveYearGroups,
    buildYearHolidaySummary,
} from './year_holiday_summary.js'

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
 * @typedef {{ workerType: string | null, typicalDays: number, statutoryHolidayDays: number, leaveYearStartMonth: number }} WorkerProfileContext
 * @typedef {{ flaggedCount: number, lowConfidenceCount: number, flaggedPeriods: string[] }} ValidationSummary
 * @typedef {{ dateRangeLabel: string, missingMonthsLabel: string, missingMonthsHtml: string, missingMonthsByYear: Record<string, string[]>, contributionMeta: ContributionMeta, validationSummary: ValidationSummary }} ReportStats
 * @typedef {{ entries: ReportEntry[], yearGroups: Map<string, YearEntries>, yearKeys: string[], contributionSummary: ContributionSummary | null, contributionMeta: ContributionMeta, reportGeneratedLabel: string, missingMonths: { missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }, validationSummary: { flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }, contributionTotals: { payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }, contributionRecency: { lastContributionLabel: string, daysSinceContribution: number | null, daysThreshold: number }, workerProfile: { workerType: string | null, typicalDays: number, statutoryHolidayDays: number, leaveYearStartMonth: number }, contractTypeMismatchWarning: string | null, leaveYearGroups: Map<string, YearEntries> }} ReportContext
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
 * @param {{ typicalDays?: number, workerType?: string, statutoryHolidayDays?: number, leaveYearStartMonth?: number } | null} [workerProfile=null]
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
    const reportRunDate = new Date()
    const rawLeaveYear = workerProfile?.leaveYearStartMonth ?? 4
    const leaveYearStartMonth =
        Number.isInteger(rawLeaveYear) &&
        rawLeaveYear >= 1 &&
        rawLeaveYear <= 12
            ? rawLeaveYear
            : 4
    /** @type {ReportEntry[]} */
    const entries = buildReportEntries(records, leaveYearStartMonth)

    entries.forEach((entry) => {
        entry.validation = buildValidation(entry)
    })
    const workerType = workerProfile?.workerType ?? null
    const typicalDays = workerProfile?.typicalDays ?? 5
    const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? 28

    buildHolidayPayFlags(entries)
    buildYearHolidayContext(entries, workerProfile)

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
                (entry.record.payrollDoc?.payments?.hourly?.basic?.units ?? 0) >
                    0 ||
                (entry.record.payrollDoc?.payments?.hourly?.holiday?.units ??
                    0) > 0
        )
        if (hasHourlyPayslip) {
            contractTypeMismatchWarning =
                'Some payslips contain hourly pay (Basic Hours) but your worker profile is set to <b>Salaried</b>. If your contract changed part-way through, consider running separate reports for each contract period for accurate results.'
        }
    }

    entries.sort((a, b) => {
        const yearA = getTaxYearSortKey(a.yearKey ?? 'Unknown')
        const yearB = getTaxYearSortKey(b.yearKey ?? 'Unknown')
        if (yearA !== yearB) {
            return yearA - yearB
        }
        if (a.monthIndex !== b.monthIndex) {
            return a.monthIndex - b.monthIndex
        }
        const fallbackA = a.record.payrollDoc?.processDate?.date || 'Unknown'
        const fallbackB = b.record.payrollDoc?.processDate?.date || 'Unknown'
        return fallbackA.localeCompare(fallbackB)
    })

    const yearGroups = new Map()
    entries.forEach((entry) => {
        const key = entry.yearKey ?? 'Unknown'
        if (!yearGroups.has(key)) {
            yearGroups.set(key, [])
        }
        const yearEntries = yearGroups.get(key)
        if (yearEntries) {
            yearEntries.push(entry)
        }
    })
    const leaveYearGroups = buildLeaveYearGroups(entries)
    const yearKeys = Array.from(yearGroups.keys())
    const contributionSummary = buildContributionSummary(
        entries,
        contributionData,
        yearKeys
    )
    yearGroups.forEach((entriesForYear, yearKey) => {
        /** @type {any} */ entriesForYear.reconciliation =
            contributionSummary?.years.get(yearKey) || null
    })

    const parsedDates = entries
        .map((entry) => entry.parsedDate)
        .filter(/** @returns {date is Date} */ (date) => date instanceof Date)
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
        .filter(/** @returns {date is Date} */ (date) => date instanceof Date)
    const lastContributionDate = contributionDates.length
        ? new Date(Math.max(...contributionDates.map((date) => date.getTime())))
        : null
    let contributionRangeLabel = 'None'
    if (contributionDates.length) {
        const minContribution = new Date(
            Math.min(...contributionDates.map((date) => date.getTime()))
        )
        const maxContribution = new Date(
            Math.max(...contributionDates.map((date) => date.getTime()))
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

    const employeeName = records[0].employee?.name || 'Unknown'
    const reportSections = []
    const miscFootnotes =
        /** @type {Array<{ type: string, dateLabel: string, item: PayrollPayItem | PayrollMiscDeduction }>} */ (
            entries.reduce((/** @type {any[]} */ acc, entry) => {
                const dateLabel = entry.parsedDate
                    ? formatDateLabel(entry.parsedDate)
                    : entry.record.payrollDoc?.processDate?.date || 'Unknown'
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

    const {
        missingMonthsByYear,
        hasMissingMonths,
        missingMonthsLabel,
        missingMonthsHtml,
    } = buildMissingMonths(yearGroups, failedDates)
    const missingMonthsPill = `Missing months: <span class="missing-months">${missingMonthsHtml}</span>`

    const {
        flaggedEntries,
        lowConfidenceEntries,
        flaggedPeriods,
        validationPill,
    } = buildValidationSummary(entries)
    const hasLowPretaxPay = entries.some((entry) => {
        const totalGrossPay =
            entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        return typeof totalGrossPay === 'number' && totalGrossPay < 1048
    })

    const contributionTotalsResult = buildContributionTotals(
        entries,
        contributionSummary
    )
    const {
        payrollEE,
        payrollER,
        payrollContribution,
        pensionEE,
        pensionER,
        reportedContribution,
        contributionDifference,
    } = contributionTotalsResult
    const daysThreshold = 30
    const { daysSinceContribution, lastContributionLabel } =
        buildContributionRecency(
            lastContributionDate,
            reportRunDate,
            daysThreshold
        )
    const contributionRecency = {
        lastContributionLabel,
        daysSinceContribution,
        daysThreshold,
    }
    const formatOrNA = (/** @type {number | null} */ value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const formatDifference = () => {
        return formatContributionDifference(contributionDifference)
    }
    const formatYearDiff = (
        /** @type {number | null} */ value,
        isZeroReview = false
    ) => {
        if (value === null) {
            return 'N/A'
        }
        const diffClass = isZeroReview
            ? 'diff--zero-review'
            : value === 0
              ? 'diff--neutral'
              : value > 0
                ? 'diff--positive'
                : 'diff--negative'
        return `<span class="${diffClass}">${formatCurrency(value)}</span>`
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
    const flaggedPeriodsByYear = /** @type {Record<string, string[]>} */ ({})
    flaggedPeriods.forEach((p) => {
        const yearMatch = p.match(/\d{4}$/)
        const year = yearMatch ? yearMatch[0] : 'Unknown'
        if (!flaggedPeriodsByYear[year]) {
            flaggedPeriodsByYear[year] = []
        }
        flaggedPeriodsByYear[year].push(p)
    })
    const flaggedPeriodsHtml = flaggedPeriods.length
        ? Object.entries(flaggedPeriodsByYear)
              .map(
                  ([year, periods]) =>
                      `<span class="missing-year">${year}:</span> <span class="meta-pills">${periods.map((p) => `<span class="pill pill--warn inline">${p.replace(/\s*\d{4}$/, '')}</span>`).join(' ')}</span>`
              )
              .join('<br>')
        : '<span class="validation-none">None</span>'
    const lowConfidencePeriods = lowConfidenceEntries.map((entry) =>
        entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
    )
    const lowConfidencePeriodsByYear =
        /** @type {Record<string, string[]>} */ ({})
    lowConfidencePeriods.forEach((p) => {
        const yearMatch = p.match(/\d{4}$/)
        const year = yearMatch ? yearMatch[0] : 'Unknown'
        if (!lowConfidencePeriodsByYear[year]) {
            lowConfidencePeriodsByYear[year] = []
        }
        lowConfidencePeriodsByYear[year].push(p)
    })
    const lowConfidenceHtml = lowConfidencePeriods.length
        ? Object.entries(lowConfidencePeriodsByYear)
              .map(
                  ([year, periods]) =>
                      `<span class="missing-year">${year}:</span> <span class="meta-pills">${periods.map((p) => `<span class="pill pill--warn inline">${p.replace(/\s*\d{4}$/, '')}</span>`).join(' ')}</span>`
              )
              .join('<br>')
        : '<span class="validation-none">0</span>'

    const missingMonthsTableHtml = hasMissingMonths
        ? Object.entries(missingMonthsByYear)
              .filter(([, months]) => months.length)
              .map(
                  ([year, months]) =>
                      `<span class="missing-year">${year}:</span> ${months.map((m) => `<span class="pill pill--warn inline">${m}</span>`).join(' ')}`
              )
              .join('<br>')
        : '<span class="validation-none">None</span>'

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

    const workerProfileHtml = `<b>Type:</b> ${workerTypeLabel} &nbsp;\u00b7&nbsp; <b>Typical days:</b> ${typicalDays}/week &nbsp;\u00b7&nbsp; <b>Holiday entitlement:</b> ${statutoryHolidayDays} days/year &nbsp;\u00b7&nbsp; <b>Leave year starts:</b> ${leaveYearStartMonthName}`

    reportSections.push('<div class="page">')
    reportSections.push(
        `<div class="report-meta">` +
            `<h2>Payroll Report \u2014 ${employeeName}</h2>` +
            `<p class="report-range">${dateRangeLabel}</p>` +
            `<p class="report-meta-generated"><b>Generated:</b> ${reportGeneratedLabel}</p>` +
            `<div class="report-meta-table-container notice no-left-border">` +
            `<table class="report-meta-table ">` +
            `<tr><th>Payroll:</th><td>${dateRangeLabel} &nbsp;\u00b7&nbsp; ${pdfCountLabel}</td></tr>` +
            `<tr><th>Pension:</th><td>${contributionMeta.fileCount ? `${contributionMeta.dateRangeLabel} &nbsp;\u00b7&nbsp; ${pensionFileLabel}` : 'None'}</td></tr>` +
            `<tr><th>Worker profile:</th><td>${workerProfileHtml}</td></tr>` +
            `<tr><th>Missing payroll months:</th><td>${missingMonthsTableHtml}</td></tr>` +
            `<tr><th>Flagged periods:</th><td>${flaggedPeriodsHtml}</td></tr>` +
            `<tr><th>Low confidence periods:</th><td>${lowConfidenceHtml}</td></tr>` +
            `</table>` +
            `</div>` +
            `</div>`
    )
    if (contractTypeMismatchWarning) {
        reportSections.push(
            `<div class="report-warning-banner"><span class="warning-icon">⚠︎</span> ${contractTypeMismatchWarning}</div>`
        )
    }
    reportSections.push(`<h2>Annual Totals:    (${dateRangeLabel})</h2>`)

    const yearSummaryRows = Array.from(yearGroups.entries())
        .filter(([yearKey]) => yearKey && yearKey !== 'Unknown')
        .map(([yearKey, entriesForYear]) => {
            const yearHours = entriesForYear.reduce(
                (
                    /** @type {number} */ acc,
                    /** @type {ReportEntry} */ entry
                ) => {
                    return (
                        acc +
                        (entry.record.payrollDoc?.payments?.hourly?.basic
                            ?.units || 0)
                    )
                },
                0
            )
            const yearPayrollEE = entriesForYear.reduce(
                (
                    /** @type {number} */ acc,
                    /** @type {ReportEntry} */ entry
                ) => {
                    return (
                        acc +
                        (entry.record.payrollDoc?.deductions?.pensionEE
                            ?.amount || 0)
                    )
                },
                0
            )
            const yearPayrollER = entriesForYear.reduce(
                (
                    /** @type {number} */ acc,
                    /** @type {ReportEntry} */ entry
                ) => {
                    return (
                        acc +
                        (entry.record.payrollDoc?.deductions?.pensionER
                            ?.amount || 0)
                    )
                },
                0
            )
            const yearPayrollContribution = yearPayrollEE + yearPayrollER
            const hasFlags = entriesForYear.some(
                (/** @type {ReportEntry} */ entry) =>
                    entry.validation?.flags && entry.validation.flags.length
            )
            const yearReconciliation = entriesForYear.reconciliation || null
            const yearReportedEE = yearReconciliation
                ? yearReconciliation.totals.actualEE || 0
                : null
            const yearReportedER = yearReconciliation
                ? yearReconciliation.totals.actualER || 0
                : null
            const yearReportedContribution = yearReconciliation
                ? yearReportedEE + yearReportedER
                : null
            const yearOverUnder =
                yearReportedContribution === null
                    ? null
                    : yearReportedContribution - yearPayrollContribution
            const yearZeroReview =
                yearReportedContribution !== null &&
                yearPayrollContribution === 0 &&
                yearReportedContribution === 0
            const flagIcon = hasFlags ? '⚠︎' : '—'
            const yearSummaryAnchor = `year-summary-${formatYearAnchor(yearKey)}`
            const yearHolidaySummary = buildYearHolidaySummary(
                entriesForYear,
                leaveYearGroups,
                {
                    workerType,
                    typicalDays,
                    statutoryHolidayDays,
                    leaveYearStartMonth,
                }
            )
            const leaveYearNote = yearHolidaySummary.leaveYearLabel
                ? `<br><span class="summary-breakdown">${yearHolidaySummary.leaveYearLabel}</span>`
                : ''

            let yearHolidayCell
            if (yearHolidaySummary.kind === 'salary_days') {
                yearHolidayCell =
                    `${formatCurrency(yearHolidaySummary.holidayAmount)}<br>` +
                    `<span class="summary-breakdown">≈${yearHolidaySummary.daysTaken.toFixed(1)} days taken` +
                    ` / ${yearHolidaySummary.daysRemaining.toFixed(1)} remaining${yearHolidaySummary.overrun ? ' (entitlement exceeded)' : ''}</span>` +
                    leaveYearNote
            } else if (yearHolidaySummary.kind === 'salary_amount') {
                yearHolidayCell =
                    formatCurrency(yearHolidaySummary.holidayAmount) +
                    leaveYearNote
            } else if (yearHolidaySummary.kind === 'hourly_days') {
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs<br>` +
                    `<span class="summary-breakdown">≈${yearHolidaySummary.daysTaken.toFixed(1)} days taken` +
                    ` / ${yearHolidaySummary.daysRemaining.toFixed(1)} remaining${yearHolidaySummary.overrun ? ' (entitlement exceeded)' : ''}</span>` +
                    leaveYearNote
            } else if (yearHolidaySummary.kind === 'hourly_hours') {
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs taken<br>` +
                    `<span class="summary-breakdown">` +
                    `≈${yearHolidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement` +
                    ` (${yearHolidaySummary.avgWeeklyHours.toFixed(1)} avg hrs/wk × 5.6)<br>` +
                    `${yearHolidaySummary.hoursRemaining.toFixed(1)} hrs remaining${yearHolidaySummary.overrun ? ' (entitlement exceeded)' : ''}` +
                    `</span>` +
                    leaveYearNote
            } else {
                const variablePatternNote =
                    yearHolidaySummary.hasVariablePattern
                        ? `<br><span class="summary-breakdown">Days estimate not shown — variable work pattern</span>`
                        : ''
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs` +
                    leaveYearNote +
                    variablePatternNote
            }
            return (
                '<tr>' +
                `<th><a href="#${yearSummaryAnchor}">${yearKey}</a></th>` +
                `<td>${yearHours.toFixed(2)}</td>` +
                `<td>${yearHolidayCell}</td>` +
                `<td>${formatBreakdownCell(yearPayrollContribution, yearPayrollEE, yearPayrollER)}</td>` +
                `<td>${formatBreakdownCell(
                    yearReportedContribution,
                    yearReportedEE,
                    yearReportedER,
                    true
                )}</td>` +
                `<td>${formatYearDiff(yearOverUnder, yearZeroReview)}</td>` +
                `<td>${flagIcon}</td>` +
                '</tr>'
            )
        })
        .join('')
    if (yearSummaryRows) {
        reportSections.push(
            '<table class="summary-table"><thead><tr>' +
                '<th>Tax Year</th><th>Hours</th><th>Holiday <span class="summary-breakdown">(hrs / est. days)</span></th>' +
                '<th>Payroll Cont. <span class="summary-breakdown">(EE+ER)</span></th><th>Reported <span class="summary-breakdown">(EE+ER)</span></th>' +
                '<th>YE Over / Under</th><th>Flags</th>' +
                '</tr></thead>' +
                `<tbody>${yearSummaryRows}</tbody>` +
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
            `<td colspan="2">${dateRangeLabel}</td>` +
            `<td>${formatBreakdownCell(payrollContribution, payrollEE, payrollER)}</td>` +
            `<td>${formatBreakdownCell(
                reportedContribution,
                pensionEE,
                pensionER,
                true
            )}</td>` +
            `<td>${formatDifference()}</td>` +
            `<td>${lastContributionLabel}<br>${formatDaysSince()}</td>` +
            '</tr></tbody>' +
            '</table>'
    )

    if (miscFootnotes.length) {
        const footnoteItems = miscFootnotes
            .map((entry) => {
                const typeLabel =
                    entry.type === 'deduction' ? 'Deduction' : 'Payment'
                const amountLabel =
                    entry.type === 'deduction'
                        ? formatDeduction(entry.item.amount || 0)
                        : formatCurrency(entry.item.amount || 0)
                const itemLabel =
                    /** @type {any} */ (entry.item).label ||
                    entry.item.title ||
                    ''
                const detailLabel =
                    entry.item.units == null || entry.item.rate == null
                        ? 'flat'
                        : `${Number(entry.item.units).toFixed(2)} @ ${formatCurrency(Number(entry.item.rate))}`
                return (
                    `<li>${entry.dateLabel}: ${typeLabel}: ${itemLabel} ` +
                    `(${detailLabel}): ${amountLabel}</li>`
                )
            })
            .join('')
        reportSections.push(
            `<div class="report-footnote">` +
                '<p>† Misc entries to review</p>' +
                `<ul>${footnoteItems}</ul>` +
                '</div>'
        )
    }

    reportSections.push(
        `<div class="report-footnote"><b>Note:</b> <i>${ACCUMULATED_TOTALS_NOTE}</i></div>`
    )

    const hasAprilEntry = entries.some(
        (entry) =>
            entry.parsedDate instanceof Date &&
            entry.parsedDate.getMonth() === 3
    )
    if (hasAprilEntry) {
        reportSections.push(
            `<div class="report-footnote">${APRIL_BOUNDARY_NOTE_HTML}</div>`
        )
    }
    if (hasLowPretaxPay) {
        reportSections.push(
            `<div class="report-footnote">${ZERO_TAX_ALLOWANCE_NOTE_HTML}</div>`
        )
    }
    reportSections.push('</div>')

    Array.from(yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = yearGroups.get(yearKey)
        if (!entriesForYear) {
            return
        }
        const yearLabel = yearKey === 'Unknown' ? 'Unknown Year' : yearKey
        const yearMissing = missingMonthsByYear[yearKey] || []
        const yearAnchor = `year-monthly-${formatYearAnchor(yearKey)}`
        /** @type {any} */ entriesForYear.yearKey = yearKey

        reportSections.push('<div class="page">')
        reportSections.push(
            `<h2 id="year-summary-${formatYearAnchor(yearKey)}">${yearLabel} Summary: ${employeeName}</h2>`
        )
        if (yearMissing.length) {
            const yearMissingPill = `Missing months: <span class="missing-months">${yearMissing.join(', ')}</span>`
            reportSections.push(
                `<p class="report-missing">${yearMissingPill}</p>`
            )
        }
        /** @type {string[]} */
        const yearFlagNotes = []
        const yearFlagIndexById = new Map()
        entriesForYear.forEach((/** @type {ReportEntry} */ entry) => {
            const entryFlags = entry.validation?.flags || []
            entryFlags.forEach((/** @type {ValidationFlag} */ flag) => {
                let noteIndex = yearFlagIndexById.get(flag.id)
                if (noteIndex === undefined) {
                    noteIndex = yearFlagNotes.length + 1
                    yearFlagIndexById.set(flag.id, noteIndex)
                    yearFlagNotes.push(flag.label)
                }
                flag.noteIndex = noteIndex
            })
        })
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
        reportSections.push(renderYearSummary(entriesForYear, openingBalance2))
        if (yearFlagNotes.length) {
            const noteItems = yearFlagNotes
                .map((label, index) => `<li>${index + 1} ${label}</li>`)
                .join('')
            reportSections.push(
                `<div class="report-footnote">` +
                    '<p>† Flag notes</p>' +
                    `<ul>${noteItems}</ul>` +
                    '</div>'
            )
        }
        // reportSections.push(
        //   `<p class="report-footnote"><a href="#${yearAnchor}">Jump to monthly breakdown</a></p>`
        // );
        const yearLowPretaxPay = entriesForYear.some(
            (/** @type {ReportEntry} */ entry) => {
                const totalGrossPay =
                    entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
                return typeof totalGrossPay === 'number' && totalGrossPay < 1048
            }
        )
        const yearHasAprilEntry = entriesForYear.some(
            (/** @type {ReportEntry} */ entry) =>
                entry.parsedDate instanceof Date &&
                entry.parsedDate.getMonth() === 3
        )
        if (yearHasAprilEntry) {
            reportSections.push(
                `<p class="report-footnote">${APRIL_BOUNDARY_NOTE_HTML}</p>`
            )
        }
        if (yearLowPretaxPay) {
            reportSections.push(
                `<p class="report-footnote">${ZERO_TAX_ALLOWANCE_NOTE_HTML}</p>`
            )
        }
        reportSections.push('</div>')
    })

    Array.from(yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = yearGroups.get(yearKey)
        if (!entriesForYear) {
            return
        }
        const yearLabel = yearKey === 'Unknown' ? 'Unknown Year' : yearKey
        const yearAnchor = `year-monthly-${formatYearAnchor(yearKey)}`
        const monthAnchors = new Set()

        entriesForYear.forEach(
            (/** @type {ReportEntry} */ entry, /** @type {number} */ index) => {
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
                    reportSections.push(`<div id="${monthAnchor}"></div>`)
                    monthAnchors.add(monthIndex)
                }
                reportSections.push(renderReportCell(entry))
                reportSections.push('</div>')
            }
        )
    })

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
            contributionRecency,
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
    yearGroups.forEach((entriesForYear, yearKey) => {
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
    })

    const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear)
    const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear)
    const hasMissingMonths = Object.values(missingMonthsByYear).some(
        (months) => months.length
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
    const validation = entry.validation || { flags: [], lowConfidence: false }
    const parsedDate = entry.parsedDate
    const dateLabel = parsedDate
        ? formatDateLabel(parsedDate)
        : record.payrollDoc?.processDate?.date || 'Unknown'
    const combined =
        (record.payrollDoc?.deductions?.pensionEE?.amount || 0) +
        (record.payrollDoc?.deductions?.pensionER?.amount || 0)
    const noImages = Boolean(
        globalThis?.location &&
        new URLSearchParams(globalThis.location.search).get('noimg') === '1'
    )
    const imageHtml =
        !noImages && record.imageData
            ? `<img class="report-image" src="${record.imageData}" alt="${dateLabel}" />`
            : ''
    const hourlyPayments = /** @type {PayrollPayments["hourly"]} */ (
        record.payrollDoc?.payments?.hourly || {}
    )
    const basicHours = hourlyPayments.basic?.units || 0
    const basicRate = hourlyPayments.basic?.rate || 0
    const basicAmount = hourlyPayments.basic?.amount || 0
    const holidayHours = hourlyPayments.holiday?.units || 0
    const holidayRate = hourlyPayments.holiday?.rate || 0
    const holidayAmount = hourlyPayments.holiday?.amount || 0
    const salaryPayments = /** @type {PayrollPayments["salary"]} */ (
        record.payrollDoc?.payments?.salary || {}
    )
    const basicSalaryAmount = salaryPayments.basic?.amount ?? null
    const holidaySalaryUnits = salaryPayments.holiday?.units ?? null
    const holidaySalaryRate = salaryPayments.holiday?.rate ?? null
    const holidaySalaryAmount = salaryPayments.holiday?.amount ?? null
    const miscPayments = record.payrollDoc?.payments?.misc || []
    const miscDeductions = record.payrollDoc?.deductions?.misc || []
    const payeTax = record.payrollDoc?.deductions?.payeTax?.amount || 0
    const nationalInsurance = record.payrollDoc?.deductions?.natIns?.amount || 0
    const nestEmployee = record.payrollDoc?.deductions?.pensionEE?.amount || 0
    const nestEmployer = record.payrollDoc?.deductions?.pensionER?.amount || 0
    const netPay = record.payrollDoc?.netPay?.amount || 0
    const hasHolidayHourly = [holidayHours, holidayRate, holidayAmount].some(
        (value) => value !== null && value !== 0
    )
    const hasHolidaySalary = [
        holidaySalaryUnits,
        holidaySalaryRate,
        holidaySalaryAmount,
    ].some((value) => value !== null && value !== 0)
    const corePaymentRows = []
    if (basicHours || basicRate || basicAmount) {
        corePaymentRows.push({
            label: 'Basic Hours',
            units: basicHours,
            rate: basicRate,
            amount: basicAmount,
        })
    }
    if (hasHolidayHourly) {
        corePaymentRows.push({
            label: 'Holiday Hours',
            units: holidayHours,
            rate: holidayRate,
            amount: holidayAmount,
        })
    }
    if (basicSalaryAmount !== null) {
        corePaymentRows.push({
            label: 'Basic Salary',
            units: null,
            rate: null,
            amount: basicSalaryAmount,
        })
    }
    if (hasHolidaySalary) {
        corePaymentRows.push({
            label: 'Holiday Salary',
            units: holidaySalaryUnits,
            rate: holidaySalaryRate,
            amount: holidaySalaryAmount,
        })
    }
    const nestEmployeeClass = nestEmployee === 0 ? 'pension-zero' : ''
    const nestEmployerClass = nestEmployer === 0 ? 'pension-zero' : ''

    const warningItems = []
    if (validation.flags.length) {
        warningItems.push(
            ...validation.flags.map((flag) => `<li>${flag.label}</li>`)
        )
    }
    const warningsHtml = warningItems.length
        ? `<div class="notice callout"><ul class="report-warning-list">${warningItems.join('')}</ul></div>`
        : ''

    const rows = [
        '<table class="report-table">',
        `<tr class="report-row--section-start"><th class="row-header" align="left">Date</th><td>${dateLabel}</td></tr>`,
        '<tr><th class="row-header" align="left" colspan="2">Payments</th></tr>',
    ]

    const entryHolidaySummary = buildEntryHolidaySummary(entry)
    const holidayImpliedDays =
        entryHolidaySummary.kind === 'hours_days'
            ? entryHolidaySummary.estimatedDays.toFixed(1)
            : null

    for (const item of corePaymentRows) {
        const breakdown =
            item.units != null && item.rate != null && item.rate !== 0
                ? ` (${Number(item.units).toFixed(2)} @ ${formatCurrency(Number(item.rate))})`
                : ''
        const isHolidayHourly = item.label === 'Holiday Hours'
        const estSuffix =
            isHolidayHourly && holidayImpliedDays !== null
                ? ` <span class="holiday-est-days">est ${holidayImpliedDays} days holiday</span>`
                : ''
        rows.push(
            `<tr><th align="left">${item.label}${breakdown}${estSuffix}</th><td>${formatCurrency(
                item.amount || 0
            )}</td></tr>`
        )
    }

    if (miscPayments.length) {
        rows.push(
            '<tr><th class="row-header" align="left" colspan="2">Misc Earnings</th></tr>',
            ...miscPayments.map(
                (item) =>
                    `<tr><th align="left">${formatMiscLabel(item)}</th><td>${formatCurrency(
                        item.amount || 0
                    )}</td></tr>`
            )
        )
    }

    rows.push(
        '<tr><th class="row-header" align="left" colspan="2">Deductions</th></tr>',
        `<tr><th align="left">PAYE Tax</th><td>${formatDeduction(payeTax)}</td></tr>`,
        `<tr><th align="left">National Insurance</th><td>${formatDeduction(
            nationalInsurance
        )}</td></tr>`,
        `<tr><th align="left">NEST Corp - EE</th>` +
            `<td class="${nestEmployeeClass}">${formatDeduction(nestEmployee)}</td></tr>`,
        `<tr><th align="left">NEST Corp - ER <sup>†</sup></th>` +
            `<td class="${nestEmployerClass}">( ${formatContribution(nestEmployer)} )</td></tr>`
    )

    if (miscDeductions.length) {
        rows.push(
            '<tr><th class="row-header" align="left" colspan="2">Misc Deductions</th></tr>',
            ...miscDeductions.map(
                (item) =>
                    `<tr><th align="left">${formatMiscLabel(item)}</th><td>${formatDeduction(
                        item.amount
                    )}</td></tr>`
            )
        )
    }

    rows.push(
        `<tr><th class="row-header" align="left">Combined NEST</th><td>${formatCurrency(combined)}</td></tr>`,
        `<tr class="report-row--total"><th class="row-header" align="left">Net Pay (after deductions)</th><td>${formatCurrency(netPay)}</td></tr>`,
        '</table>'
    )

    let holidayAnalysisFootnote = ''
    if (
        holidayImpliedDays !== null &&
        entryHolidaySummary.kind === 'hours_days'
    ) {
        const avgHrsPerDay = entryHolidaySummary.avgHoursPerDay.toFixed(2)
        const avgHrsPerWeek = entryHolidaySummary.avgWeeklyHours.toFixed(2)
        const days = entryHolidaySummary.typicalDays
        holidayAnalysisFootnote =
            `<div class="notice">` +
            `<p><b>Holiday analysis</b> (year average, <i>estimate only</i>):</p>` +
            `<ul><li>Avg ${avgHrsPerWeek}\u00a0hrs/week over ${days}\u00a0days \u2192 1\u00a0day\u00a0\u2248\u00a0${avgHrsPerDay}\u00a0hrs.</li>` +
            `<li>This payslip: ${entryHolidaySummary.holidayHours.toFixed(2)}\u00a0hrs\u00a0\u2248\u00a0${holidayImpliedDays}\u00a0days.</li></ul>` +
            `<p>If <b>${holidayImpliedDays}</b>\u00a0days doesn\u2019t match the days you agreed, ask your employer how they calculated the number of hours for holiday.</p>` +
            `</div>`
    }

    const cellClass = validation.lowConfidence
        ? 'report-cell is-low-confidence'
        : 'report-cell'
    const erFootnote =
        '<p class="report-footnote-row"><sup>†</sup> ' +
        'Employer contribution — paid by the employer on top of your salary, ' +
        'not deducted from your net pay.' +
        '</p>'
    const aprilBoundaryFootnote =
        parsedDate instanceof Date && parsedDate.getMonth() === 3
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
 * @param {YearEntries} entriesForYear
 * @param {number} openingBalance
 * @returns {string}
 */
function renderYearSummary(entriesForYear, openingBalance) {
    const monthEntries = new Map()
    entriesForYear.forEach((entry) => {
        if (entry.monthIndex >= 1 && entry.monthIndex <= 12) {
            if (!monthEntries.has(entry.monthIndex)) {
                monthEntries.set(entry.monthIndex, [])
            }
            monthEntries.get(entry.monthIndex).push(entry)
        }
    })
    const yearKey = entriesForYear.yearKey || 'Unknown'

    let yearHours = 0
    let yearHolidayUnits = 0
    let yearPayrollEE = 0
    let yearPayrollER = 0
    let yearPayrollContribution = 0
    let yearReportedEE = null
    let yearReportedER = null
    let yearReportedContribution = null

    const bodyRows = []
    const reconciliation = entriesForYear.reconciliation
    const showReconciliation = reconciliation != null
    const formatOrNA = (/** @type {number | null} */ value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const formatDiff = (
        /** @type {number | null} */ value,
        isZeroReview = false
    ) => {
        if (value === null) {
            return 'N/A'
        }
        const roundedValue = Number(value.toFixed(2))
        const diffClass = isZeroReview
            ? 'diff--zero-review'
            : roundedValue === 0
              ? 'diff--neutral'
              : roundedValue > 0
                ? 'diff--positive'
                : 'diff--negative'
        return `<span class="${diffClass}">${formatCurrency(value)}</span>`
    }
    const miscFootnotes =
        /** @type {Array<{ type: string, dateLabel: string, item: PayrollPayItem | PayrollMiscDeduction }>} */ (
            entriesForYear.reduce(
                (
                    /** @type {any[]} */ acc,
                    /** @type {ReportEntry} */ entry
                ) => {
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
                },
                []
            )
        )

    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const calendarMonth = getCalendarMonthFromFiscalIndex(monthIndex)
        const monthName = calendarMonth
            ? formatMonthLabel(calendarMonth)
            : 'Unknown'
        const entries = /** @type {ReportEntry[]} */ (
            monthEntries.get(monthIndex) || []
        )
            .slice()
            .sort(
                (
                    /** @type {ReportEntry} */ a,
                    /** @type {ReportEntry} */ b
                ) => {
                    const aDate =
                        a.parsedDate ||
                        a.record?.payrollDoc?.processDate?.date ||
                        null
                    const bDate =
                        b.parsedDate ||
                        b.record?.payrollDoc?.processDate?.date ||
                        null
                    if (!aDate && !bDate) {
                        return 0
                    }
                    if (!aDate) {
                        return 1
                    }
                    if (!bDate) {
                        return -1
                    }
                    return new Date(aDate).getTime() - new Date(bDate).getTime()
                }
            )
        const monthAnchor = `year-monthly-${formatYearAnchor(
            yearKey
        )}-${String(monthIndex).padStart(2, '0')}`
        const reconMonth = showReconciliation
            ? reconciliation?.months.get(monthIndex)
            : null
        const actualEE = reconMonth?.actualEE ?? null
        const actualER = reconMonth?.actualER ?? null
        const reportedContribution =
            actualEE === null || actualER === null ? null : actualEE + actualER

        if (entries.length) {
            entries.forEach(
                (
                    /** @type {ReportEntry} */ entry,
                    /** @type {number} */ entryIndex
                ) => {
                    const record = entry.record || null
                    const validation = entry.validation || null
                    const hours =
                        record?.payrollDoc?.payments?.hourly?.basic?.units || 0
                    const holidayHourlyUnits =
                        record?.payrollDoc?.payments?.hourly?.holiday?.units ||
                        0
                    const holidaySalaryUnits =
                        record?.payrollDoc?.payments?.salary?.holiday?.units ||
                        0
                    const holidayUnits = holidayHourlyUnits + holidaySalaryUnits
                    const entryHolidaySummary = buildEntryHolidaySummary(entry)
                    const holidayCell =
                        entryHolidaySummary.kind === 'hours_days'
                            ? `${entryHolidaySummary.holidayHours.toFixed(2)} hrs<br><span class="summary-breakdown">≈${entryHolidaySummary.estimatedDays.toFixed(1)} days</span>`
                            : `${entryHolidaySummary.holidayHours.toFixed(2)} hrs`
                    const nestEmployee =
                        record?.payrollDoc?.deductions?.pensionEE?.amount || 0
                    const nestEmployer =
                        record?.payrollDoc?.deductions?.pensionER?.amount || 0
                    const payrollContribution = nestEmployee + nestEmployer
                    const flagSummary = validation?.flags?.length
                        ? validation.flags
                              .map((/** @type {ValidationFlag} */ flag) =>
                                  flag.noteIndex
                                      ? `${flag.noteIndex}`
                                      : flag.label
                              )
                              .join('; ')
                        : '—'
                    const flagClass = validation?.flags?.length
                        ? 'summary-warning'
                        : ''
                    const overUnder =
                        reportedContribution === null
                            ? null
                            : reportedContribution - payrollContribution
                    const zeroReview =
                        payrollContribution === 0 && reportedContribution === 0
                    const monthLabel =
                        entries.length > 1
                            ? `${monthName} (${entryIndex + 1})`
                            : monthName
                    const monthLink = `<a href="#${monthAnchor}">${monthLabel}</a>`

                    bodyRows.push(
                        '<tr>' +
                            `<th>${monthLink}</th>` +
                            `<td>${hours.toFixed(2)}</td>` +
                            `<td>${holidayCell}</td>` +
                            `<td>${formatBreakdownCell(payrollContribution, nestEmployee, nestEmployer)}</td>` +
                            `<td>${formatBreakdownCell(
                                reportedContribution,
                                actualEE,
                                actualER,
                                true
                            )}</td>` +
                            `<td>${formatDiff(overUnder, zeroReview)}</td>` +
                            `<td class="${flagClass}">${flagSummary}</td>` +
                            '</tr>'
                    )

                    yearHours += hours
                    yearHolidayUnits += holidayUnits
                    yearPayrollEE += nestEmployee
                    yearPayrollER += nestEmployer
                    yearPayrollContribution += payrollContribution
                }
            )
        } else {
            const payrollContribution = 0
            const overUnder =
                reportedContribution === null
                    ? null
                    : reportedContribution - payrollContribution
            const zeroReview =
                payrollContribution === 0 && reportedContribution === 0
            bodyRows.push(
                '<tr>' +
                    `<th>${monthName}</th>` +
                    '<td>0.00</td>' +
                    '<td>0.00</td>' +
                    `<td>${formatBreakdownCell(payrollContribution, 0, 0)}</td>` +
                    `<td>${formatBreakdownCell(reportedContribution, actualEE, actualER, true)}</td>` +
                    `<td>${formatDiff(overUnder, zeroReview)}</td>` +
                    '<td class="">—</td>' +
                    '</tr>'
            )
        }
    }

    if (showReconciliation && reconciliation) {
        yearReportedEE = reconciliation.totals.actualEE || 0
        yearReportedER = reconciliation.totals.actualER || 0
        yearReportedContribution = yearReportedEE + yearReportedER
    }
    const yearOverUnder =
        yearReportedContribution === null
            ? null
            : yearReportedContribution - yearPayrollContribution
    const yearZeroReview =
        yearPayrollContribution === 0 && yearReportedContribution === 0
    const closingBalance =
        showReconciliation && yearOverUnder !== null
            ? openingBalance + yearOverUnder
            : null
    const showBalanceRows =
        showReconciliation && (openingBalance !== 0 || closingBalance !== null)
    const openingBalanceRow =
        showBalanceRows && openingBalance !== 0
            ? '<tr>' +
              '<th>Opening Balance</th>' +
              '<td colspan="4"></td>' +
              `<td colspan="1">${formatDiff(openingBalance)}</td>` +
              '<td>—</td>' +
              '</tr>'
            : ''
    const closingBalanceRow =
        showBalanceRows && closingBalance !== null
            ? '<tr>' +
              '<th>Closing Pensions Balance</th>' +
              '<td colspan="4"></td>' +
              `<td colspan="1">${formatDiff(closingBalance)}</td>` +
              '<td>—</td>' +
              '</tr>'
            : ''
    const sections = [
        '<table class="summary-table">' +
            '<thead><tr>' +
            '<th>Month</th><th>Hours</th><th>Holiday <span class="summary-breakdown">(hrs / est. days)</span></th>' +
            '<th>Payroll Cont. (EE+ER)</th><th>Reported (EE+ER)</th>' +
            '<th>Over / Under</th><th>Flags</th>' +
            '</tr></thead>' +
            `<tbody>${bodyRows.join('')}</tbody>` +
            '<tfoot>' +
            openingBalanceRow +
            '<tr>' +
            '<th>Total</th>' +
            `<td>${yearHours.toFixed(2)}</td>` +
            `<td>${yearHolidayUnits.toFixed(2)}</td>` +
            `<td>${formatBreakdownCell(
                yearPayrollContribution,
                yearPayrollEE,
                yearPayrollER
            )}</td>` +
            `<td>${formatBreakdownCell(
                yearReportedContribution,
                yearReportedEE,
                yearReportedER,
                true
            )}</td>` +
            `<td>${formatDiff(yearOverUnder, yearZeroReview)}</td>` +
            '<td>—</td>' +
            '</tr>' +
            closingBalanceRow +
            '</tfoot>' +
            '</table>',
    ]

    if (miscFootnotes.length) {
        const footnoteItems = miscFootnotes
            .map((entry) => {
                const typeLabel =
                    entry.type === 'deduction' ? 'Deduction' : 'Payment'
                const amountLabel =
                    entry.type === 'deduction'
                        ? formatDeduction(entry.item.amount || 0)
                        : formatCurrency(entry.item.amount || 0)
                const itemLabel =
                    /** @type {any} */ (entry.item).label ||
                    entry.item.title ||
                    ''
                const detailLabel =
                    entry.item.units == null || entry.item.rate == null
                        ? 'flat'
                        : `${Number(entry.item.units).toFixed(2)} @ ${formatCurrency(Number(entry.item.rate))}`
                return (
                    `<li>${entry.dateLabel}: ${typeLabel}: ${itemLabel} ` +
                    `(${detailLabel}): ${amountLabel}</li>`
                )
            })
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
