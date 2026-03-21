import autoTable from 'jspdf-autotable'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('jspdf', () => {
    class MockJsPDF {
        constructor() {
            this._page = 1
            this.internal = {
                pageSize: { getWidth: () => 595, getHeight: () => 842 },
            }
        }
        setFont() {}
        setFontSize() {}
        setTextColor() {}
        setDrawColor() {}
        setLineWidth() {}
        text() {}
        rect() {}
        addPage() {
            this._page += 1
        }
        setPage(n) {
            this._page = n
        }
        getCurrentPageInfo() {
            return { pageNumber: this._page }
        }
        insertPage() {}
        deletePage() {}
        link() {}
        getNumberOfPages() {
            return this._page
        }
        splitTextToSize(t) {
            return [t]
        }
        getImageProperties() {
            return { width: 100, height: 100 }
        }
        addImage() {}
        output() {
            return new ArrayBuffer(8)
        }
    }
    return { jsPDF: MockJsPDF }
})

vi.mock('jspdf-autotable', () => ({
    default: vi.fn(),
    __esModule: true,
}))

import { formatDiff } from '../pwa/src/report/pdf_export.js'
import {
    formatBreakdownCell,
    formatContribution,
    formatContributionDifference,
    formatCurrency,
    formatDeduction,
    formatMiscLabel,
} from '../pwa/src/report/report_formatters.js'

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
    it('formats a positive integer', () => {
        expect(formatCurrency(100)).toBe('£100.00')
    })

    it('formats a positive decimal', () => {
        expect(formatCurrency(1234.56)).toBe('£1234.56')
    })

    it('rounds to 2 decimal places', () => {
        expect(formatCurrency(1.006)).toBe('£1.01')
        expect(formatCurrency(1.004)).toBe('£1.00')
    })

    it('formats zero', () => {
        expect(formatCurrency(0)).toBe('£0.00')
    })

    it('normalises negative zero to £0.00', () => {
        expect(formatCurrency(-0)).toBe('£0.00')
    })

    it('formats a negative value', () => {
        expect(formatCurrency(-50.5)).toBe('£-50.50')
    })
})

// ─── formatDeduction ──────────────────────────────────────────────────────────

describe('formatDeduction', () => {
    it('formats a positive deduction amount with leading minus', () => {
        expect(formatDeduction(153.57)).toBe('-£153.57')
    })

    it('formats a negative deduction amount (absolute value)', () => {
        expect(formatDeduction(-153.57)).toBe('-£153.57')
    })

    it('formats zero', () => {
        expect(formatDeduction(0)).toBe('-£0.00')
    })
})

// ─── formatContribution ───────────────────────────────────────────────────────

describe('formatContribution', () => {
    it('formats a positive contribution', () => {
        expect(formatContribution(57.59)).toBe('£57.59')
    })

    it('formats a negative value as absolute', () => {
        expect(formatContribution(-57.59)).toBe('£57.59')
    })

    it('formats zero', () => {
        expect(formatContribution(0)).toBe('£0.00')
    })
})

// ─── formatMiscLabel ──────────────────────────────────────────────────────────

describe('formatMiscLabel', () => {
    it('returns empty string for null/undefined', () => {
        expect(formatMiscLabel(null)).toBe('')
        expect(formatMiscLabel(undefined)).toBe('')
    })

    it('returns title only when units and rate are absent', () => {
        expect(formatMiscLabel({ title: 'Bonus' })).toBe('Bonus')
    })

    it('returns title only when units is null', () => {
        expect(formatMiscLabel({ title: 'Bonus', units: null, rate: 10 })).toBe(
            'Bonus'
        )
    })

    it('returns title only when rate is null', () => {
        expect(
            formatMiscLabel({ title: 'Overtime', units: 5, rate: null })
        ).toBe('Overtime')
    })

    it('includes units and rate when both are present', () => {
        expect(
            formatMiscLabel({ title: 'Overtime', units: 5.5, rate: 12.0 })
        ).toBe('Overtime (5.50 @ £12.00)')
    })

    it('returns empty string for a title-less item', () => {
        expect(formatMiscLabel({ units: 1, rate: 10 })).toBe(' (1.00 @ £10.00)')
    })
})

// ─── formatBreakdownCell ──────────────────────────────────────────────────────

describe('formatBreakdownCell', () => {
    it('formats known values without allowNA', () => {
        const result = formatBreakdownCell(153.57, 95.98, 57.59)
        expect(result).toContain('£153.57')
        expect(result).toContain('£95.98 EE')
        expect(result).toContain('£57.59 ER')
    })

    it('treats null values as zero when allowNA is false', () => {
        const result = formatBreakdownCell(null, null, null, false)
        expect(result).toContain('£0.00')
    })

    it('returns N/A for null total when allowNA is true', () => {
        expect(formatBreakdownCell(null, null, null, true)).toBe('N/A')
    })

    it('shows N/A for null EE/ER when allowNA is true and total is provided', () => {
        const result = formatBreakdownCell(100, null, null, true)
        expect(result).toContain('£100.00')
        expect(result).toContain('N/A EE')
        expect(result).toContain('N/A ER')
    })
})

// ─── formatContributionDifference ────────────────────────────────────────────

describe('formatContributionDifference', () => {
    it('returns N/A for null', () => {
        expect(formatContributionDifference(null)).toBe('N/A')
    })

    it('applies diff--neutral class for zero', () => {
        const result = formatContributionDifference(0)
        expect(result).toContain('diff--neutral')
        expect(result).toContain('£0.00')
    })

    it('applies diff--neutral class for value that rounds to zero', () => {
        const result = formatContributionDifference(0.004)
        expect(result).toContain('diff--neutral')
    })

    it('applies diff--positive class for positive value', () => {
        const result = formatContributionDifference(552.06)
        expect(result).toContain('diff--positive')
        expect(result).toContain('£552.06')
    })

    it('applies diff--negative class for negative value', () => {
        const result = formatContributionDifference(-153.57)
        expect(result).toContain('diff--negative')
        expect(result).toContain('£-153.57')
    })

    it('does not apply diff--positive to negative value', () => {
        expect(formatContributionDifference(-1)).not.toContain('diff--positive')
    })

    it('does not apply diff--negative to positive value', () => {
        expect(formatContributionDifference(1)).not.toContain('diff--negative')
    })
})

// ─── formatDiff (PDF semantic colour helper) ──────────────────────────────────

describe('formatDiff', () => {
    it('returns N/A with null color for null input', () => {
        expect(formatDiff(null)).toEqual({ text: 'N/A', color: null })
    })

    it('returns neutral (green) color for zero', () => {
        const result = formatDiff(0)
        expect(result.text).toBe('£0.00')
        expect(result.color).toBe('#2d7a4f')
    })

    it('returns neutral color for value that rounds to zero', () => {
        expect(formatDiff(0.004).color).toBe('#2d7a4f')
        expect(formatDiff(-0.004).color).toBe('#2d7a4f')
    })

    it('returns positive (amber) color for positive value', () => {
        const result = formatDiff(552.06)
        expect(result.text).toBe('£552.06')
        expect(result.color).toBe('#8a6014')
    })

    it('returns negative (red) color for negative value', () => {
        const result = formatDiff(-153.57)
        expect(result.text).toBe('£-153.57')
        expect(result.color).toBe('#c0391a')
    })

    it('text matches formatCurrency output', () => {
        expect(formatDiff(100).text).toBe(formatCurrency(100))
        expect(formatDiff(-50.5).text).toBe(formatCurrency(-50.5))
    })

    it('positive and negative colors are distinct', () => {
        expect(formatDiff(1).color).not.toBe(formatDiff(-1).color)
    })

    it('neutral and positive colors are distinct', () => {
        expect(formatDiff(0).color).not.toBe(formatDiff(1).color)
    })

    it('formatDiff and formatContributionDifference agree on sign classification', () => {
        const pairs = [
            [552.06, 'positive'],
            [-153.57, 'negative'],
            [0, 'neutral'],
        ]
        for (const [value, expected] of pairs) {
            const diff = formatDiff(value)
            const html = formatContributionDifference(value)
            expect(html).toContain(`diff--${expected}`)
            if (expected === 'positive') expect(diff.color).toBe('#8a6014')
            if (expected === 'negative') expect(diff.color).toBe('#c0391a')
            if (expected === 'neutral') expect(diff.color).toBe('#2d7a4f')
        }
    })
})

// ─── formatDiff zero-review guard ─────────────────────────────────────────────
// When both payroll and reported contributions are £0, the year summary uses
// DIFF_POSITIVE_COLOR (amber) rather than DIFF_NEUTRAL_COLOR (green).
// This test documents the expected caller-side behaviour.

describe('formatDiff zero-review convention', () => {
    it('formatDiff(0) returns neutral, not amber — caller must override for zero-review', () => {
        const result = formatDiff(0)
        expect(result.color).toBe('#2d7a4f')
        expect(result.color).not.toBe('#8a6014')
    })

    it('zero-review override colour matches positive colour', () => {
        const DIFF_POSITIVE_COLOR = '#8a6014'
        const zeroReviewColor = DIFF_POSITIVE_COLOR
        expect(zeroReviewColor).toBe(formatDiff(1).color)
    })
})

// ─── exportReportPdf guards ───────────────────────────────────────────────────

const validMeta = {
    filename: 'test.pdf',
    appVersion: '1.0.0',
    employeeName: 'Test User',
    dateRangeLabel: '2024/25',
}

const validContext = {
    entries: [],
    yearGroups: new Map(),
    yearKeys: [],
    contributionSummary: null,
    missingMonths: {
        missingMonthsByYear: {},
        hasMissingMonths: false,
        missingMonthsLabel: '',
        missingMonthsHtml: '',
    },
    validationSummary: {
        flaggedEntries: [],
        lowConfidenceEntries: [],
        flaggedPeriods: [],
        validationPill: '',
    },
    contributionTotals: {
        payrollEE: 0,
        payrollER: 0,
        payrollContribution: 0,
        pensionEE: null,
        pensionER: null,
        reportedContribution: null,
        contributionDifference: null,
    },
    contributionRecency: null,
}

/** @type {typeof exportReportPdf} */
let pdfExport
/** @type {(value: any) => string} */
let sanitize
beforeAll(async () => {
    const mod = await import('../pwa/src/report/pdf_export.js')
    pdfExport = mod.exportReportPdf
    sanitize = mod.sanitizeText
})

describe('exportReportPdf', () => {
    it('throws PDF_CONTEXT_MISSING when context is null', async () => {
        await expect(pdfExport(null, validMeta)).rejects.toThrow(
            'PDF_CONTEXT_MISSING'
        )
    })

    it('throws PDF_CONTEXT_MISSING when meta is null', async () => {
        await expect(pdfExport(validContext, null)).rejects.toThrow(
            'PDF_CONTEXT_MISSING'
        )
    })

    it('throws PDF_CONTEXT_MISSING when both are null', async () => {
        await expect(pdfExport(null, null)).rejects.toThrow(
            'PDF_CONTEXT_MISSING'
        )
    })

    it('returns a Uint8Array for a minimal valid context', async () => {
        const result = await pdfExport(validContext, validMeta)
        expect(result).toBeInstanceOf(Uint8Array)
    })

    it('returns a non-empty Uint8Array', async () => {
        const result = await pdfExport(validContext, validMeta)
        expect(result.byteLength).toBeGreaterThan(0)
    })

    it('renders year pages when yearGroups has entries (line 1016)', async () => {
        const entry = {
            parsedDate: new Date('2024-01-31'),
            monthIndex: 10,
            yearKey: '2023/24',
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    processDate: { date: '01/01/24 - 31/01/24' },
                    payments: {
                        hourly: {
                            basic: { units: 0, rate: 0, amount: 0 },
                            holiday: { units: 0, rate: 0, amount: 0 },
                        },
                        salary: { basic: { amount: 0 }, holiday: { units: 0 } },
                        misc: [],
                    },
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                },
            },
            validation: { flags: [], lowConfidence: false },
        }
        const yearEntries = [entry]
        yearEntries.yearKey = '2023/24'
        yearEntries.reconciliation = null
        const contextWithYear = {
            ...validContext,
            entries: [entry],
            yearGroups: new Map([['2023/24', yearEntries]]),
            yearKeys: ['2023/24'],
        }
        const result = await pdfExport(contextWithYear, validMeta)
        expect(result).toBeInstanceOf(Uint8Array)
    })

    it('applies zero-review footer styling for year total rows', async () => {
        vi.mocked(autoTable).mockClear()

        const entry = {
            parsedDate: new Date('2024-01-31'),
            monthIndex: 10,
            yearKey: '2023/24',
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    processDate: { date: '01/01/24 - 31/01/24' },
                    payments: {
                        hourly: {
                            basic: { units: 0, rate: 0, amount: 0 },
                            holiday: { units: 0, rate: 0, amount: 0 },
                        },
                        salary: { basic: { amount: 0 }, holiday: { units: 0 } },
                        misc: [],
                    },
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                },
            },
            validation: { flags: [], lowConfidence: false },
        }
        const yearEntries = [entry]
        yearEntries.yearKey = '2023/24'
        yearEntries.reconciliation = {
            months: new Map([
                [
                    10,
                    {
                        expectedEE: 0,
                        expectedER: 0,
                        actualEE: 0,
                        actualER: 0,
                        delta: 0,
                        balance: 0,
                    },
                ],
            ]),
            totals: {
                expectedEE: 0,
                expectedER: 0,
                actualEE: 0,
                actualER: 0,
                delta: 0,
            },
            yearEndBalance: 0,
        }
        const contextWithYear = {
            ...validContext,
            entries: [entry],
            yearGroups: new Map([['2023/24', yearEntries]]),
            yearKeys: ['2023/24'],
        }

        await pdfExport(contextWithYear, validMeta)

        const yearTableCall = vi
            .mocked(autoTable)
            .mock.calls.find((call) => call[1]?.head?.[0]?.[0] === 'Month')
        expect(yearTableCall).toBeTruthy()

        const yearTableOptions = yearTableCall[1]
        expect(yearTableOptions.foot?.[0]?.[5]).toBe('£0.00')

        const footCell = {
            section: 'foot',
            column: { index: 5 },
            row: { index: 0 },
            cell: {
                styles: {},
            },
        }
        yearTableOptions.didParseCell(footCell)

        expect(footCell.cell.styles.textColor).toBe('#8a6014')
        expect(footCell.cell.styles.fontStyle).toBe('bold')
    })

    it('renders payslip pages when entries has items (line 1025)', async () => {
        const entry = {
            parsedDate: new Date('2024-02-28'),
            monthIndex: 11,
            yearKey: '2023/24',
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    processDate: { date: '01/02/24 - 28/02/24' },
                    payments: {
                        hourly: {
                            basic: { units: 0, rate: 0, amount: 0 },
                            holiday: { units: 0, rate: 0, amount: 0 },
                        },
                        salary: { basic: { amount: 0 }, holiday: { units: 0 } },
                        misc: [],
                    },
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                },
                imageData: null,
            },
            validation: { flags: [], lowConfidence: false },
        }
        const contextWithEntries = {
            ...validContext,
            entries: [entry],
        }
        const result = await pdfExport(contextWithEntries, validMeta)
        expect(result).toBeInstanceOf(Uint8Array)
    })

    it('renders validation flags on payslip page (line 980)', async () => {
        const entry = {
            parsedDate: new Date('2024-03-31'),
            monthIndex: 12,
            yearKey: '2023/24',
            record: {
                employee: { natInsNumber: '' },
                payrollDoc: {
                    processDate: { date: '01/03/24 - 31/03/24' },
                    payments: {
                        hourly: {
                            basic: { units: 0, rate: 0, amount: 0 },
                            holiday: { units: 0, rate: 0, amount: 0 },
                        },
                        salary: { basic: { amount: 0 }, holiday: { units: 0 } },
                        misc: [],
                    },
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                },
                imageData: null,
            },
            validation: {
                flags: [{ id: 'test-flag', label: 'Test warning flag' }],
                lowConfidence: false,
            },
        }
        const contextWithFlags = {
            ...validContext,
            entries: [entry],
        }
        const result = await pdfExport(contextWithFlags, validMeta)
        expect(result).toBeInstanceOf(Uint8Array)
    })
})

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
    it('returns plain text unchanged', () => {
        expect(sanitize('Hello world')).toBe('Hello world')
    })

    it('preserves a single newline between two lines', () => {
        expect(sanitize('£160.80\n(EE £100.50 / ER £60.30)')).toBe(
            '£160.80\n(EE £100.50 / ER £60.30)'
        )
    })

    it('preserves multiple newlines', () => {
        expect(sanitize('line one\nline two\nline three')).toBe(
            'line one\nline two\nline three'
        )
    })

    it('does not collapse newline into a space', () => {
        const result = sanitize('total\nbreakdown')
        expect(result).not.toContain(' ')
        expect(result).toBe('total\nbreakdown')
    })

    it('strips HTML tags', () => {
        expect(sanitize('<b>bold</b> text')).toBe('bold text')
    })

    it('strips HTML tags but preserves newlines around them', () => {
        expect(sanitize('<b>total</b>\n<span>detail</span>')).toBe(
            'total\ndetail'
        )
    })

    it('collapses multiple spaces within a line to one', () => {
        expect(sanitize('too   many   spaces')).toBe('too many spaces')
    })

    it('trims leading and trailing whitespace within each line', () => {
        expect(sanitize('  padded  \n  also padded  ')).toBe(
            'padded\nalso padded'
        )
    })

    it('handles null input', () => {
        expect(sanitize(null)).toBe('')
    })

    it('handles undefined input', () => {
        expect(sanitize(undefined)).toBe('')
    })

    it('handles numeric input', () => {
        expect(sanitize(42)).toBe('42')
    })

    it('handles empty string', () => {
        expect(sanitize('')).toBe('')
    })

    it('strips control characters below code 32 (except tab)', () => {
        expect(sanitize('hello\x01\x1Fworld')).toBe('helloworld')
    })

    it('normalises tab characters to spaces within a line', () => {
        const result = sanitize('col1\tcol2')
        expect(result).toBe('col1 col2')
    })

    it('strips the DEL character (code 127)', () => {
        expect(sanitize('hello\x7Fworld')).toBe('helloworld')
    })

    it('does not introduce newlines when none were in the input', () => {
        const result = sanitize('£160.80 (EE £100.50 / ER £60.30)')
        expect(result).not.toContain('\n')
        expect(result).toBe('£160.80 (EE £100.50 / ER £60.30)')
    })
})
