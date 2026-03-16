/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 */

import {
    buildHolidayPayFlags,
    buildYearHolidayContext,
} from './holiday_calculations.js'
import {
    buildValidation,
    sumDeductionsForNetPay,
    sumMiscAmounts,
    sumPayments,
} from './hourly_pay_calculations.js'
import { buildContributionSummary } from './pension_calculations.js'
import {
    buildMissingMonthsWithRange,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getCalendarMonthFromFiscalIndex,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
} from './tax_year_utils.js'

/**
 * @param {PayrollRecord[]} records
 * @returns {import('./hourly_pay_calculations.js').HourlyPayEntry[]}
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
    buildHolidayPayFlags,
    buildMissingMonthsWithRange,
    buildReportEntries,
    buildValidation,
    buildYearHolidayContext,
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
