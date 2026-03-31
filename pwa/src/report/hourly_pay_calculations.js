/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 * @typedef {{ id: string, label: string, ruleId?: string, inputs?: Record<string, number | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecord, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult }} HourlyPayEntry
 */

import { resolveFlagLabel } from './flag_catalog.js'
import { VALIDATION_TOLERANCE } from './uk_thresholds.js'

/**
 * @param {number | null | undefined} actual
 * @param {number | null | undefined} expected
 * @returns {boolean}
 */
export function isWithinTolerance(actual, expected) {
    if (
        actual === null ||
        actual === undefined ||
        expected === null ||
        expected === undefined
    ) {
        return false
    }
    return Math.abs(actual - expected) <= VALIDATION_TOLERANCE
}

/**
 * @param {Array<{ amount: number | null }>} items
 * @returns {number}
 */
export function sumMiscAmounts(items) {
    if (!items || !items.length) {
        return 0
    }
    return items.reduce((sum, item) => sum + (item.amount || 0), 0)
}

/**
 * @param {PayrollRecord} record
 * @returns {number}
 */
export function sumPayments(record) {
    const hourly = /** @type {PayrollPayments["hourly"]} */ (
        record?.payrollDoc?.payments?.hourly || {}
    )
    const salary = /** @type {PayrollPayments["salary"]} */ (
        record?.payrollDoc?.payments?.salary || {}
    )
    const misc = record?.payrollDoc?.payments?.misc || []
    return (
        (hourly.basic?.amount || 0) +
        (hourly.holiday?.amount || 0) +
        (salary.basic?.amount || 0) +
        (salary.holiday?.amount || 0) +
        sumMiscAmounts(misc)
    )
}

/**
 * @param {PayrollRecord} record
 * @returns {number}
 */
export function sumDeductionsForNetPay(record) {
    const deductions = /** @type {PayrollDeductions} */ (
        record?.payrollDoc?.deductions || {}
    )
    return (
        (deductions.payeTax?.amount || 0) +
        (deductions.natIns?.amount || 0) +
        (deductions.pensionEE?.amount || 0) +
        sumMiscAmounts(deductions.misc || [])
    )
}

/**
 * Validates a payroll entry and returns a set of flags describing anomalies.
 *
 * Flag priority cascade (to avoid redundant overlapping warnings):
 * - payment_line_mismatch fires → gross_mismatch and net_mismatch suppressed
 * - gross_mismatch fires → net_mismatch suppressed
 *
 * @param {HourlyPayEntry} entry
 * @returns {ValidationResult}
 */
export function buildValidation(entry) {
    const record = entry.record
    const flags = []
    const natInsNumber = record.employee?.natInsNumber || ''
    const taxCode = record.payrollDoc?.taxCode?.code || ''
    const payeTax = record.payrollDoc?.deductions?.payeTax?.amount || 0
    const nationalInsurance = record.payrollDoc?.deductions?.natIns?.amount || 0
    const totalGrossPay =
        record.payrollDoc?.thisPeriod?.totalGrossPay?.amount ?? null
    const netPay = record.payrollDoc?.netPay?.amount ?? null
    const paymentsTotal = sumPayments(record)
    const deductionsTotal = sumDeductionsForNetPay(record)

    if (!natInsNumber) {
        flags.push({
            id: 'missing_nat_ins',
            label: resolveFlagLabel('missing_nat_ins', 'Missing NAT INS No'),
        })
    }
    if (!taxCode) {
        flags.push({
            id: 'missing_tax_code',
            label: resolveFlagLabel('missing_tax_code', 'Missing tax code'),
        })
    }
    if (payeTax <= 0) {
        flags.push({
            id: 'paye_zero',
            label: resolveFlagLabel('paye_zero', 'PAYE Tax missing or £0'),
            ruleId: 'paye_zero',
            inputs: { payeTax },
        })
    }
    if (nationalInsurance <= 0) {
        flags.push({
            id: 'nat_ins_zero',
            label: resolveFlagLabel(
                'nat_ins_zero',
                'National Insurance missing or £0'
            ),
            ruleId: 'nat_ins_zero',
            inputs: { nationalInsurance },
        })
    }

    const hourly = record?.payrollDoc?.payments?.hourly
    const salaryHoliday = record?.payrollDoc?.payments?.salary?.holiday
    const hourlyItems = [hourly?.basic, hourly?.holiday, salaryHoliday]
    for (const item of hourlyItems) {
        if (
            item &&
            item.units !== null &&
            item.units !== undefined &&
            item.rate !== null &&
            item.rate !== undefined &&
            item.amount !== null &&
            item.amount !== undefined
        ) {
            const expected = Math.round(item.units * item.rate * 100) / 100
            if (!isWithinTolerance(expected, item.amount)) {
                flags.push({
                    id: 'payment_line_mismatch',
                    label: resolveFlagLabel(
                        'payment_line_mismatch',
                        'A payment line units × rate does not match its amount'
                    ),
                    ruleId: 'payment_line_mismatch',
                    inputs: { computed: expected, reported: item.amount },
                })
                break
            }
        }
    }

    const hasPaymentLineMismatch = flags.some(
        (f) => f.id === 'payment_line_mismatch'
    )

    let grossMismatch = false
    if (totalGrossPay !== null && !hasPaymentLineMismatch) {
        grossMismatch = !isWithinTolerance(paymentsTotal, totalGrossPay)
        if (grossMismatch) {
            flags.push({
                id: 'gross_mismatch',
                label: resolveFlagLabel(
                    'gross_mismatch',
                    'Payments total does not match Total Gross Pay'
                ),
                ruleId: 'gross_mismatch',
                inputs: { computed: paymentsTotal, reported: totalGrossPay },
            })
        }
    }

    let netMismatch = false
    if (netPay !== null && !hasPaymentLineMismatch && !grossMismatch) {
        const expectedNet = paymentsTotal - deductionsTotal
        netMismatch = !isWithinTolerance(expectedNet, netPay)
        if (netMismatch) {
            flags.push({
                id: 'net_mismatch',
                label: resolveFlagLabel(
                    'net_mismatch',
                    'Net Pay does not match payments less deductions'
                ),
                ruleId: 'net_mismatch',
                inputs: { computed: expectedNet, reported: netPay },
            })
        }
    }

    return {
        flags,
        lowConfidence: grossMismatch || netMismatch,
    }
}
