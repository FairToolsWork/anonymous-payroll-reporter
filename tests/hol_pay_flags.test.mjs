import { describe, expect, it } from 'vitest'
import {
    buildHolidayPayFlags,
    buildRollingReference,
    buildYearHolidayContext,
    isReferenceEligible,
} from '../pwa/src/report/holiday_calculations.js'

/**
 * Builds a minimal ReportEntry with hourly basic + holiday data.
 * @param {{ basicUnits: number, basicRate: number, basicAmount?: number, holidayUnits?: number, holidayRate?: number, holidayAmount?: number, yearKey?: string, monthIndex?: number, parsedDate?: Date, miscPayments?: Array<{title: string}> }} opts
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
    parsedDate = new Date(2024, 6, 15),
    miscPayments = [],
}) {
    return {
        yearKey,
        monthIndex,
        parsedDate,
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
                    misc: miscPayments,
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

describe('buildHolidayPayFlags — Signal B (rolling average rate)', () => {
    it('flags holiday_rate_below_rolling_avg when holiday rate is below rolling average', () => {
        const entries = []
        for (let i = 0; i < 6; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
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
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeDefined()
        expect(flag.label).toMatch(/average basic rate/)
    })

    it('does not fire Signal B when fewer than 3 eligible periods', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 2,
                parsedDate: new Date(2024, 1, 15),
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
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('does not fire Signal B when holiday rate matches rolling average', () => {
        const entries = []
        for (let i = 0; i < 6; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
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
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
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
                    parsedDate: new Date(2024, i + 1, 15),
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
            parsedDate: new Date(2024, 7, 15),
        })
        entries.push(earlyPayslip)

        buildHolidayPayFlags(entries)

        const flag = earlyPayslip.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('crosses tax year boundaries — prior-year rolling window data triggers flag', () => {
        const entriesPrevYear = []
        for (let i = 0; i < 6; i++) {
            entriesPrevYear.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2023/24',
                    monthIndex: i + 1,
                    parsedDate: new Date(2023, 9 + i, 15),
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
            parsedDate: new Date(2024, 5, 15),
        })

        buildHolidayPayFlags([...entriesPrevYear, holidayEntry])

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeDefined()
        expect(flag.label).toMatch(/average basic rate/)
    })

    it('does not count multiple entries in the same month toward the 3-month threshold', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 20),
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2024/25',
                monthIndex: 2,
                parsedDate: new Date(2024, 1, 15),
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
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeUndefined()
    })

    it('sets limitedData: true and still flags when fewer than 52 weeks available', () => {
        const entries = []
        for (let i = 0; i < 4; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2024/25',
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
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
            parsedDate: new Date(2024, 4, 15),
        })
        entries.push(holidayEntry)

        buildHolidayPayFlags(entries)

        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeDefined()
        expect(flag.label).toMatch(/weeks available/)
    })
})

describe('buildYearHolidayContext — hours-per-day context', () => {
    it('sets hasBaseline: false when fewer than 3 months', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                monthIndex: 2,
                parsedDate: new Date(2024, 1, 15),
            }),
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
                    parsedDate: new Date(2024, i, 15),
                })
            )
        }
        const targetEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            monthIndex: 4,
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 5 })

        const ctx = targetEntry.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.typicalDays).toBe(5)
        // Rolling window: 3 months of Jan/Feb/Mar (31+29+31=91 days = 13.0 weeks)
        const totalWeeks = (31 + 29 + 31) / 7
        const expectedWeekly = (160 * 3) / totalWeeks
        expect(ctx.avgWeeklyHours).toBeCloseTo(expectedWeekly, 2)
        expect(ctx.avgHoursPerDay).toBeCloseTo(expectedWeekly / 5, 2)
    })

    it('uses typicalDays from workerProfile to divide per-day hours', () => {
        const entries = []
        for (let i = 0; i < 4; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 156,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
                })
            )
        }
        const targetEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            monthIndex: 5,
            parsedDate: new Date(2024, 4, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 4 })
        const ctx = targetEntry.holidayContext
        expect(ctx.typicalDays).toBe(4)
        // Jan(31)+Feb(29)+Mar(31)+Apr(30) = 121 days
        const totalWeeks = (31 + 29 + 31 + 30) / 7
        const avgWeekly = (156 * 4) / totalWeeks
        expect(ctx.avgHoursPerDay).toBeCloseTo(avgWeekly / 4, 2)
    })

    it('defaults typicalDays to 0 when workerProfile is null', () => {
        const entries = []
        for (let i = 0; i < 3; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
                })
            )
        }
        const targetEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            monthIndex: 4,
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, null)
        const ctx = targetEntry.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.typicalDays).toBe(0)
    })

    it('computes avgRatePerHour as weighted average of basic amounts / units', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 10.0,
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                monthIndex: 2,
                parsedDate: new Date(2024, 1, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                monthIndex: 3,
                parsedDate: new Date(2024, 2, 15),
            }),
        ]
        const targetEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            monthIndex: 4,
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 5 })
        const ctx = targetEntry.holidayContext
        const expectedAvgRate =
            (100 * 10.0 + 200 * 15.0 + 150 * 12.0) / (100 + 200 + 150)
        expect(ctx.avgRatePerHour).toBeCloseTo(expectedAvgRate, 4)
    })

    it('includes prior-year months in rolling context', () => {
        const entriesA = []
        for (let i = 0; i < 3; i++) {
            entriesA.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    yearKey: '2023/24',
                    monthIndex: i + 1,
                    parsedDate: new Date(2023, 9 + i, 15),
                })
            )
        }
        const entryB = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 2, 15),
        })
        buildYearHolidayContext([...entriesA, entryB], { typicalDays: 5 })
        expect(entriesA[0].holidayContext.hasBaseline).toBe(false)
        expect(entryB.holidayContext.hasBaseline).toBe(true)
    })

    it('includes typicalDays in holidayContext even when hasBaseline is false', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 10.0,
                basicAmount: 1600,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 10.0,
                basicAmount: 1500,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 1, 15),
            }),
        ]
        buildYearHolidayContext(entries, { typicalDays: 3 })
        expect(entries[0].holidayContext.hasBaseline).toBe(false)
        expect(entries[0].holidayContext.typicalDays).toBe(3)
        expect(entries[1].holidayContext.hasBaseline).toBe(false)
        expect(entries[1].holidayContext.typicalDays).toBe(3)
    })

    it('handles typicalDays = 0 (zero-hours workers) without division errors', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                monthIndex: 1,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                monthIndex: 2,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 1, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                monthIndex: 3,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 2, 15),
            }),
        ]
        const targetEntry = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 4,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 0 })

        const ctx = targetEntry.holidayContext
        expect(ctx.typicalDays).toBe(0)
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.avgHoursPerDay).toBe(0)
        expect(isNaN(ctx.avgHoursPerDay)).toBe(false)
        expect(ctx.avgWeeklyHours).toBeGreaterThan(0)
        expect(ctx.avgRatePerHour).toBeGreaterThan(0)
    })

    it('handles typicalDays = 0.5 (minimum salaried workers)', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 1, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 2, 15),
            }),
        ]
        const targetEntry = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 0.5 })

        const ctx = targetEntry.holidayContext
        expect(ctx.typicalDays).toBe(0.5)
        if (ctx.hasBaseline) {
            const totalWeeks = (31 + 29 + 31) / 7
            const avgWeeklyHours = (100 + 200 + 150) / totalWeeks
            expect(ctx.avgHoursPerDay).toBeCloseTo(avgWeeklyHours / 0.5, 2)
        }
    })

    it('handles typicalDays = 7 (maximum salaried workers)', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 1, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 2, 15),
            }),
        ]
        const targetEntry = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(targetEntry)
        buildYearHolidayContext(entries, { typicalDays: 7 })

        const ctx = targetEntry.holidayContext
        expect(ctx.typicalDays).toBe(7)
        if (ctx.hasBaseline) {
            const totalWeeks = (31 + 29 + 31) / 7
            const avgWeeklyHours = (100 + 200 + 150) / totalWeeks
            expect(ctx.avgHoursPerDay).toBeCloseTo(avgWeeklyHours / 7, 2)
        }
    })
})

describe('buildYearHolidayContext — pre/post April 2024 entitlement method', () => {
    function makeRefEntries(startYear) {
        return [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                monthIndex: 1,
                yearKey: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
                parsedDate: new Date(startYear, 0, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                monthIndex: 2,
                yearKey: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
                parsedDate: new Date(startYear, 1, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                monthIndex: 3,
                yearKey: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`,
                parsedDate: new Date(startYear, 2, 15),
            }),
        ]
    }

    it('uses 5.6-weeks method for leave year starting before April 2024', () => {
        const entries = makeRefEntries(2023)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 4,
            yearKey: '2023/24',
            parsedDate: new Date(2023, 6, 15),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 4,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(false)
        const totalWeeks = (31 + 28 + 31) / 7
        const avgWeeklyHours = (100 + 200 + 150) / totalWeeks
        expect(ctx.entitlementHours).toBeCloseTo(avgWeeklyHours * 5.6, 1)
    })

    it('uses 12.07% accrual method for leave year starting on/after April 2024', () => {
        const entries = makeRefEntries(2024)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 4,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 4,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(true)
        const totalWeeks = (31 + 29 + 31) / 7
        const avgWeeklyHours = (100 + 200 + 150) / totalWeeks
        expect(ctx.entitlementHours).toBeCloseTo(
            avgWeeklyHours * 52 * 0.1207,
            1
        )
    })

    it('crossover run: pre-2024 entry uses 5.6×, post-2024 entry uses 12.07%', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                monthIndex: 10,
                yearKey: '2023/24',
                parsedDate: new Date(2023, 9, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                monthIndex: 11,
                yearKey: '2023/24',
                parsedDate: new Date(2023, 10, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                monthIndex: 12,
                yearKey: '2023/24',
                parsedDate: new Date(2023, 11, 15),
            }),
        ]

        const preCutoffEntry = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 1,
            yearKey: '2023/24',
            parsedDate: new Date(2024, 0, 15),
        })

        const postCutoffEntry = makeEntry({
            basicUnits: 170,
            basicRate: 14.0,
            basicAmount: 2380,
            monthIndex: 5,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 4, 15),
        })

        entries.push(preCutoffEntry, postCutoffEntry)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 4,
        })

        const preCutoffCtx = preCutoffEntry.holidayContext
        expect(preCutoffCtx.hasBaseline).toBe(true)
        expect(preCutoffCtx.useAccrualMethod).toBe(false)
        expect(preCutoffCtx.entitlementHours).toBeDefined()

        const postCutoffCtx = postCutoffEntry.holidayContext
        expect(postCutoffCtx.hasBaseline).toBe(true)
        expect(postCutoffCtx.useAccrualMethod).toBe(true)
        expect(postCutoffCtx.entitlementHours).toBeDefined()

        // Post-2024 entitlement should be higher than pre-2024 for similar hours
        expect(postCutoffCtx.entitlementHours).toBeGreaterThan(
            preCutoffCtx.entitlementHours
        )
    })

    it('January leave year starting Jan 2024 uses 5.6× (before April cutoff)', () => {
        const entries = makeRefEntries(2023)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 2,
            yearKey: '2023/24',
            parsedDate: new Date(2024, 1, 15),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 1,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(false)
    })

    it('January leave year starting Jan 2025 uses 12.07% (after April cutoff)', () => {
        const entries = [
            makeEntry({
                basicUnits: 100,
                basicRate: 15.0,
                basicAmount: 1500,
                monthIndex: 10,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 9, 15),
            }),
            makeEntry({
                basicUnits: 200,
                basicRate: 15.0,
                basicAmount: 3000,
                monthIndex: 11,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 10, 15),
            }),
            makeEntry({
                basicUnits: 150,
                basicRate: 12.0,
                basicAmount: 1800,
                monthIndex: 12,
                yearKey: '2024/25',
                parsedDate: new Date(2024, 11, 15),
            }),
        ]
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 2,
            yearKey: '2025/26',
            parsedDate: new Date(2025, 1, 15),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 1,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(true)
    })

    it('entry exactly on leave year start date (1 Apr 2024) uses 12.07%', () => {
        const entries = makeRefEntries(2024)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 4,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 3, 1),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 4,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(true)
    })

    it('entry day before leave year start (31 Mar 2024) uses 5.6×', () => {
        const entries = makeRefEntries(2023)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 12,
            yearKey: '2023/24',
            parsedDate: new Date(2024, 2, 31),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 0,
            leaveYearStartMonth: 4,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBe(false)
    })

    it('does not set useAccrualMethod for workers with typicalDays > 0', () => {
        const entries = makeRefEntries(2024)
        const target = makeEntry({
            basicUnits: 160,
            basicRate: 14.0,
            basicAmount: 2240,
            monthIndex: 4,
            yearKey: '2024/25',
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(target)
        buildYearHolidayContext(entries, {
            typicalDays: 5,
            leaveYearStartMonth: 4,
        })

        const ctx = target.holidayContext
        expect(ctx.hasBaseline).toBe(true)
        expect(ctx.useAccrualMethod).toBeUndefined()
        expect(ctx.entitlementHours).toBeUndefined()
    })
})

describe('isReferenceEligible', () => {
    it('returns true for a normal basic-hours entry', () => {
        const entry = makeEntry({ basicUnits: 160, basicRate: 14.5 })
        expect(isReferenceEligible(entry)).toBe(true)
    })

    it('returns false when basic units are zero', () => {
        const entry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when the entry itself has holiday pay', () => {
        const entry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            holidayUnits: 8,
            holidayAmount: 116,
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when misc payments contain SSP title', () => {
        const entry = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            miscPayments: [{ title: 'Statutory Sick Pay' }],
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when misc payments contain maternity pay title', () => {
        const entry = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            miscPayments: [{ title: 'Statutory Maternity Pay' }],
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns true when misc payments contain unrelated items', () => {
        const entry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            miscPayments: [{ title: 'Bonus' }, { title: 'Overtime' }],
        })
        expect(isReferenceEligible(entry)).toBe(true)
    })
})

describe('buildRollingReference — null yearKey deduplication', () => {
    it('counts distinct calendar-year months correctly when yearKey is null on all entries', () => {
        const m1 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2023, 0, 15),
        })
        m1.yearKey = null
        const m2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 15),
        })
        m2.yearKey = null
        const m3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        m3.yearKey = null
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 6, 15),
        })
        target.yearKey = null
        const sorted = [m1, m2, m3, target].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
    })

    it('deduplicates same calendar-year month when yearKey is null', () => {
        const dup1 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 10),
        })
        dup1.yearKey = null
        const dup2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 20),
        })
        dup2.yearKey = null
        const m2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        m2.yearKey = null
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 6, 15),
        })
        target.yearKey = null
        const sorted = [dup1, dup2, m2, target].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).toBeNull()
    })
})

describe('buildRollingReference', () => {
    it('returns null when target has no parsedDate', () => {
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
        })
        target.parsedDate = null
        expect(buildRollingReference([target], target)).toBeNull()
    })

    it('returns null when fewer than 3 eligible periods', () => {
        const entries = [
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                monthIndex: 1,
                parsedDate: new Date(2024, 0, 15),
            }),
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                monthIndex: 2,
                parsedDate: new Date(2024, 1, 15),
            }),
        ]
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 6, 15),
        })
        entries.push(target)
        const sorted = [...entries].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        expect(buildRollingReference(sorted, target)).toBeNull()
    })

    it('excludes entries with parsedDate on or after target date', () => {
        const before = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 15),
        })
        const before2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        const before3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 3,
            parsedDate: new Date(2024, 2, 15),
        })
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 3, 15),
        })
        const after = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 4,
            parsedDate: new Date(2024, 4, 15),
        })
        const sorted = [before, before2, before3, target, after].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
    })

    it('deduplicates same month — only counts weeks once per yearKey:monthIndex', () => {
        const dup1 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 10),
        })
        const dup2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 20),
        })
        const m2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        const m3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 3,
            parsedDate: new Date(2024, 2, 15),
        })
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 6, 15),
        })
        const sorted = [dup1, dup2, m2, m3, target].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
    })

    it('sets limitedData: true when fewer than 52 weeks accumulated', () => {
        const entries = []
        for (let i = 0; i < 4; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    monthIndex: i + 1,
                    parsedDate: new Date(2024, i, 15),
                })
            )
        }
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 4, 15),
        })
        entries.push(target)
        const sorted = [...entries].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.limitedData).toBe(true)
        expect(ref.periodsCounted).toBe(4)
    })

    it('sets limitedData: false when 52+ weeks accumulated', () => {
        const entries = []
        for (let i = 0; i < 13; i++) {
            entries.push(
                makeEntry({
                    basicUnits: 160,
                    basicRate: 14.5,
                    monthIndex: (i % 12) + 1,
                    parsedDate: new Date(2023, i, 15),
                })
            )
        }
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: new Date(2024, 3, 15),
        })
        entries.push(target)
        const sorted = [...entries].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.limitedData).toBe(false)
    })

    it('excludes an entry that is exactly 104 weeks before the target', () => {
        const targetDate = new Date(2024, 6, 15)
        const cutoffDate = new Date(
            targetDate.getTime() - 104 * 7 * 24 * 60 * 60 * 1000
        )
        const justOutside = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(cutoffDate.getTime() - 1),
        })
        const justInside = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(cutoffDate.getTime() + 1),
        })
        const m3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 3,
            parsedDate: new Date(2024, 0, 15),
        })
        const m4 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 4,
            parsedDate: new Date(2024, 1, 15),
        })
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: targetDate,
        })
        const all = [justOutside, justInside, m3, m4, target].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(all, target)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
    })

    it('holiday month with basic hours is excluded from its own reference pool', () => {
        const m1 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 15),
        })
        const m2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        const m3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 3,
            parsedDate: new Date(2024, 2, 15),
        })
        const holidayMonth = makeEntry({
            basicUnits: 120,
            basicRate: 14.5,
            holidayUnits: 8,
            holidayAmount: 8 * 14.5,
            monthIndex: 4,
            parsedDate: new Date(2024, 3, 15),
        })
        const all = [m1, m2, m3, holidayMonth].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(all, holidayMonth)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
        const monthKeys = [m1, m2, m3].map(
            (e) => `${e.yearKey}:${e.monthIndex}`
        )
        expect(ref.totalBasicHours).toBeCloseTo(160 * 3, 4)
        expect(monthKeys).not.toContain(
            `${holidayMonth.yearKey}:${holidayMonth.monthIndex}`
        )
    })

    it('includes a payslip on the first day of the 104-week window (calendar boundary)', () => {
        // The cutoff is computed via setDate(-728) from the target date, which gives midnight
        // on the boundary calendar day. A payslip on that exact calendar day must be included
        // (entryDate.getTime() >= cutoffMs). This guards against the previous implementation
        // that used raw millisecond subtraction (104 * 7 * 24 * 60 * 60 * 1000), which could
        // shift the cutoff by ±1 hour across DST transitions in the Europe/London timezone,
        // causing payslips on that boundary day to be incorrectly excluded.
        const targetDate = new Date(2024, 6, 15) // 2024-07-15
        const boundaryDate = new Date(2022, 6, 18) // 2022-07-18 — exactly 728 calendar days before

        const boundaryEntry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 4,
            parsedDate: boundaryDate,
        })
        const m2 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 15),
        })
        const m3 = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        const target = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            parsedDate: targetDate,
        })
        const sorted = [boundaryEntry, m2, m3, target].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        const ref = buildRollingReference(sorted, target)
        expect(ref).not.toBeNull()
        expect(ref.periodsCounted).toBe(3)
    })

    it('worker with stable hourly rate but variable weekly hours — no false positive', () => {
        const highUnits = makeEntry({
            basicUnits: 240,
            basicRate: 14.5,
            basicAmount: 240 * 14.5,
            monthIndex: 1,
            parsedDate: new Date(2024, 0, 15),
        })
        const lowUnits = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            basicAmount: 80 * 14.5,
            monthIndex: 2,
            parsedDate: new Date(2024, 1, 15),
        })
        const highUnits2 = makeEntry({
            basicUnits: 240,
            basicRate: 14.5,
            basicAmount: 240 * 14.5,
            monthIndex: 3,
            parsedDate: new Date(2024, 2, 15),
        })
        const holidayEntry = makeEntry({
            basicUnits: 0,
            basicRate: null,
            basicAmount: 0,
            holidayUnits: 8,
            holidayRate: null,
            holidayAmount: 8 * 14.5,
            monthIndex: 4,
            parsedDate: new Date(2024, 3, 15),
        })
        const all = [highUnits, lowUnits, highUnits2, holidayEntry].sort(
            (a, b) =>
                (a.parsedDate?.getTime() ?? 0) - (b.parsedDate?.getTime() ?? 0)
        )
        buildHolidayPayFlags(all)
        const flag = holidayEntry.validation.flags.find(
            (f) => f.id === 'holiday_rate_below_rolling_avg'
        )
        expect(flag).toBeUndefined()
    })
})

describe('isReferenceEligible — statutory pay titles', () => {
    it('returns false when basic.units is null (not zero)', () => {
        const entry = makeEntry({ basicUnits: 160, basicRate: 14.5 })
        entry.record.payrollDoc.payments.hourly.basic.units = null
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when misc payments contain paternity pay title', () => {
        const entry = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            miscPayments: [{ title: 'Statutory Paternity Pay' }],
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when misc payments contain adoption pay title', () => {
        const entry = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            miscPayments: [{ title: 'Statutory Adoption Pay' }],
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('does not false-positive on titles containing "spa" (e.g. Spare Hours)', () => {
        const entry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            miscPayments: [{ title: 'Spare Hours Adjustment' }],
        })
        expect(isReferenceEligible(entry)).toBe(true)
    })

    it('does not false-positive on titles containing "spa" (e.g. Special Bonus)', () => {
        const entry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            miscPayments: [{ title: 'Special Bonus' }],
        })
        expect(isReferenceEligible(entry)).toBe(true)
    })

    it('returns false for case-insensitive title match (mixed case)', () => {
        const entry = makeEntry({
            basicUnits: 80,
            basicRate: 14.5,
            miscPayments: [{ title: 'Statutory Sick Pay (SSP)' }],
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })

    it('returns false when only holiday amount is non-zero (no units)', () => {
        const entry = makeEntry({
            basicUnits: 160,
            basicRate: 14.5,
            holidayUnits: 0,
            holidayAmount: 100,
        })
        expect(isReferenceEligible(entry)).toBe(false)
    })
})
