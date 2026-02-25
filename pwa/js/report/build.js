/**
 * @typedef {import("../parse/payroll.types").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../parse/payroll.types").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types").PayrollPayments} PayrollPayments
 */

import {
    buildMissingMonthsHtml,
    buildMissingMonthsLabel,
    formatMonthLabel,
} from '../parse/parser_config.js'
import {
    buildContributionSummary,
    buildValidation,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    parsePayPeriodStart,
    sumMiscAmounts,
} from './report_calculations.js'

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
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, year: number | null, monthIndex: number, monthLabel: string, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 * @typedef {ReportEntry[] & { yearKey?: string | number, reconciliation?: ContributionYearSummary | null }} YearEntries
 * @typedef {PayrollRecord[] & { contributionData?: ContributionData }} PayrollRecordCollection
 * @typedef {{ fileCount: number, recordCount: number, dateRangeLabel: string }} ContributionMeta
 * @typedef {{ flaggedCount: number, lowConfidenceCount: number, flaggedPeriods: string[] }} ValidationSummary
 * @typedef {{ dateRangeLabel: string, missingMonthsLabel: string, missingMonthsHtml: string, missingMonthsByYear: Record<string, string[]>, contributionMeta: ContributionMeta, validationSummary: ValidationSummary }} ReportStats
 */

/** @type {string} */
const ZERO_TAX_ALLOWANCE_NOTE =
    '<b>Note:</b> <i>PAYE Tax / National Insurance may be £0 when monthly pay is below £1,048 ' +
    '(Personal Allowance £12,570 per year for 2025/26 and 2026/27)</i>.'

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
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
    return `£${value.toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatDeduction(value) {
    return `-£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatContribution(value) {
    return `£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @param {boolean} [allowNA=false]
 * @returns {string}
 */
function formatBreakdownCell(total, ee, er, allowNA = false) {
    if (allowNA && total === null) {
        return 'N/A'
    }
    const formatOrNA = (value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const totalLabel = allowNA ? formatOrNA(total) : formatCurrency(total)
    const eeLabel = allowNA ? formatOrNA(ee) : formatCurrency(ee)
    const erLabel = allowNA ? formatOrNA(er) : formatCurrency(er)
    return `${totalLabel}<br><span class="summary-breakdown">${eeLabel} EE / ${erLabel} ER</span>`
}

/**
 * @param {PayrollPayItem | PayrollMiscDeduction | { title?: string, units?: number | null, rate?: number | null }} item
 * @returns {string}
 */
function formatMiscLabel(item) {
    if (!item) {
        return ''
    }
    const label = item.title || ''
    if (item.units === null || item.rate === null) {
        return label
    }
    return `${label} (${item.units.toFixed(2)} @ ${formatCurrency(item.rate)})`
}

/**
 * @param {PayrollRecordCollection} records
 * @param {string[]} [failedPayPeriods=[]]
 * @returns {{ html: string, filename: string, stats: ReportStats }}
 */
export function buildReport(records, failedPayPeriods = []) {
    const reportRunDate = new Date()
    /** @type {ReportEntry[]} */
    const entries = records.map((record) => {
        const parsedDate = parsePayPeriodStart(
            record.payrollDoc?.processDate?.date
        )
        const year = parsedDate ? parsedDate.getFullYear() : null
        const monthIndex = parsedDate ? parsedDate.getMonth() + 1 : 13
        const monthLabel = parsedDate
            ? parsedDate.toLocaleDateString('en-GB', { month: 'long' })
            : 'Unknown'
        return {
            record,
            parsedDate,
            year,
            monthIndex,
            monthLabel,
        }
    })

    entries.forEach((entry) => {
        entry.validation = buildValidation(entry)
    })

    entries.sort((a, b) => {
        const yearA = a.year ?? 9999
        const yearB = b.year ?? 9999
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
        const key = entry.year ?? 'Unknown'
        if (!yearGroups.has(key)) {
            yearGroups.set(key, [])
        }
        yearGroups.get(key).push(entry)
    })
    const yearKeys = Array.from(yearGroups.keys())
    const contributionSummary = buildContributionSummary(
        entries,
        records.contributionData,
        yearKeys
    )
    yearGroups.forEach((entriesForYear, yearKey) => {
        entriesForYear.reconciliation =
            contributionSummary?.years.get(yearKey) || null
    })

    const parsedDates = entries
        .map((entry) => entry.parsedDate)
        .filter((date) => date instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime())
    const failedDates = failedPayPeriods
        .map((period) => parsePayPeriodStart(period))
        .filter((date) => date instanceof Date)
    const rangeDates = parsedDates.concat(failedDates)
    const rangeStart = parsedDates[0] || null
    const rangeEnd = parsedDates[parsedDates.length - 1] || null
    const dateRangeLabel =
        rangeStart && rangeEnd
            ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
            : 'Unknown'
    const contributionEntries = records.contributionData?.entries || []
    const contributionDates = contributionEntries
        .map((entry) => entry.date)
        .filter((date) => date instanceof Date)
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
    } else if ((records.contributionData?.sourceFiles || []).length) {
        contributionRangeLabel = 'Unknown'
    }
    const contributionMeta = {
        fileCount: records.contributionData?.sourceFiles?.length || 0,
        recordCount: records.contributionData?.entries?.length || 0,
        dateRangeLabel: contributionRangeLabel,
    }

    const employeeName = records[0].employee?.name || 'Unknown'
    const reportSections = []
    const miscFootnotes = entries.reduce((acc, entry) => {
        const dateLabel = entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
        const miscPayments = entry.record.payrollDoc?.payments?.misc || []
        const miscDeductions = entry.record.payrollDoc?.deductions?.misc || []
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

    /** @type {Record<string, number[]>} */
    const failedMonthsByYear = {}
    failedDates.forEach((date) => {
        const yearKey = date.getFullYear()
        const monthIndex = date.getMonth() + 1
        if (!failedMonthsByYear[yearKey]) {
            failedMonthsByYear[yearKey] = []
        }
        if (!failedMonthsByYear[yearKey].includes(monthIndex)) {
            failedMonthsByYear[yearKey].push(monthIndex)
        }
    })

    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonthIndex = currentDate.getMonth() + 1
    /** @type {Record<string, string[]>} */
    const missingMonthsByYear = {}
    yearGroups.forEach((entriesForYear, yearKey) => {
        const numericYear = Number(yearKey)
        const presentMonths = entriesForYear
            .map((entry) => entry.monthIndex)
            .filter((month) => month >= 1 && month <= 12)
        const failedMonths = failedMonthsByYear[yearKey] || []
        const combinedMonths = presentMonths.concat(failedMonths)
        const maxMonth =
            numericYear === currentYear ? currentMonthIndex - 1 : 12
        if (!combinedMonths.length || maxMonth <= 0) {
            missingMonthsByYear[yearKey] = []
            return
        }
        const present = new Set(presentMonths)
        const missing = []
        for (let month = 1; month <= maxMonth; month += 1) {
            if (!present.has(month)) {
                missing.push(formatMonthLabel(month))
            }
        }
        missingMonthsByYear[yearKey] = missing
    })
    const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear)
    const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear)
    const missingMonthsPill = `Missing months: <span class="missing-months">${missingMonthsHtml}</span>`
    const hasMissingMonths = Object.values(missingMonthsByYear).some(
        (months) => months.length
    )

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
    const hasLowPretaxPay = entries.some((entry) => {
        const totalGrossPay =
            entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        return typeof totalGrossPay === 'number' && totalGrossPay < 1048
    })

    const totals = entries.reduce(
        (acc, entry) => {
            acc.nestEmployee +=
                entry.record.payrollDoc?.deductions?.nestEE?.amount || 0
            acc.nestEmployer +=
                entry.record.payrollDoc?.deductions?.nestER?.amount || 0
            acc.miscPayments += sumMiscAmounts(
                entry.record.payrollDoc?.payments?.misc || []
            )
            acc.miscDeductions += sumMiscAmounts(
                entry.record.payrollDoc?.deductions?.misc || []
            )
            return acc
        },
        {
            nestEmployee: 0,
            nestEmployer: 0,
            miscPayments: 0,
            miscDeductions: 0,
        }
    )
    const payrollEE = totals.nestEmployee
    const payrollER = totals.nestEmployer
    const payrollContribution = payrollEE + payrollER
    let pensionEE = null
    let pensionER = null
    let reportedContribution = null
    let contributionDifference = null
    let daysSinceContribution = null
    let lastContributionLabel = 'N/A'
    const daysThreshold = 30
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
    if (lastContributionDate) {
        const millisecondsSince =
            reportRunDate.getTime() - lastContributionDate.getTime()
        const dayCount = Math.floor(millisecondsSince / (1000 * 60 * 60 * 24))
        daysSinceContribution = Math.max(0, dayCount)
        lastContributionLabel = formatDateLabel(lastContributionDate)
    }
    const differenceClass =
        contributionDifference === null
            ? ''
            : contributionDifference === 0
              ? 'diff--neutral'
              : contributionDifference > 0
                ? 'diff--positive'
                : 'diff--negative'
    const formatOrNA = (value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const formatDifference = () => {
        if (contributionDifference === null) {
            return 'N/A'
        }
        return `<span class="${differenceClass}">${formatCurrency(contributionDifference)}</span>`
    }
    const formatYearDiff = (value, isZeroReview = false) => {
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

    reportSections.push('<div class="page">')
    reportSections.push(
        `<div class="report-meta"><h2>Payroll Report - ${employeeName}</h2>` +
            `<p class="report-range">${dateRangeLabel}</p>` +
            (hasMissingMonths
                ? `<div class="report-missing">${missingMonthsPill}</div>`
                : '') +
            `<div class="report-validation">${validationPill}</div>` +
            '</div>'
    )
    reportSections.push(
        `<h2>Summary Totals: ${employeeName} (${dateRangeLabel})</h2>`
    )

    const yearSummaryRows = Array.from(yearGroups.entries())
        .filter(([yearKey]) => yearKey && yearKey !== 'Unknown')
        .map(([yearKey, entriesForYear]) => {
            const yearHours = entriesForYear.reduce((acc, entry) => {
                return (
                    acc +
                    (entry.record.payrollDoc?.payments?.hourly?.basic?.units ||
                        0)
                )
            }, 0)
            const yearPayrollEE = entriesForYear.reduce((acc, entry) => {
                return (
                    acc +
                    (entry.record.payrollDoc?.deductions?.nestEE?.amount || 0)
                )
            }, 0)
            const yearPayrollER = entriesForYear.reduce((acc, entry) => {
                return (
                    acc +
                    (entry.record.payrollDoc?.deductions?.nestER?.amount || 0)
                )
            }, 0)
            const yearPayrollContribution = yearPayrollEE + yearPayrollER
            const hasFlags = entriesForYear.some(
                (entry) =>
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
            const yearSummaryAnchor = `year-summary-${yearKey}`
            return (
                '<tr>' +
                `<th><a href="#${yearSummaryAnchor}">${yearKey}</a></th>` +
                `<td>${yearHours.toFixed(2)}</td>` +
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
                '<th>Year</th><th>Hours</th>' +
                '<th>Payroll Cont. (EE+ER)</th><th>Reported Cont. (EE+ER)</th>' +
                '<th>YE Over / Under</th><th>Flags</th>' +
                '</tr></thead>' +
                `<tbody>${yearSummaryRows}</tbody>` +
                '</table>'
        )
    }

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
            '</table>' +
            `<p class="notice">Note: Accumulated Over / Under = Payroll Contributions (EE+ER) − Reported (EE+ER). Negative values indicate an underpayment to you pension.</p>`
    )

    if (miscFootnotes.length) {
        const footnoteItems = miscFootnotes
            .map((entry) => {
                const typeLabel =
                    entry.type === 'deduction' ? 'Deduction' : 'Payment'
                const amountLabel =
                    entry.type === 'deduction'
                        ? formatDeduction(entry.item.amount)
                        : formatCurrency(entry.item.amount)
                const itemLabel = entry.item.label || entry.item.title || ''
                const detailLabel =
                    entry.item.units === null || entry.item.rate === null
                        ? 'flat'
                        : `${entry.item.units.toFixed(2)} @ ${formatCurrency(entry.item.rate)}`
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

    if (hasLowPretaxPay) {
        reportSections.push(
            `<div class="report-footnote">${ZERO_TAX_ALLOWANCE_NOTE}</div>`
        )
    }
    reportSections.push('</div>')

    Array.from(yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = yearGroups.get(yearKey)
        const yearLabel = yearKey === 'Unknown' ? 'Unknown Year' : yearKey
        const yearMissing = missingMonthsByYear[yearKey] || []
        const yearAnchor = `year-monthly-${yearKey}`
        entriesForYear.yearKey = yearKey

        reportSections.push('<div class="page">')
        reportSections.push(
            `<h2 id="year-summary-${yearKey}">${yearLabel} Summary: ${employeeName}</h2>`
        )
        if (yearMissing.length) {
            const yearMissingPill = `Missing months: <span class="missing-months">${yearMissing.join(', ')}</span>`
            reportSections.push(
                `<p class="report-missing">${yearMissingPill}</p>`
            )
        }
        const yearFlagNotes = []
        const yearFlagIndexById = new Map()
        entriesForYear.forEach((entry) => {
            const entryFlags = entry.validation?.flags || []
            entryFlags.forEach((flag) => {
                let noteIndex = yearFlagIndexById.get(flag.id)
                if (noteIndex === undefined) {
                    noteIndex = yearFlagNotes.length + 1
                    yearFlagIndexById.set(flag.id, noteIndex)
                    yearFlagNotes.push(flag.label)
                }
                flag.noteIndex = noteIndex
            })
        })
        reportSections.push(renderYearSummary(entriesForYear))
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
        const yearLowPretaxPay = entriesForYear.some((entry) => {
            const totalGrossPay =
                entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
            return typeof totalGrossPay === 'number' && totalGrossPay < 1048
        })
        if (yearLowPretaxPay) {
            reportSections.push(
                `<p class="report-footnote">${ZERO_TAX_ALLOWANCE_NOTE}</p>`
            )
        }
        reportSections.push('</div>')
    })

    Array.from(yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = yearGroups.get(yearKey)
        const yearLabel = yearKey === 'Unknown' ? 'Unknown Year' : yearKey
        const yearAnchor = `year-monthly-${yearKey}`
        const monthAnchors = new Set()

        entriesForYear.forEach((entry, index) => {
            reportSections.push('<div class="page">')
            if (index === 0) {
                reportSections.push(
                    `<h2 class="year-header" id="${yearAnchor}">${yearLabel}</h2>`
                )
            }
            const monthIndex = entry.monthIndex
            if (
                monthIndex >= 1 &&
                monthIndex <= 12 &&
                !monthAnchors.has(monthIndex)
            ) {
                const monthAnchor = `year-monthly-${yearKey}-${String(monthIndex).padStart(2, '0')}`
                reportSections.push(`<div id="${monthAnchor}"></div>`)
                monthAnchors.add(monthIndex)
            }
            reportSections.push(renderReportCell(entry))
            reportSections.push('</div>')
        })
    })

    const timestamp = formatTimestamp(reportRunDate)
    const dateStart = rangeStart ? formatDateKey(rangeStart) : 'unknown'
    const dateFinish = rangeEnd ? formatDateKey(rangeEnd) : 'unknown'
    const employeeSlug = employeeName.trim().replace(/\s+/g, '-')
    const filename = `${timestamp}-${employeeSlug}_${dateStart}-${dateFinish}.pdf`

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
    }
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
    const natInsNumber = record.employee?.natInsNumber || ''
    const combined =
        (record.payrollDoc?.deductions?.nestEE?.amount || 0) +
        (record.payrollDoc?.deductions?.nestER?.amount || 0)
    const imageHtml = record.imageData
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
    const nestEmployee = record.payrollDoc?.deductions?.nestEE?.amount || 0
    const nestEmployer = record.payrollDoc?.deductions?.nestER?.amount || 0
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
    const validationList = validation.flags
        .map((flag) => `<li>${flag.label}</li>`)
        .join('')
    const nestEmployeeClass = nestEmployee === 0 ? 'pension-zero' : ''
    const nestEmployerClass = nestEmployer === 0 ? 'pension-zero' : ''
    const rows = [
        '<table class="report-table">',
        `<tr style="border-bottom: 2px solid black;"><th class="row-header" align="left">Date</th><td>${dateLabel}</td></tr>`,
        ...(!natInsNumber
            ? [
                  `<tr class="report-warning"><th align="left">NAT INS No.</th>` +
                      '<td>Missing</td></tr>',
              ]
            : []),
        ...(validation.flags.length
            ? [
                  `<tr class="report-warning"><th align="left">Warnings</th>` +
                      `<td><ul class="report-warning-list">${validationList}</ul></td></tr>`,
              ]
            : []),
        '<tr><th class="row-header" align="left" colspan="2">Payments</th></tr>',
        ...corePaymentRows.map(
            (item) =>
                `<tr><th align="left">${formatMiscLabel(item)}</th><td>${formatCurrency(
                    item.amount || 0
                )}</td></tr>`
        ),
    ]

    if (miscPayments.length) {
        rows.push(
            '<tr><th class="row-header" align="left" colspan="2">Misc Earnings</th></tr>',
            ...miscPayments.map(
                (item) =>
                    `<tr><th align="left">${formatMiscLabel(item)}</th><td>${formatCurrency(
                        item.amount
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
        `<tr><th align="left">NEST Corp - ER</th>` +
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
        `<tr style="border-top: 2px solid black;"><th class="row-header" align="left">Net Pay (after deductions)</th><td>${formatCurrency(netPay)}</td></tr>`,
        '</table>'
    )

    const cellClass = validation.lowConfidence
        ? 'report-cell is-low-confidence'
        : 'report-cell'
    return `
    <div class="${cellClass}">
      ${imageHtml}
      ${rows.join('\n')}
    </div>
  `
}

/**
 * @param {YearEntries} entriesForYear
 * @returns {string}
 */
function renderYearSummary(entriesForYear) {
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
    const showReconciliation = Boolean(reconciliation)
    const formatOrNA = (value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const formatDiff = (value, isZeroReview = false) => {
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
    const miscFootnotes = entriesForYear.reduce((acc, entry) => {
        const dateLabel = entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
        const miscPayments = entry.record.payrollDoc?.payments?.misc || []
        const miscDeductions = entry.record.payrollDoc?.deductions?.misc || []
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

    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const monthName = new Date(2024, monthIndex - 1, 1).toLocaleDateString(
            'en-GB',
            {
                month: 'long',
            }
        )
        const entries = (monthEntries.get(monthIndex) || [])
            .slice()
            .sort((a, b) => {
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
            })
        const monthAnchor = `year-monthly-${yearKey}-${String(monthIndex).padStart(2, '0')}`
        const reconMonth = showReconciliation
            ? reconciliation.months.get(monthIndex)
            : null
        const actualEE = reconMonth?.actualEE ?? null
        const actualER = reconMonth?.actualER ?? null
        const reportedContribution =
            actualEE === null || actualER === null ? null : actualEE + actualER

        if (entries.length) {
            entries.forEach((entry, entryIndex) => {
                const record = entry.record || null
                const validation = entry.validation || null
                const hours =
                    record?.payrollDoc?.payments?.hourly?.basic?.units || 0
                const holidayHourlyUnits =
                    record?.payrollDoc?.payments?.hourly?.holiday?.units || 0
                const holidaySalaryUnits =
                    record?.payrollDoc?.payments?.salary?.holiday?.units || 0
                const holidayUnits = holidayHourlyUnits + holidaySalaryUnits
                const nestEmployee =
                    record?.payrollDoc?.deductions?.nestEE?.amount || 0
                const nestEmployer =
                    record?.payrollDoc?.deductions?.nestER?.amount || 0
                const payrollContribution = nestEmployee + nestEmployer
                const flagSummary = validation?.flags?.length
                    ? validation.flags
                          .map((flag) =>
                              flag.noteIndex ? `${flag.noteIndex}` : flag.label
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
                        `<td>${holidayUnits.toFixed(2)}</td>` +
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
            })
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

    if (showReconciliation) {
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
    const sections = [
        '<table class="summary-table">' +
            '<thead><tr>' +
            '<th>Month</th><th>Hours</th><th>Holiday Used (Units)</th>' +
            '<th>Payroll Cont. (EE+ER)</th><th>Reported Cont. (EE+ER)</th>' +
            '<th>Over / Under</th><th>Flags</th>' +
            '</tr></thead>' +
            `<tbody>${bodyRows.join('')}</tbody>` +
            '<tfoot>' +
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
                        ? formatDeduction(entry.item.amount)
                        : formatCurrency(entry.item.amount)
                const itemLabel = entry.item.label || entry.item.title || ''
                const detailLabel =
                    entry.item.units === null || entry.item.rate === null
                        ? 'flat'
                        : `${entry.item.units.toFixed(2)} @ ${formatCurrency(entry.item.rate)}`
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
