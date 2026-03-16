/**
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ hasBaseline: false } | { hasBaseline: true, avgWeeklyHours: number, avgHoursPerDay: number, avgRatePerHour: number, typicalDays: number }} HolidayContext
 * @typedef {{ record: any, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, holidayContext?: HolidayContext }} HolidayEntry
 */

/** @type {number} £0.05/hr tolerance — covers float rounding without masking real discrepancies */
export const HOLIDAY_RATE_TOLERANCE = 0.05

/**
 * Builds a per-tax-year accumulator of basic hourly pay totals across all entries.
 *
 * @param {HolidayEntry[]} entries
 * @returns {Map<string, { totalBasicAmount: number, totalBasicUnits: number, monthCount: number }>}
 */
function buildYearBasicTotals(entries) {
    /** @type {Map<string, { totalBasicAmount: number, totalBasicUnits: number, monthCount: number, monthsSeen: Set<number> }>} */
    const yearBasicTotals = new Map()
    for (const entry of entries) {
        const yearKey = entry.yearKey || 'Unknown'
        const basic = entry.record?.payrollDoc?.payments?.hourly?.basic
        const basicUnits = basic?.units ?? 0
        const basicAmount = basic?.amount ?? 0
        if (basicUnits > 0 && basicAmount > 0) {
            if (!yearBasicTotals.has(yearKey)) {
                yearBasicTotals.set(yearKey, {
                    totalBasicAmount: 0,
                    totalBasicUnits: 0,
                    monthCount: 0,
                    monthsSeen: new Set(),
                })
            }
            const t =
                /** @type {NonNullable<ReturnType<typeof yearBasicTotals.get>>} */ (
                    yearBasicTotals.get(yearKey)
                )
            t.totalBasicAmount += basicAmount
            t.totalBasicUnits += basicUnits
            t.monthsSeen.add(entry.monthIndex)
            t.monthCount = t.monthsSeen.size
        }
    }
    return yearBasicTotals
}

/**
 * Appends holiday-rate anomaly flags to each entry's validation.flags array.
 *
 * Signal A: holiday implied rate below basic rate on the same payslip.
 * Signal B: holiday implied rate below the year-weighted average basic rate
 *           (catches pay-rise scenarios where the rolling average should apply).
 *
 * Requires entry.validation to already be set (call after buildValidation loop).
 * Only operates on hourly workers — entries without hourly.basic data produce no flags.
 *
 * Signal A is suppressed when Signal B will also fire for the same entry,
 * to avoid overlapping warnings with the same root cause.
 *
 * @param {HolidayEntry[]} entries
 * @returns {void}
 */
export function buildHolidayPayFlags(entries) {
    const yearBasicTotals = buildYearBasicTotals(entries)

    for (const entry of entries) {
        const hourly = entry.record?.payrollDoc?.payments?.hourly
        const basic = hourly?.basic
        const holiday = hourly?.holiday

        const holidayUnits = holiday?.units ?? 0
        const holidayAmount = holiday?.amount ?? 0

        if (holidayUnits <= 0 || holidayAmount <= 0) {
            continue
        }

        const impliedHolidayRate = holidayAmount / holidayUnits

        if (!entry.validation) {
            entry.validation = { flags: [], lowConfidence: false }
        }

        const basicUnits = basic?.units ?? 0
        const basicAmount = basic?.amount ?? 0
        const basicRate =
            basic?.rate != null
                ? basic.rate
                : basicUnits > 0 && basicAmount > 0
                  ? basicAmount / basicUnits
                  : null

        const yearKey = entry.yearKey || 'Unknown'
        const yearTotals = yearBasicTotals.get(yearKey)
        const holidayMatchesBasic =
            basicRate !== null &&
            Math.abs(basicRate - impliedHolidayRate) <= HOLIDAY_RATE_TOLERANCE

        const yearAvgRate =
            yearTotals && yearTotals.totalBasicUnits > 0
                ? yearTotals.totalBasicAmount / yearTotals.totalBasicUnits
                : null
        const yearAvgFlagWillFire =
            yearTotals &&
            yearTotals.monthCount >= 3 &&
            !holidayMatchesBasic &&
            yearAvgRate !== null &&
            yearAvgRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE

        if (
            basicRate !== null &&
            basicRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE &&
            !yearAvgFlagWillFire
        ) {
            entry.validation.flags.push({
                id: 'holiday_rate_below_basic',
                label: `Holiday rate (£${impliedHolidayRate.toFixed(2)}/hr implied) is below basic rate (£${basicRate.toFixed(2)}/hr) on this payslip`,
            })
        }

        if (yearAvgFlagWillFire) {
            entry.validation.flags.push({
                id: 'holiday_rate_below_year_avg',
                label: `Holiday rate (£${impliedHolidayRate.toFixed(2)}/hr implied) is below year average basic rate (£${yearAvgRate.toFixed(2)}/hr) — if your rate changed this year, request employer's weekly records to confirm`,
            })
        }
    }
}

/**
 * Computes per-year holiday context for each entry and stores it as entry.holidayContext.
 *
 * holidayContext: { avgWeeklyHours, avgHoursPerDay, avgRatePerHour, hasBaseline }
 * hasBaseline is false when fewer than 3 months of basic hours exist in the year.
 *
 * @param {HolidayEntry[]} entries
 * @param {{ typicalDays: number } | null} workerProfile
 * @returns {void}
 */
export function buildYearHolidayContext(entries, workerProfile) {
    const typicalDays =
        workerProfile != null && workerProfile.typicalDays > 0
            ? workerProfile.typicalDays
            : 5

    const yearTotals = buildYearBasicTotals(entries)

    for (const entry of entries) {
        const yearKey = entry.yearKey || 'Unknown'
        const t = yearTotals.get(yearKey)

        /** @type {any} */
        const anyEntry = entry
        if (!t || t.monthCount < 3 || t.totalBasicUnits <= 0) {
            anyEntry.holidayContext = { hasBaseline: false }
            continue
        }

        const avgWeeklyHours = t.totalBasicUnits / 52
        const avgHoursPerDay = avgWeeklyHours / typicalDays
        const avgRatePerHour = t.totalBasicAmount / t.totalBasicUnits

        anyEntry.holidayContext = {
            hasBaseline: true,
            avgWeeklyHours,
            avgHoursPerDay,
            avgRatePerHour,
            typicalDays,
        }
    }
}
