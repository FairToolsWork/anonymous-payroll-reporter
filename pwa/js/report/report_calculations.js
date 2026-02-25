/**
 * @typedef {import("../parse/payroll.types").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../parse/payroll.types").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types").PayrollPayments} PayrollPayments
 */

import { formatMonthLabel } from '../parse/parser_config.js'

/**
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {{ id: string, label: string }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ date: Date | null, type: string, amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number, balance: number }} ContributionMonthSummary
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number }} ContributionYearTotals
 * @typedef {{ months: Map<number, ContributionMonthSummary>, totals: ContributionYearTotals, yearEndBalance: number }} ContributionYearSummary
 * @typedef {{ years: Map<string, ContributionYearSummary>, balance: number, sourceFiles: string[] }} ContributionSummary
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, year: number | null, monthIndex: number, monthLabel: string, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 */

/** @type {Record<string, number>} */
const DATE_MONTHS = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
}

/** @type {number} */
const VALIDATION_TOLERANCE = 0.05

/**
 * @param {string | null} payPeriod
 * @returns {Date | null}
 */
function parsePayPeriodStart(payPeriod) {
    if (!payPeriod) {
        return null
    }
    const startSegment = payPeriod.split('-')[0].trim()
    return parseDateValue(startSegment)
}

/**
 * @param {string | null} value
 * @returns {Date | null}
 */
function parseDateValue(value) {
    if (!value) {
        return null
    }
    const numericMatch = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (numericMatch) {
        const day = parseInt(numericMatch[1], 10)
        const month = parseInt(numericMatch[2], 10) - 1
        let year = parseInt(numericMatch[3], 10)
        if (year < 100) {
            year += 2000
        }
        const parsed = new Date(year, month, day)
        return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const longMatch = value.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/)
    if (longMatch) {
        const day = parseInt(longMatch[1], 10)
        const monthKey = longMatch[2].toLowerCase()
        const month = DATE_MONTHS[monthKey]
        const year = parseInt(longMatch[3], 10)
        if (month !== undefined) {
            const parsed = new Date(year, month, day)
            return Number.isNaN(parsed.getTime()) ? null : parsed
        }
    }

    const monthYearMatch = value.match(/([A-Za-z]{3,})\s+(\d{4})/)
    if (monthYearMatch) {
        const monthKey = monthYearMatch[1].toLowerCase()
        const month = DATE_MONTHS[monthKey]
        const year = parseInt(monthYearMatch[2], 10)
        if (month !== undefined) {
            const parsed = new Date(year, month, 1)
            return Number.isNaN(parsed.getTime()) ? null : parsed
        }
    }

    return null
}

/**
 * @param {Date | null} date
 * @returns {string}
 */
function formatDateLabel(date) {
    if (!date) {
        return 'Unknown'
    }
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/**
 * @param {Date | null} date
 * @returns {string}
 */
function formatMonthYearLabel(date) {
    if (!date) {
        return 'Unknown'
    }
    return date.toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
    })
}

/**
 * @param {Date | null} date
 * @returns {string}
 */
function formatDateKey(date) {
    if (!date) {
        return 'unknown'
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

/**
 * @param {number | string} year
 * @param {number} monthIndex
 * @returns {string}
 */
function buildMonthKey(year, monthIndex) {
    return `${year}-${String(monthIndex).padStart(2, '0')}`
}

/**
 * @param {number[]} presentMonths
 * @param {number | null} minMonth
 * @param {number | null} maxMonth
 * @returns {string[]}
 */
function buildMissingMonthsWithRange(presentMonths, minMonth, maxMonth) {
    if (!presentMonths.length || minMonth === null || maxMonth === null) {
        return []
    }
    const present = new Set(presentMonths)
    const missing = []
    for (let month = minMonth; month <= maxMonth; month += 1) {
        if (!present.has(month)) {
            missing.push(formatMonthLabel(month))
        }
    }
    return missing
}

/**
 * @param {Array<{ amount: number | null }>} items
 * @returns {number}
 */
function sumMiscAmounts(items) {
    if (!items || !items.length) {
        return 0
    }
    return items.reduce((sum, item) => sum + (item.amount || 0), 0)
}

/**
 * @param {PayrollRecord} record
 * @returns {number}
 */
function sumPayments(record) {
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
function sumDeductionsForNetPay(record) {
    const deductions = /** @type {PayrollDeductions} */ (
        record?.payrollDoc?.deductions || {}
    )
    return (
        (deductions.payeTax?.amount || 0) +
        (deductions.natIns?.amount || 0) +
        (deductions.nestEE?.amount || 0) +
        sumMiscAmounts(deductions.misc || [])
    )
}

/**
 * @param {number | null | undefined} actual
 * @param {number | null | undefined} expected
 * @returns {boolean}
 */
function isWithinTolerance(actual, expected) {
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
 * @param {ReportEntry} entry
 * @returns {ValidationResult}
 */
function buildValidation(entry) {
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
        flags.push({ id: 'missing_nat_ins', label: 'Missing NAT INS No' })
    }
    if (!taxCode) {
        flags.push({ id: 'missing_tax_code', label: 'Missing tax code' })
    }
    if (payeTax <= 0) {
        flags.push({ id: 'paye_zero', label: 'PAYE Tax missing or £0' })
    }
    if (nationalInsurance <= 0) {
        flags.push({
            id: 'nat_ins_zero',
            label: 'National Insurance missing or £0',
        })
    }

    let grossMismatch = false
    if (totalGrossPay !== null) {
        grossMismatch = !isWithinTolerance(paymentsTotal, totalGrossPay)
        if (grossMismatch) {
            flags.push({
                id: 'gross_mismatch',
                label: 'Payments total does not match Total Gross Pay',
            })
        }
    }

    let netMismatch = false
    if (netPay !== null) {
        const expectedNet = paymentsTotal - deductionsTotal
        netMismatch = !isWithinTolerance(expectedNet, netPay)
        if (netMismatch) {
            flags.push({
                id: 'net_mismatch',
                label: 'Net Pay does not match payments less deductions',
            })
        }
    }

    return {
        flags,
        lowConfidence: grossMismatch || netMismatch,
    }
}

/**
 * @param {ReportEntry[]} entries
 * @param {ContributionData | null | undefined} contributionData
 * @param {Array<string | number>} yearKeys
 * @returns {ContributionSummary | null}
 */
function buildContributionSummary(entries, contributionData, yearKeys) {
    if (
        !contributionData ||
        !contributionData.entries ||
        !contributionData.entries.length
    ) {
        return null
    }
    const expectedByMonth = new Map()
    entries.forEach((entry) => {
        if (!(entry.parsedDate instanceof Date)) {
            return
        }
        const year = entry.parsedDate.getFullYear()
        const monthIndex = entry.parsedDate.getMonth() + 1
        const key = buildMonthKey(year, monthIndex)
        const expected = expectedByMonth.get(key) || { ee: 0, er: 0 }
        expected.ee += entry.record.payrollDoc?.deductions?.nestEE?.amount || 0
        expected.er += entry.record.payrollDoc?.deductions?.nestER?.amount || 0
        expectedByMonth.set(key, expected)
    })

    const actualByMonth = new Map()
    contributionData.entries.forEach((entry) => {
        if (!(entry.date instanceof Date)) {
            return
        }
        const year = entry.date.getFullYear()
        const monthIndex = entry.date.getMonth() + 1
        const key = buildMonthKey(year, monthIndex)
        const actual = actualByMonth.get(key) || { ee: 0, er: 0 }
        if (entry.type === 'ee') {
            actual.ee += entry.amount || 0
        } else if (entry.type === 'er') {
            actual.er += entry.amount || 0
        }
        actualByMonth.set(key, actual)
    })

    const summaryByYear = new Map()
    let overallBalance = 0
    yearKeys.forEach((yearKey) => {
        if (!yearKey || yearKey === 'Unknown') {
            return
        }
        const months = new Map()
        const totals = {
            expectedEE: 0,
            expectedER: 0,
            actualEE: 0,
            actualER: 0,
            delta: 0,
        }
        let runningBalance = 0
        for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
            const key = buildMonthKey(yearKey, monthIndex)
            const expected = expectedByMonth.get(key) || { ee: 0, er: 0 }
            const actual = actualByMonth.get(key) || { ee: 0, er: 0 }
            const expectedTotal = expected.ee + expected.er
            const actualTotal = actual.ee + actual.er
            const delta = actualTotal - expectedTotal
            runningBalance += delta
            months.set(monthIndex, {
                expectedEE: expected.ee,
                expectedER: expected.er,
                actualEE: actual.ee,
                actualER: actual.er,
                delta,
                balance: runningBalance,
            })
            totals.expectedEE += expected.ee
            totals.expectedER += expected.er
            totals.actualEE += actual.ee
            totals.actualER += actual.er
            totals.delta += delta
        }
        summaryByYear.set(yearKey, {
            months,
            totals,
            yearEndBalance: runningBalance,
        })
        overallBalance += totals.delta
    })

    return {
        years: summaryByYear,
        balance: overallBalance,
        sourceFiles: contributionData.sourceFiles || [],
    }
}

export {
    buildContributionSummary,
    buildMissingMonthsWithRange,
    buildValidation,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    parsePayPeriodStart,
    sumMiscAmounts,
}
