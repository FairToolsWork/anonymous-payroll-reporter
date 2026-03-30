import { formatMonthLabel } from '../parse/parser_config.js'
import {
    TAX_YEAR_START_DAY,
    TAX_YEAR_START_MONTH_INDEX,
} from './uk_thresholds.js'

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
export function getTaxYearKey(date) {
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
export function getTaxYearSortKey(yearKey) {
    const startYear = parseTaxYearStartYear(yearKey)
    return startYear ?? 9999
}

/**
 * Returns a leave-year key for the given date, using a configurable start
 * month (1-indexed: 1=January, 4=April). The leave year is assumed to start
 * on the 1st of the given month. When startMonth is 1 the leave year aligns
 * with the calendar year and the key is a plain four-digit year string (e.g.
 * "2023"); otherwise it uses the same "YYYY/YY" cross-year format as the tax
 * year (e.g. "2023/24").
 *
 * @param {Date | null} date
 * @param {number} startMonth - 1-indexed month number (1=January … 12=December)
 * @returns {string}
 */
export function getLeaveYearKey(date, startMonth) {
    if (!date) {
        return 'Unknown'
    }
    if (
        startMonth === 4 ||
        !Number.isInteger(startMonth) ||
        startMonth < 1 ||
        startMonth > 12
    ) {
        return getTaxYearKey(date)
    }
    const startMonthIndex = startMonth - 1
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const startYear = monthIndex >= startMonthIndex ? year : year - 1
    if (startMonth === 1) {
        return String(startYear)
    }
    return formatTaxYearLabel(startYear)
}

/**
 * Returns a numeric sort key for a leave-year key produced by
 * {@link getLeaveYearKey}. Handles both "YYYY/YY" and plain "YYYY" formats.
 *
 * @param {string | number} leaveYearKey
 * @returns {number}
 */
export function getLeaveYearSortKey(leaveYearKey) {
    if (!leaveYearKey || leaveYearKey === 'Unknown') {
        return 9999
    }
    const slashMatch = String(leaveYearKey).match(/^(\d{4})\//)
    if (slashMatch) {
        const parsed = Number.parseInt(slashMatch[1], 10)
        return Number.isNaN(parsed) ? 9999 : parsed
    }
    const yearMatch = String(leaveYearKey).match(/^(\d{4})$/)
    if (yearMatch) {
        const parsed = Number.parseInt(yearMatch[1], 10)
        return Number.isNaN(parsed) ? 9999 : parsed
    }
    return 9999
}

/**
 * @param {Date | null} date
 * @returns {number | null}
 */
export function getFiscalMonthIndex(date) {
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
export function getCalendarMonthFromFiscalIndex(fiscalMonthIndex) {
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

/**
 * @param {string | null} payPeriod
 * @returns {Date | null}
 */
export function parsePayPeriodStart(payPeriod) {
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
export function formatDateLabel(date) {
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
export function formatMonthYearLabel(date) {
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
export function formatDateKey(date) {
    if (!date) {
        return 'unknown'
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

/**
 * Returns the number of calendar weeks in the month containing the given date.
 * Used to convert monthly basic hours/pay into per-week figures for the rolling
 * 52-week reference average.
 *
 * @param {Date} date
 * @returns {number}
 */
export function getWeeksInPeriod(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return daysInMonth / 7
}

/**
 * @param {number[]} presentMonths - Fiscal month indices (1=April … 12=March)
 * @param {number | null} minMonth - Fiscal month index lower bound (inclusive)
 * @param {number | null} maxMonth - Fiscal month index upper bound (inclusive)
 * @returns {string[]}
 */
export function buildMissingMonthsWithRange(presentMonths, minMonth, maxMonth) {
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
