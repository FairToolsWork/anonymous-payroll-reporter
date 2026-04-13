import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    ACCUMULATED_TOTALS_TITLE,
    buildAnnualMonthBreakdownDisplay,
    buildContributionBreakdownParts,
    buildContributionRecencyDisplay,
    buildDiffDisplay,
    buildHolidaySummaryDisplay,
    buildMiscReviewLine,
    buildSummaryNoticesList,
    buildWorkerProfileSummaryFields,
    buildYearNoticesList,
    buildYearRowHolidayDisplay,
    FLAG_NOTES_TITLE,
    formatContribution,
    formatCurrency,
    formatDeduction,
    LOW_CONFIDENCE_PREFACE_TEXT,
    MISC_REVIEW_TITLE,
    YEAR_SUMMARY_TITLE,
} from './report_formatters.js'
import {
    buildPayslipViewModel,
    buildSummaryViewModel,
    buildYearViewModel,
    prepareCoverageEntries,
} from './report_view_model.js'
import { CONTRIBUTION_RECENCY_DAYS_THRESHOLD } from './uk_thresholds.js'

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
const LINE_GAP = 6
const SECTION_GAP = 4
const HEADING_PRE_GAP = 16
const FONT_TITLE = 16
const FONT_HEADING = 13
const FONT_BODY = 10
const FONT_SMALL = 9

// ─── Holiday accrual constants ────────────────────────────────────────────────

const HOURLY_ACCRUAL_FACTOR = 0.1207
const HOURLY_ACCRUAL_FALLBACK_LABEL =
    'worked-hours fallback estimate (no baseline)'

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Formats a contribution total with its EE/ER breakdown on a second line.
 * @param {number} total
 * @param {number} ee
 * @param {number} er
 * @returns {string}
 */
function formatBreakdown(total, ee, er) {
    const parts = buildContributionBreakdownParts(total, ee, er, false)
    return `${parts.totalLabel}\n(${parts.breakdownLabel})`
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
    const parts = buildContributionBreakdownParts(total, ee, er, true)
    return `${parts.totalLabel}\n(${parts.breakdownLabel})`
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripHtml(value) {
    return String(value || '').replace(/<[^>]*>/g, '')
}

/**
 * Sanitizes text for PDF rendering by removing HTML and control characters.
 *
 * IMPORTANT: jsPDF's Helvetica font has limited Unicode support. Characters not in the
 * font (e.g., ≈ U+2248, → U+2192, • U+2022) can corrupt the text rendering state,
 * causing letter spacing issues in subsequent text. This corruption persists even after
 * autoTable calls and affects splitTextToSize calculations.
 *
 * If you encounter spaced-out letters in PDF text after tables or special content:
 * 1. Check for Unicode characters beyond basic ASCII/Latin-1 (codes > 255)
 * 2. Replace with ASCII equivalents: ≈ → ~, → → ->, • → -, etc.
 * 3. The issue manifests as corrupted charSpace state that cannot be reset via setCharSpace(0)
 *
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
 * @param {jsPDF} doc
 * @returns {number}
 */
function contentBottom(doc) {
    return pageHeight(doc) - PAGE_MARGIN
}

/**
 * Ensures there is enough remaining space on the current page; otherwise starts a new page.
 * @param {jsPDF} doc
 * @param {number} cursorY
 * @param {number} requiredHeight
 * @returns {number}
 */
function ensureSpace(doc, cursorY, requiredHeight) {
    if (cursorY + requiredHeight > contentBottom(doc)) {
        doc.addPage()
        return PAGE_MARGIN
    }
    return cursorY
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
    const rawLines = Array.isArray(safeText) ? safeText : [safeText]
    const lines = rawLines.flatMap((line) => {
        const wrapped = doc.splitTextToSize(String(line ?? ''), maxWidth(doc))
        return wrapped.length ? wrapped : ['']
    })
    const lineHeight = fontSize * 1.3
    const lineContent = [...lines]
    let y = cursorY

    while (lineContent.length) {
        y = ensureSpace(doc, y, lineHeight)
        const availableHeight = contentBottom(doc) - y
        const linesOnPage = Math.max(
            1,
            Math.floor(availableHeight / lineHeight)
        )
        const chunk = lineContent.splice(0, linesOnPage)
        doc.text(chunk, PAGE_MARGIN, y)
        y += chunk.length * lineHeight
        if (lineContent.length) {
            doc.addPage()
            y = PAGE_MARGIN
        }
    }

    return y + LINE_GAP
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
    const neededHeight = preGap + fontSize * 1.3 + gap
    let y = ensureSpace(doc, cursorY, neededHeight)
    y += preGap
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

/**
 * Returns the text and a semantic text colour for a diff value.
 * @param {number | null} value
 * @returns {{ text: string, color: string | null }}
 */
export function formatDiff(value) {
    const diff = buildDiffDisplay(value)
    return { text: diff.text, color: diff.color }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

/**
 * @param {{ workerTypeLabel: string, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonthName: string, hasVariablePattern: boolean }} workerProfile
 * @returns {string}
 */
function renderWorkerProfileText(workerProfile) {
    return buildWorkerProfileSummaryFields(workerProfile)
        .map(({ label, value }) => `${label}: ${value}`)
        .join(' · ')
}

/**
 * @param {{ primaryLabel: string, detailLines: string[] }} display
 * @returns {string}
 */
function renderDisplayText(display) {
    return [display.primaryLabel, ...display.detailLines]
        .filter(Boolean)
        .join('\n')
}

/**
 * @param {any} row
 * @returns {string}
 */
function renderSummaryYearHoursText(row) {
    const kind = row?.holidaySummary?.kind
    if (kind === 'salary_days' || kind === 'salary_amount') {
        return 'N/A'
    }
    return row.hours.toFixed(2)
}

/**
 * @param {any} holidaySummary
 * @param {number | null} [accruedHoursHint=null]
 */
function renderYearRowHolidayText(holidaySummary, accruedHoursHint = null) {
    const display = buildYearRowHolidayDisplay(holidaySummary, accruedHoursHint)
    return [display.primaryLabel, ...display.detailLines]
        .filter(Boolean)
        .join('\n')
}

/**
 * @param {any} row
 * @returns {string}
 */
function renderSalaryYearRowHolidayText(row) {
    const holidayAmount = row?.salaryHolidayAmount ?? 0
    const estimatedDays = row?.salaryHolidayEstimatedDays
    if (estimatedDays === null || Number.isNaN(estimatedDays)) {
        return `${formatCurrency(holidayAmount)} holiday pay`
    }
    return `${formatCurrency(holidayAmount)} holiday pay\n~${estimatedDays.toFixed(1)} days`
}

/**
 * @param {number} holidayHours
 * @param {number} workedHours
 * @returns {string}
 */
function renderHourlyVariableFooterText(holidayHours, workedHours) {
    const accruedHours = workedHours * HOURLY_ACCRUAL_FACTOR
    const remainingHours = Math.max(0, accruedHours - holidayHours)
    return [
        `${holidayHours.toFixed(2)} hrs taken`,
        `+${accruedHours.toFixed(2)} hrs accrued`,
        `~${accruedHours.toFixed(1)} hrs/yr entitlement (${HOURLY_ACCRUAL_FALLBACK_LABEL})`,
        `${remainingHours.toFixed(1)} hrs remaining`,
    ].join('\n')
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
    const summaryViewModel = buildSummaryViewModel(context, meta)
    const firstSummaryHolidayKind = summaryViewModel.yearSummaryRows.find(
        (row) => row?.holidaySummary?.kind
    )?.holidaySummary?.kind
    const isSalaryWorker =
        firstSummaryHolidayKind === 'salary_days' ||
        firstSummaryHolidayKind === 'salary_amount'
    const summaryHeading = summaryViewModel.heading

    /**
     * @param {string | string[]} text
     * @param {number} cursorY
     * @param {{ fontSize?: number, bold?: boolean, color?: string, gap?: number }} [opts]
     * @returns {number}
     */
    function writeCenteredText(text, cursorY, opts = {}) {
        const fontSize = opts.fontSize ?? FONT_BODY
        const bold = opts.bold ?? false
        const gap = opts.gap ?? LINE_GAP
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(fontSize)
        doc.setTextColor(opts.color ?? '#000000')
        const safeText = sanitizeTextLines(text)
        const lines = Array.isArray(safeText)
            ? safeText
            : doc.splitTextToSize(safeText, maxWidth(doc))
        doc.text(lines, pageWidth(doc) / 2, cursorY, { align: 'center' })
        const lineHeight = fontSize * 1.3
        return cursorY + lines.length * lineHeight + gap
    }

    y = writeCenteredText(
        `Payroll Report - ${summaryHeading.employeeName}`,
        y,
        { fontSize: FONT_TITLE, bold: true, gap: SECTION_GAP }
    )
    y = writeCenteredText(`Date range: ${summaryHeading.dateRangeLabel}`, y, {
        gap: SECTION_GAP,
    })
    if (summaryHeading.generatedLabel) {
        y = writeCenteredText(
            `Generated: ${summaryHeading.generatedLabel}`,
            y,
            {
                gap: SECTION_GAP,
            }
        )
    }
    y += 2

    const metaRows = summaryViewModel.metaRows.map((/** @type {any} */ row) => [
        sanitizeText(row.label),
        sanitizeText(
            row.id === 'worker-profile' && row.workerProfile
                ? renderWorkerProfileText(row.workerProfile)
                : (row.displayValue ?? row.value ?? '')
        ),
    ])
    y += 2
    autoTable(doc, {
        startY: y,
        head: [],
        body: metaRows,
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
    y += LINE_GAP * 2

    /**
     * @param {string} warningBody
     */
    const renderSummaryWarningBox = (warningBody) => {
        y += SECTION_GAP
        const warningText = 'WARNING: ' + sanitizeText(warningBody)
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
        y = ensureSpace(doc, y, warnBoxH + SECTION_GAP)
        doc.setFillColor(253, 244, 237)
        doc.roundedRect(warnBoxX, y, warnBoxW, warnBoxH, 2, 2, 'F')
        doc.setFillColor(194, 84, 45)
        doc.rect(warnBoxX, y, WARN_ACCENT_W, warnBoxH, 'F')
        doc.setTextColor(74, 40, 0)
        doc.text(warnLines, warnTextX, y + WARN_PAD_V + FONT_SMALL)
        doc.setTextColor(0, 0, 0)
        y += warnBoxH + SECTION_GAP
    }

    const summaryNotices = buildSummaryNoticesList(summaryViewModel)
    const hasErrors =
        Boolean(summaryViewModel.contractTypeMismatchWarning) ||
        Boolean(summaryViewModel.thresholdStalenessNotice)

    if (summaryNotices.length > 0) {
        if (summaryNotices.length === 1 && hasErrors) {
            renderSummaryWarningBox(summaryNotices[0])
        } else if (summaryNotices.length === 1) {
            y = writeText(doc, summaryNotices[0], y, {
                fontSize: FONT_SMALL,
            })
        } else {
            y += SECTION_GAP
            const bulletPoints = summaryNotices
                .map((notice) => '- ' + sanitizeText(notice))
                .join('\n')
            const noticeBoxX = PAGE_MARGIN
            const noticeBoxW = maxWidth(doc)
            const NOTICE_PAD_H = 10
            const NOTICE_PAD_V = 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(FONT_SMALL)
            const noticeLines = doc.splitTextToSize(
                bulletPoints,
                noticeBoxW - NOTICE_PAD_H * 2
            )
            const noticeLineH = FONT_SMALL * 1.3
            const noticeTextH = noticeLines.length * noticeLineH
            const noticeBoxH = noticeTextH + NOTICE_PAD_V * 2
            y = ensureSpace(doc, y, noticeBoxH + SECTION_GAP)
            doc.setFillColor(245, 245, 245)
            doc.rect(noticeBoxX, y, noticeBoxW, noticeBoxH, 'F')
            doc.setFillColor(100, 100, 100)
            doc.setLineWidth(0.5)
            doc.rect(noticeBoxX, y, noticeBoxW, noticeBoxH)
            doc.setTextColor(50, 50, 50)
            doc.text(
                noticeLines,
                noticeBoxX + NOTICE_PAD_H,
                y + NOTICE_PAD_V + FONT_SMALL
            )
            doc.setTextColor(0, 0, 0)
            y += noticeBoxH + SECTION_GAP
        }
    }

    y = writeHeading(doc, YEAR_SUMMARY_TITLE, y, {
        preGap: 8,
        gap: 2,
    })

    /** @type {Array<Array<string>>} */
    const yearRows = []
    /** @type {Array<string | null>} */
    const yearRowDiffColors = []
    const yearKeys = summaryViewModel.yearSummaryRows.map((row) => row.yearKey)
    summaryViewModel.yearSummaryRows.forEach((/** @type {any} */ row) => {
        const diff = buildDiffDisplay(row.overUnder, row.zeroReview)
        yearRows.push([
            String(row.yearKey || 'Unknown'),
            renderSummaryYearHoursText(row),
            renderDisplayText(buildHolidaySummaryDisplay(row.holidaySummary)),
            formatBreakdown(
                row.payrollContribution.total,
                row.payrollContribution.ee,
                row.payrollContribution.er
            ),
            formatBreakdownOrNA(
                row.reportedContribution.total,
                row.reportedContribution.ee,
                row.reportedContribution.er
            ),
            diff.text,
            row.hasFlags ? '!' : '-',
        ])
        yearRowDiffColors.push(diff.color)
    })

    y = writeTable(
        doc,
        {
            head: [
                [
                    'Tax Year',
                    'Hours',
                    isSalaryWorker
                        ? 'Holiday (pay/days)'
                        : 'Holiday (hrs/days)',
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

    y = writeHeading(doc, ACCUMULATED_TOTALS_TITLE, y)

    const totals = summaryViewModel.accumulatedTotals
    const recencyDisplay = buildContributionRecencyDisplay(
        totals.contributionRecency,
        CONTRIBUTION_RECENCY_DAYS_THRESHOLD
    )
    const lastContributionCell = totals.contributionRecency
        ? `${recencyDisplay.lastContributionLabel}\n${recencyDisplay.daysLabel}`
        : totals.hasContributionSummary
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
                    totals.dateRangeLabel || meta.dateRangeLabel || 'Unknown',
                    formatBreakdown(
                        totals.payrollContribution.total,
                        totals.payrollContribution.ee,
                        totals.payrollContribution.er
                    ),
                    formatBreakdownOrNA(
                        totals.reportedContribution.total,
                        totals.reportedContribution.ee,
                        totals.reportedContribution.er
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
                if (data.column.index === 4 && recencyDisplay.color) {
                    data.cell.styles.textColor = recencyDisplay.color
                    data.cell.styles.fontStyle = 'bold'
                }
            },
        }
    )

    if (summaryViewModel.miscReviewItems.length) {
        y = writeHeading(doc, MISC_REVIEW_TITLE, y, {
            fontSize: FONT_BODY,
            preGap: 10,
            gap: LINE_GAP,
        })
        y = writeText(
            doc,
            summaryViewModel.miscReviewItems.map((/** @type {any} */ item) =>
                buildMiscReviewLine(item)
            ),
            y,
            { fontSize: FONT_SMALL }
        )
    }
    if (summaryViewModel.notes.length) {
        y += LINE_GAP
        summaryViewModel.notes.forEach((/** @type {any} */ note) => {
            y = writeText(doc, note.text, y, { fontSize: FONT_SMALL })
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
 * @param {{ sortedEntries: import('./report_view_model.js').HolidayCoverageEntry[], normalizedEntryByOriginalEntry: Map<import('./report_view_model.js').ReportEntry, import('./report_view_model.js').HolidayCoverageEntry> } | null} [coverageEntriesPrecomputed]
 * @param {Map<import('./report_view_model.js').ReportEntry, number> | null} [globalEntryIndexByEntryPrecomputed]
 * @returns {number}
 */
function renderYearPage(
    doc,
    entriesForYear,
    yearKey,
    context,
    pageNumbers,
    openingBalance,
    coverageEntriesPrecomputed = null,
    globalEntryIndexByEntryPrecomputed = null
) {
    doc.addPage()
    const pageNumber = doc.getCurrentPageInfo().pageNumber
    let y = PAGE_MARGIN
    const yearViewModel = buildYearViewModel(
        entriesForYear,
        String(yearKey),
        context,
        openingBalance,
        coverageEntriesPrecomputed,
        globalEntryIndexByEntryPrecomputed
    )

    y = writeHeading(
        doc,
        `${yearViewModel.heading.yearKey} Summary: ${context.employeeName || 'Unknown'}`,
        y,
        {
            preGap: 0,
        }
    )
    const yearNotices = buildYearNoticesList(yearViewModel)
    if (yearNotices.length === 1) {
        y = writeText(doc, yearNotices[0], y, { fontSize: FONT_SMALL })
    } else if (yearNotices.length > 1) {
        y += SECTION_GAP
        const bulletPoints = yearNotices
            .map((notice) => '- ' + sanitizeText(notice))
            .join('\n')
        const noticeBoxX = PAGE_MARGIN
        const noticeBoxW = maxWidth(doc)
        const NOTICE_PAD_H = 10
        const NOTICE_PAD_V = 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(FONT_SMALL)
        const noticeLines = doc.splitTextToSize(
            bulletPoints,
            noticeBoxW - NOTICE_PAD_H * 2
        )
        const noticeLineH = FONT_SMALL * 1.3
        const noticeTextH = noticeLines.length * noticeLineH
        const noticeBoxH = noticeTextH + NOTICE_PAD_V * 2
        y = ensureSpace(doc, y, noticeBoxH + SECTION_GAP)
        doc.setFillColor(245, 245, 245)
        doc.rect(noticeBoxX, y, noticeBoxW, noticeBoxH, 'F')
        doc.setFillColor(100, 100, 100)
        doc.setLineWidth(0.5)
        doc.rect(noticeBoxX, y, noticeBoxW, noticeBoxH)
        doc.setTextColor(50, 50, 50)
        doc.text(
            noticeLines,
            noticeBoxX + NOTICE_PAD_H,
            y + NOTICE_PAD_V + FONT_SMALL
        )
        doc.setTextColor(0, 0, 0)
        y += noticeBoxH + SECTION_GAP
    }

    /** @type {Array<Array<string>>} */
    const bodyRows = []
    /** @type {Array<string | null>} */
    const diffColorByRow = []
    /** @type {Array<number | null>} */
    const payslipIndexByRow = []
    const breakdownByMonth = new Map(
        (yearViewModel.monthBreakdown || []).map((/** @type {any} */ bd) => [
            bd.monthIndex,
            bd,
        ])
    )
    // Col index: Month(0) Hours(1) Holiday(2) RefState(3) Payroll(4) Reported(5) Over/Under(6) Flags(7)
    const overUnderColIndex = 6
    const isAccrualHourlyContext = yearViewModel.isAccrualHourlyContext === true
    const isFixedScheduleHourlyContext =
        yearViewModel.isFixedScheduleHourlyContext === true
    const isSalaryContext = yearViewModel.isSalaryContext === true
    yearViewModel.rows.forEach((/** @type {any} */ row) => {
        const rowDiff = buildDiffDisplay(row.overUnder, row.zeroReview)
        const bd = breakdownByMonth.get(row.monthIndex)
        const rowHolidayKind = row.holidaySummary?.kind
        const isHourlyRow =
            rowHolidayKind === 'hours_only' || rowHolidayKind === 'hours_days'
        const accruedHoursHint =
            isAccrualHourlyContext && isHourlyRow && Number.isFinite(row.hours)
                ? row.hours * 0.1207
                : null
        const holidayCellText = isSalaryContext
            ? renderSalaryYearRowHolidayText(row)
            : renderYearRowHolidayText(row.holidaySummary, accruedHoursHint)
        const hoursCellText = isSalaryContext ? 'N/A' : row.hours.toFixed(2)
        const breakdownCells = isFixedScheduleHourlyContext
            ? ['N/A']
            : bd
              ? [buildAnnualMonthBreakdownDisplay(bd).referenceLabel]
              : isSalaryContext
                ? ['N/A']
                : [isAccrualHourlyContext ? 'No baseline' : '—']
        bodyRows.push([
            row.monthLabel,
            hoursCellText,
            holidayCellText,
            ...breakdownCells,
            formatBreakdown(
                row.payrollContribution.total,
                row.payrollContribution.ee,
                row.payrollContribution.er
            ),
            formatBreakdownOrNA(
                row.reportedContribution.total,
                row.reportedContribution.ee,
                row.reportedContribution.er
            ),
            rowDiff.text,
            row.flagRefs.length ? row.flagRefs.join('; ') : '-',
        ])
        diffColorByRow.push(rowDiff.color)
        payslipIndexByRow.push(row.globalEntryIndex ?? null)
    })

    /** @type {Array<Array<string>>} */
    const footRows = []
    /** @type {Array<string | null>} */
    const footDiffColors = []
    yearViewModel.footerRows.forEach((/** @type {any} */ row) => {
        const rowDiff = buildDiffDisplay(row.overUnder, row.zeroReview)
        footRows.push(
            row.id === 'total'
                ? [
                      row.label,
                      isSalaryContext ? 'N/A' : row.hours.toFixed(2),
                      row.yearHolidaySummary?.kind === 'hourly_variable'
                          ? renderHourlyVariableFooterText(
                                row.yearHolidaySummary?.holidayHours ?? 0,
                                row.hours
                            )
                          : renderDisplayText(
                                buildHolidaySummaryDisplay(
                                    row.yearHolidaySummary
                                )
                            ),
                      '',
                      formatBreakdown(
                          row.payrollContribution.total,
                          row.payrollContribution.ee,
                          row.payrollContribution.er
                      ),
                      formatBreakdownOrNA(
                          row.reportedContribution.total,
                          row.reportedContribution.ee,
                          row.reportedContribution.er
                      ),
                      rowDiff.text,
                      '-',
                  ]
                : [row.label, '', '', '', '', '', rowDiff.text, '']
        )
        footDiffColors.push(rowDiff.color)
    })

    const headColumns = [
        'Month',
        'Hours',
        isSalaryContext ? 'Holiday (pay/days)' : 'Holiday (hrs/days)',
        'Reference state',
        'Payroll Cont. (EE+ER)',
        'Reported (EE+ER)',
        'Over/Under',
        'Flags',
    ]

    y = writeTable(
        doc,
        {
            head: [headColumns],
            body: bodyRows,
            foot: footRows,
        },
        y,
        {
            didParseCell(data) {
                if (data.section === 'head') return
                if (data.column.index === overUnderColIndex) {
                    const color =
                        data.section === 'foot'
                            ? (footDiffColors[data.row.index] ?? null)
                            : (diffColorByRow[data.row.index] ?? null)
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

    if (
        yearViewModel.annualCrossCheck &&
        yearViewModel.annualCrossCheckDisplay
    ) {
        y = writeHeading(doc, yearViewModel.annualCrossCheckDisplay.title, y)
        y = writeText(
            doc,
            [
                yearViewModel.annualCrossCheckDisplay.statusLabel,
                ...yearViewModel.annualCrossCheckDisplay.summaryLines,
            ],
            y,
            { fontSize: FONT_SMALL }
        )
    }

    if (yearViewModel.miscReviewItems.length) {
        y = writeHeading(doc, MISC_REVIEW_TITLE, y, {
            fontSize: FONT_BODY,
            preGap: 10,
            gap: LINE_GAP,
        })
        y = writeText(
            doc,
            yearViewModel.miscReviewItems.map((/** @type {any} */ item) =>
                buildMiscReviewLine(item)
            ),
            y,
            { fontSize: FONT_SMALL }
        )
    }

    if (yearViewModel.flagNotes.length) {
        y = writeHeading(doc, FLAG_NOTES_TITLE, y, {
            fontSize: FONT_BODY,
            preGap: 10,
            gap: LINE_GAP,
        })
        const flagNoteLines = yearViewModel.flagNotes.flatMap(
            (/** @type {any} */ note, index) =>
                index === 0
                    ? [`${note.index}. ${note.label}`]
                    : ['', `${note.index}. ${note.label}`]
        )
        y = writeText(doc, flagNoteLines, y, { fontSize: FONT_SMALL })
    }

    if (yearViewModel.notes.length) {
        y += LINE_GAP
        yearViewModel.notes.forEach((/** @type {any} */ note) => {
            y = writeText(doc, note.text, y, { fontSize: FONT_SMALL })
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

    const payslipViewModel = buildPayslipViewModel(entry)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT_HEADING)
    doc.setTextColor('#000000')
    doc.text(`Payslip details - ${payslipViewModel.dateLabel}`, PAGE_MARGIN, y)
    y += FONT_HEADING + LINE_GAP

    const imageData = normalizeImageData(payslipViewModel.imageData || null)
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

    /** @type {Array<Array<string>>} */
    const paymentRows = []
    payslipViewModel.paymentRows.forEach((item) => {
        const breakdown =
            item.units != null && item.rate != null && item.rate !== 0
                ? ` (${Number(item.units).toFixed(2)} @ ${formatCurrency(Number(item.rate))})`
                : ''
        const estSuffix = item.holidayEstimatedDaysSuffix
            ? ` - ${item.holidayEstimatedDaysSuffix}`
            : ''
        paymentRows.push([
            `${item.label}${breakdown}${estSuffix}`,
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

    if (payslipViewModel.holidayAnalysis) {
        const holidayAnalysis = payslipViewModel.holidayAnalysis
        y = writeHeading(doc, 'Holiday analysis', y, {
            fontSize: FONT_BODY,
            preGap: HEADING_PRE_GAP,
            gap: LINE_GAP,
        })
        y = writeText(
            doc,
            [
                holidayAnalysis.intro,
                ...holidayAnalysis.items,
                holidayAnalysis.footer,
            ],
            y,
            { fontSize: FONT_SMALL }
        )
    }

    const deductionRows = payslipViewModel.deductionRows.map((item) => [
        item.label,
        item.amountType === 'deduction'
            ? formatDeduction(item.amount || 0)
            : item.amountType === 'contribution'
              ? formatContribution(item.amount || 0)
              : formatCurrency(item.amount || 0),
    ])

    y = writeTable(
        doc,
        { head: [['Deductions', 'Amount']], body: deductionRows },
        y
    )

    if (payslipViewModel.flags.lowConfidence) {
        y = writeHeading(doc, 'Low confidence', y, { fontSize: FONT_BODY })
        y = writeText(doc, LOW_CONFIDENCE_PREFACE_TEXT, y, {
            fontSize: FONT_SMALL,
        })
    }

    if (payslipViewModel.warningItems?.length) {
        y = writeHeading(doc, 'Warnings', y, { fontSize: FONT_BODY })
        y = writeText(
            doc,
            payslipViewModel.warningItems.map(
                (/** @type {string} */ warning) => `- ${warning}`
            ),
            y,
            { fontSize: FONT_SMALL }
        )
    }
    if (payslipViewModel.noticeItems?.length) {
        y = writeHeading(doc, 'Notices', y, { fontSize: FONT_BODY })
        y = writeText(
            doc,
            payslipViewModel.noticeItems.map(
                (/** @type {string} */ notice) => `- ${notice}`
            ),
            y,
            { fontSize: FONT_SMALL }
        )
    }
    payslipViewModel.footerNotes.forEach((note) => {
        const noteText = note.marker ? `${note.marker} ${note.text}` : note.text
        y = writeText(doc, noteText, y, { fontSize: FONT_SMALL })
    })
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
 * @typedef {{ entries: ReportEntry[], yearGroups: Map<string, YearEntries>, yearKeys: string[], contributionSummary: ContributionSummary | null, contributionMeta?: { fileCount: number, recordCount: number, dateRangeLabel: string }, reportGeneratedLabel?: string, missingMonths: { missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }, validationSummary: { flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }, contributionTotals: { payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }, contributionRecency?: { lastContributionLabel: string, daysSinceContribution: number | null, daysThreshold: number }, workerProfile?: { workerType: string | null, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }, contractTypeMismatchWarning?: string | null, leaveYearGroups?: Map<string, YearEntries>, employeeName?: string }} ReportContext
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

    const yearCoveragePrecomputed = prepareCoverageEntries(
        /** @type {any[]} */ (context.entries || [])
    )
    const globalEntryIndexPrecomputed = new Map(
        /** @type {any[]} */ (context.entries || []).map((entry, index) => [
            entry,
            index,
        ])
    )
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
            openingBalance,
            yearCoveragePrecomputed,
            globalEntryIndexPrecomputed
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
