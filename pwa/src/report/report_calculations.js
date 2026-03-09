/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
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
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 */

/** @type {number} */
const TAX_YEAR_START_MONTH_INDEX = 3
/** @type {number} */
const TAX_YEAR_START_DAY = 6

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

/**
 * @param {Date | null} date
 * @returns {number | null}
 */
function getTaxYearStartYear(date) {
    if (!date) {
        return null
    }
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const day = date.getDate()
    const isAfterStart =
        monthIndex > TAX_YEAR_START_MONTH_INDEX ||
        (monthIndex === TAX_YEAR_START_MONTH_INDEX && day >= TAX_YEAR_START_DAY)
    return isAfterStart ? year : year - 1
}

/**
 * @param {number | null} startYear
 * @returns {string}
 */
function formatTaxYearLabel(startYear) {
    if (!startYear && startYear !== 0) {
        return 'Unknown'
    }
    const endYear = startYear + 1
    const nextYearSuffix = String(endYear % 100).padStart(2, '0')
    const suffix = endYear % 100 === 0 ? String(endYear) : nextYearSuffix
    return `${startYear}/${suffix}`
}

/**
 * @param {Date | null} date
 * @returns {string}
 */
function getTaxYearKey(date) {
    const startYear = getTaxYearStartYear(date)
    return formatTaxYearLabel(startYear)
}

/**
 * @param {string | number} yearKey
 * @returns {number | null}
 */
function parseTaxYearStartYear(yearKey) {
    if (!yearKey || yearKey === 'Unknown') {
        return null
    }
    const match = String(yearKey).match(/^(\d{4})\//)
    if (!match) {
        return null
    }
    const parsed = Number.parseInt(match[1], 10)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * @param {string | number} yearKey
 * @returns {number}
 */
function getTaxYearSortKey(yearKey) {
    const startYear = parseTaxYearStartYear(yearKey)
    return startYear ?? 9999
}

/**
 * @param {Date | null} date
 * @returns {number | null}
 */
function getFiscalMonthIndex(date) {
    if (!date) {
        return null
    }
    const monthIndex = date.getMonth()
    const day = date.getDate()
    const isAfterTaxYearStart =
        monthIndex > TAX_YEAR_START_MONTH_INDEX ||
        (monthIndex === TAX_YEAR_START_MONTH_INDEX && day >= TAX_YEAR_START_DAY)
    const calendarMonthIndex = monthIndex + 1
    if (isAfterTaxYearStart) {
        return calendarMonthIndex - 3
    }
    return Math.min(calendarMonthIndex + 9, 12)
}

/**
 * @param {number} fiscalMonthIndex
 * @returns {number | null}
 */
function getCalendarMonthFromFiscalIndex(fiscalMonthIndex) {
    if (!Number.isFinite(fiscalMonthIndex)) {
        return null
    }
    if (fiscalMonthIndex >= 1 && fiscalMonthIndex <= 9) {
        return fiscalMonthIndex + 3
    }
    if (fiscalMonthIndex >= 10 && fiscalMonthIndex <= 12) {
        return fiscalMonthIndex - 9
    }
    return null
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
 * @param {number[]} presentMonths - Fiscal month indices (1=April … 12=March)
 * @param {number | null} minMonth - Fiscal month index lower bound (inclusive)
 * @param {number | null} maxMonth - Fiscal month index upper bound (inclusive)
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
            const calendarMonth = getCalendarMonthFromFiscalIndex(month)
            if (calendarMonth) {
                missing.push(formatMonthLabel(calendarMonth))
            }
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
        (deductions.pensionEE?.amount || 0) +
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
                    label: 'A payment line units × rate does not match its amount',
                })
                break
            }
        }
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
 * @param {string[]} yearKeys
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
        const yearKey = getTaxYearKey(entry.parsedDate)
        const fiscalMonthIndex = getFiscalMonthIndex(entry.parsedDate)
        if (!yearKey || yearKey === 'Unknown' || !fiscalMonthIndex) {
            return
        }
        const key = buildMonthKey(yearKey, fiscalMonthIndex)
        const expected = expectedByMonth.get(key) || { ee: 0, er: 0 }
        expected.ee +=
            entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
        expected.er +=
            entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
        expectedByMonth.set(key, expected)
    })

    const actualByMonth = new Map()
    contributionData.entries.forEach((entry) => {
        if (!(entry.date instanceof Date)) {
            return
        }
        const yearKey = getTaxYearKey(entry.date)
        const fiscalMonthIndex = getFiscalMonthIndex(entry.date)
        if (!yearKey || yearKey === 'Unknown' || !fiscalMonthIndex) {
            return
        }
        const key = buildMonthKey(yearKey, fiscalMonthIndex)
        const actual = actualByMonth.get(key) || { ee: 0, er: 0 }
        if (entry.type === 'ee') {
            actual.ee += entry.amount || 0
        } else if (entry.type === 'er') {
            actual.er += entry.amount || 0
        }
        actualByMonth.set(key, actual)
    })

    const contributionYears = new Set()
    actualByMonth.forEach((_, key) => {
        const year = key.split('-')[0]
        if (year && year !== 'Unknown') {
            contributionYears.add(year)
        }
    })
    const allYearKeys = Array.from(
        new Set([
            ...yearKeys.filter((k) => k && k !== 'Unknown'),
            ...contributionYears,
        ])
    ).sort((a, b) => getTaxYearSortKey(a) - getTaxYearSortKey(b))

    const summaryByYear = new Map()
    let overallBalance = 0
    allYearKeys.forEach((yearKey) => {
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

/**
 * @param {PayrollRecordWithImage[]} records
 * @returns {ReportEntry[]}
 * @note monthIndex is a fiscal month index (1=April … 12=March).
 */
function buildReportEntries(records) {
    return records.map((record) => {
        const parsedDate = parsePayPeriodStart(
            record.payrollDoc?.processDate?.date
        )
        const yearKey = parsedDate ? getTaxYearKey(parsedDate) : null
        const monthIndex = getFiscalMonthIndex(parsedDate) ?? 13
        return {
            record,
            parsedDate,
            yearKey,
            monthIndex,
        }
    })
}

export {
    buildContributionSummary,
    buildMissingMonthsWithRange,
    buildReportEntries,
    buildValidation,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getCalendarMonthFromFiscalIndex,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
    sumDeductionsForNetPay,
    sumMiscAmounts,
    sumPayments,
}
