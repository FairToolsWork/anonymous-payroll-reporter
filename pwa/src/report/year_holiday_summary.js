/**
 * @typedef {{
 *   hasBaseline?: boolean,
 *   avgHoursPerDay?: number,
 *   avgWeeklyHours?: number,
 *   typicalDays?: number,
 *   entitlementHours?: number,
 * }} HolidayContextLike
 */

/**
 * @typedef {{
 *   record?: any,
 *   monthIndex?: number,
 *   leaveYearKey?: string | null,
 *   holidayContext?: HolidayContextLike | null,
 *   validation?: { flags?: Array<{ noteIndex?: number, label?: string }> } | null,
 *   parsedDate?: Date | null,
 * }} ReportEntryLike
 */

/**
 * @typedef {Array<ReportEntryLike> & { reconciliation?: any | null }} YearEntriesLike
 */

/**
 * @typedef {{ workerType?: string | null, typicalDays?: number, statutoryHolidayDays?: number, leaveYearStartMonth?: number }} WorkerProfileLike
 */

/**
 * @typedef {{
 *   kind: 'hours_days',
 *   holidayHours: number,
 *   estimatedDays: number,
 *   avgHoursPerDay: number,
 *   avgWeeklyHours: number,
 *   typicalDays: number,
 * }} EntryHolidaySummaryHoursDays
 */

/**
 * @typedef {{
 *   kind: 'hours_only',
 *   holidayHours: number,
 *   hasVariablePattern: boolean,
 * }} EntryHolidaySummaryHoursOnly
 */

/**
 * @typedef {EntryHolidaySummaryHoursDays | EntryHolidaySummaryHoursOnly} EntryHolidaySummary
 */

/**
 * @typedef {{
 *   kind: 'salary_days',
 *   leaveYearLabel: string | null,
 *   holidayAmount: number,
 *   daysTaken: number,
 *   daysRemaining: number,
 *   overrun: boolean,
 * }} YearHolidaySummarySalaryDays
 */

/**
 * @typedef {{
 *   kind: 'salary_amount',
 *   leaveYearLabel: string | null,
 *   holidayAmount: number,
 * }} YearHolidaySummarySalaryAmount
 */

/**
 * @typedef {{
 *   kind: 'hourly_days',
 *   leaveYearLabel: string | null,
 *   holidayHours: number,
 *   daysTaken: number,
 *   daysRemaining: number,
 *   overrun: boolean,
 * }} YearHolidaySummaryHourlyDays
 */

/**
 * @typedef {{
 *   kind: 'hourly_hours',
 *   leaveYearLabel: string | null,
 *   holidayHours: number,
 *   entitlementHours: number,
 *   avgWeeklyHours: number,
 *   hoursRemaining: number,
 *   overrun: boolean,
 * }} YearHolidaySummaryHourlyHours
 */

/**
 * @typedef {{
 *   kind: 'hourly_variable',
 *   leaveYearLabel: string | null,
 *   holidayHours: number,
 *   hasVariablePattern: boolean,
 * }} YearHolidaySummaryHourlyVariable
 */

/**
 * @typedef {YearHolidaySummarySalaryDays | YearHolidaySummarySalaryAmount | YearHolidaySummaryHourlyDays | YearHolidaySummaryHourlyHours | YearHolidaySummaryHourlyVariable} YearHolidaySummary
 */

/**
 * @param {ReportEntryLike[]} entries
 * @returns {number}
 */
function sumHolidayUnits(entries) {
    return entries.reduce(
        /** @param {number} acc @param {ReportEntryLike} entry */ (
            acc,
            entry
        ) =>
            acc +
            (entry.record?.payrollDoc?.payments?.hourly?.holiday?.units || 0) +
            (entry.record?.payrollDoc?.payments?.salary?.holiday?.units || 0),
        0
    )
}

/**
 * @param {ReportEntryLike | null | undefined} entry
 * @returns {number}
 */
function getEntryHolidayUnits(entry) {
    return (
        (entry?.record?.payrollDoc?.payments?.hourly?.holiday?.units || 0) +
        (entry?.record?.payrollDoc?.payments?.salary?.holiday?.units || 0)
    )
}

/**
 * @param {ReportEntryLike[]} entries
 * @returns {number}
 */
function sumSalaryBasicAmount(entries) {
    return entries.reduce(
        /** @param {number} acc @param {ReportEntryLike} entry */ (
            acc,
            entry
        ) =>
            acc +
            (entry.record?.payrollDoc?.payments?.salary?.basic?.amount || 0),
        0
    )
}

/**
 * @param {ReportEntryLike[]} entries
 * @returns {number}
 */
function sumSalaryHolidayAmount(entries) {
    return entries.reduce(
        /** @param {number} acc @param {ReportEntryLike} entry */ (
            acc,
            entry
        ) =>
            acc +
            (entry.record?.payrollDoc?.payments?.salary?.holiday?.amount || 0),
        0
    )
}

/**
 * @param {ReportEntryLike[]} entries
 * @returns {Map<string, YearEntriesLike>}
 */
export function buildLeaveYearGroups(entries) {
    /** @type {Map<string, YearEntriesLike>} */
    const leaveYearGroups = new Map()
    entries.forEach((/** @type {ReportEntryLike} */ entry) => {
        const key = entry.leaveYearKey ?? 'Unknown'
        if (!leaveYearGroups.has(key)) {
            leaveYearGroups.set(key, /** @type {YearEntriesLike} */ ([]))
        }
        const leaveYearEntries = leaveYearGroups.get(key)
        if (leaveYearEntries) {
            leaveYearEntries.push(entry)
        }
    })
    return leaveYearGroups
}

/**
 * @param {ReportEntryLike} entry
 * @returns {EntryHolidaySummary}
 */
export function buildEntryHolidaySummary(entry) {
    const holidayHours = getEntryHolidayUnits(entry)
    const entryCtx = entry?.holidayContext
    const entryAvgHoursPerDay = entryCtx?.avgHoursPerDay ?? 0
    const entryAvgWeeklyHours = entryCtx?.avgWeeklyHours ?? 0
    const entryTypicalDays = entryCtx?.typicalDays ?? 0

    if (
        entryCtx?.hasBaseline &&
        entryAvgHoursPerDay > 0 &&
        entryTypicalDays > 0 &&
        holidayHours > 0
    ) {
        return {
            kind: 'hours_days',
            holidayHours,
            estimatedDays: holidayHours / entryAvgHoursPerDay,
            avgHoursPerDay: entryAvgHoursPerDay,
            avgWeeklyHours: entryAvgWeeklyHours,
            typicalDays: entryTypicalDays,
        }
    }

    return {
        kind: 'hours_only',
        holidayHours,
        hasVariablePattern: Boolean(
            entryCtx?.hasBaseline && entryCtx.typicalDays === 0
        ),
    }
}

/**
 * @param {YearEntriesLike} entriesForYear
 * @param {Map<string, YearEntriesLike>} leaveYearGroups
 * @param {WorkerProfileLike | null | undefined} workerProfile
 * @returns {YearHolidaySummary}
 */
export function buildYearHolidaySummary(
    entriesForYear,
    leaveYearGroups,
    workerProfile
) {
    const workerType = workerProfile?.workerType ?? null
    const typicalDays = workerProfile?.typicalDays ?? 5
    const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? 28
    const leaveYearStartMonth = workerProfile?.leaveYearStartMonth ?? 4
    const firstEntry = entriesForYear[0] || null
    const firstLeaveYearKey = firstEntry?.leaveYearKey ?? null
    const holidayEntries =
        leaveYearStartMonth !== 4 && firstLeaveYearKey
            ? leaveYearGroups.get(firstLeaveYearKey) || entriesForYear
            : entriesForYear
    const leaveYearLabel =
        leaveYearStartMonth !== 4 && firstLeaveYearKey
            ? `Leave year: ${firstLeaveYearKey}`
            : null
    const holidayHours = sumHolidayUnits(holidayEntries)

    if (workerType === 'salary') {
        const basicSalaryAmount = sumSalaryBasicAmount(holidayEntries)
        const holidaySalaryAmount = sumSalaryHolidayAmount(holidayEntries)
        const monthsInYear = new Set(
            holidayEntries.map(
                (/** @type {ReportEntryLike} */ entry) => entry.monthIndex
            )
        ).size
        const workingDaysPerMonth = (typicalDays * 52) / 12
        const dailyRate =
            basicSalaryAmount > 0 && workingDaysPerMonth > 0 && monthsInYear > 0
                ? basicSalaryAmount / monthsInYear / workingDaysPerMonth
                : 0
        const daysTaken = dailyRate > 0 ? holidaySalaryAmount / dailyRate : null
        if (daysTaken !== null) {
            const daysRemainingRaw = statutoryHolidayDays - daysTaken
            return {
                kind: 'salary_days',
                leaveYearLabel,
                holidayAmount: holidaySalaryAmount,
                daysTaken,
                daysRemaining: Math.max(0, daysRemainingRaw),
                overrun: daysRemainingRaw < 0,
            }
        }
        return {
            kind: 'salary_amount',
            leaveYearLabel,
            holidayAmount: holidaySalaryAmount,
        }
    }

    const firstEntryCtx = firstEntry?.holidayContext
    const firstAvgHoursPerDay = firstEntryCtx?.avgHoursPerDay ?? 0
    const firstTypicalDays = firstEntryCtx?.typicalDays ?? 0
    if (
        firstEntryCtx?.hasBaseline &&
        firstAvgHoursPerDay > 0 &&
        firstTypicalDays > 0
    ) {
        const daysTaken = holidayHours / firstAvgHoursPerDay
        const daysRemainingRaw = statutoryHolidayDays - daysTaken
        return {
            kind: 'hourly_days',
            leaveYearLabel,
            holidayHours,
            daysTaken,
            daysRemaining: Math.max(0, daysRemainingRaw),
            overrun: daysRemainingRaw < 0,
        }
    }

    const lastEntryCtx =
        entriesForYear[entriesForYear.length - 1]?.holidayContext
    const lastTypicalDays = lastEntryCtx?.typicalDays ?? null
    const lastEntitlementHours = lastEntryCtx?.entitlementHours ?? 0
    const lastAvgWeeklyHours = lastEntryCtx?.avgWeeklyHours ?? 0
    if (
        lastEntryCtx?.hasBaseline &&
        lastTypicalDays === 0 &&
        lastEntitlementHours > 0
    ) {
        const hoursRemainingRaw = lastEntitlementHours - holidayHours
        return {
            kind: 'hourly_hours',
            leaveYearLabel,
            holidayHours,
            entitlementHours: lastEntitlementHours,
            avgWeeklyHours: lastAvgWeeklyHours,
            hoursRemaining: Math.max(0, hoursRemainingRaw),
            overrun: hoursRemainingRaw < 0,
        }
    }

    return {
        kind: 'hourly_variable',
        leaveYearLabel,
        holidayHours,
        hasVariablePattern: Boolean(
            lastEntryCtx?.hasBaseline && lastEntryCtx.typicalDays === 0
        ),
    }
}
