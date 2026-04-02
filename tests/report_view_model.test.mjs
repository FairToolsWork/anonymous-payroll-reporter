import { describe, expect, it } from 'vitest'
import {
    buildPayslipViewModel,
    buildSummaryViewModel,
    buildYearViewModel,
} from '../pwa/src/report/report_view_model.js'

function buildEntry(overrides = {}) {
    return {
        record: {
            imageData: null,
            payrollDoc: {
                processDate: { date: '30 Apr 2024' },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 10, amount: 1000 },
                        holiday: { units: 8, rate: 10, amount: 80 },
                    },
                    salary: {},
                    misc: [{ title: 'Bonus', amount: 50 }],
                },
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 80 },
                    pensionEE: { amount: 50 },
                    pensionER: { amount: 30 },
                    misc: [{ title: 'Advance', amount: 20 }],
                },
                netPay: { amount: 800 },
            },
        },
        parsedDate: new Date('2024-04-30T00:00:00.000Z'),
        validation: {
            flags: [{ id: 'warn-1', label: 'Needs review' }],
            lowConfidence: true,
        },
        holidayContext: {
            hasBaseline: true,
            avgHoursPerDay: 8,
            avgWeeklyHours: 40,
            typicalDays: 5,
        },
        ...overrides,
    }
}

function buildStageTwoEntry(overrides = {}) {
    const base = buildEntry()
    return {
        ...base,
        monthIndex: 1,
        yearKey: '2024/25',
        leaveYearKey: '2024/25',
        record: {
            ...base.record,
            payrollDoc: {
                ...base.record.payrollDoc,
                thisPeriod: {
                    totalGrossPay: { amount: 800 },
                },
            },
        },
        ...overrides,
    }
}

function buildStageTwoContext() {
    const entry = buildStageTwoEntry()
    const entriesForYear = [entry]
    entriesForYear.reconciliation = {
        months: new Map([[1, { actualEE: 60, actualER: 40 }]]),
        totals: { actualEE: 60, actualER: 40 },
    }
    return {
        entry,
        entriesForYear,
        context: {
            entries: [entry],
            yearGroups: new Map([['2024/25', entriesForYear]]),
            contributionSummary: {
                years: new Map([['2024/25', { totals: { delta: 20 } }]]),
            },
            reportGeneratedLabel: '01 Jun 2024',
            contributionMeta: {
                fileCount: 1,
                recordCount: 2,
                dateRangeLabel: 'Apr 2024',
            },
            missingMonths: {
                missingMonthsByYear: {
                    '2024/25': ['May'],
                },
            },
            validationSummary: {
                flaggedPeriods: ['30 Apr 2024'],
                lowConfidenceEntries: [entry],
            },
            contributionTotals: {
                payrollContribution: 80,
                payrollEE: 50,
                payrollER: 30,
                reportedContribution: 100,
                pensionEE: 60,
                pensionER: 40,
                contributionDifference: 20,
            },
            contributionRecency: {
                lastContributionLabel: '25 Apr 2024',
                daysSinceContribution: 5,
                daysThreshold: 30,
            },
            workerProfile: {
                workerType: 'hourly',
                typicalDays: 5,
                statutoryHolidayDays: 28,
                leaveYearStartMonth: 4,
            },
            contractTypeMismatchWarning: 'Worker type mismatch',
        },
        meta: {
            employeeName: 'Pat Example',
            dateRangeLabel: 'Apr 2024',
        },
    }
}

function buildZeroHoursStageTwoContext() {
    const entry = buildStageTwoEntry({
        holidayContext: {
            hasBaseline: true,
            avgHoursPerDay: 0,
            avgWeeklyHours: 40,
            avgRatePerHour: 12.5,
            typicalDays: 0,
            entitlementHours: 224,
            useAccrualMethod: true,
            mixedMonthsIncluded: 1,
            confidence: {
                level: 'medium',
                reasons: ['mixed month reference'],
            },
        },
        record: {
            imageData: null,
            payrollDoc: {
                processDate: { date: '30 Apr 2024' },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 12.5, amount: 1250 },
                        holiday: { units: 8, rate: 12.5, amount: 100 },
                    },
                    salary: {},
                    misc: [],
                },
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 80 },
                    pensionEE: { amount: 50 },
                    pensionER: { amount: 30 },
                    misc: [],
                },
                netPay: { amount: 1170 },
                thisPeriod: { totalGrossPay: { amount: 1350 } },
            },
        },
        validation: {
            flags: [
                { id: 'holiday_rate_below_rolling_avg', label: 'Needs review' },
            ],
            lowConfidence: true,
        },
    })
    const entriesForYear = [entry]
    entriesForYear.reconciliation = {
        months: new Map([[1, { actualEE: 60, actualER: 40 }]]),
        totals: { actualEE: 60, actualER: 40 },
    }
    return {
        entry,
        entriesForYear,
        context: {
            entries: [entry],
            yearGroups: new Map([['2024/25', entriesForYear]]),
            contributionSummary: {
                years: new Map([['2024/25', { totals: { delta: 20 } }]]),
            },
            reportGeneratedLabel: '01 Jun 2024',
            contributionMeta: {
                fileCount: 1,
                recordCount: 1,
                dateRangeLabel: 'Apr 2024',
            },
            missingMonths: {
                missingMonthsByYear: {
                    '2024/25': ['May'],
                },
            },
            validationSummary: {
                flaggedPeriods: ['30 Apr 2024'],
                lowConfidenceEntries: [entry],
            },
            contributionTotals: {
                payrollContribution: 80,
                payrollEE: 50,
                payrollER: 30,
                reportedContribution: 100,
                pensionEE: 60,
                pensionER: 40,
                contributionDifference: 20,
            },
            contributionRecency: {
                lastContributionLabel: '25 Apr 2024',
                daysSinceContribution: 5,
                daysThreshold: 30,
            },
            workerProfile: {
                workerType: 'hourly',
                typicalDays: 0,
                statutoryHolidayDays: null,
                leaveYearStartMonth: 4,
            },
            contractTypeMismatchWarning: null,
        },
        meta: {
            employeeName: 'Pat Example',
            dateRangeLabel: 'Apr 2024',
        },
    }
}

describe('buildPayslipViewModel', () => {
    it('builds shared hourly payslip rows, warnings, holiday analysis, and footer notes', () => {
        const viewModel = buildPayslipViewModel(buildEntry())

        expect(viewModel.dateLabel).toBe('30 Apr 2024')
        expect(viewModel.paymentRows.map((row) => row.label)).toEqual([
            'Basic Hours',
            'Holiday Hours',
            'Bonus',
        ])
        expect(
            viewModel.paymentRows.find((row) => row.id === 'holiday-hours')
                ?.holidayEstimatedDaysSuffix
        ).toBe('est 1.0 days holiday')
        expect(viewModel.deductionRows.map((row) => row.id)).toEqual([
            'paye-tax',
            'national-insurance',
            'nest-ee',
            'nest-er',
            'misc-deduction',
            'combined-nest',
            'net-pay',
        ])
        expect(viewModel.warnings).toEqual(['Needs review'])
        expect(viewModel.flags).toEqual({
            lowConfidence: true,
            warningCount: 1,
        })
        expect(viewModel.holidayAnalysis).toMatchObject({
            title: 'Holiday analysis',
            intro: 'Year average, estimate only.',
            estimatedDays: '1.0',
            typicalDays: 5,
            holidayHours: 8,
        })
        expect(viewModel.footerNotes).toEqual(
            expect.arrayContaining([
                {
                    id: 'employer-contribution',
                    marker: '†',
                    text: 'Employer contribution — paid by the employer on top of your salary, not deducted from your pay.',
                },
                expect.objectContaining({
                    id: 'april-boundary',
                    marker: null,
                    text: expect.stringContaining(
                        'April payslips may include pay accrued across the 6 April tax year boundary.'
                    ),
                }),
            ])
        )
        const aprilBoundaryNote = viewModel.footerNotes.find(
            (note) => note.id === 'april-boundary'
        )
        expect((aprilBoundaryNote?.text || '').replace('<br/>', ' ')).toContain(
            'This tool cannot determine how the employer has attributed hours or amounts between tax years, which may cause discrepancies in year-end figures.'
        )
    })

    it('builds salaried payslip rows without hourly-only holiday analysis', () => {
        const viewModel = buildPayslipViewModel(
            buildEntry({
                record: {
                    imageData: 'data:image/png;base64,abc123',
                    payrollDoc: {
                        processDate: { date: '31 May 2024' },
                        payments: {
                            hourly: {},
                            salary: {
                                basic: { amount: 3000 },
                                holiday: {
                                    units: null,
                                    rate: null,
                                    amount: 200,
                                },
                            },
                            misc: [],
                        },
                        deductions: {
                            payeTax: { amount: 200 },
                            natIns: { amount: 120 },
                            pensionEE: { amount: 60 },
                            pensionER: { amount: 40 },
                            misc: [],
                        },
                        netPay: { amount: 2620 },
                    },
                },
                parsedDate: new Date('2024-05-31T00:00:00.000Z'),
                holidayContext: null,
                validation: { flags: [], lowConfidence: false },
            })
        )

        expect(viewModel.imageData).toBe('data:image/png;base64,abc123')
        expect(viewModel.paymentRows.map((row) => row.label)).toEqual([
            'Basic Salary',
            'Holiday Salary',
        ])
        expect(viewModel.holidayAnalysis).toBeNull()
        expect(viewModel.footerNotes).toEqual([
            {
                id: 'employer-contribution',
                marker: '†',
                text: 'Employer contribution — paid by the employer on top of your salary, not deducted from your pay.',
            },
        ])
        expect(viewModel.flags).toEqual({
            lowConfidence: false,
            warningCount: 0,
        })
    })
})

describe('buildSummaryViewModel', () => {
    it('builds shared summary rows, accumulated totals, and ordered notes', () => {
        const { context, meta } = buildStageTwoContext()

        const viewModel = buildSummaryViewModel(context, meta)

        expect(viewModel.heading).toEqual({
            employeeName: 'Pat Example',
            dateRangeLabel: 'Apr 2024',
            generatedLabel: '01 Jun 2024',
        })
        expect(viewModel.metaRows.map((row) => row.id)).toEqual([
            'payroll',
            'pension',
            'worker-profile',
            'missing-payroll-months',
            'flagged-periods',
            'low-confidence-periods',
        ])
        expect(
            viewModel.metaRows.find(
                (row) => row.id === 'missing-payroll-months'
            )?.value
        ).toBe('2024/25: May')
        expect(viewModel.contractTypeMismatchWarning).toBe(
            'Worker type mismatch'
        )
        expect(viewModel.yearSummaryRows).toHaveLength(1)
        expect(viewModel.yearSummaryRows[0]).toMatchObject({
            yearKey: '2024/25',
            anchorId: 'year-summary-2024-25',
            hours: 100,
            payrollContribution: { total: 80, ee: 50, er: 30 },
            reportedContribution: { total: 100, ee: 60, er: 40 },
            overUnder: 20,
            hasFlags: true,
        })
        expect(viewModel.accumulatedTotals).toMatchObject({
            dateRangeLabel: 'Apr 2024',
            payrollContribution: { total: 80, ee: 50, er: 30 },
            reportedContribution: { total: 100, ee: 60, er: 40 },
            contributionDifference: 20,
        })
        expect(viewModel.miscReviewItems.map((item) => item.label)).toEqual([
            'Bonus',
            'Advance',
        ])
        expect(viewModel.notes.map((note) => note.id)).toEqual([
            'accumulated-totals',
            'april-boundary',
            'zero-tax-allowance',
        ])
        expect(
            viewModel.notes.find((note) => note.id === 'zero-tax-allowance')
                ?.text
        ).toContain('current configured UK rate')
    })

    it('shows rule snapshot metadata when audit metadata is available', () => {
        const { context, meta } = buildStageTwoContext()
        context.auditMetadata = {
            rulesVersion: '2026-03-30',
            thresholdsVersion: '2026-03-30',
        }

        const viewModel = buildSummaryViewModel(context, meta)
        const ruleSnapshotRow = viewModel.metaRows.find(
            (row) => row.id === 'rule-snapshot'
        )

        expect(ruleSnapshotRow).toBeTruthy()
        expect(ruleSnapshotRow?.label).toBe('Rule snapshot')
        expect(ruleSnapshotRow?.displayValue).toBe(
            'Rules 2026-03-30 · Thresholds 2026-03-30'
        )
    })
})

describe('buildYearViewModel', () => {
    it('builds monthly rows, flag notes, balances, and footer notes from shared year data', () => {
        const { context, entriesForYear } = buildStageTwoContext()

        const viewModel = buildYearViewModel(
            entriesForYear,
            '2024/25',
            context,
            10
        )

        expect(viewModel.heading).toEqual({
            yearKey: '2024/25',
            anchorId: 'year-summary-2024-25',
        })
        expect(viewModel.missingMonths).toEqual(['May'])
        expect(viewModel.rows).toHaveLength(12)
        expect(viewModel.rows[0]).toMatchObject({
            kind: 'entry',
            monthLabel: 'April',
            monthAnchorId: 'year-monthly-2024-25-01',
            globalEntryIndex: 0,
            hours: 100,
            flagRefs: ['1'],
            payrollContribution: { total: 80, ee: 50, er: 30 },
            reportedContribution: { total: 100, ee: 60, er: 40 },
            overUnder: 20,
        })
        expect(viewModel.rows[1]).toMatchObject({
            kind: 'empty',
            monthLabel: 'May',
            globalEntryIndex: null,
        })
        expect(viewModel.footerRows.map((row) => row.id)).toEqual([
            'opening-balance',
            'total',
            'closing-balance',
        ])
        expect(viewModel.footerRows[0].overUnder).toBe(10)
        expect(viewModel.footerRows[1]).toMatchObject({
            id: 'total',
            hours: 100,
            holidayHours: 8,
            overUnder: 20,
        })
        expect(viewModel.footerRows[2].overUnder).toBe(30)
        expect(viewModel.miscReviewItems.map((item) => item.label)).toEqual([
            'Bonus',
            'Advance',
        ])
        expect(viewModel.flagNotes).toEqual([
            { id: 'warn-1', index: 1, label: 'Needs review' },
        ])
        expect(viewModel.notes.map((note) => note.id)).toEqual([
            'april-boundary',
            'zero-tax-allowance',
        ])
    })

    it('propagates annual cross-check data and display text for zero-hours yearly summaries', () => {
        const { context, meta, entriesForYear } =
            buildZeroHoursStageTwoContext()

        const summaryViewModel = buildSummaryViewModel(context, meta)
        const summaryYearRow = summaryViewModel.yearSummaryRows[0]
        expect(summaryYearRow.annualCrossCheck).toBeTruthy()
        expect(summaryYearRow.monthBreakdown).toHaveLength(1)
        expect(summaryYearRow.annualCrossCheckDisplay).toMatchObject({
            title: 'Annual holiday pay cross-check',
        })

        const yearViewModel = buildYearViewModel(
            entriesForYear,
            '2024/25',
            context,
            0
        )

        expect(yearViewModel.annualCrossCheck).toBeTruthy()
        expect(yearViewModel.monthBreakdown).toHaveLength(1)
        expect(yearViewModel.monthBreakdown[0]).toMatchObject({
            monthLabel: 'April',
            basicHours: 100,
            holidayHours: 8,
            mixedMonthIncluded: true,
        })
        expect(yearViewModel.annualCrossCheckDisplay).toMatchObject({
            title: 'Annual holiday pay cross-check',
            statusLabel: 'Material mismatch',
        })
        expect(yearViewModel.annualCrossCheckDisplay.summaryLines[0]).toContain(
            'Recorded 8.00 holiday hrs'
        )
    })
})
