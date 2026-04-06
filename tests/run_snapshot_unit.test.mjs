/**
 * Unit tests for buildRunSnapshot options handling.
 * These tests use minimal in-memory data and do not require PDF fixtures.
 */
import { describe, expect, it } from 'vitest'
import { buildRunSnapshot } from '../pwa/src/report/run_snapshot.js'

function buildMinimalContextEntry({
    periodLabel = 'May 2025',
    netPay = 1000,
    flags = [],
} = {}) {
    return {
        record: {
            payrollDoc: {
                processDate: { date: periodLabel },
                payments: {
                    hourly: {
                        basic: { units: 80, rate: 12.5, amount: 1000 },
                        holiday: { units: 0, rate: null, amount: 0 },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { amount: 0 },
                    },
                    misc: [],
                },
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                    totalDeductions: { amount: 0 },
                },
                netPay: { amount: netPay },
            },
        },
        validation: { flags, lowConfidence: false },
        parsedDate: null,
        yearKey: '2025/26',
        monthIndex: 2,
    }
}

describe('buildRunSnapshot — basic behavior', () => {
    it('returns zero recordCount and empty entries for empty inputs', () => {
        const snapshot = buildRunSnapshot([], null, null)
        expect(snapshot.recordCount).toBe(0)
        expect(snapshot.contributionEntries).toBe(0)
        expect(snapshot.entries).toEqual([])
    })

    it('counts records correctly', () => {
        const records = [{}, {}, {}]
        const snapshot = buildRunSnapshot(records, null, null)
        expect(snapshot.recordCount).toBe(3)
    })

    it('counts contribution entries from contributionData', () => {
        const contributionData = {
            entries: [{}, {}, {}, {}],
        }
        const snapshot = buildRunSnapshot([], null, contributionData)
        expect(snapshot.contributionEntries).toBe(4)
    })

    it('returns zero contributionEntries when contributionData is null', () => {
        const snapshot = buildRunSnapshot([], null, null)
        expect(snapshot.contributionEntries).toBe(0)
    })

    it('produces an entry for each context entry', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({ periodLabel: 'Apr 2025' }),
                buildMinimalContextEntry({ periodLabel: 'May 2025' }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null)
        expect(snapshot.entries).toHaveLength(2)
    })

    it('does not include flagDetails by default', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [{ id: 'nat_ins_zero', label: 'NI zero', severity: 'warning' }],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null)
        expect(snapshot.entries[0].flagIds).toContain('nat_ins_zero')
        expect(Object.prototype.hasOwnProperty.call(snapshot.entries[0], 'flagDetails')).toBe(false)
    })

    it('does not include payeMismatchDiagnostics by default', () => {
        const context = { entries: [buildMinimalContextEntry()] }
        const snapshot = buildRunSnapshot([], context, null)
        expect(Object.prototype.hasOwnProperty.call(snapshot, 'payeMismatchDiagnostics')).toBe(false)
    })
})

describe('buildRunSnapshot — includeFlagDetails option', () => {
    it('includes flagDetails array for each entry when includeFlagDetails is true', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [
                        {
                            id: 'nat_ins_zero',
                            label: 'NI missing or £0',
                            severity: 'warning',
                            ruleId: 'nat_ins_zero',
                            inputs: { nationalInsurance: 0, grossPay: 1200 },
                        },
                    ],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includeFlagDetails: true })
        expect(Array.isArray(snapshot.entries[0].flagDetails)).toBe(true)
        expect(snapshot.entries[0].flagDetails).toHaveLength(1)
        const detail = snapshot.entries[0].flagDetails[0]
        expect(detail.id).toBe('nat_ins_zero')
        expect(detail.label).toBe('NI missing or £0')
        expect(detail.severity).toBe('warning')
        expect(detail.ruleId).toBe('nat_ins_zero')
    })

    it('sanitises inputs to only include numbers, strings, and null', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [
                        {
                            id: 'test_flag',
                            label: 'Test',
                            severity: 'notice',
                            inputs: {
                                numberVal: 42,
                                stringVal: 'hello',
                                nullVal: null,
                                objectVal: { nested: 'ignored' },
                                booleanVal: true,
                                undefinedVal: undefined,
                            },
                        },
                    ],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includeFlagDetails: true })
        const inputs = snapshot.entries[0].flagDetails[0].inputs
        expect(inputs.numberVal).toBe(42)
        expect(inputs.stringVal).toBe('hello')
        expect(inputs.nullVal).toBeNull()
        expect(Object.prototype.hasOwnProperty.call(inputs, 'objectVal')).toBe(false)
        expect(Object.prototype.hasOwnProperty.call(inputs, 'booleanVal')).toBe(false)
        expect(Object.prototype.hasOwnProperty.call(inputs, 'undefinedVal')).toBe(false)
    })

    it('sorts flagDetails alphabetically by id', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [
                        { id: 'paye_zero', label: 'PAYE zero', severity: 'warning' },
                        { id: 'missing_tax_code', label: 'Missing tax code', severity: 'warning' },
                        { id: 'nat_ins_zero', label: 'NI zero', severity: 'warning' },
                    ],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includeFlagDetails: true })
        const ids = snapshot.entries[0].flagDetails.map((f) => f.id)
        expect(ids).toEqual(['missing_tax_code', 'nat_ins_zero', 'paye_zero'])
    })

    it('handles flags with no severity as null in flagDetails', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [{ id: 'some_flag', label: 'Some flag' }],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includeFlagDetails: true })
        expect(snapshot.entries[0].flagDetails[0].severity).toBeNull()
    })

    it('handles missing inputs gracefully in flagDetails', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [{ id: 'some_flag', label: 'Some flag', severity: 'warning' }],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includeFlagDetails: true })
        expect(snapshot.entries[0].flagDetails[0].inputs).toEqual({})
    })
})

describe('buildRunSnapshot — includePayeDiagnostics option', () => {
    it('includes payeMismatchDiagnostics array when includePayeDiagnostics is true', () => {
        const context = {
            entries: [buildMinimalContextEntry()],
        }
        const snapshot = buildRunSnapshot([], context, null, { includePayeDiagnostics: true })
        expect(Object.prototype.hasOwnProperty.call(snapshot, 'payeMismatchDiagnostics')).toBe(true)
        expect(Array.isArray(snapshot.payeMismatchDiagnostics)).toBe(true)
    })

    it('produces empty payeMismatchDiagnostics when no paye_mismatch flags are present', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [{ id: 'nat_ins_zero', label: 'NI zero', severity: 'warning', inputs: {} }],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, { includePayeDiagnostics: true })
        expect(snapshot.payeMismatchDiagnostics).toEqual([])
    })

    it('extracts PAYE diagnostic data from paye_mismatch flags', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    periodLabel: 'Jun 2025',
                    flags: [
                        {
                            id: 'paye_mismatch',
                            label: 'PAYE mismatch',
                            severity: 'warning',
                            ruleId: 'paye_mismatch',
                            inputs: {
                                payeTax: 100,
                                expectedPaye: 150,
                                payeDifference: -50,
                                periodIndex: 3,
                                taxCode: '1257L',
                                region: 'england',
                                payeCalculationMode: 'cumulative',
                                payeCumulativeMode: 'exact',
                                cumulativeAllowance: 3144,
                                taxableYtd: 1856,
                                expectedTaxYtd: 371.2,
                                priorTaxPaid: 221.2,
                                expectedPayeExact: 150,
                                expectedPayeSageApprox: 149.5,
                                expectedPayeTableMode: 148,
                                expectedTaxYtdExact: 371.2,
                                expectedTaxYtdSageApprox: 370.7,
                                expectedTaxYtdTableMode: 369,
                            },
                        },
                    ],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, {
            includeFlagDetails: true,
            includePayeDiagnostics: true,
        })
        expect(snapshot.payeMismatchDiagnostics).toHaveLength(1)
        const diag = snapshot.payeMismatchDiagnostics[0]
        expect(diag.taxCode).toBe('1257L')
        expect(diag.region).toBe('england')
        expect(diag.periodIndex).toBe(3)
        expect(diag.payeTax).toBe(100)
        expect(diag.expectedPaye).toBe(150)
        expect(diag.payeDifference).toBe(-50)
        expect(diag.cumulativeAllowance).toBe(3144)
        expect(diag.expectedPayeExact).toBe(150)
        expect(diag.expectedPayeSageApprox).toBe(149.5)
        expect(diag.expectedPayeTableMode).toBe(148)
        expect(diag.calculationMode).toBe('cumulative')
        expect(diag.cumulativeMode).toBe('exact')
    })

    it('includes both options simultaneously without conflict', () => {
        const context = {
            entries: [
                buildMinimalContextEntry({
                    flags: [
                        {
                            id: 'paye_mismatch',
                            label: 'PAYE mismatch',
                            severity: 'warning',
                            inputs: { payeTax: 0, expectedPaye: 200, payeDifference: -200 },
                        },
                    ],
                }),
            ],
        }
        const snapshot = buildRunSnapshot([], context, null, {
            includeFlagDetails: true,
            includePayeDiagnostics: true,
        })
        expect(Array.isArray(snapshot.entries[0].flagDetails)).toBe(true)
        expect(Array.isArray(snapshot.payeMismatchDiagnostics)).toBe(true)
    })
})