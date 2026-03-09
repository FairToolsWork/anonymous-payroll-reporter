import { describe, expect, it } from 'vitest'
import { formatMonthLabel } from '../pwa/src/parse/parser_config.js'
import {
    buildContributionSummary,
    buildMissingMonthsWithRange,
    buildValidation,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
    sumDeductionsForNetPay,
    sumMiscAmounts,
    sumPayments,
} from '../pwa/src/report/report_calculations.js'

function buildRecord({
    nestEE,
    nestER,
    natInsNumber,
    taxCode,
    grossPay,
    netPay,
}) {
    return {
        employee: { natInsNumber: natInsNumber || null },
        payrollDoc: {
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                pensionEE: { amount: nestEE },
                pensionER: { amount: nestER },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { amount: grossPay },
                    holiday: { amount: 0 },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { amount: 0 },
                },
                misc: [],
            },
            taxCode: { code: taxCode || '' },
            thisPeriod: { totalGrossPay: { amount: grossPay } },
            netPay: { amount: netPay },
        },
    }
}

describe('report calculations', () => {
    it('builds contribution summary totals', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 100,
                    netPay: 100,
                }),
                parsedDate: new Date(2025, 0, 15),
                yearKey: '2024/25',
                monthIndex: 10,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 100,
                    netPay: 100,
                }),
                parsedDate: new Date(2025, 1, 15),
                yearKey: '2024/25',
                monthIndex: 11,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 0, 20), type: 'ee', amount: 55 },
                { date: new Date(2025, 0, 20), type: 'er', amount: 25 },
                { date: new Date(2025, 1, 20), type: 'ee', amount: 65 },
                { date: new Date(2025, 1, 20), type: 'er', amount: 35 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2024/25',
        ])
        const totals = summary?.years.get('2024/25')?.totals
        expect(totals).toEqual({
            expectedEE: 110,
            expectedER: 70,
            actualEE: 120,
            actualER: 60,
            delta: 0,
        })
    })

    it('flags validation issues', () => {
        const entry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 90,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((flag) => flag.id)
        expect(flagIds).toContain('missing_nat_ins')
        expect(flagIds).toContain('missing_tax_code')
        expect(flagIds).toContain('paye_zero')
        expect(flagIds).toContain('nat_ins_zero')
        expect(flagIds).toContain('net_mismatch')
    })

    it('respects validation tolerance', () => {
        const withinToleranceEntry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 99.96,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const outsideToleranceEntry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 99.9,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const withinValidation = buildValidation(withinToleranceEntry)
        const outsideValidation = buildValidation(outsideToleranceEntry)
        const withinIds = withinValidation.flags.map((flag) => flag.id)
        const outsideIds = outsideValidation.flags.map((flag) => flag.id)
        expect(withinIds).not.toContain('net_mismatch')
        expect(outsideIds).toContain('net_mismatch')
    })

    it('builds missing months', () => {
        const missing = buildMissingMonthsWithRange([1, 3], 1, 3)
        expect(missing).toEqual([formatMonthLabel(5)])
    })

    it('returns empty array from buildMissingMonthsWithRange when maxMonth is 0 (first month of tax year not yet started)', () => {
        expect(buildMissingMonthsWithRange([], 1, 0)).toEqual([])
        expect(buildMissingMonthsWithRange([1], 1, 0)).toEqual([])
    })

    it('formats tax year labels correctly across century boundary', () => {
        expect(getTaxYearKey(new Date(2024, 3, 6))).toBe('2024/25')
        expect(getTaxYearKey(new Date(2024, 2, 5))).toBe('2023/24')
        expect(getTaxYearKey(new Date(2099, 3, 6))).toBe('2099/2100')
        expect(getTaxYearKey(null)).toBe('Unknown')
    })

    it('getFiscalMonthIndex respects the April 6 tax year boundary', () => {
        expect(getFiscalMonthIndex(new Date(2026, 3, 5))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 3, 1))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 3, 6))).toBe(1)
        expect(getFiscalMonthIndex(new Date(2026, 3, 7))).toBe(1)
        expect(getFiscalMonthIndex(new Date(2026, 2, 31))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 4, 1))).toBe(2)
        expect(getFiscalMonthIndex(null)).toBeNull()
    })

    it('getTaxYearKey and getFiscalMonthIndex are consistent on Apr 1-5 boundary', () => {
        const apr3 = new Date(2026, 3, 3)
        expect(getTaxYearKey(apr3)).toBe('2025/26')
        expect(getFiscalMonthIndex(apr3)).toBe(12)

        const apr6 = new Date(2026, 3, 6)
        expect(getTaxYearKey(apr6)).toBe('2026/27')
        expect(getFiscalMonthIndex(apr6)).toBe(1)

        const mar31 = new Date(2026, 2, 31)
        expect(getTaxYearKey(mar31)).toBe('2025/26')
        expect(getFiscalMonthIndex(mar31)).toBe(12)
    })

    it('getTaxYearSortKey returns null sentinel for malformed or non-YYYY/ prefixed keys', () => {
        expect(getTaxYearSortKey('2024/25')).toBe(2024)
        expect(getTaxYearSortKey('Unknown')).toBe(9999)
        expect(getTaxYearSortKey('1234abcd5678')).toBe(9999)
        expect(getTaxYearSortKey('')).toBe(9999)
        expect(getTaxYearSortKey(null)).toBe(9999)
    })

    it('formats dates and keys', () => {
        const parsedNumeric = parsePayPeriodStart('01/02/25 - 28/02/25')
        const parsedLong = parsePayPeriodStart('15 March 2024 - 31 March 2024')
        const localDateString = (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        expect(localDateString(parsedNumeric)).toBe('2025-02-01')
        expect(localDateString(parsedLong)).toBe('2024-03-15')
        expect(parsePayPeriodStart(null)).toBeNull()

        const sampleDate = new Date(2025, 0, 5)
        expect(formatDateLabel(sampleDate)).toBe('05 Jan 2025')
        expect(formatDateLabel(null)).toBe('Unknown')
        expect(formatMonthYearLabel(sampleDate)).toBe('Jan 2025')
        expect(formatMonthYearLabel(null)).toBe('Unknown')
        expect(formatDateKey(sampleDate)).toBe('20250105')
        expect(formatDateKey(null)).toBe('unknown')
    })

    it('sums misc amounts', () => {
        expect(sumMiscAmounts([])).toBe(0)
        expect(sumMiscAmounts(null)).toBe(0)
        expect(
            sumMiscAmounts([{ amount: 10 }, { amount: null }, { amount: 5 }])
        ).toBe(15)
    })

    it('detects under-contribution when employer pays less than payslip deducted', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 20 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 30 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(-10)
        expect(aprilMonth?.balance).toBe(-10)
        expect(mayMonth?.delta).toBe(-10)
        expect(mayMonth?.balance).toBe(-20)
        expect(year?.yearEndBalance).toBe(-20)
        expect(year?.totals.delta).toBe(-20)
        expect(summary?.balance).toBe(-20)
    })

    it('detects over-contribution when employer pays more than payslip deducted', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 45 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 55 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(15)
        expect(aprilMonth?.balance).toBe(15)
        expect(mayMonth?.delta).toBe(15)
        expect(mayMonth?.balance).toBe(30)
        expect(year?.yearEndBalance).toBe(30)
        expect(year?.totals.delta).toBe(30)
        expect(summary?.balance).toBe(30)
    })

    it('accumulates per-month balance correctly when contributions vary month to month', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
            {
                record: buildRecord({
                    nestEE: 55,
                    nestER: 35,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 5, 20),
                yearKey: '2025/26',
                monthIndex: 3,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 20 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 50 },
                { date: new Date(2025, 5, 20), type: 'ee', amount: 55 },
                { date: new Date(2025, 5, 20), type: 'er', amount: 35 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')

        expect(year?.months.get(1)?.delta).toBe(-10)
        expect(year?.months.get(1)?.balance).toBe(-10)
        expect(year?.months.get(2)?.delta).toBe(10)
        expect(year?.months.get(2)?.balance).toBe(0)
        expect(year?.months.get(3)?.delta).toBe(0)
        expect(year?.months.get(3)?.balance).toBe(0)
        expect(year?.yearEndBalance).toBe(0)
        expect(year?.totals.delta).toBe(0)
    })

    it('keeps year end balance per year', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 10,
                    nestER: 5,
                    grossPay: 100,
                    netPay: 90,
                }),
                parsedDate: new Date(2024, 0, 15),
                yearKey: '2023/24',
                monthIndex: 10,
            },
            {
                record: buildRecord({
                    nestEE: 20,
                    nestER: 10,
                    grossPay: 100,
                    netPay: 90,
                }),
                parsedDate: new Date(2025, 0, 15),
                yearKey: '2024/25',
                monthIndex: 10,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2024, 0, 20), type: 'ee', amount: 8 },
                { date: new Date(2024, 0, 20), type: 'er', amount: 7 },
                { date: new Date(2025, 0, 20), type: 'ee', amount: 35 },
                { date: new Date(2025, 0, 20), type: 'er', amount: 0 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2023/24',
            '2024/25',
        ])
        const year2024 = summary?.years.get('2023/24')
        const year2025 = summary?.years.get('2024/25')
        expect({
            year2024End: year2024?.yearEndBalance,
            year2025End: year2025?.yearEndBalance,
            overall: summary?.balance,
        }).toEqual({
            year2024End: 0,
            year2025End: 5,
            overall: 5,
        })
    })

    it('flags gross_mismatch and sets lowConfidence when payments total differs from totalGrossPay', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 50 },
                        pensionER: { amount: 30 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { amount: 1000 },
                            holiday: { amount: 0 },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: 0 },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1100 } },
                    netPay: { amount: 770 },
                },
            },
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((flag) => flag.id)
        expect(flagIds).toContain('gross_mismatch')
        expect(validation.lowConfidence).toBe(true)
    })

    it('sums all payment types correctly', () => {
        const hourlyRecord = {
            payrollDoc: {
                payments: {
                    hourly: {
                        basic: { amount: 800 },
                        holiday: { amount: 120 },
                    },
                    salary: { basic: { amount: 0 }, holiday: { amount: 0 } },
                    misc: [{ amount: 50 }, { amount: null }],
                },
            },
        }
        expect(sumPayments(hourlyRecord)).toBe(970)

        const salaryRecord = {
            payrollDoc: {
                payments: {
                    hourly: { basic: { amount: 0 }, holiday: { amount: 0 } },
                    salary: {
                        basic: { amount: 2000 },
                        holiday: { amount: 200 },
                    },
                    misc: [],
                },
            },
        }
        expect(sumPayments(salaryRecord)).toBe(2200)

        expect(sumPayments(null)).toBe(0)
        expect(sumPayments({})).toBe(0)
    })

    it('sums deductions for net pay, excluding pensionER', () => {
        const record = {
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 300 },
                    natIns: { amount: 150 },
                    pensionEE: { amount: 75 },
                    pensionER: { amount: 100 },
                    misc: [{ amount: 25 }],
                },
            },
        }
        expect(sumDeductionsForNetPay(record)).toBe(550)
        expect(sumDeductionsForNetPay(null)).toBe(0)
        expect(sumDeductionsForNetPay({})).toBe(0)
    })

    it('shows surplus delta when NEST contributions exist for months with no payslip', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 30 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 40 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(0)
        expect(aprilMonth?.balance).toBe(0)
        expect(mayMonth?.expectedEE).toBe(0)
        expect(mayMonth?.expectedER).toBe(0)
        expect(mayMonth?.actualEE).toBe(60)
        expect(mayMonth?.actualER).toBe(40)
        expect(mayMonth?.delta).toBe(100)
        expect(year?.yearEndBalance).toBe(100)
        expect(summary?.balance).toBe(100)
    })

    it('returns null when no contribution data is provided', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
        ]
        expect(buildContributionSummary(entries, null, ['2025/26'])).toBeNull()
        expect(
            buildContributionSummary(
                entries,
                { entries: [], sourceFiles: [] },
                ['2025/26']
            )
        ).toBeNull()
        expect(
            buildContributionSummary(entries, undefined, ['2025/26'])
        ).toBeNull()
    })

    it('flags payment_line_mismatch when units * rate does not match amount', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 75.9,
                                rate: 8.6,
                                amount: 759,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 759 } },
                    netPay: { amount: 579 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when units * rate matches amount', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 75.9,
                                rate: 10,
                                amount: 759,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 759 } },
                    netPay: { amount: 579 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when rate is null (multi-rate accumulated line)', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 61.47 },
                        natIns: { amount: 43.65 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 151.8,
                                rate: null,
                                amount: 1411.74,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1411.74 } },
                    netPay: { amount: 1262.03 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when difference is within tolerance', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 10,
                                rate: 10,
                                amount: 100.03,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 100.03 } },
                    netPay: { amount: -79.97 },
                },
            },
            parsedDate: new Date(2025, 0, 20),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('parses month-year date format and two-digit years', () => {
        const parsedMonthYear = parsePayPeriodStart('April 2024')
        expect(parsedMonthYear?.getFullYear()).toBe(2024)
        expect(parsedMonthYear?.getMonth()).toBe(3)
        expect(parsedMonthYear?.getDate()).toBe(1)

        const parsedShortYear = parsePayPeriodStart('01/06/99 - 30/06/99')
        expect(parsedShortYear?.getFullYear()).toBe(2099)
        expect(parsedShortYear?.getMonth()).toBe(5)
        expect(parsedShortYear?.getDate()).toBe(1)
    })
})
