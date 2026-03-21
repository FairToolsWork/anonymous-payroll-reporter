import { describe, expect, it } from 'vitest'
import { buildPayslipViewModel } from '../pwa/src/report/report_view_model.js'

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
        expect(viewModel.footerNotes).toEqual([
            {
                id: 'employer-contribution',
                marker: '†',
                text: 'Employer contribution — paid by the employer on top of your salary, not deducted from your net pay.',
            },
            {
                id: 'april-boundary',
                marker: null,
                text: 'April payslips may include pay accrued across the 6 April tax year boundary. This tool cannot determine how the employer has attributed hours or amounts between tax years, which may cause discrepancies in year-end figures.',
            },
        ])
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
                text: 'Employer contribution — paid by the employer on top of your salary, not deducted from your net pay.',
            },
        ])
        expect(viewModel.flags).toEqual({
            lowConfidence: false,
            warningCount: 0,
        })
    })
})
