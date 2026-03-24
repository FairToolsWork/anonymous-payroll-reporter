import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
    buildReport,
    formatBreakdownCell,
    formatContributionDifference,
} from '../pwa/src/report/build.js'
import {
    sumDeductionsForNetPay,
    sumPayments,
} from '../pwa/src/report/hourly_pay_calculations.js'
import { buildContributionSummary } from '../pwa/src/report/pension_calculations.js'
import { getTaxYearKey } from '../pwa/src/report/tax_year_utils.js'
import {
    buildBrowserShims,
    runReportFromFixtures,
} from './utils/report_runner.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow/fixtures'
)
const EXCEL_FIXTURE = path.resolve(
    __dirname,
    './test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx'
)
const NET_PAY_TOLERANCE = 0.05

const formatYearAnchor = (yearKey) =>
    String(yearKey || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

const buildRecord = (overrides = {}) => ({
    employee: { name: 'Test Person', natInsNumber: 'AB123456C' },
    payrollDoc: {
        processDate: { date: '01/01/24 - 31/01/24' },
        payments: {
            hourly: {
                basic: { units: 0, rate: 0, amount: 0 },
                holiday: { units: 0, rate: 0, amount: 0 },
            },
            salary: {
                basic: { amount: 0 },
                holiday: { units: 0, rate: 0, amount: 0 },
            },
            misc: [],
        },
        deductions: {
            payeTax: { amount: 0 },
            natIns: { amount: 0 },
            pensionEE: { amount: 0 },
            pensionER: { amount: 0 },
            misc: [],
        },
        taxCode: { code: '1257L' },
        thisPeriod: { totalGrossPay: { amount: 0 } },
        netPay: { amount: 0 },
    },
    ...overrides,
})

describe('report workflow', () => {
    it('builds report output from fixtures', async () => {
        buildBrowserShims()
        const pdfPaths = fs
            .readdirSync(FIXTURES_DIR)
            .filter((file) => file.endsWith('.pdf'))
            .map((file) => path.resolve(FIXTURES_DIR, file))

        const result = await runReportFromFixtures({
            pdfPaths,
            excelPaths: [EXCEL_FIXTURE],
            captureDebug: true,
            requireEmployeeDetails: false,
            includeReportContext: true,
        })

        expect(result.records.length).toBe(13)
        expect(result.report).toBeTruthy()
        expect(result.debug?.text).toBeDefined()
        expect(result.reportContext).toBeTruthy()
        expect(result.reportContext?.entries?.length).toBe(13)
        expect(result.report.stats.validationSummary).toEqual({
            flaggedCount:
                result.reportContext.validationSummary.flaggedEntries.length,
            lowConfidenceCount:
                result.reportContext.validationSummary.lowConfidenceEntries
                    .length,
            flaggedPeriods:
                result.reportContext.validationSummary.flaggedPeriods,
        })
        expect(result.report.stats.missingMonthsByYear).toEqual(
            result.reportContext.missingMonths.missingMonthsByYear
        )

        const expectedContributionSummary = buildContributionSummary(
            result.reportContext.entries,
            result.contributionData,
            result.reportContext.yearKeys
        )
        expect(result.reportContext.contributionSummary).toEqual(
            expectedContributionSummary
        )

        /** @type {Map<string, { expectedEE: number, expectedER: number, actualEE: number, actualER: number }>} */
        const expectedAnnualTotals = new Map()
        result.reportContext.entries.forEach((entry) => {
            if (!(entry.parsedDate instanceof Date)) {
                return
            }
            const yearKey = getTaxYearKey(entry.parsedDate)
            if (!yearKey || yearKey === 'Unknown') {
                return
            }
            const totals = expectedAnnualTotals.get(yearKey) || {
                expectedEE: 0,
                expectedER: 0,
                actualEE: 0,
                actualER: 0,
            }
            totals.expectedEE +=
                entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
            totals.expectedER +=
                entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
            expectedAnnualTotals.set(yearKey, totals)
        })
        const contributionEntries = result.contributionData?.entries || []
        contributionEntries.forEach((entry) => {
            if (!(entry.date instanceof Date)) {
                return
            }
            const yearKey = getTaxYearKey(entry.date)
            if (!yearKey || yearKey === 'Unknown') {
                return
            }
            const totals = expectedAnnualTotals.get(yearKey) || {
                expectedEE: 0,
                expectedER: 0,
                actualEE: 0,
                actualER: 0,
            }
            if (entry.type === 'ee') {
                totals.actualEE += entry.amount || 0
            } else if (entry.type === 'er') {
                totals.actualER += entry.amount || 0
            }
            expectedAnnualTotals.set(yearKey, totals)
        })
        const assertTotalsWithinTolerance = (actual, expected) => {
            if (!actual || !expected) {
                expect(actual).toEqual(expected)
                return
            }
            expect(
                Math.abs(actual.expectedEE - expected.expectedEE)
            ).toBeLessThanOrEqual(NET_PAY_TOLERANCE)
            expect(
                Math.abs(actual.expectedER - expected.expectedER)
            ).toBeLessThanOrEqual(NET_PAY_TOLERANCE)
            expect(
                Math.abs(actual.actualEE - expected.actualEE)
            ).toBeLessThanOrEqual(NET_PAY_TOLERANCE)
            expect(
                Math.abs(actual.actualER - expected.actualER)
            ).toBeLessThanOrEqual(NET_PAY_TOLERANCE)
            expect(Math.abs(actual.delta - expected.delta)).toBeLessThanOrEqual(
                NET_PAY_TOLERANCE
            )
        }

        result.reportContext.yearKeys.forEach((yearKey) => {
            if (!yearKey || yearKey === 'Unknown') {
                return
            }
            const expectedTotals = expectedAnnualTotals.get(yearKey) || {
                expectedEE: 0,
                expectedER: 0,
                actualEE: 0,
                actualER: 0,
            }
            const expectedDelta =
                expectedTotals.actualEE +
                expectedTotals.actualER -
                expectedTotals.expectedEE -
                expectedTotals.expectedER
            const yearSummary =
                result.reportContext.contributionSummary?.years.get(yearKey)
            assertTotalsWithinTolerance(yearSummary?.totals, {
                expectedEE: expectedTotals.expectedEE,
                expectedER: expectedTotals.expectedER,
                actualEE: expectedTotals.actualEE,
                actualER: expectedTotals.actualER,
                delta: expectedDelta,
            })
        })
        const expectedBalance = result.reportContext.yearKeys.reduce(
            (acc, yearKey) => {
                if (!yearKey || yearKey === 'Unknown') {
                    return acc
                }
                const totals = expectedAnnualTotals.get(yearKey) || {
                    expectedEE: 0,
                    expectedER: 0,
                    actualEE: 0,
                    actualER: 0,
                }
                return (
                    acc +
                    totals.actualEE +
                    totals.actualER -
                    totals.expectedEE -
                    totals.expectedER
                )
            },
            0
        )
        expect(result.reportContext.contributionSummary?.balance).toBeCloseTo(
            expectedBalance
        )

        const contributionTotals = result.reportContext.contributionTotals
        const payrollBreakdown = formatBreakdownCell(
            contributionTotals.payrollContribution,
            contributionTotals.payrollEE,
            contributionTotals.payrollER
        )
        const reportedBreakdown = formatBreakdownCell(
            contributionTotals.reportedContribution,
            contributionTotals.pensionEE,
            contributionTotals.pensionER,
            true
        )
        const differenceLabel = formatContributionDifference(
            contributionTotals.contributionDifference
        )

        result.reportContext.entries.forEach((entry) => {
            const { record } = entry
            const payments = sumPayments(record)
            const deductions = sumDeductionsForNetPay(record)
            const expectedNet = payments - deductions
            const actualNet = record?.payrollDoc?.netPay?.amount || 0
            const isMismatch =
                Math.abs(actualNet - expectedNet) > NET_PAY_TOLERANCE
            const hasNetMismatchFlag = entry.validation?.flags?.some(
                (flag) => flag.id === 'net_mismatch'
            )
            expect(hasNetMismatchFlag).toBe(isMismatch)
        })

        expect(result.report.html).toContain('Payroll Report \u2014')
        expect(result.report.html).toContain('<th>Tax Year</th>')
        expect(result.report.html).toContain('<th>Hours</th>')
        expect(result.report.html).toContain('<th>Payroll Cont. (EE+ER)</th>')
        expect(result.report.html).toContain('<th>Reported (EE+ER)</th>')
        expect(result.report.html).toContain('<th>YE Over / Under</th>')
        expect(result.report.html).toContain('<th>Flags</th>')
        expect(result.report.html).toContain('<th colspan="2">Date Range</th>')
        expect(result.report.html).toContain('<th>Reported (EE+ER)</th>')
        expect(result.report.html).toContain('<th>Accumulated Over/Under</th>')
        expect(result.report.html).toContain('<th>Last Contribution Date</th>')
        expect(result.report.html).toContain('<th>Month</th>')
        expect(result.report.html).toContain(
            '<th>Holiday <span class="summary-breakdown">(hrs / est. days)</span></th>'
        )
        expect(result.report.html).toContain('<th>Over / Under</th>')
        expect(result.report.html).toContain('<th>Total</th>')
        result.reportContext.yearKeys.forEach((yearKey) => {
            if (!yearKey || yearKey === 'Unknown') {
                return
            }
            const yearLabel = String(yearKey)
            const yearAnchor = formatYearAnchor(yearLabel)
            expect(result.report.html).toContain(
                `<a href="#year-summary-${yearAnchor}">${yearLabel}</a>`
            )
            expect(result.report.html).toContain(
                `<h2 id="year-summary-${yearAnchor}">${yearLabel} Summary:`
            )
            expect(result.report.html).toContain(
                `<h2 class="year-header" id="year-monthly-${yearAnchor}">Payslips: ${yearLabel}</h2>`
            )
            const yearMissing =
                result.reportContext.missingMonths.missingMonthsByYear[
                    yearKey
                ] || []
            if (yearMissing.length) {
                expect(result.report.html).toContain(
                    `Missing months: <span class="missing-months">${yearMissing.join(
                        ', '
                    )}</span>`
                )
            }
            const monthAnchors = new Set(
                result.reportContext.entries
                    .filter(
                        (entry) =>
                            entry.yearKey === yearKey &&
                            entry.monthIndex >= 1 &&
                            entry.monthIndex <= 12
                    )
                    .map((entry) => entry.monthIndex)
            )
            monthAnchors.forEach((monthIndex) => {
                const monthAnchor = `year-monthly-${yearAnchor}-${String(
                    monthIndex
                ).padStart(2, '0')}`
                expect(result.report.html).toContain(
                    `<div id="${monthAnchor}"></div>`
                )
            })
        })
        expect(result.report.html).toContain(payrollBreakdown)
        expect(result.report.html).toContain(reportedBreakdown)
        expect(result.report.html).toContain(differenceLabel)
    })

    it('throws when no payroll records are provided', () => {
        expect(() => buildReport([])).toThrow('No payroll records provided')
    })

    it('handles entries with no parsed dates', () => {
        const record = buildRecord({
            payrollDoc: {
                ...buildRecord().payrollDoc,
                processDate: { date: 'Not a date' },
            },
        })
        const report = buildReport([record])
        expect(report.stats.dateRangeLabel).toBe('Unknown')
    })

    it('treats failed pay periods as present months', () => {
        const record = buildRecord()
        const report = buildReport([record], ['01/02/24 - 28/02/24'])
        const taxYearKey = getTaxYearKey(new Date(2024, 1, 1))
        expect(report.stats.missingMonthsByYear[taxYearKey]).not.toContain(
            'February'
        )
    })

    it('labels contribution range as unknown when dates are missing', () => {
        const record = buildRecord()
        const report = buildReport([record], [], {
            entries: [{ date: null, type: 'ee', amount: 25 }],
            sourceFiles: ['fixture.xlsx'],
        })
        expect(report.stats.contributionMeta.dateRangeLabel).toBe('Unknown')
    })

    it('renders salary-only rows without basic hours', () => {
        const record = buildRecord({
            payrollDoc: {
                ...buildRecord().payrollDoc,
                payments: {
                    ...buildRecord().payrollDoc.payments,
                    salary: {
                        basic: { amount: 2000 },
                        holiday: { units: 0, rate: 0, amount: 0 },
                    },
                },
            },
        })
        const report = buildReport([record])
        expect(report.html).toContain('£2000.00')
        expect(report.html).not.toContain('Basic Hours')
    })

    it('uses N/A for reported totals when reconciliation is missing', () => {
        const record = buildRecord()
        const report = buildReport([record])
        expect(report.html).toContain('<th>Reported (EE+ER)</th>')
        expect(report.html).toContain('<td>N/A</td>')
        expect(report.html).not.toContain('N/A EE / N/A ER')
    })

    it('includes April boundary note when an April payslip is present', () => {
        const record = buildRecord({
            payrollDoc: {
                ...buildRecord().payrollDoc,
                processDate: { date: '06/04/24 - 05/05/24' },
            },
        })
        const report = buildReport([record])
        const aprilNoteFragment =
            'April payslips may include pay accrued across the 6 April tax year boundary'
        expect(report.html).toContain(aprilNoteFragment)
    })

    it('omits April boundary note when no April payslip is present', () => {
        const record = buildRecord()
        const report = buildReport([record])
        const aprilNoteFragment =
            'April payslips may include pay accrued across the 6 April tax year boundary'
        expect(report.html).not.toContain(aprilNoteFragment)
    })
})
