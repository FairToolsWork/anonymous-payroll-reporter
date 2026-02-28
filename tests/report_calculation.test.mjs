import { describe, expect, it } from 'vitest'
import { formatMonthLabel } from '../pwa/js/parse/parser_config.js'
import {
    buildContributionSummary,
    buildMissingMonthsWithRange,
    buildValidation,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    parsePayPeriodStart,
    sumMiscAmounts,
} from '../pwa/js/report/report_calculations.js'

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
                year: 2025,
                monthIndex: 1,
                monthLabel: 'January',
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 100,
                    netPay: 100,
                }),
                parsedDate: new Date(2025, 1, 15),
                year: 2025,
                monthIndex: 2,
                monthLabel: 'February',
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
        const summary = buildContributionSummary(
            entries,
            contributionData,
            [2025]
        )
        const totals = summary?.years.get(2025)?.totals
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
            year: 2025,
            monthIndex: 1,
            monthLabel: 'January',
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
            year: 2025,
            monthIndex: 1,
            monthLabel: 'January',
        }
        const outsideToleranceEntry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 99.9,
            }),
            parsedDate: new Date(2025, 0, 1),
            year: 2025,
            monthIndex: 1,
            monthLabel: 'January',
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
        expect(missing).toEqual([formatMonthLabel(2)])
    })

    it('formats dates and keys', () => {
        const parsedNumeric = parsePayPeriodStart('01/02/25 - 28/02/25')
        const parsedLong = parsePayPeriodStart('15 March 2024 - 31 March 2024')
        expect(parsedNumeric?.toISOString().slice(0, 10)).toBe('2025-02-01')
        expect(parsedLong?.toISOString().slice(0, 10)).toBe('2024-03-15')
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
                year: 2025,
                monthIndex: 4,
                monthLabel: 'April',
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                year: 2025,
                monthIndex: 5,
                monthLabel: 'May',
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
        const summary = buildContributionSummary(
            entries,
            contributionData,
            [2025]
        )
        const year = summary?.years.get(2025)
        const aprilMonth = year?.months.get(4)
        const mayMonth = year?.months.get(5)

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
                year: 2025,
                monthIndex: 4,
                monthLabel: 'April',
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                year: 2025,
                monthIndex: 5,
                monthLabel: 'May',
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
        const summary = buildContributionSummary(
            entries,
            contributionData,
            [2025]
        )
        const year = summary?.years.get(2025)
        const aprilMonth = year?.months.get(4)
        const mayMonth = year?.months.get(5)

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
                year: 2025,
                monthIndex: 4,
                monthLabel: 'April',
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                year: 2025,
                monthIndex: 5,
                monthLabel: 'May',
            },
            {
                record: buildRecord({
                    nestEE: 55,
                    nestER: 35,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 5, 20),
                year: 2025,
                monthIndex: 6,
                monthLabel: 'June',
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
        const summary = buildContributionSummary(
            entries,
            contributionData,
            [2025]
        )
        const year = summary?.years.get(2025)

        expect(year?.months.get(4)?.delta).toBe(-10)
        expect(year?.months.get(4)?.balance).toBe(-10)
        expect(year?.months.get(5)?.delta).toBe(10)
        expect(year?.months.get(5)?.balance).toBe(0)
        expect(year?.months.get(6)?.delta).toBe(0)
        expect(year?.months.get(6)?.balance).toBe(0)
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
                year: 2024,
                monthIndex: 1,
                monthLabel: 'January',
            },
            {
                record: buildRecord({
                    nestEE: 20,
                    nestER: 10,
                    grossPay: 100,
                    netPay: 90,
                }),
                parsedDate: new Date(2025, 0, 15),
                year: 2025,
                monthIndex: 1,
                monthLabel: 'January',
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
        const summary = buildContributionSummary(
            entries,
            contributionData,
            [2024, 2025]
        )
        const year2024 = summary?.years.get(2024)
        const year2025 = summary?.years.get(2025)
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
})
