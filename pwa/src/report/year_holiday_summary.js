import { formatMonthLabel } from '../parse/parser_config.js'
import { buildAnnualHolidayCheckResult } from './holiday_calculations.js'
import { getCalendarMonthFromFiscalIndex } from './tax_year_utils.js'

/**
 * @typedef {{
 *   hasBaseline?: boolean,
 *   avgHoursPerDay?: number,
 *   avgWeeklyHours?: number,
 *   avgRatePerHour?: number,
 *   typicalDays?: number,
 *   entitlementHours?: number,
 *   useAccrualMethod?: boolean,
 *   mixedMonthsIncluded?: number,
 *   confidence?: { level: 'high' | 'medium' | 'low', reasons: string[] },
 * }} HolidayContextLike
 */

/**
 * @typedef {{
 *   record?: any,
 *   monthIndex?: number,
 *   leaveYearKey?: string | null,
 *   holidayContext?: HolidayContextLike | null,
 *   validation?: { flags?: Array<{ id?: string, noteIndex?: number, label?: string }> } | null,
 *   parsedDate?: Date | null,
 * }} ReportEntryLike
 */

/**
 * @typedef {Array<ReportEntryLike> & { reconciliation?: any | null }} YearEntriesLike
 */

/**
 * @typedef {{ workerType?: string | null, typicalDays?: number, statutoryHolidayDays?: number | null, leaveYearStartMonth?: number }} WorkerProfileLike
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
 *   accruedHours: number | null,
 * }} EntryHolidaySummaryHoursOnly
 */

/**
 * @typedef {EntryHolidaySummaryHoursDays | EntryHolidaySummaryHoursOnly} EntryHolidaySummary
 */

/**
 * @typedef {{
 *   hasBaseline: boolean,
 *   avgWeeklyHours: number | null,
 *   avgRatePerHour: number | null,
 *   mixedMonthsIncluded: number,
 *   confidenceLevel: 'high' | 'medium' | 'low' | null,
 * }} AnnualReferenceState
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 * }} AnnualSignal
 */

/**
 * @typedef {{
 *   monthIndex: number,
 *   monthLabel: string,
 *   basicHours: number,
 *   holidayHours: number,
 *   estimatedDays: number | null,
 *   referenceState: AnnualReferenceState,
 *   mixedMonthIncluded: boolean,
 *   signalsFired: AnnualSignal[],
 * }} AnnualMonthBreakdownEntry
 */

/**
 * @typedef {{
 *   expectedHolidayPay: number,
 *   actualHolidayPay: number,
 *   payVarianceAmount: number,
 *   payVariancePercent: number,
 *   impliedHolidayHours: number,
 *   expectedEntitlementHours: number,
 *   remainingHoursComparison: { recordedRemaining: number, expectedRemaining: number, discrepancyHours: number },
 *   confidence: { level: 'high' | 'medium' | 'low', reasons: string[] },
 *   status: 'aligned' | 'review' | 'mismatch',
 *   reasons: string[],
 *   monthBreakdown: AnnualMonthBreakdownEntry[],
 * }} AnnualHolidayCheckSummaryResult
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
 *   entitlementHours: number,
 *   hoursRemaining: number,
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
 *   useAccrualMethod: boolean,
 *   annualCrossCheck?: AnnualHolidayCheckSummaryResult,
 *   monthBreakdown?: AnnualMonthBreakdownEntry[],
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
 * @param {ReportEntryLike[]} entries
 * @returns {number}
 */
function sumBasicHours(entries) {
    return entries.reduce(
        /** @param {number} acc @param {ReportEntryLike} entry */ (
            acc,
            entry
        ) =>
            acc +
            (entry.record?.payrollDoc?.payments?.hourly?.basic?.units || 0),
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
 * @returns {number}
 */
function sumHourlyHolidayAmount(entries) {
    return entries.reduce(
        /** @param {number} acc @param {ReportEntryLike} entry */ (
            acc,
            entry
        ) =>
            acc +
            (entry.record?.payrollDoc?.payments?.hourly?.holiday?.amount || 0),
        0
    )
}

/**
 * @param {HolidayContextLike | null | undefined} holidayContext
 * @returns {{ totalBasicPay: number, totalBasicHours: number, totalWeeks: number, periodsCounted: number, limitedData: boolean, mixedMonthsIncluded: number, confidence: { level: 'high' | 'medium' | 'low', reasons: string[] } } | null}
 */
function buildAnnualSyntheticReference(holidayContext) {
    const avgWeeklyHours = holidayContext?.avgWeeklyHours ?? 0
    const avgRatePerHour = holidayContext?.avgRatePerHour ?? 0
    if (
        !holidayContext?.hasBaseline ||
        avgWeeklyHours <= 0 ||
        avgRatePerHour <= 0
    ) {
        return null
    }
    return {
        totalBasicPay: avgWeeklyHours * avgRatePerHour,
        totalBasicHours: avgWeeklyHours,
        totalWeeks: 1,
        periodsCounted: 1,
        limitedData: false,
        mixedMonthsIncluded: holidayContext.mixedMonthsIncluded ?? 0,
        confidence: holidayContext.confidence ?? {
            level: 'medium',
            reasons: ['missing reference confidence'],
        },
    }
}

/**
 * @param {'high' | 'medium' | 'low'} left
 * @param {'high' | 'medium' | 'low'} right
 * @returns {'high' | 'medium' | 'low'}
 */
function minConfidenceLevel(left, right) {
    const rank = { high: 3, medium: 2, low: 1 }
    return rank[left] <= rank[right] ? left : right
}

/**
 * @param {ReportEntryLike[]} entriesForYear
 * @returns {AnnualMonthBreakdownEntry[]}
 */
function buildAnnualMonthBreakdown(entriesForYear) {
    /** @type {Map<number, ReportEntryLike[]>} */
    const entriesByMonth = new Map()
    entriesForYear.forEach((entry) => {
        const monthIndex = entry.monthIndex ?? -1
        if (monthIndex < 1 || monthIndex > 12) {
            return
        }
        if (!entriesByMonth.has(monthIndex)) {
            entriesByMonth.set(monthIndex, [])
        }
        const existing = entriesByMonth.get(monthIndex)
        if (existing) {
            existing.push(entry)
        }
    })

    return Array.from(entriesByMonth.entries())
        .sort(([left], [right]) => left - right)
        .map(([monthIndex, monthEntries]) => {
            const sortedMonthEntries = [...monthEntries].sort((left, right) => {
                const leftTime = left.parsedDate?.getTime() ?? 0
                const rightTime = right.parsedDate?.getTime() ?? 0
                return leftTime - rightTime
            })
            const lastEntry =
                sortedMonthEntries[sortedMonthEntries.length - 1] || null
            const lastContext = lastEntry?.holidayContext ?? null
            const basicHours = sortedMonthEntries.reduce(
                (sum, entry) =>
                    sum +
                    (entry.record?.payrollDoc?.payments?.hourly?.basic?.units ||
                        0),
                0
            )
            const holidayHours = sumHolidayUnits(sortedMonthEntries)
            const estimatedDays =
                (lastContext?.avgHoursPerDay ?? 0) > 0
                    ? holidayHours / (lastContext?.avgHoursPerDay ?? 1)
                    : null
            const signalsById = new Map()
            sortedMonthEntries.forEach((entry) => {
                ;(entry.validation?.flags || []).forEach((flag) => {
                    const id = flag.id || `note-${flag.noteIndex || 'unknown'}`
                    if (!signalsById.has(id)) {
                        signalsById.set(id, {
                            id,
                            label: flag.label || id,
                        })
                    }
                })
            })
            const calendarMonthIndex =
                getCalendarMonthFromFiscalIndex(monthIndex)
            return {
                monthIndex,
                monthLabel: calendarMonthIndex
                    ? formatMonthLabel(calendarMonthIndex)
                    : 'Unknown',
                basicHours,
                holidayHours,
                estimatedDays,
                referenceState: {
                    hasBaseline: Boolean(lastContext?.hasBaseline),
                    avgWeeklyHours: lastContext?.avgWeeklyHours ?? null,
                    avgRatePerHour: lastContext?.avgRatePerHour ?? null,
                    mixedMonthsIncluded: lastContext?.mixedMonthsIncluded ?? 0,
                    confidenceLevel: lastContext?.confidence?.level ?? null,
                },
                mixedMonthIncluded: (lastContext?.mixedMonthsIncluded ?? 0) > 0,
                signalsFired: Array.from(signalsById.values()),
            }
        })
}

/**
 * @param {ReportEntryLike[]} holidayEntries
 * @param {HolidayContextLike | null | undefined} holidayContext
 * @param {number} holidayHours
 * @param {number} recordedRemaining
 * @param {number | null | undefined} expectedEntitlementHours
 * @param {boolean} hasIndependentRemainingSource
 * @returns {AnnualHolidayCheckSummaryResult | null}
 */
function buildAnnualHolidayCheckSummary(
    holidayEntries,
    holidayContext,
    holidayHours,
    recordedRemaining,
    expectedEntitlementHours,
    hasIndependentRemainingSource
) {
    const syntheticReference = buildAnnualSyntheticReference(holidayContext)
    const totalHolidayPay = sumHourlyHolidayAmount(holidayEntries)
    const annualCrossCheck = buildAnnualHolidayCheckResult(
        holidayHours,
        totalHolidayPay,
        recordedRemaining,
        syntheticReference,
        {
            expectedEntitlementHours:
                expectedEntitlementHours != null
                    ? expectedEntitlementHours
                    : undefined,
            hasIndependentRemainingSource,
        }
    )
    if (!annualCrossCheck) {
        return null
    }

    const monthBreakdown = buildAnnualMonthBreakdown(holidayEntries)
    const confidenceReasons = [...annualCrossCheck.confidence.reasons]
    if (!confidenceReasons.includes('basic pay reference only')) {
        confidenceReasons.push('basic pay reference only')
    }
    /** @type {'high' | 'medium' | 'low'} */
    let annualDataConfidence = 'medium'
    if (monthBreakdown.length < 12) {
        annualDataConfidence = 'low'
        if (!confidenceReasons.includes('partial leave year')) {
            confidenceReasons.push('partial leave year')
        }
    }

    return {
        ...annualCrossCheck,
        confidence: {
            level: minConfidenceLevel(
                annualCrossCheck.confidence.level,
                annualDataConfidence
            ),
            reasons: confidenceReasons,
        },
        monthBreakdown,
    }
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

    const basicHours =
        entry.record?.payrollDoc?.payments?.hourly?.basic?.units ?? 0
    const useAccrual = entryCtx?.useAccrualMethod ?? false
    const accruedHours =
        entryCtx?.hasBaseline &&
        entryCtx.typicalDays === 0 &&
        useAccrual &&
        basicHours > 0
            ? basicHours * 0.1207
            : null

    return {
        kind: 'hours_only',
        holidayHours,
        hasVariablePattern: Boolean(
            entryCtx?.hasBaseline && entryCtx.typicalDays === 0
        ),
        accruedHours,
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
    const typicalDays = workerProfile?.typicalDays ?? 0
    const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? null
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
        if (daysTaken !== null && statutoryHolidayDays !== null) {
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

    /** Scan backwards for the last entry with a usable baseline (most data). */
    let baselineCtx = null
    for (let i = entriesForYear.length - 1; i >= 0; i--) {
        const ctx = entriesForYear[i]?.holidayContext
        if (
            ctx?.hasBaseline &&
            (ctx.avgHoursPerDay ?? 0) > 0 &&
            (ctx.typicalDays ?? 0) > 0
        ) {
            baselineCtx = ctx
            break
        }
    }
    const baselineAvgHoursPerDay = baselineCtx?.avgHoursPerDay ?? 0
    const baselineTypicalDays = baselineCtx?.typicalDays ?? 0
    if (
        baselineCtx?.hasBaseline &&
        baselineAvgHoursPerDay > 0 &&
        baselineTypicalDays > 0
    ) {
        const daysTaken = holidayHours / baselineAvgHoursPerDay
        if (statutoryHolidayDays !== null) {
            const daysRemainingRaw = statutoryHolidayDays - daysTaken
            const entitlementHours =
                statutoryHolidayDays * baselineAvgHoursPerDay
            const hoursRemainingRaw = entitlementHours - holidayHours
            return {
                kind: 'hourly_days',
                leaveYearLabel,
                holidayHours,
                entitlementHours,
                hoursRemaining: Math.max(0, hoursRemainingRaw),
                daysTaken,
                daysRemaining: Math.max(0, daysRemainingRaw),
                overrun: daysRemainingRaw < 0,
            }
        }
    }

    const lastEntryCtx =
        entriesForYear[entriesForYear.length - 1]?.holidayContext
    const lastTypicalDays = lastEntryCtx?.typicalDays ?? null
    const lastEntitlementHours = lastEntryCtx?.entitlementHours ?? 0
    const lastAvgWeeklyHours = lastEntryCtx?.avgWeeklyHours ?? 0
    const lastUseAccrual = lastEntryCtx?.useAccrualMethod ?? false
    if (
        lastEntryCtx?.hasBaseline &&
        lastTypicalDays === 0 &&
        lastEntitlementHours > 0
    ) {
        const leaveYearBasicHours = lastUseAccrual
            ? sumBasicHours(holidayEntries)
            : 0
        const effectiveEntitlementHours =
            lastUseAccrual && leaveYearBasicHours > 0
                ? leaveYearBasicHours * 0.1207
                : lastEntitlementHours
        const hoursRemainingRaw = effectiveEntitlementHours - holidayHours
        const annualCrossCheck = buildAnnualHolidayCheckSummary(
            holidayEntries,
            lastEntryCtx,
            holidayHours,
            hoursRemainingRaw,
            effectiveEntitlementHours,
            false
        )
        return {
            kind: 'hourly_hours',
            leaveYearLabel,
            holidayHours,
            entitlementHours: effectiveEntitlementHours,
            avgWeeklyHours: lastAvgWeeklyHours,
            hoursRemaining: Math.max(0, hoursRemainingRaw),
            overrun: hoursRemainingRaw < 0,
            useAccrualMethod: lastUseAccrual,
            annualCrossCheck: annualCrossCheck || undefined,
            monthBreakdown: annualCrossCheck?.monthBreakdown || undefined,
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
