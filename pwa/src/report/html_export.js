import {
    ACCUMULATED_TOTALS_TITLE,
    buildAnnualMonthBreakdownDisplay,
    buildContributionBreakdownParts,
    buildContributionRecencyDisplay,
    buildDiffDisplay,
    buildHolidaySummaryDisplay,
    buildMiscReviewLine,
    buildWorkerProfileSummaryFields,
    buildYearRowHolidayDisplay,
    formatContribution,
    formatCurrency,
    formatDeduction,
    FLAG_NOTES_TITLE,
    LOW_CONFIDENCE_PREFACE_TEXT,
    MISC_REVIEW_TITLE,
    YEAR_SUMMARY_TITLE,
} from './report_formatters.js'
import {
    buildPayslipViewModel,
    buildSummaryViewModel,
    buildYearViewModel,
} from './report_view_model.js'

const HOURLY_ACCRUAL_FACTOR = 0.1207
const HOURLY_ACCRUAL_FALLBACK_LABEL =
    'worked-hours fallback estimate (no baseline)'

/**
 * @param {{ workerTypeLabel: string, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonthName: string }} workerProfile
 * @returns {string}
 */
function renderWorkerProfileHtml(workerProfile) {
    return buildWorkerProfileSummaryFields(workerProfile)
        .map(({ label, value }) => `<b>${label}:</b> ${value}`)
        .join(' &nbsp;·&nbsp; ')
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function renderSummaryBreakdownLinesHtml(lines) {
    if (!lines.length) {
        return ''
    }
    return `<br>${lines.map((line) => `<span class="summary-breakdown">${line}</span>`).join('<br>')}`
}

/**
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @param {boolean} [allowNA=false]
 * @returns {string}
 */
function renderBreakdownCellHtml(total, ee, er, allowNA = false) {
    if (allowNA && total === null) {
        return 'N/A'
    }
    const parts = buildContributionBreakdownParts(total, ee, er, allowNA)
    return `${parts.totalLabel}<br><span class="summary-breakdown">${parts.breakdownLabel}</span>`
}

/**
 * @param {number | null} value
 * @param {boolean} [isZeroReview=false]
 * @returns {string}
 */
function renderDiffHtml(value, isZeroReview = false) {
    const diff = buildDiffDisplay(value, isZeroReview)
    if (diff.className === null) {
        return 'N/A'
    }
    return `<span class="${diff.className}">${diff.text}</span>`
}

/**
 * @param {{ dateLabel: string, type: string, label: string, amount: number, units: number | null, rate: number | null }} item
 * @returns {string}
 */
function renderMiscReviewItemHtml(item) {
    return `<li>${buildMiscReviewLine(item)}</li>`
}

/**
 * @param {any} holidaySummary
 * @returns {string}
 */
function renderHolidaySummaryHtml(holidaySummary) {
    const display = buildHolidaySummaryDisplay(holidaySummary)
    return `${display.primaryLabel}${renderSummaryBreakdownLinesHtml(display.detailLines)}`
}

/**
 * @param {any} row
 * @returns {string}
 */
function renderSummaryYearHoursHtml(row) {
    const kind = row?.holidaySummary?.kind
    if (kind === 'salary_days' || kind === 'salary_amount') {
        return 'N/A'
    }
    return row.hours.toFixed(2)
}

/**
 * @param {any} holidaySummary
 * @param {number | null} [accruedHoursHint=null]
 * @returns {string}
 */
function renderYearRowHolidayHtml(holidaySummary, accruedHoursHint = null) {
    const display = buildYearRowHolidayDisplay(holidaySummary, accruedHoursHint)
    if (!display.detailLines.length) {
        return display.primaryLabel
    }
    if (display.detailMode === 'inline') {
        return `${display.primaryLabel} <span class="summary-breakdown">${display.detailLines.join(' ')}</span>`
    }
    return `${display.primaryLabel}${renderSummaryBreakdownLinesHtml(display.detailLines)}`
}

/**
 * @param {any} row
 * @returns {string}
 */
function renderSalaryYearRowHolidayHtml(row) {
    const holidayAmount = row?.salaryHolidayAmount ?? 0
    const estimatedDays = row?.salaryHolidayEstimatedDays
    if (!Number.isFinite(estimatedDays)) {
        return `${formatCurrency(holidayAmount)} holiday pay`
    }
    return `${formatCurrency(holidayAmount)} holiday pay<br><span class="summary-breakdown">~${estimatedDays.toFixed(1)} days</span>`
}

/**
 * @param {number} holidayHours
 * @param {number} workedHours
 * @returns {string}
 */
function renderHourlyVariableFooterHtml(holidayHours, workedHours) {
    const accruedHours = workedHours * HOURLY_ACCRUAL_FACTOR
    const remainingHours = Math.max(0, accruedHours - holidayHours)
    return `${holidayHours.toFixed(2)} hrs taken${renderSummaryBreakdownLinesHtml(
        [
            `+${accruedHours.toFixed(2)} hrs accrued`,
            `~${accruedHours.toFixed(1)} hrs/yr entitlement (${HOURLY_ACCRUAL_FALLBACK_LABEL})`,
            `${remainingHours.toFixed(1)} hrs remaining`,
        ]
    )}`
}

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
 * @param {any} context
 * @param {{ employeeName: string, dateRangeLabel: string }} meta
 * @returns {string}
 */
export function renderHtmlReport(context, meta) {
    const employeeName = meta.employeeName || 'Unknown'
    const dateRangeLabel = meta.dateRangeLabel || 'Unknown'
    const {
        workerType,
        typicalDays,
        statutoryHolidayDays,
        leaveYearStartMonth,
    } = context.workerProfile

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
    const workerProfileHtml = renderWorkerProfileHtml({
        workerTypeLabel,
        typicalDays,
        statutoryHolidayDays,
        leaveYearStartMonthName,
    })

    const summaryViewModel = buildSummaryViewModel(context, {
        employeeName,
        dateRangeLabel,
    })
    const isSalaryWorker = context.workerProfile?.workerType === 'salary'
    const summaryHolidayHeader = isSalaryWorker
        ? 'Holiday <span class="summary-breakdown">(pay / est. days)</span>'
        : 'Holiday <span class="summary-breakdown">(hrs / est. days)</span>'

    /**
     * @param {Array<{ year: string, months: string[] }> | undefined} groupedMonths
     * @param {string} emptyLabel
     * @returns {string}
     */
    const formatGroupedMonthsHtml = (groupedMonths, emptyLabel) => {
        if (!groupedMonths || !groupedMonths.length) {
            return `<span class="validation-none">${emptyLabel}</span>`
        }
        return groupedMonths
            .map((group) => {
                const { year, months } = group
                const monthPills = months
                    .map(
                        (m) =>
                            `<span class="pill pill--warn inline">${m}</span>`
                    )
                    .join(' ')
                return `<span class="missing-year">${year}:</span> ${monthPills}`
            })
            .join('<br>')
    }

    /**
     * @param {Array<{ year: string, items: string[] }> | undefined} groupedPeriods
     * @param {string} emptyLabel
     * @returns {string}
     */
    const formatGroupedPeriodsHtml = (groupedPeriods, emptyLabel) => {
        if (!groupedPeriods || !groupedPeriods.length) {
            return `<span class="validation-none">${emptyLabel}</span>`
        }
        return groupedPeriods
            .map((group) => {
                const { year, items } = group
                const itemPills = items
                    .map(
                        (item) =>
                            `<span class="pill pill--warn inline">${item}</span>`
                    )
                    .join(' ')
                return `<span class="missing-year">${year}:</span> <span class="meta-pills">${itemPills}</span>`
            })
            .join('<br>')
    }

    const summaryMetaRowsHtml = summaryViewModel.metaRows
        .map((row) => {
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
        .map((row) => {
            const flagIcon = row.hasFlags ? '⚠︎' : '—'
            return (
                '<tr>' +
                `<th><a href="#${row.anchorId}">${row.yearKey}</a></th>` +
                `<td>${renderSummaryYearHoursHtml(row)}</td>` +
                `<td>${renderHolidaySummaryHtml(row.holidaySummary)}</td>` +
                `<td>${renderBreakdownCellHtml(
                    row.payrollContribution.total,
                    row.payrollContribution.ee,
                    row.payrollContribution.er
                )}</td>` +
                `<td>${renderBreakdownCellHtml(
                    row.reportedContribution.total,
                    row.reportedContribution.ee,
                    row.reportedContribution.er,
                    true
                )}</td>` +
                `<td class="col-center">${renderDiffHtml(row.overUnder, row.zeroReview)}</td>` +
                `<td class="col-center">${flagIcon}</td>` +
                '</tr>'
            )
        })
        .join('')

    const summaryAccumulatedTotals = summaryViewModel.accumulatedTotals
    const summaryRecencyDisplay = buildContributionRecencyDisplay(
        summaryAccumulatedTotals.contributionRecency,
        context.contributionRecency.daysThreshold
    )
    const summaryDaysHtml = summaryRecencyDisplay.className
        ? `<span class="${summaryRecencyDisplay.className}">${summaryRecencyDisplay.daysLabel}</span>`
        : summaryRecencyDisplay.daysLabel
    const summaryMiscReviewHtml = summaryViewModel.miscReviewItems.length
        ? `<div class="report-footnote"><p>† ${MISC_REVIEW_TITLE}</p><ul>${summaryViewModel.miscReviewItems.map((item) => renderMiscReviewItemHtml(item)).join('')}</ul></div>`
        : ''
    const summaryNotesHtml = summaryViewModel.notes
        .map(
            (note) =>
                `<div class="report-footnote"><b>Note:</b> <i>${note.text}</i></div>`
        )
        .join('')

    /** @type {string[]} */
    const reportSections = []

    reportSections.push('<div class="page">')
    reportSections.push(
        `<div class="${summaryViewModel.globalCoverageNotice || summaryViewModel.contractTypeMismatchWarning ? 'has-notice report-meta' : 'report-meta'}">` +
            `<h2>Payroll Report — ${summaryViewModel.heading.employeeName}</h2>` +
            `<p class="report-range">${summaryViewModel.heading.dateRangeLabel}</p>` +
            `<p class="report-meta-generated"><b>Generated:</b> ${summaryViewModel.heading.generatedLabel || 'Unknown'}</p>` +
            `<div class="report-meta-table-container notice no-left-border">` +
            `<table class="report-meta-table ">` +
            `${summaryMetaRowsHtml}` +
            `</table>` +
            `</div>` +
            `</div>`
    )
    if (summaryViewModel.contractTypeMismatchWarning) {
        reportSections.push(
            `<div class="notice error"><span class="warning-icon">⚠︎</span> ${summaryViewModel.contractTypeMismatchWarning}</div>`
        )
    }
    if (summaryViewModel.globalCoverageNotice) {
        reportSections.push(
            `<div class="notice"><p >${summaryViewModel.globalCoverageNotice.message}</p></div>`
        )
    }
    reportSections.push(
        `<h2 class="${summaryViewModel.globalCoverageNotice || summaryViewModel.contractTypeMismatchWarning ? 'has-notice' : ''}">${YEAR_SUMMARY_TITLE}: (${summaryViewModel.heading.dateRangeLabel})</h2>`
    )

    if (summaryYearRowsHtml) {
        reportSections.push(
            '<table class="summary-table global"><thead><tr>' +
                `<th>Tax Year</th><th>Hours worked</th><th>${summaryHolidayHeader}</th>` +
                '<th>Pension Payroll Cont. <span class="summary-breakdown">(EE+ER)</span></th><th>Reported <span class="summary-breakdown">(EE+ER)</span></th>' +
                '<th class="col-center">YE Over / Under</th><th class="col-center">Flags</th>' +
                '</tr></thead>' +
                `<tbody>${summaryYearRowsHtml}</tbody>` +
                '</table>'
        )
    }

    reportSections.push(`<h3>${ACCUMULATED_TOTALS_TITLE}</h3>`)
    reportSections.push(
        '<table class="summary-table accumulated-totals"><thead><tr>' +
            '<th colspan="2">Date Range</th><th>Payroll Cont. (EE+ER)</th>' +
            '<th>Reported (EE+ER)</th><th>Accumulated Over/Under</th>' +
            '<th>Last Contribution Date</th></tr></thead>' +
            '<tbody><tr>' +
            `<td colspan="2">${summaryAccumulatedTotals.dateRangeLabel}</td>` +
            `<td>${renderBreakdownCellHtml(summaryAccumulatedTotals.payrollContribution.total, summaryAccumulatedTotals.payrollContribution.ee, summaryAccumulatedTotals.payrollContribution.er)}</td>` +
            `<td>${renderBreakdownCellHtml(
                summaryAccumulatedTotals.reportedContribution.total,
                summaryAccumulatedTotals.reportedContribution.ee,
                summaryAccumulatedTotals.reportedContribution.er,
                true
            )}</td>` +
            `<td>${renderDiffHtml(summaryAccumulatedTotals.contributionDifference)}</td>` +
            `<td>${summaryRecencyDisplay.lastContributionLabel}<br>${summaryDaysHtml}</td>` +
            '</tr></tbody>' +
            '</table>'
    )
    if (summaryMiscReviewHtml) {
        reportSections.push(summaryMiscReviewHtml)
    }
    reportSections.push(summaryNotesHtml)
    reportSections.push('</div>')

    Array.from(context.yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = context.yearGroups.get(yearKey)
        if (!entriesForYear) {
            return
        }
        /** @type {any} */ entriesForYear.yearKey = yearKey
        const yearKeys = Array.from(context.yearGroups.keys())
        const yearIndex = yearKeys.indexOf(yearKey)
        let openingBalance = 0
        if (yearIndex > 0 && context.contributionSummary) {
            for (let i = 0; i < yearIndex; i += 1) {
                openingBalance +=
                    context.contributionSummary.years.get(yearKeys[i])?.totals
                        ?.delta ?? 0
            }
        }
        const yearViewModel = buildYearViewModel(
            entriesForYear,
            String(yearKey),
            {
                entries: context.entries,
                missingMonths: {
                    missingMonthsByYear:
                        context.missingMonths.missingMonthsByYear,
                },
                workerProfile: context.workerProfile,
            },
            openingBalance
        )
        reportSections.push('<div class="page">')
        reportSections.push(
            `<h2 id="${yearViewModel.heading.anchorId}">${yearViewModel.heading.yearKey} Summary: ${employeeName}</h2>`
        )
        if (yearViewModel.coverageWarning) {
            reportSections.push(
                `<div class="notice "><p>${yearViewModel.coverageWarning.message}</p></div>`
            )
        }
        if (yearViewModel.missingMonths.length) {
            const yearMissingPill = `<div class="notice"><p>Missing months: <span class="missing-months">${yearViewModel.missingMonths.join(', ')}</span></p></div>`
            reportSections.push(
                `<div class="report-missing">${yearMissingPill}</div>`
            )
        }
        reportSections.push(renderYearSummaryFromViewModel(yearViewModel))
        if (yearViewModel.flagNotes.length) {
            const noteItems = yearViewModel.flagNotes
                .map((note) => `<li>${note.index} ${note.label}</li>`)
                .join('')
            reportSections.push(
                `<div class="report-footnote">` +
                    `<p>† ${FLAG_NOTES_TITLE}</p>` +
                    `<ul>${noteItems}</ul>` +
                    '</div>'
            )
        }
        yearViewModel.notes.forEach((note) => {
            reportSections.push(
                `<p class="report-footnote"><b>Note:</b> <i>${note.text}</i></p>`
            )
        })
        reportSections.push('</div>')
    })

    Array.from(context.yearGroups.keys()).forEach((yearKey) => {
        const entriesForYear = context.yearGroups.get(yearKey)
        if (!entriesForYear) {
            return
        }
        const yearLabel = yearKey === 'Unknown' ? 'Unknown Year' : yearKey
        const yearAnchor = `year-monthly-${formatYearAnchor(yearKey)}`
        const monthAnchors = new Set()

        entriesForYear.forEach(
            /**
             * @param {any} entry
             * @param {number} index
             */
            (entry, index) => {
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

    return reportSections.join('\n')
}

/**
 * @param {any} yearViewModel
 * @returns {string}
 */
function renderYearSummaryFromViewModel(yearViewModel) {
    const breakdownByMonth = new Map(
        (yearViewModel.monthBreakdown || []).map((/** @type {any} */ bd) => [
            bd.monthIndex,
            bd,
        ])
    )
    const isAccrualHourlyContext = yearViewModel.isAccrualHourlyContext === true
    const isFixedScheduleHourlyContext =
        yearViewModel.isFixedScheduleHourlyContext === true
    const isSalaryContext = yearViewModel.isSalaryContext === true
    const yearHolidayHeader = isSalaryContext
        ? 'Holiday <span class="summary-breakdown">(pay / est. days)</span>'
        : 'Holiday <span class="summary-breakdown">(hrs / est. days)</span>'
    const bodyRows = yearViewModel.rows.map(
        /** @param {any} row */
        (row) => {
            const monthCell =
                row.kind === 'entry'
                    ? `<a href="#${row.monthAnchorId}">${row.monthLabel}</a>`
                    : row.monthLabel
            const flagSummary = row.flagRefs.length
                ? row.flagRefs.join('; ')
                : '—'
            const flagClass = row.flagRefs.length ? 'summary-warning' : ''
            const bd = breakdownByMonth.get(row.monthIndex)
            const rowHolidayKind = row.holidaySummary?.kind
            const isHourlyRow =
                rowHolidayKind === 'hours_only' ||
                rowHolidayKind === 'hours_days'
            const accruedHoursHint =
                isAccrualHourlyContext && isHourlyRow
                    ? row.hours * HOURLY_ACCRUAL_FACTOR
                    : null
            const holidayCellHtml = isSalaryContext
                ? renderSalaryYearRowHolidayHtml(row)
                : renderYearRowHolidayHtml(row.holidaySummary, accruedHoursHint)
            const breakdownCells = isFixedScheduleHourlyContext
                ? '<td>N/A</td>'
                : bd
                  ? `<td>${buildAnnualMonthBreakdownDisplay(bd).referenceLabel}</td>`
                  : isSalaryContext
                    ? '<td>N/A</td>'
                    : isAccrualHourlyContext
                      ? '<td>No baseline</td>'
                      : '<td>—</td>'
            const hoursCellHtml = isSalaryContext ? 'N/A' : row.hours.toFixed(2)
            return (
                '<tr>' +
                `<th>${monthCell}</th>` +
                `<td>${hoursCellHtml}</td>` +
                `<td>${holidayCellHtml}</td>` +
                breakdownCells +
                `<td>${renderBreakdownCellHtml(
                    row.payrollContribution.total,
                    row.payrollContribution.ee,
                    row.payrollContribution.er
                )}</td>` +
                `<td>${renderBreakdownCellHtml(
                    row.reportedContribution.total,
                    row.reportedContribution.ee,
                    row.reportedContribution.er,
                    true
                )}</td>` +
                `<td class="col-center">${renderDiffHtml(row.overUnder, row.zeroReview)}</td>` +
                `<td class="col-center ${flagClass}">${flagSummary}</td>` +
                '</tr>'
            )
        }
    )
    const footerRows = yearViewModel.footerRows.map(
        /** @param {any} row */
        (row) => {
            if (row.id === 'total') {
                const totalHolidayCellHtml =
                    row.yearHolidaySummary?.kind === 'hourly_variable'
                        ? renderHourlyVariableFooterHtml(
                              row.yearHolidaySummary?.holidayHours ?? 0,
                              row.hours
                          )
                        : renderHolidaySummaryHtml(row.yearHolidaySummary)
                const totalHoursCellHtml = isSalaryContext
                    ? 'N/A'
                    : row.hours.toFixed(2)
                return (
                    '<tr>' +
                    `<th>${row.label}</th>` +
                    `<td>${totalHoursCellHtml}</td>` +
                    `<td colspan="2">${totalHolidayCellHtml}</td>` +
                    `<td>${renderBreakdownCellHtml(
                        row.payrollContribution.total,
                        row.payrollContribution.ee,
                        row.payrollContribution.er
                    )}</td>` +
                    `<td>${renderBreakdownCellHtml(
                        row.reportedContribution.total,
                        row.reportedContribution.ee,
                        row.reportedContribution.er,
                        true
                    )}</td>` +
                    `<td class="col-center">${renderDiffHtml(row.overUnder, row.zeroReview)}</td>` +
                    '<td class="col-center">—</td>' +
                    '</tr>'
                )
            }
            return (
                '<tr>' +
                `<th>${row.label}</th>` +
                '<td colspan="5"></td>' +
                `<td class="col-center" colspan="1">${renderDiffHtml(row.overUnder, row.zeroReview)}</td>` +
                '<td class="col-center">—</td>' +
                '</tr>'
            )
        }
    )
    const sections = [
        '<table class="summary-table annual">' +
            '<thead><tr>' +
            `<th>Month</th><th>Hours worked</th><th>${yearHolidayHeader}</th>` +
            '<th>Reference state</th>' +
            '<th>Pension Payroll Cont. <span class="summary-breakdown">(EE+ER)</span></th><th>Reported <span class="summary-breakdown">(EE+ER)</span></th>' +
            '<th class="col-center">Over / Under</th><th class="col-center">Flags</th>' +
            '</tr></thead>' +
            `<tbody>${bodyRows.join('')}</tbody>` +
            '<tfoot>' +
            `${footerRows.join('')}` +
            '</tfoot>' +
            '</table>',
    ]

    if (yearViewModel.miscReviewItems.length) {
        const footnoteItems = yearViewModel.miscReviewItems
            .map(
                /** @param {any} item */
                (item) => renderMiscReviewItemHtml(item)
            )
            .join('')
        sections.push(
            `<div class="report-footnote">` +
                `<p>† ${MISC_REVIEW_TITLE}</p>` +
                `<ul>${footnoteItems}</ul>` +
                '</div>'
        )
    }

    if (
        yearViewModel.annualCrossCheck &&
        yearViewModel.annualCrossCheckDisplay
    ) {
        sections.push(
            `<div class="notice no-left-border">` +
                `<p><b>${yearViewModel.annualCrossCheckDisplay.title}:</b> ${yearViewModel.annualCrossCheckDisplay.statusLabel}</p>` +
                yearViewModel.annualCrossCheckDisplay.summaryLines
                    .map((/** @type {string} */ line) => `<p>${line}</p>`)
                    .join('') +
                `</div>`
        )
    }

    return sections.join('')
}

/**
 * @param {any} entry
 * @returns {string}
 */
function renderReportCell(entry) {
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
    /** @param {string} item */
    const isNiThresholdNoticeLabel = (item) => {
        const label = String(item || '').toLowerCase()
        return (
            label.includes('ni deductions not taken as gross pay') &&
            (label.includes('at or below the primary threshold') ||
                label.includes('below the primary threshold'))
        )
    }
    const rawWarningItems = payslipViewModel.warningItems || []
    const rawNoticeItems =
        payslipViewModel.noticeItems || payslipViewModel.warnings
    const warningItems = rawWarningItems
        .filter((warning) => !isNiThresholdNoticeLabel(warning))
        .map((warning) => `<li>${warning}</li>`)
    const noticeItems = [
        ...rawNoticeItems,
        ...rawWarningItems.filter((warning) =>
            isNiThresholdNoticeLabel(warning)
        ),
    ].map((notice) => `<li>${notice}</li>`)
    const warningsHtml = warningItems.length
        ? `<div class="notice error"><ul class="report-warning-list">${warningItems.join('')}</ul></div>`
        : ''
    const noticesHtml = noticeItems.length
        ? `<div class="notice"><ul class="report-warning-list">${noticeItems.join('')}</ul></div>`
        : ''
    const lowConfidencePrefaceHtml = payslipViewModel.flags.lowConfidence
        ? `<div class="notice low-confidence-preface"><p>${LOW_CONFIDENCE_PREFACE_TEXT}</p></div>`
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
            `<tr><th align="left">${item.label}${breakdown}<br/>${estSuffix}</th><td>${formatCurrency(
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
        holidayAnalysisFootnote =
            `<div class="notice">` +
            `   <p><b>${holidayAnalysis.title}</b><br/>` +
            `   <i>${holidayAnalysis.intro}</i></p>` +
            `   <ul>${holidayAnalysis.items.map((item) => `<li>${item}</li>`).join('')}</ul>` +
            `   <p>${holidayAnalysis.footer}</p>` +
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
    const zeroTaxAllowanceNote = payslipViewModel.footerNotes.find(
        (note) => note.id === 'zero-tax-allowance'
    )
    const erFootnote = employerContributionNote
        ? `<p class="report-footnote-row"><sup>${employerContributionNote.marker}</sup> ${employerContributionNote.text}</p>`
        : ''
    const aprilBoundaryFootnote = aprilBoundaryNote
        ? `<p class="report-footnote-row"><b>Note:</b> <i>${aprilBoundaryNote.text}</i></p>`
        : ''
    const zeroTaxAllowanceFootnote = zeroTaxAllowanceNote
        ? `<p class="report-footnote-row"><b>Note:</b> <i>${zeroTaxAllowanceNote.text}</i></p>`
        : ''

    return `
    <div class="${cellClass}">
      <div class="report-cell-image">${imageHtml}</div>
      <div class="report-cell-main">
        ${rows.join('\n')}
                ${lowConfidencePrefaceHtml}
        ${warningsHtml}
                ${noticesHtml}
        ${holidayAnalysisFootnote}
      </div>
      <div class="report-cell-footer">
        ${erFootnote}
        ${aprilBoundaryFootnote}
        ${zeroTaxAllowanceFootnote}
      </div>
    </div>
  `
}
