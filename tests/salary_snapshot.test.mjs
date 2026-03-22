import { describe, expect, it } from 'vitest'
import { buildReport } from '../pwa/src/report/build.js'
import { buildRunSnapshot } from '../pwa/src/report/run_snapshot.js'

const MONTHS_2025_26 = [
    '20 Apr 2025',
    '20 May 2025',
    '20 Jun 2025',
    '20 Jul 2025',
    '20 Aug 2025',
    '20 Sep 2025',
    '20 Oct 2025',
    '20 Nov 2025',
    '20 Dec 2025',
    '20 Jan 2026',
    '20 Feb 2026',
    '20 Mar 2026',
]

/**
 * Builds a minimal salaried PayrollRecord.
 * @param {{ monthlySalary: number, payeTax: number, natIns: number, pensionEE: number, pensionER: number, processDateStr: string, taxCode?: string, natInsNumber?: string, holidaySalary?: number }} opts
 */
function buildSalariedRecord({
    monthlySalary,
    payeTax,
    natIns,
    pensionEE,
    pensionER,
    processDateStr,
    taxCode = 'S1257L',
    natInsNumber = 'QQ123456C',
    holidaySalary = 0,
}) {
    const net = monthlySalary + holidaySalary - payeTax - natIns - pensionEE
    return {
        employee: { natInsNumber },
        payrollDoc: {
            deductions: {
                payeTax: { amount: payeTax },
                natIns: { amount: natIns },
                pensionEE: { amount: pensionEE },
                pensionER: { amount: pensionER },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { units: 0, rate: null, amount: 0 },
                    holiday: { units: 0, rate: null, amount: 0 },
                },
                salary: {
                    basic: { amount: monthlySalary },
                    holiday: { units: 0, rate: null, amount: holidaySalary },
                },
                misc: [],
            },
            taxCode: { code: taxCode },
            thisPeriod: {
                totalGrossPay: { amount: monthlySalary + holidaySalary },
            },
            netPay: { amount: net },
            processDate: { date: processDateStr },
        },
    }
}

function buildRecords(overrides = {}) {
    return MONTHS_2025_26.map((date, i) => {
        const monthOverrides =
            typeof overrides === 'function' ? overrides(i, date) : overrides
        return buildSalariedRecord({ processDateStr: date, ...monthOverrides })
    })
}

function snapshotFromRecords(records, workerProfile = null) {
    const { context } = buildReport(records, [], null, workerProfile)
    return buildRunSnapshot(records, context, null)
}

describe('salary snapshot — good place full-time (£2500/month)', () => {
    const base = {
        monthlySalary: 2500,
        payeTax: 285,
        natIns: 174,
        pensionEE: 99,
        pensionER: 59,
    }

    it('captures salariedPay correctly on all entries', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        expect(snapshot.recordCount).toBe(12)
        for (const entry of snapshot.entries) {
            expect(entry.salariedPay).toBe(2500)
        }
    })

    it('has basicHours: 0 and basicRate: null on all entries (salaried, not hourly)', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.basicHours).toBe(0)
            expect(entry.basicRate).toBeNull()
        }
    })

    it('has no flags on any entry (the good place)', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toEqual([])
        }
    })

    it('captures net pay correctly', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        const expectedNet = 2500 - 285 - 174 - 99
        for (const entry of snapshot.entries) {
            expect(entry.netPay).toBe(expectedNet)
        }
    })

    it('captures pensionEE correctly', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.pensionEE).toBe(99)
        }
    })
})

describe('salary snapshot — good place fractional 0.6 FTE (£1500/month)', () => {
    const base = {
        monthlySalary: 1500,
        payeTax: 68,
        natIns: 54,
        pensionEE: 49,
        pensionER: 29,
    }

    it('captures salariedPay as £1500 on all entries', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        expect(snapshot.recordCount).toBe(12)
        for (const entry of snapshot.entries) {
            expect(entry.salariedPay).toBe(1500)
        }
    })

    it('has no flags (the good place)', () => {
        const records = buildRecords(base)
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toEqual([])
        }
    })

    it('captures proportionally lower pensionEE than full-time', () => {
        const fullRecords = buildRecords({
            monthlySalary: 2500,
            payeTax: 285,
            natIns: 174,
            pensionEE: 99,
            pensionER: 59,
        })
        const fracRecords = buildRecords(base)
        const fullSnap = snapshotFromRecords(fullRecords)
        const fracSnap = snapshotFromRecords(fracRecords)
        expect(fracSnap.entries[0].pensionEE).toBeLessThan(
            fullSnap.entries[0].pensionEE
        )
    })
})

describe('salary snapshot — good place with salary holiday pay', () => {
    it('captures salariedPay as basic salary only (not including holiday amount)', () => {
        const records = buildRecords((i) => ({
            monthlySalary: 2500,
            payeTax: 310,
            natIns: 185,
            pensionEE: 109,
            pensionER: 65,
            holidaySalary: i === 5 ? 250 : 0,
        }))
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.salariedPay).toBe(2500)
        }
    })

    it('has no flags on any entry including the holiday month', () => {
        const records = buildRecords((i) => ({
            monthlySalary: 2500,
            payeTax: 310,
            natIns: 185,
            pensionEE: 109,
            pensionER: 65,
            holidaySalary: i === 5 ? 250 : 0,
        }))
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toEqual([])
        }
    })
})

describe('salary snapshot — bad place full-time (known violations)', () => {
    it('flags missing_tax_code when tax code is absent', () => {
        const records = buildRecords({
            monthlySalary: 2500,
            payeTax: 285,
            natIns: 174,
            pensionEE: 99,
            pensionER: 59,
            taxCode: '',
        })
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toContain('missing_tax_code')
        }
    })

    it('flags paye_zero when no PAYE is deducted', () => {
        const records = buildRecords({
            monthlySalary: 2500,
            payeTax: 0,
            natIns: 174,
            pensionEE: 99,
            pensionER: 59,
        })
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toContain('paye_zero')
        }
    })

    it('flags nat_ins_zero when no NI is deducted', () => {
        const records = buildRecords({
            monthlySalary: 2500,
            payeTax: 285,
            natIns: 0,
            pensionEE: 99,
            pensionER: 59,
        })
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.flagIds).toContain('nat_ins_zero')
        }
    })

    it('salariedPay is still captured correctly even with deduction violations', () => {
        const records = buildRecords({
            monthlySalary: 2500,
            payeTax: 0,
            natIns: 0,
            pensionEE: 99,
            pensionER: 59,
            taxCode: '',
        })
        const snapshot = snapshotFromRecords(records)
        for (const entry of snapshot.entries) {
            expect(entry.salariedPay).toBe(2500)
        }
    })
})
