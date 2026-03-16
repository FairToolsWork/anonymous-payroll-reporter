import { describe, expect, it } from 'vitest'
import {
    buildHolidayPayFlags,
    buildYearHolidayContext,
} from '../pwa/src/report/holiday_calculations.js'

/**
 * Builds a minimal ReportEntry with hourly basic + holiday data.
 * @param {{ basicUnits: number, basicRate: number, basicAmount?: number, holidayUnits?: number, holidayRate?: number, holidayAmount?: number, yearKey?: string }} opts
 */
function makeEntry({
    basicUnits,
    basicRate,
    basicAmount,
    holidayUnits = 0,
    holidayRate = null,
    holidayAmount = 0,
    yearKey = '2024/25',
    monthIndex = 1,
}) {
    return {
        yearKey,
        monthIndex,
        parsedDate: new Date(2024, 6, 15),
        validation: { flags: [], lowConfidence: false },
        record: {
            employee: { natInsNumber: 'AB123456C' },
            payrollDoc: {
                taxCode: { code: '1257L' },
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 50 },
                    pensionEE: { amount: 30 },
                    pensionER: { amount: 20 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: {
                            units: basicUnits,
                            rate: basicRate,
                            amount:
                                basicAmount ??
                                Math.round(basicUnits * basicRate * 100) / 100,
                        },
                        holiday: {
                            units: holidayUnits,
                            rate: holidayRate,
                            amount: holidayAmount,
                        },
                    },
                    salary: {
                        basic: { amount: null },
                        holiday: { units: 0, rate: null, amount: 0 },
                    },
                    misc: [],
                },
                thisPeriod: { totalGrossPay: { amount: 1000 } },
                netPay: { amount: 800 },
            },
        },
    }
}

describe('buildHolidayPayFlags — Signal A (same-payslip rate)', () => {
    it('adds no flag when holiday rate matches basic rate', () => {
        const entry = makeEntry({
            basicUnits: 100,
            basicRate: 14.5,
            holidayUnits: 8,
            holidayRate: 14.5,
            holidayAmount: 116.0,
        })
        buildHolidayPayFlags([entry])
        expect(entry.validation.flags).toHaveLength(0)
    })

    it('adds no flag when rates differ by less than the tolerance (0.04 delta)', () => {
        const entry = makeEntry({
            basicUnits: 100,
            basicRate: 14.5,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 14.46,
        })
        buildHolidayPayFlags([entry])
        expect(entry.validation.flags).toHaveLength(0)
    })

    it('flags holiday_rate_below_basic when holiday rate is materially lower', () => {
        const entry = makeEntry({
            basicUnits: 100,
            basicRate: 14.5,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 10.0,
        })
        buildHolidayPayFlags([entry])
        const flag = entry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_basic'
        )
        expect(flag).toBeDefined()
        expect(flag.label).toMatch(/£10\.00\/hr implied/)
        expect(flag.label).toMatch(/£14\.50\/hr/)
    })

    it('derives basic rate from amount/units when rate is null', () => {
        const entry = makeEntry({
            basicUnits: 100,
            basicRate: null,
            basicAmount: 1450,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 64,
        })
        buildHolidayPayFlags([entry])
        const flag = entry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_basic'
        )
        expect(flag).toBeDefined()
    })

    it('produces no flag when there are no holiday units', () => {
        const entry = makeEntry({ basicUnits: 100, basicRate: 14.5 })
        buildHolidayPayFlags([entry])
        expect(entry.validation.flags).toHaveLength(0)
    })

    it('does not flag when basic rate cannot be derived (no units)', () => {
        const entry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 80,
        })
        buildHolidayPayFlags([entry])
        const flagA = entry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_basic'
        )
        expect(flagA).toBeUndefined()
    })
})

describe('buildHolidayPayFlags — Signal B (year-average rate)', () => {
    it('flags holiday_rate_below_year_avg when holiday rate is below year average', () => {
        const entries = []
        for (let i = 0; i < 6; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                })
            )
        }
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 10.0,
            yearKey: '2024/25',
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeDefined()
        expect(flag.label).toMatch(/year average basic rate/)
    })

    it('does not fire Signal B when fewer than 3 months of basic hours', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 2,
            }),
        ]
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 10.0,
            yearKey: '2024/25',
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('does not fire Signal B when holiday rate matches year average', () => {
        const entries = []
        for (let i = 0; i < 6; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                })
            )
        }
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 14.5,
            yearKey: '2024/25',
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('does not fire Signal B when holiday rate matches the same-payslip basic rate (pay-rise artefact)', () => {
        const entries = []
        for (let i = 0; i < 6; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                })
            )
        }
        const earlyPayslip = makeEntry({
            basicUnits: 150,
            basicRate: 12.0,
            basicAmount: 1800,
            holidayUnits: 31.5,
            holidayRate: 12.0,
            holidayAmount: 31.5 * 12.0,
            yearKey: '2024/25',
        })
        entries.push(earlyPayslip)

        buildHolidayPayFlags(entries)

        const flag = earlyPayslip.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('does not cross-contaminate Signal B across different tax years', () => {
        const entriesPrevYear = []
        for (let i = 0; i < 6; i++) {
            entriesPrevYear.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2023/24',
                    monthIndex: i + 1,
                })
            )
        }
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 10.0,
            yearKey: '2024/25',
        })

        buildHolidayPayFlags([...entriesPrevYear, holidayEntry])

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('does not count multiple entries in the same month toward the 3-month threshold', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 2,
            }),
        ]
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 10.0,
            yearKey: '2024/25',
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_year_avg'
        )
        expect(flag).toBeUndefined()
    })
})

describe('buildYearHolidayContext — hours-per-day context', () => {
    it('sets hasBaseline: false when fewer than 3 months', () => {
        const entries = [
            makeEntry({ basicUnits: 160, basicRate: 14.5, monthIndex: 1 }),
            makeEntry({ basicUnits: 160, basicRate: 14.5, monthIndex: 2 }),
        ]
        buildYearHolidayContext(entries, { typicalDays: 5 })
        expect(entries[0].holidayContext.hasBaseline).toBe(false)
        expect(entries[1].holidayContext.hasBaseline).toBe(false)
    })

    it('computes avgWeeklyHours and avgHoursPerDay correctly with 3+ months', () => {
        const entries = []
        for (let i = 0; i < 3; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                })
            )
        }
        buildYearHolidayContext(entries, { typicalDays: 5 })

        const ctx = entries[0].holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.typicalDays).toBe(5)
        const expectedWeekly = (160 * 3) / 52
        expect(ctx.avgWeeklyHours).toBeCloseTo(expectedWeekly, 4)
        expect(ctx.avgHoursPerDay).toBeCloseTo(expectedWeekly / 5, 4)
    })

    it('uses typicalDays from workerProfile to divide per-day hours', () => {
        const entries = []
        for (let i = 0; i < 4; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 156,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                })
            )
        }
        buildYearHolidayContext(entries, { typicalDays: 4 })
        const ctx = entries[0].holidayContext
        expect(ctx.typicalDays).toBe(4)
        const avgWeekly = (156 * 4) / 52
        expect(ctx.avgHoursPerDay).toBeCloseTo(avgWeekly / 4, 4)
    })

    it('defaults typicalDays to 5 when workerProfile is null', () => {
        const entries = []
        for (let i = 0; i < 3; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                })
            )
        }
        buildYearHolidayContext(entries, null)
        const ctx = entries[0].holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.typicalDays).toBe(5)
    })

    it('computes avgRatePerHour as weighted average of basic amounts / units', () => {
        const entries = [
            makeEntry({ basicUnits: 100, basicRate: 10.0, monthIndex: 1 }),
            makeEntry({ basicUnits: 200, basicRate: 15.0, monthIndex: 2 }),
            makeEntry({ basicUnits: 150, basicRate: 12.0, monthIndex: 3 }),
        ]
        buildYearHolidayContext(entries, { typicalDays: 5 })
        const ctx = entries[0].holidayContext
        const expectedAvgRate =
            (100 * 10.0 + 200 * 15.0 + 150 * 12.0) / (100 + 200 + 150)
        expect(ctx.avgRatePerHour).toBeCloseTo(expectedAvgRate, 4)
    })

    it('keeps contexts isolated across different yearKeys', () => {
        const entriesA = []
        for (let i = 0; i < 3; i++) {
            entriesA.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2023/24',
                    monthIndex: i + 1,
                })
            )
        }
        const entryB = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            yearKey: '2024/25',
        })
        buildYearHolidayContext([...entriesA, entryB], { typicalDays: 5 })
        expect(entriesA[0].holidayContext.hasBaseline).toBe(true)
        expect(entryB.holidayContext.hasBaseline).toBe(false)
    })
})
