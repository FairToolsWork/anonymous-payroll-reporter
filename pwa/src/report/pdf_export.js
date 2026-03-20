import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMonthLabel } from '../parse/parser_config.js'
import {
    ACCUMULATED_TOTALS_NOTE,
    APRIL_BOUNDARY_NOTE,
    formatContribution,
    formatCurrency,
    formatDeduction,
    formatMiscLabel,
    ZERO_TAX_ALLOWANCE_NOTE,
} from './report_formatters.js'
import { getCalendarMonthFromFiscalIndex } from './tax_year_utils.js'
import {
    buildEntryHolidaySummary,
    buildLeaveYearGroups,
    buildYearHolidaySummary,
} from './year_holiday_summary.js'

/**
 * Testing constraints: jsPDF requires a DOM constructor and autoTable relies on
 * jsPDF's font metrics engine (canvas / TTF) to perform layout and fire cell hooks
 * (didParseCell, willDrawCell). Neither is available in Node without a browser shim.
 *
 * What IS testable in Node (via vi.mock stubs):
 *   - Guard conditions (exportReportPdf throws PDF_CONTEXT_MISSING for null inputs)
 *   - Pure helpers: formatDiff, sanitizeText, formatBreakdown, formatBreakdownOrNA
 *   - Code paths through renderSummaryPage / renderYearPage / renderPayslipPage that
 *     do not depend on autoTable layout callbacks
 *
 * What is NOT testable without a real browser or Playwright:
 *   - didParseCell / willDrawCell hooks (semantic colour application)
 *   - autoTable column layout and row height calculation
 *   - Image rendering branches (JPEG/PNG detection, overflow onto new page)
 */

// ─── Layout constants ────────────────────────────────────────────────────────

const PAGE_MARGIN = 40
const LINE_GAP = 4
const SECTION_GAP = 4
const HEADING_PRE_GAP = 16
const FONT_TITLE = 16
const FONT_HEADING = 13
const FONT_BODY = 10
const FONT_SMALL = 9

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * @param {number | null} value
 * @returns {string}
 */
function formatOrNA(value) {
    return value === null ? 'N/A' : formatCurrency(value)
}

/**
 * Formats a contribution total with its EE/ER breakdown on a second line.
 * @param {number} total
 * @param {number} ee
 * @param {number} er
 * @returns {string}
 */
function formatBreakdown(total, ee, er) {
    return `${formatCurrency(total)}\n(EE ${formatCurrency(ee)} / ER ${formatCurrency(er)})`
}

/**
 * Formats a contribution total with its EE/ER breakdown on a second line,
 * where EE or ER may be null (shown as N/A).
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @returns {string}
 */
function formatBreakdownOrNA(total, ee, er) {
    if (total === null) return 'N/A'
    return `${formatCurrency(total)}\n(EE ${formatOrNA(ee)} / ER ${formatOrNA(er)})`
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripHtml(value) {
    return String(value || '').replace(/<[^>]*>/g, '')
}

/**
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function sanitizeText(value) {
    const stripped = stripHtml(String(value ?? ''))
    return stripped
        .split('\n')
        .map((line) => {
            let filtered = ''
            for (let i = 0; i < line.length; i += 1) {
                const code = line.charCodeAt(i)
                if (code === 9 || (code >= 32 && code !== 127)) {
                    filtered += line[i]
                }
            }
            return filtered.replace(/\s+/g, ' ').trim()
        })
        .join('\n')
}

/**
 * @param {string | string[]} value
 * @returns {string | string[]}
 */
function sanitizeTextLines(value) {
    if (Array.isArray(value)) {
        return value.map((line) => sanitizeText(line))
    }
    return sanitizeText(value)
}

/**
 * @param {Date | null} date
 * @returns {string}
 */
function formatEntryDateLabel(date) {
    if (!(date instanceof Date)) {
        return 'Unknown'
    }
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/**
 * @param {string | null} imageData
 * @returns {string | null}
 */
function normalizeImageData(imageData) {
    if (!imageData) {
        return null
    }
    if (imageData.startsWith('data:image')) {
        return imageData
    }
    return `data:image/png;base64,${imageData}`
}

// ─── Layout primitives ───────────────────────────────────────────────────────
// Each function takes cursorY and returns the new cursorY after rendering.

/**
 * @param {jsPDF} doc
 * @returns {number}
 */
function pageHeight(doc) {
    return doc.internal.pageSize.getHeight()
}

/**
 * @param {jsPDF} doc
 * @returns {number}
 */
function pageWidth(doc) {
    return doc.internal.pageSize.getWidth()
}

/**
 * @param {jsPDF} doc
 * @returns {number}
 */
function maxWidth(doc) {
    return pageWidth(doc) - PAGE_MARGIN * 2
}

/**
 * Writes text and returns updated cursorY.
 * @param {jsPDF} doc
 * @param {string | string[]} text
 * @param {number} cursorY
 * @param {{ fontSize?: number, bold?: boolean, color?: string }} [opts]
 * @returns {number}
 */
function writeText(doc, text, cursorY, opts = {}) {
    const fontSize = opts.fontSize ?? FONT_BODY
    const bold = opts.bold ?? false
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    doc.setTextColor(opts.color ?? '#000000')
    const safeText = sanitizeTextLines(text)
    const lines = Array.isArray(safeText)
        ? safeText
        : doc.splitTextToSize(safeText, maxWidth(doc))
    doc.text(lines, PAGE_MARGIN, cursorY)
    const lineHeight = fontSize * 1.3
    return cursorY + lines.length * lineHeight + LINE_GAP
}

/**
 * Writes a heading and returns updated cursorY.
 * @param {jsPDF} doc
 * @param {string} text
 * @param {number} cursorY
 * @param {{ fontSize?: number, gap?: number, preGap?: number }} [opts]
 * @returns {number}
 */
function writeHeading(doc, text, cursorY, opts = {}) {
    const fontSize = opts.fontSize ?? FONT_HEADING
    const gap = opts.gap ?? SECTION_GAP
    const preGap = opts.preGap ?? HEADING_PRE_GAP
    const y = cursorY + preGap
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.setTextColor('#000000')
    doc.text(sanitizeText(text), PAGE_MARGIN, y)
    return y + fontSize * 1.3 + gap
}

/**
 * Renders an autoTable and returns updated cursorY.
 * @param {jsPDF} doc
 * @param {{ head: string[][], body: string[][], foot?: string[][] }} tableData
 * @param {number} cursorY
 * @param {{ didParseCell?: (data: any) => void, didDrawCell?: (data: any) => void }} [opts]
 * @returns {number}
 */
function writeTable(doc, tableData, cursorY, opts = {}) {
    const safeHead = tableData.head.map((row) =>
        row.map((cell) => sanitizeText(cell))
    )
    const safeBody = tableData.body.map((row) =>
        row.map((cell) => sanitizeText(cell))
    )
    const safeFoot = tableData.foot
        ? tableData.foot.map((row) => row.map((cell) => sanitizeText(cell)))
        : undefined
    autoTable(doc, {
        startY: cursorY,
        head: safeHead,
        body: safeBody,
        foot: safeFoot,
        theme: 'grid',
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        styles: {
            font: 'helvetica',
            fontSize: FONT_SMALL,
            cellPadding: 4,
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [30, 28, 25],
            textColor: 255,
            fontStyle: 'bold',
        },
        footStyles: {
            fillColor: [255, 255, 255],
            textColor: [30, 28, 25],
            fontStyle: 'bold',
            lineColor: [30, 28, 25],
            lineWidth: 0.75,
        },
        columnStyles: {},
        didParseCell: opts.didParseCell,
        didDrawCell: opts.didDrawCell,
    })
    const finalY = /** @type {any} */ (doc).lastAutoTable?.finalY ?? cursorY
    return finalY + SECTION_GAP
}

// ─── Diff colour helpers ─────────────────────────────────────────────────────

const DIFF_POSITIVE_COLOR = '#8a6014'
const DIFF_NEGATIVE_COLOR = '#c0391a'
const DIFF_NEUTRAL_COLOR = '#2d7a4f'

/**
 * Returns the text and a semantic text colour for a diff value.
 * @param {number | null} value
 * @returns {{ text: string, color: string | null }}
 */
export function formatDiff(value) {
    if (value === null) {
        return { text: 'N/A', color: null }
    }
    const rounded = Number(value.toFixed(2))
    const text = formatCurrency(value)
    if (rounded === 0) return { text, color: DIFF_NEUTRAL_COLOR }
    if (rounded > 0) return { text, color: DIFF_POSITIVE_COLOR }
    return { text, color: DIFF_NEGATIVE_COLOR }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ type: 'payment' | 'deduction', dateLabel: string, item: any }} MiscFootnote
 */

/**
 * @param {any[]} entries
 * @returns {MiscFootnote[]}
 */
function collectMiscFootnotes(entries) {
    /** @type {MiscFootnote[]} */
    const result = []
    entries.forEach((entry) => {
        const dateLabel = entry.parsedDate
            ? formatEntryDateLabel(entry.parsedDate)
            : entry.record?.payrollDoc?.processDate?.date || 'Unknown'
        const miscPayments = entry.record?.payrollDoc?.payments?.misc || []
        const miscDeductions = entry.record?.payrollDoc?.deductions?.misc || []
        miscPayments.forEach((/** @type {any} */ item) => {
            result.push({ type: 'payment', dateLabel, item })
        })
        miscDeductions.forEach((/** @type {any} */ item) => {
            result.push({ type: 'deduction', dateLabel, item })
        })
    })
    return result
}

// ─── Page sections ────────────────────────────────────────────────────────────

/**
 * @param {jsPDF} doc
 * @param {any} context
 * @param {{ filename: string, appVersion: string, employeeName: string, dateRangeLabel: string }} meta
 * @param {{ yearPageNumbers: Map<string, number>, payslipPageNumbers: Map<number, number> }} pageNumbers
 */
function renderSummaryPage(doc, context, meta, pageNumbers) {
    let y = PAGE_MARGIN

    /**
     * @param {string | string[]} text
     * @param {number} cursorY
     * @param {{ fontSize?: number, bold?: boolean, color?: string }} [opts]
     * @returns {number}
     */
    function writeCenteredText(text, cursorY, opts = {}) {
        const fontSize = opts.fontSize ?? FONT_BODY
        const bold = opts.bold ?? false
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(fontSize)
        doc.setTextColor(opts.color ?? '#000000')
        const safeText = sanitizeTextLines(text)
        const lines = Array.isArray(safeText)
            ? safeText
            : doc.splitTextToSize(safeText, maxWidth(doc))
        doc.text(lines, pageWidth(doc) / 2, cursorY, { align: 'center' })
        const lineHeight = fontSize * 1.3
        return cursorY + lines.length * lineHeight + LINE_GAP
    }

    /**
     * @param {string[]} periods
     * @param {string} emptyValue
     * @returns {string}
     */
    function formatPeriodsByYear(periods, emptyValue) {
        if (!periods.length) {
            return emptyValue
        }
        const grouped = /** @type {Record<string, string[]>} */ ({})
        periods.forEach((period) => {
            const yearMatch = String(period).match(/\d{4}$/)
            const year = yearMatch ? yearMatch[0] : 'Unknown'
            if (!grouped[year]) {
                grouped[year] = []
            }
            grouped[year].push(String(period).replace(/\s*\d{4}$/, ''))
        })
        return Object.entries(grouped)
            .map(([year, items]) => `${year}: ${items.join(', ')}`)
            .join('; ')
    }

    /**
     * @param {Record<string, string[]> | null | undefined} groupedMonths
     * @returns {string}
     */
    function formatMonthsByYear(groupedMonths) {
        if (!groupedMonths) {
            return 'None'
        }
        const entries = Object.entries(groupedMonths).filter(
            ([, months]) => months.length
        )
        if (!entries.length) {
            return 'None'
        }
        return entries
            .map(([year, months]) => `${year}: ${months.join(', ')}`)
            .join('; ')
    }

    y = writeCenteredText(
        `Payroll Report - ${meta.employeeName || 'Unknown'}`,
        y,
        { fontSize: FONT_TITLE, bold: true }
    )
    y = writeCenteredText(`Date range: ${meta.dateRangeLabel || 'Unknown'}`, y)
    if (context.reportGeneratedLabel) {
        y = writeCenteredText(`Generated: ${context.reportGeneratedLabel}`, y)
    }
    y += LINE_GAP

    const pdfCount = context.entries?.length ?? 0
    const pdfRow = `${meta.dateRangeLabel || 'Unknown'} · ${pdfCount} PDF${pdfCount !== 1 ? 's' : ''}`
    const pensionMeta = context.contributionMeta || null
    const pensionFileCount = pensionMeta?.fileCount ?? 0
    const pensionRow =
        pensionFileCount > 0
            ? `${pensionMeta?.dateRangeLabel || 'Unknown'} · ${pensionFileCount} file${pensionFileCount !== 1 ? 's' : ''} (${pensionMeta?.recordCount ?? 0} records)`
            : 'None'
    const wp = context.workerProfile
    const PDF_MONTH_NAMES = [
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
    const pdfWorkerTypeLabel = wp?.workerType
        ? wp.workerType.charAt(0).toUpperCase() + wp.workerType.slice(1)
        : 'Not specified'
    const pdfLeaveMonthName =
        PDF_MONTH_NAMES[(wp?.leaveYearStartMonth ?? 4) - 1] || 'April'
    const pdfTypicalDaysDisplay =
        (wp?.typicalDays ?? 5) > 0
            ? `${wp?.typicalDays ?? 5} days/week`
            : 'Variable pattern'
    const workerProfileRow =
        `Type: ${pdfWorkerTypeLabel} · ${pdfTypicalDaysDisplay}` +
        ` · Entitlement: ${wp?.statutoryHolidayDays ?? 28} days/year` +
        ` · Leave year: ${pdfLeaveMonthName}`
    const pdfMissingStr = formatMonthsByYear(
        context.missingMonths?.missingMonthsByYear
    )
    const pdfFlaggedPeriods = context.validationSummary?.flaggedPeriods ?? []
    const pdfFlaggedStr = formatPeriodsByYear(pdfFlaggedPeriods, 'None')
    const pdfLowConfPeriods =
        context.validationSummary?.lowConfidenceEntries?.map(
            (/** @type {ReportEntry} */ entry) =>
                entry.parsedDate
                    ? formatEntryDateLabel(entry.parsedDate)
                    : entry.record?.payrollDoc?.processDate?.date || 'Unknown'
        ) ?? []
    const pdfLowConfStr = formatPeriodsByYear(pdfLowConfPeriods, '0')
    const metaRows = [
        ['Payroll', pdfRow],
        ['Pension', pensionRow],
        ['Worker profile', workerProfileRow],
        ['Missing payroll months', pdfMissingStr],
        ['Flagged periods', pdfFlaggedStr],
        ['Low confidence periods', pdfLowConfStr],
    ]
    y += LINE_GAP
    autoTable(doc, {
        startY: y,
        head: [],
        body: metaRows.map((row) => [
            sanitizeText(row[0]),
            sanitizeText(row[1]),
        ]),
        theme: 'plain',
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        tableWidth: maxWidth(doc),
        columnStyles: {
            0: {
                fontStyle: 'bold',
                textColor: [110, 105, 100],
                cellWidth: 100,
            },
            1: { textColor: [30, 28, 25] },
        },
        styles: {
            font: 'helvetica',
            fontSize: FONT_SMALL,
            cellPadding: { top: 2, right: 4, bottom: 2, left: 4 },
            overflow: 'linebreak',
            fillColor: [248, 246, 243],
            lineColor: [215, 210, 202],
            lineWidth: 0.3,
        },
        tableLineColor: [194, 189, 182],
        tableLineWidth: 0.5,
    })
    y = /** @type {any} */ (doc).lastAutoTable?.finalY ?? y
    y += SECTION_GAP

    if (context.contractTypeMismatchWarning) {
        y += SECTION_GAP
        const warningText =
            'WARNING: ' + sanitizeText(context.contractTypeMismatchWarning)
        const WARN_ACCENT_W = 4
        const WARN_PAD_H = 10
        const WARN_PAD_V = 6
        const warnBoxX = PAGE_MARGIN
        const warnBoxW = maxWidth(doc)
        const warnTextX = warnBoxX + WARN_ACCENT_W + WARN_PAD_H
        const warnAvailWidth = warnBoxW - WARN_ACCENT_W - WARN_PAD_H * 2
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(FONT_SMALL)
        const warnLines = doc.splitTextToSize(warningText, warnAvailWidth)
        const warnLineH = FONT_SMALL * 1.3
        const warnTextH = warnLines.length * warnLineH
        const warnBoxH = warnTextH + WARN_PAD_V * 2
        doc.setFillColor(253, 244, 237)
        doc.roundedRect(warnBoxX, y, warnBoxW, warnBoxH, 2, 2, 'F')
        doc.setFillColor(194, 84, 45)
        doc.rect(warnBoxX, y, WARN_ACCENT_W, warnBoxH, 'F')
        doc.setTextColor(74, 40, 0)
        doc.text(warnLines, warnTextX, y + WARN_PAD_V + FONT_SMALL)
        doc.setTextColor(0, 0, 0)
        y += warnBoxH + SECTION_GAP
    }

    y += LINE_GAP
    y = writeHeading(doc, 'Year Summary', y)

    /** @type {Array<Array<string>>} */
    const yearRows = []
    /** @type {Array<string | null>} */
    const yearRowDiffColors = []
    const leaveYearGroups =
        context.leaveYearGroups || buildLeaveYearGroups(context.entries || [])
    context.yearGroups.forEach(
        (/** @type {any} */ entriesForYear, /** @type {string} */ yearKey) => {
            const yearEntries = /** @type {any[]} */ (entriesForYear)
            const hours = yearEntries.reduce(
                (acc, e) =>
                    acc +
                    (e.record?.payrollDoc?.payments?.hourly?.basic?.units || 0),
                0
            )
            const payEE = yearEntries.reduce(
                (acc, e) =>
                    acc +
                    (e.record?.payrollDoc?.deductions?.pensionEE?.amount || 0),
                0
            )
            const payER = yearEntries.reduce(
                (acc, e) =>
                    acc +
                    (e.record?.payrollDoc?.deductions?.pensionER?.amount || 0),
                0
            )
            const payTotal = payEE + payER
            const recon = entriesForYear.reconciliation || null
            const repEE = recon?.totals?.actualEE ?? null
            const repER = recon?.totals?.actualER ?? null
            const repTotal =
                repEE === null || repER === null ? null : repEE + repER
            const overUnder = repTotal === null ? null : repTotal - payTotal
            const zeroReview =
                repTotal !== null && payTotal === 0 && repTotal === 0
            const diff = zeroReview
                ? { text: formatCurrency(0), color: DIFF_POSITIVE_COLOR }
                : formatDiff(overUnder)
            const hasFlags = yearEntries.some(
                (e) => e.validation?.flags?.length
            )
            const pdfWorkerType = context.workerProfile?.workerType ?? null
            const pdfTypicalDays = context.workerProfile?.typicalDays ?? 5
            const pdfStatutoryDays =
                context.workerProfile?.statutoryHolidayDays ?? 28
            const pdfLeaveYearStartMonth =
                context.workerProfile?.leaveYearStartMonth ?? 4
            const yearHolidaySummary = buildYearHolidaySummary(
                yearEntries,
                leaveYearGroups,
                {
                    workerType: pdfWorkerType,
                    typicalDays: pdfTypicalDays,
                    statutoryHolidayDays: pdfStatutoryDays,
                    leaveYearStartMonth: pdfLeaveYearStartMonth,
                }
            )
            let yearHolidayCell
            if (yearHolidaySummary.kind === 'salary_days') {
                yearHolidayCell =
                    `${formatCurrency(yearHolidaySummary.holidayAmount)}\n` +
                    `(${yearHolidaySummary.daysTaken.toFixed(1)}d taken, ${yearHolidaySummary.daysRemaining.toFixed(1)} rem${yearHolidaySummary.overrun ? ' EXCEEDED' : ''})`
            } else if (yearHolidaySummary.kind === 'salary_amount') {
                yearHolidayCell = formatCurrency(
                    yearHolidaySummary.holidayAmount
                )
            } else if (yearHolidaySummary.kind === 'hourly_days') {
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs\n` +
                    `(${yearHolidaySummary.daysTaken.toFixed(1)}d taken, ${yearHolidaySummary.daysRemaining.toFixed(1)} rem${yearHolidaySummary.overrun ? ' EXCEEDED' : ''})`
            } else if (yearHolidaySummary.kind === 'hourly_hours') {
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs taken\n` +
                    `~${yearHolidaySummary.entitlementHours.toFixed(1)} hrs/yr entitlement\n` +
                    `(${yearHolidaySummary.avgWeeklyHours.toFixed(1)} avg hrs/wk x 5.6)\n` +
                    `${yearHolidaySummary.hoursRemaining.toFixed(1)} hrs remaining${yearHolidaySummary.overrun ? ' EXCEEDED' : ''}`
            } else {
                const variableNote = yearHolidaySummary.hasVariablePattern
                    ? '\n(Variable pattern)'
                    : ''
                yearHolidayCell =
                    `${yearHolidaySummary.holidayHours.toFixed(2)} hrs` +
                    variableNote
            }
            if (yearHolidaySummary.leaveYearLabel) {
                yearHolidayCell += `\n(${yearHolidaySummary.leaveYearLabel})`
            }
            yearRows.push([
                String(yearKey || 'Unknown'),
                hours.toFixed(2),
                yearHolidayCell,
                formatBreakdown(payTotal, payEE, payER),
                formatBreakdownOrNA(repTotal, repEE, repER),
                diff.text,
                hasFlags ? '!' : '-',
            ])
            yearRowDiffColors.push(diff.color)
        }
    )

    const yearKeys = /** @type {string[]} */ ([])
    context.yearGroups.forEach(
        (/** @type {any} */ _v, /** @type {string} */ k) => yearKeys.push(k)
    )

    y = writeTable(
        doc,
        {
            head: [
                [
                    'Tax Year',
                    'Hours',
                    'Holiday (hrs/days)',
                    'Payroll Cont. (EE+ER)',
                    'Reported (EE+ER)',
                    'YE Over/Under',
                    'Flags',
                ],
            ],
            body: yearRows,
        },
        y,
        {
            didParseCell(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    const color = yearRowDiffColors[data.row.index] ?? null
                    if (color) {
                        data.cell.styles.textColor = color
                        data.cell.styles.fontStyle = 'bold'
                    }
                }
                if (data.section === 'body' && data.column.index === 0) {
                    data.cell.styles.textColor = '#1a5fa8'
                }
            },
            didDrawCell(data) {
                if (data.section !== 'body' || data.column.index !== 0) return
                const key = yearKeys[data.row.index]
                if (!key) return
                const pageNumber = pageNumbers.yearPageNumbers.get(key)
                if (!pageNumber) return
                /** @type {any} */
                doc.link(
                    data.cell.x,
                    data.cell.y,
                    data.cell.width,
                    data.cell.height,
                    { pageNumber }
                )
            },
        }
    )

    y = writeHeading(doc, 'Accumulated Totals', y)

    const totals = context.contributionTotals
    const contributionRecency = context.contributionRecency || null
    const daysCount =
        contributionRecency &&
        typeof contributionRecency.daysSinceContribution === 'number'
            ? contributionRecency.daysSinceContribution
            : null
    const daysThreshold = contributionRecency?.daysThreshold ?? 30
    const daysSince = daysCount !== null ? `${daysCount} days` : 'N/A'
    const daysColor =
        daysCount === null
            ? null
            : daysCount > daysThreshold
              ? '#c0391a'
              : '#2d7a4f'
    const lastContributionCell = contributionRecency
        ? `${contributionRecency.lastContributionLabel}\n${daysSince}`
        : context.contributionSummary?.years
          ? 'See year details'
          : 'N/A'
    y = writeTable(
        doc,
        {
            head: [
                [
                    'Date Range',
                    'Payroll Cont. (EE+ER)',
                    'Reported (EE+ER)',
                    'Accumulated Over/Under',
                    'Last Contribution Date',
                ],
            ],
            body: [
                [
                    meta.dateRangeLabel || 'Unknown',
                    formatBreakdown(
                        totals.payrollContribution,
                        totals.payrollEE,
                        totals.payrollER
                    ),
                    formatBreakdownOrNA(
                        totals.reportedContribution,
                        totals.pensionEE,
                        totals.pensionER
                    ),
                    formatDiff(totals.contributionDifference).text,
                    lastContributionCell,
                ],
            ],
        },
        y,
        {
            didParseCell(data) {
                if (data.section !== 'body') return
                if (data.column.index === 3) {
                    const color = formatDiff(
                        totals.contributionDifference
                    ).color
                    if (color) {
                        data.cell.styles.textColor = color
                        data.cell.styles.fontStyle = 'bold'
                    }
                }
                if (data.column.index === 4 && daysColor) {
                    data.cell.styles.textColor = daysColor
                    data.cell.styles.fontStyle = 'bold'
                }
            },
        }
    )

    const hasAprilEntry = context.entries.some(
        (/** @type {any} */ e) =>
            e.parsedDate instanceof Date && e.parsedDate.getMonth() === 3
    )
    const hasLowPretaxPay = context.entries.some((/** @type {any} */ e) => {
        const gross = e.record?.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        return typeof gross === 'number' && gross < 1048
    })

    const summaryFootnotes = collectMiscFootnotes(context.entries)
    if (summaryFootnotes.length) {
        y = writeHeading(doc, 'Misc entries to review', y)
        y = writeText(
            doc,
            summaryFootnotes.map((f) => {
                const typeLabel =
                    f.type === 'deduction' ? 'Deduction' : 'Payment'
                const amountLabel =
                    f.type === 'deduction'
                        ? formatDeduction(f.item.amount || 0)
                        : formatCurrency(f.item.amount || 0)
                return `${f.dateLabel}: ${typeLabel}: ${formatMiscLabel(f.item)}: ${amountLabel}`
            }),
            y,
            { fontSize: FONT_SMALL }
        )
    }
    y = writeText(doc, ACCUMULATED_TOTALS_NOTE, y, { fontSize: FONT_SMALL })
    if (hasAprilEntry) {
        y = writeText(doc, APRIL_BOUNDARY_NOTE, y, { fontSize: FONT_SMALL })
    }
    if (hasLowPretaxPay) {
        y = writeText(doc, ZERO_TAX_ALLOWANCE_NOTE, y, {
            fontSize: FONT_SMALL,
        })
    }
}

/**
 * @param {jsPDF} doc
 * @param {any} entriesForYear
 * @param {string} yearKey
 * @param {any} context
 * @param {{ yearPageNumbers: Map<string, number>, payslipPageNumbers: Map<number, number> }} pageNumbers
 * @param {number} openingBalance
 * @returns {number}
 */
function renderYearPage(
    doc,
    entriesForYear,
    yearKey,
    context,
    pageNumbers,
    openingBalance
) {
    doc.addPage()
    const pageNumber = doc.getCurrentPageInfo().pageNumber
    let y = PAGE_MARGIN

    y = writeHeading(
        doc,
        `${String(yearKey || 'Unknown')} Summary: ${context.employeeName || 'Unknown'}`,
        y,
        {
            preGap: 0,
        }
    )

    const missingForYear =
        context.missingMonths?.missingMonthsByYear?.[yearKey] || []
    if (missingForYear.length) {
        y = writeText(doc, `Missing months: ${missingForYear.join(', ')}`, y, {
            fontSize: FONT_SMALL,
        })
    }

    const monthEntries = new Map()
    entriesForYear.forEach((/** @type {any} */ entry) => {
        if (entry.monthIndex >= 1 && entry.monthIndex <= 12) {
            if (!monthEntries.has(entry.monthIndex)) {
                monthEntries.set(entry.monthIndex, [])
            }
            monthEntries.get(entry.monthIndex).push(entry)
        }
    })

    const reconciliation = entriesForYear.reconciliation || null
    /** @type {Array<Array<string>>} */
    const bodyRows = []
    /** @type {Array<string | null>} */
    const diffColorByRow = []
    /** @type {Array<number | null>} */
    const payslipIndexByRow = []
    let totalHours = 0
    let totalHolidayUnits = 0
    let totalPayEE = 0
    let totalPayER = 0
    let totalPayContrib = 0
    let totalRepEE = null
    let totalRepER = null

    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const entries = /** @type {any[]} */ (
            monthEntries.get(monthIndex) || []
        )
        const calendarMonthIndex = getCalendarMonthFromFiscalIndex(monthIndex)
        const calendarMonth = calendarMonthIndex
            ? formatMonthLabel(calendarMonthIndex)
            : 'Unknown'
        const reconMonth = reconciliation?.months?.get(monthIndex) || null
        const actualEE = reconMonth?.actualEE ?? null
        const actualER = reconMonth?.actualER ?? null
        const repContrib =
            actualEE === null || actualER === null ? null : actualEE + actualER

        if (entries.length) {
            entries.forEach((entry, entryIndex) => {
                const globalEntryIndex = context.entries.indexOf(entry)
                const rec = entry.record || null
                const hours =
                    rec?.payrollDoc?.payments?.hourly?.basic?.units || 0
                const entryHolidaySummary = buildEntryHolidaySummary(entry)
                const holidayCell =
                    entryHolidaySummary.kind === 'hours_days'
                        ? `${entryHolidaySummary.holidayHours.toFixed(2)} hrs\n(${entryHolidaySummary.estimatedDays.toFixed(1)}d)`
                        : entryHolidaySummary.holidayHours.toFixed(2)
                const nestEE =
                    rec?.payrollDoc?.deductions?.pensionEE?.amount || 0
                const nestER =
                    rec?.payrollDoc?.deductions?.pensionER?.amount || 0
                const payContrib = nestEE + nestER
                const overUnder =
                    repContrib === null ? null : repContrib - payContrib
                const zeroReview =
                    repContrib !== null && payContrib === 0 && repContrib === 0
                const rowDiff = zeroReview
                    ? { text: formatCurrency(0), color: DIFF_POSITIVE_COLOR }
                    : formatDiff(overUnder)
                const flagSummary = entry.validation?.flags?.length
                    ? entry.validation.flags
                          .map((/** @type {any} */ f) => f.noteIndex ?? f.label)
                          .join('; ')
                    : '-'
                const monthLabel =
                    entries.length > 1
                        ? `${calendarMonth} (${entryIndex + 1})`
                        : calendarMonth

                bodyRows.push([
                    monthLabel,
                    hours.toFixed(2),
                    holidayCell,
                    formatBreakdown(payContrib, nestEE, nestER),
                    formatBreakdownOrNA(repContrib, actualEE, actualER),
                    rowDiff.text,
                    flagSummary,
                ])
                diffColorByRow.push(rowDiff.color)
                payslipIndexByRow.push(
                    globalEntryIndex >= 0 ? globalEntryIndex : null
                )

                totalHours += hours
                totalHolidayUnits += entryHolidaySummary.holidayHours
                totalPayEE += nestEE
                totalPayER += nestER
                totalPayContrib += payContrib
            })
        } else {
            const overUnder = repContrib === null ? null : repContrib - 0
            const emptyDiff = formatDiff(overUnder)
            bodyRows.push([
                calendarMonth,
                '0.00',
                '0.00',
                formatBreakdown(0, 0, 0),
                formatBreakdownOrNA(repContrib, actualEE, actualER),
                emptyDiff.text,
                '-',
            ])
            diffColorByRow.push(emptyDiff.color)
            payslipIndexByRow.push(null)
        }
    }

    if (reconciliation) {
        totalRepEE = reconciliation.totals?.actualEE ?? null
        totalRepER = reconciliation.totals?.actualER ?? null
    }
    const totalRepContrib =
        totalRepEE === null || totalRepER === null
            ? null
            : (totalRepEE || 0) + (totalRepER || 0)
    const totalOverUnder =
        totalRepContrib === null ? null : totalRepContrib - totalPayContrib

    const totalOverUnderDiff = formatDiff(totalOverUnder)
    const closingBalance =
        reconciliation && totalOverUnder !== null
            ? openingBalance + totalOverUnder
            : null
    const showBalanceRows =
        reconciliation != null &&
        (openingBalance !== 0 || closingBalance !== null)
    const openingBalanceDiff = formatDiff(
        openingBalance !== 0 ? openingBalance : null
    )
    const closingBalanceDiff = formatDiff(closingBalance)
    const footRows = []
    if (showBalanceRows && openingBalance !== 0) {
        footRows.push([
            'Opening Balance',
            '',
            '',
            '',
            '',
            openingBalanceDiff.text,
            '',
        ])
    }
    footRows.push([
        'Total',
        totalHours.toFixed(2),
        totalHolidayUnits.toFixed(2),
        formatBreakdown(totalPayContrib, totalPayEE, totalPayER),
        formatBreakdownOrNA(totalRepContrib, totalRepEE, totalRepER),
        totalOverUnderDiff.text,
        '-',
    ])
    if (showBalanceRows && closingBalance !== null) {
        footRows.push([
            'Closing Balance',
            '',
            '',
            '',
            '',
            closingBalanceDiff.text,
            '',
        ])
    }

    y = writeTable(
        doc,
        {
            head: [
                [
                    'Month',
                    'Hours',
                    'Holiday (hrs/days)',
                    'Payroll Cont. (EE+ER)',
                    'Reported (EE+ER)',
                    'Over/Under',
                    'Flags',
                ],
            ],
            body: bodyRows,
            foot: footRows,
        },
        y,
        {
            didParseCell(data) {
                if (data.section === 'head') return
                if (data.column.index === 5) {
                    let color = null
                    if (data.section === 'foot') {
                        const totalRowIndex =
                            showBalanceRows && openingBalance !== 0 ? 1 : 0
                        if (data.row.index === totalRowIndex) {
                            color = totalOverUnderDiff.color
                        } else if (
                            data.row.index === 0 &&
                            showBalanceRows &&
                            openingBalance !== 0
                        ) {
                            color = openingBalanceDiff.color
                        } else {
                            color = closingBalanceDiff.color
                        }
                    } else {
                        color = diffColorByRow[data.row.index] ?? null
                    }
                    if (color) {
                        data.cell.styles.textColor = color
                        data.cell.styles.fontStyle = 'bold'
                    }
                }
                if (
                    data.section === 'body' &&
                    data.column.index === 0 &&
                    payslipIndexByRow[data.row.index] !== null
                ) {
                    data.cell.styles.textColor = '#1a5fa8'
                }
            },
            didDrawCell(data) {
                if (data.section !== 'body' || data.column.index !== 0) return
                const idx = payslipIndexByRow[data.row.index]
                if (idx === null || idx === undefined) return
                const pageNumber = pageNumbers.payslipPageNumbers.get(idx)
                if (!pageNumber) return
                /** @type {any} */
                doc.link(
                    data.cell.x,
                    data.cell.y,
                    data.cell.width,
                    data.cell.height,
                    { pageNumber }
                )
            },
        }
    )

    const yearFootnotes = collectMiscFootnotes(entriesForYear)
    if (yearFootnotes.length) {
        y = writeHeading(doc, 'Misc entries to review', y)
        y = writeText(
            doc,
            yearFootnotes.map((f) => {
                const typeLabel =
                    f.type === 'deduction' ? 'Deduction' : 'Payment'
                const amountLabel =
                    f.type === 'deduction'
                        ? formatDeduction(f.item.amount || 0)
                        : formatCurrency(f.item.amount || 0)
                return `${f.dateLabel}: ${typeLabel}: ${formatMiscLabel(f.item)}: ${amountLabel}`
            }),
            y,
            { fontSize: FONT_SMALL }
        )
    }

    const yearFlagNotes = /** @type {string[]} */ ([])
    const yearFlagIndexById = new Map()
    entriesForYear.forEach((/** @type {any} */ entry) => {
        const entryFlags = entry.validation?.flags || []
        entryFlags.forEach((/** @type {any} */ flag) => {
            if (!yearFlagIndexById.has(flag.id)) {
                yearFlagIndexById.set(flag.id, yearFlagNotes.length + 1)
                yearFlagNotes.push(flag.label)
            }
        })
    })
    if (yearFlagNotes.length) {
        y = writeHeading(doc, 'Flag notes', y)
        y = writeText(
            doc,
            yearFlagNotes.map((label, i) => `${i + 1}. ${label}`),
            y,
            { fontSize: FONT_SMALL }
        )
    }

    const yearHasAprilEntry = entriesForYear.some(
        (/** @type {any} */ e) =>
            e.parsedDate instanceof Date && e.parsedDate.getMonth() === 3
    )
    const yearLowPretaxPay = entriesForYear.some((/** @type {any} */ e) => {
        const gross = e.record?.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        return typeof gross === 'number' && gross < 1048
    })
    if (yearHasAprilEntry) {
        writeText(doc, APRIL_BOUNDARY_NOTE, y, { fontSize: FONT_SMALL })
    }
    if (yearLowPretaxPay) {
        writeText(doc, ZERO_TAX_ALLOWANCE_NOTE, y, {
            fontSize: FONT_SMALL,
        })
    }

    return pageNumber
}

/**
 * @param {jsPDF} doc
 * @param {any} entry
 * @returns {number}
 */
function renderPayslipPage(doc, entry) {
    doc.addPage()
    const pageNumber = /** @type {any} */ (doc).getCurrentPageInfo().pageNumber
    let y = PAGE_MARGIN

    const record = entry.record
    const dateLabel = entry.parsedDate
        ? formatEntryDateLabel(entry.parsedDate)
        : record?.payrollDoc?.processDate?.date || 'Unknown'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT_HEADING)
    doc.setTextColor('#000000')
    doc.text(`Payslip details - ${dateLabel}`, PAGE_MARGIN, y)
    y += FONT_HEADING + LINE_GAP

    const imageData = normalizeImageData(entry.record?.imageData || null)
    if (imageData) {
        try {
            const props = doc.getImageProperties(imageData)
            const maxW = maxWidth(doc)
            const availableH = pageHeight(doc) - y - PAGE_MARGIN
            const ratio = props.width / props.height
            let imgW = maxW
            let imgH = imgW / ratio
            if (imgH > availableH) {
                doc.addPage()
                y = PAGE_MARGIN
                imgH = Math.min(imgH, pageHeight(doc) - PAGE_MARGIN * 2)
                imgW = imgH * ratio
                if (imgW > maxW) {
                    imgW = maxW
                    imgH = imgW / ratio
                }
            }
            const imgFormat = imageData.startsWith('data:image/jpeg')
                ? 'JPEG'
                : 'PNG'
            doc.addImage(imageData, imgFormat, PAGE_MARGIN, y, imgW, imgH)
            doc.setDrawColor('#cccccc')
            doc.setLineWidth(0.5)
            doc.rect(PAGE_MARGIN, y, imgW, imgH)
            y += imgH + SECTION_GAP
        } catch {
            y = writeText(doc, 'Image unavailable for this entry.', y, {
                fontSize: FONT_SMALL,
            })
        }
    }

    const hourlyPayments = record?.payrollDoc?.payments?.hourly || {}
    const salaryPayments = record?.payrollDoc?.payments?.salary || {}
    const miscPayments = record?.payrollDoc?.payments?.misc || []
    const validation = entry.validation || { flags: [], lowConfidence: false }

    /** @type {Array<Array<string>>} */
    const paymentRows = []
    const entryHolidaySummary = buildEntryHolidaySummary(entry)
    const holidayImpliedDays =
        entryHolidaySummary.kind === 'hours_days'
            ? entryHolidaySummary.estimatedDays.toFixed(1)
            : null
    const basicHours = hourlyPayments.basic?.units || 0
    const basicRate = hourlyPayments.basic?.rate || 0
    const basicAmount = hourlyPayments.basic?.amount || 0
    const holidayHoursUnits = hourlyPayments.holiday?.units || 0
    const holidayRate = hourlyPayments.holiday?.rate || 0
    const holidayAmount = hourlyPayments.holiday?.amount || 0
    const basicSalaryAmount = salaryPayments.basic?.amount ?? null
    const holidaySalaryUnits = salaryPayments.holiday?.units ?? null
    const holidaySalaryRate = salaryPayments.holiday?.rate ?? null
    const holidaySalaryAmount = salaryPayments.holiday?.amount ?? null
    const hasHolidayHourly = [
        holidayHoursUnits,
        holidayRate,
        holidayAmount,
    ].some((value) => value !== null && value !== 0)
    const hasHolidaySalary = [
        holidaySalaryUnits,
        holidaySalaryRate,
        holidaySalaryAmount,
    ].some((value) => value !== null && value !== 0)

    /** @type {Array<{ label: string, units: number | null, rate: number | null, amount: number | null }>} */
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
            units: holidayHoursUnits,
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

    corePaymentRows.forEach((item) => {
        const breakdown =
            item.units != null && item.rate != null && item.rate !== 0
                ? ` (${Number(item.units).toFixed(2)} @ ${formatCurrency(Number(item.rate))})`
                : ''
        const estSuffix =
            item.label === 'Holiday Hours' && holidayImpliedDays !== null
                ? ` - est ${holidayImpliedDays} days holiday`
                : ''
        paymentRows.push([
            `${item.label}${breakdown}${estSuffix}`,
            formatCurrency(item.amount || 0),
        ])
    })
    miscPayments.forEach((/** @type {any} */ item) => {
        paymentRows.push([
            formatMiscLabel(item),
            formatCurrency(item.amount || 0),
        ])
    })

    y = writeTable(
        doc,
        {
            head: [['Payments', 'Amount']],
            body: paymentRows.length
                ? paymentRows
                : [['No payments recorded', '']],
        },
        y
    )

    if (
        holidayImpliedDays !== null &&
        entryHolidaySummary.kind === 'hours_days'
    ) {
        y = writeHeading(doc, 'Holiday analysis', y, {
            fontSize: FONT_BODY,
            preGap: 0,
            gap: LINE_GAP,
        })
        y = writeText(
            doc,
            [
                'Year average, estimate only.',
                `Avg ${entryHolidaySummary.avgWeeklyHours.toFixed(2)} hrs/week over ${entryHolidaySummary.typicalDays} days -> 1 day ≈ ${entryHolidaySummary.avgHoursPerDay.toFixed(2)} hrs.`,
                `This payslip: ${entryHolidaySummary.holidayHours.toFixed(2)} hrs ≈ ${holidayImpliedDays} days.`,
                `If ${holidayImpliedDays} days doesn't match the days you agreed, ask your employer how they calculated the number of hours for holiday.`,
            ],
            y,
            { fontSize: FONT_SMALL }
        )
    }

    const miscDeductions = record?.payrollDoc?.deductions?.misc || []
    const payeTax = record?.payrollDoc?.deductions?.payeTax?.amount || 0
    const natIns = record?.payrollDoc?.deductions?.natIns?.amount || 0
    const nestEE = record?.payrollDoc?.deductions?.pensionEE?.amount || 0
    const nestER = record?.payrollDoc?.deductions?.pensionER?.amount || 0
    const netPay = record?.payrollDoc?.netPay?.amount || 0

    /** @type {Array<Array<string>>} */
    const deductionRows = [
        ['PAYE Tax', formatDeduction(payeTax)],
        ['National Insurance', formatDeduction(natIns)],
        ['NEST Corp - EE', formatDeduction(nestEE)],
        ['NEST Corp - ER', formatContribution(nestER)],
    ]
    miscDeductions.forEach((/** @type {any} */ item) => {
        deductionRows.push([
            formatMiscLabel(item),
            formatDeduction(item.amount || 0),
        ])
    })
    deductionRows.push(['Combined NEST', formatCurrency(nestEE + nestER)])
    deductionRows.push(['Net Pay (after deductions)', formatCurrency(netPay)])

    y = writeTable(
        doc,
        { head: [['Deductions', 'Amount']], body: deductionRows },
        y
    )

    const validationFlags = validation.flags || []
    if (validationFlags.length) {
        y = writeHeading(doc, 'Warnings', y, { fontSize: FONT_BODY })
        y = writeText(
            doc,
            validationFlags.map((/** @type {any} */ f) => `• ${f.label}`),
            y,
            { fontSize: FONT_SMALL }
        )
    }
    y = writeText(
        doc,
        '† Employer contribution — paid by the employer on top of your salary, not deducted from your net pay.',
        y,
        { fontSize: FONT_SMALL }
    )
    if (entry.parsedDate instanceof Date && entry.parsedDate.getMonth() === 3) {
        y = writeText(doc, APRIL_BOUNDARY_NOTE, y, { fontSize: FONT_SMALL })
    }
    return pageNumber
}

/**
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ date: Date | null, type: string, amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number, balance: number }} ContributionMonthSummary
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number }} ContributionYearTotals
 * @typedef {{ months: Map<number, ContributionMonthSummary>, totals: ContributionYearTotals, yearEndBalance: number }} ContributionYearSummary
 * @typedef {{ years: Map<string, ContributionYearSummary>, balance: number, sourceFiles: string[] }} ContributionSummary
 * @typedef {{ record: any, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 * @typedef {ReportEntry[] & { yearKey?: string, reconciliation?: ContributionYearSummary | null }} YearEntries
 * @typedef {{ entries: ReportEntry[], yearGroups: Map<string, YearEntries>, yearKeys: string[], contributionSummary: ContributionSummary | null, contributionMeta?: { fileCount: number, recordCount: number, dateRangeLabel: string }, reportGeneratedLabel?: string, missingMonths: { missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }, validationSummary: { flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }, contributionTotals: { payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }, contributionRecency?: { lastContributionLabel: string, daysSinceContribution: number | null, daysThreshold: number }, workerProfile?: { workerType: string | null, typicalDays: number, statutoryHolidayDays: number, leaveYearStartMonth: number }, contractTypeMismatchWarning?: string | null, leaveYearGroups?: Map<string, YearEntries>, employeeName?: string }} ReportContext
 */

/**
 * @param {ReportContext} context
 * @param {{ filename: string, appVersion: string, employeeName: string, dateRangeLabel: string }} meta
 * @returns {Promise<Uint8Array>}
 */
export async function exportReportPdf(context, meta) {
    if (!context || !meta) {
        throw new Error('PDF_CONTEXT_MISSING')
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })

    /** @type {Map<string, number>} */
    const yearPageNumbers = new Map()
    /** @type {Map<number, number>} */
    const payslipPageNumbers = new Map()

    const pdfYearKeys = /** @type {string[]} */ ([])
    context.yearGroups.forEach(
        (/** @type {any} */ _v, /** @type {string} */ k) =>
            pdfYearKeys.push(String(k || 'Unknown'))
    )

    // Pre-calculate payslip page numbers so year pages can link to them.
    // Final page order: 1=summary (inserted last), 2..Y+1=year pages, Y+2..end=payslips.
    const firstPayslipPage = pdfYearKeys.length + 2
    context.entries.forEach((_, index) => {
        payslipPageNumbers.set(index, firstPayslipPage + index)
    })

    context.employeeName = meta.employeeName || 'Unknown'

    context.yearGroups.forEach((entriesForYear, yearKey) => {
        const strYearKey = String(yearKey || 'Unknown')
        const yearIdx = pdfYearKeys.indexOf(strYearKey)
        let openingBalance = 0
        if (yearIdx > 0 && context.contributionSummary) {
            for (let i = 0; i < yearIdx; i += 1) {
                openingBalance +=
                    context.contributionSummary.years.get(pdfYearKeys[i])
                        ?.totals?.delta ?? 0
            }
        }
        const pageNumber = renderYearPage(
            doc,
            entriesForYear,
            strYearKey,
            context,
            { yearPageNumbers, payslipPageNumbers },
            openingBalance
        )
        yearPageNumbers.set(strYearKey, pageNumber)
    })

    context.entries.forEach((entry, index) => {
        const pageNumber = renderPayslipPage(doc, entry)
        payslipPageNumbers.set(index, pageNumber)
    })

    const docAny = /** @type {any} */ (doc)
    docAny.insertPage(1)
    docAny.deletePage(2)
    doc.setPage(1)
    renderSummaryPage(doc, context, meta, {
        yearPageNumbers,
        payslipPageNumbers,
    })

    const arrayBuffer = doc.output('arraybuffer')
    return new Uint8Array(arrayBuffer)
}
