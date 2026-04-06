import { getWeeksInPeriod } from './tax_year_utils.js'
import { formatFlagLabel } from './flag_catalog.js'
import {
    HOLIDAY_ACCRUAL_CUTOFF,
    HOLIDAY_RATE_TOLERANCE,
} from './uk_thresholds.js'

export { HOLIDAY_RATE_TOLERANCE } from './uk_thresholds.js'

const timing = /** @type {any} */ (globalThis).__payrollTiming || null

/**
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', noteIndex?: number, ruleId?: string, inputs?: Record<string, number | null> }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ level: 'high' | 'medium' | 'low', reasons: string[] }} ReferenceConfidence
 * @typedef {{ hasBaseline: false, typicalDays: number } | { hasBaseline: true, avgWeeklyHours: number, avgHoursPerDay: number, avgRatePerHour: number, typicalDays: number, entitlementHours?: number, useAccrualMethod?: boolean, mixedMonthsIncluded: number, confidence: ReferenceConfidence }} HolidayContext
 * @typedef {{ record: any, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, holidayContext?: HolidayContext }} HolidayEntry
 * @typedef {{
 *   expectedHolidayPay: number,
 *   actualHolidayPay: number,
 *   payVarianceAmount: number,
 *   payVariancePercent: number,
 *   impliedHolidayHours: number,
 *   expectedEntitlementHours: number,
 *   remainingHoursComparison: { recordedRemaining: number, expectedRemaining: number, discrepancyHours: number },
 *   confidence: ReferenceConfidence,
 *   status: 'aligned' | 'review' | 'mismatch',
 *   reasons: string[]
 * }} AnnualHolidayCheckResult
 *
 * AnnualHolidayCheckResult: Annual second-tier reasonableness cross-check for irregular/zero-hours hourly workers.
 * - expectedHolidayPay: recordedHolidayHours × (totalBasicPay ÷ totalBasicHours); computed from leave-year rolling reference.
 * - actualHolidayPay: sum of all holiday pay amounts recorded in the leave year.
 * - payVarianceAmount: actualHolidayPay - expectedHolidayPay (negative = underpaid, positive = overpaid).
 * - payVariancePercent: (payVarianceAmount ÷ expectedHolidayPay) × 100 (null if expectedHolidayPay ≤ 0).
 * - impliedHolidayHours: actualHolidayPay ÷ (totalBasicPay ÷ totalBasicHours); reverse-calculated from actual pay.
 * - expectedEntitlementHours: avgWeeklyHours × 5.6 (statutory entitlement); must match entitlementHours from rolling reference.
 * - remainingHoursComparison: {
 *     recordedRemaining: sum of recorded remaining hours across all leave-year entries,
 *     expectedRemaining: expectedEntitlementHours - recordedHolidayHours,
 *     discrepancyHours: recordedRemaining - expectedRemaining (negative = reported remaining > expected, positive = reported remaining < expected)
 *   }
 * - confidence: composed from reference confidence; cannot exceed reference confidence level. Inherit reasons; append annual-specific reasons (e.g., 'partial leave year', 'holiday pay not separable').
 * - status: 'aligned' if payVariancePercent ≤ ±5% AND discrepancyHours ≤ ±2, 'review' if ±5–15% or ±2–8 hours, 'mismatch' if beyond review thresholds.
 * - reasons: list of human-readable status explanations (e.g., 'actual holiday pay £14.32 below expected', 'recorded remaining hours differ by 4.5 from expected').
 */

const ACCRUAL_CUTOFF = HOLIDAY_ACCRUAL_CUTOFF

/**
 * Returns the start date of the leave year containing the given entry date.
 * @param {Date} entryDate
 * @param {number} leaveYearStartMonth - 1-indexed month (1=Jan, 4=Apr)
 * @returns {Date}
 */
function getLeaveYearStart(entryDate, leaveYearStartMonth) {
    const year = entryDate.getFullYear()
    const month = entryDate.getMonth() + 1
    const leaveYear = month >= leaveYearStartMonth ? year : year - 1
    return new Date(leaveYear, leaveYearStartMonth - 1, 1)
}

/**
 * Pay title substrings (lower-cased) that identify statutory / non-regular pay.
 * A month containing any of these in misc payment titles is excluded from the
 * rolling reference average per ACAS guidance.
 *
 * @type {string[]}
 */
const SKIP_PAY_TITLES = [
    'statutory sick',
    'ssp',
    'maternity',
    'smp',
    'paternity',
    'spp',
    'shpp',
    'statutory adoption',
    'adoption pay',
]

/**
 * @param {HolidayEntry} entry
 * @returns {any}
 */
function getBasicPay(entry) {
    return entry.record?.payrollDoc?.payments?.hourly?.basic ?? null
}

/**
 * @param {HolidayEntry} entry
 * @returns {any}
 */
function getHolidayPay(entry) {
    return entry.record?.payrollDoc?.payments?.hourly?.holiday ?? null
}

/**
 * @param {HolidayEntry} entry
 * @returns {boolean}
 */
function hasSkippedMiscPayments(entry) {
    const misc = entry.record?.payrollDoc?.payments?.misc ?? []
    for (const item of misc) {
        const title = (item.title ?? '').toLowerCase()
        if (SKIP_PAY_TITLES.some((s) => title.includes(s))) {
            return true
        }
    }
    return false
}

/**
 * @param {HolidayEntry} entry
 * @returns {boolean}
 */
function hasPositiveBasicHours(entry) {
    const basic = getBasicPay(entry)
    return Boolean(basic && (basic.units ?? 0) > 0)
}

/**
 * @param {HolidayEntry} entry
 * @returns {boolean}
 */
function hasHolidayPayment(entry) {
    const holiday = getHolidayPay(entry)
    return (holiday?.units ?? 0) > 0 || (holiday?.amount ?? 0) > 0
}

/**
 * @param {HolidayEntry} entry
 * @returns {boolean}
 */
function isMixedMonthCandidate(entry) {
    return (
        hasPositiveBasicHours(entry) &&
        hasHolidayPayment(entry) &&
        !hasSkippedMiscPayments(entry)
    )
}

/**
 * @param {{ limitedData: boolean, totalWeeks: number, mixedMonthsIncluded: number }} params
 * @returns {ReferenceConfidence}
 */
function buildReferenceConfidence({
    limitedData,
    totalWeeks,
    mixedMonthsIncluded,
}) {
    /** @type {string[]} */
    const reasons = []
    if (limitedData) {
        reasons.push(
            `Limited reference: ${Math.round(totalWeeks)} weeks available`
        )
    }
    if (mixedMonthsIncluded > 0) {
        const monthLabel = mixedMonthsIncluded === 1 ? 'month' : 'months'
        reasons.push(
            `Includes ${mixedMonthsIncluded} mixed work+holiday ${monthLabel}`
        )
    }
    /** @type {'high' | 'medium' | 'low'} */
    let level = 'high'
    if (limitedData && mixedMonthsIncluded > 0) {
        level = 'low'
    } else if (limitedData || mixedMonthsIncluded > 0) {
        level = 'medium'
    }
    return { level, reasons }
}

/**
 * @param {HolidayEntry} entry
 * @param {{ mixedMonthsIncluded?: number } | null} ref
 * @returns {void}
 */
function applyMixedMonthLowConfidence(entry, ref) {
    if (!entry.validation || !ref || (ref.mixedMonthsIncluded ?? 0) <= 0) {
        return
    }
    // Mixed-month confidence only affects holiday-rate interpretation.
    // Avoid marking non-holiday periods as low confidence for long runs.
    if (!hasHolidayPayment(entry)) {
        return
    }
    entry.validation.lowConfidence = true
}

/**
 * @param {HolidayEntry} entry
 * @param {ValidationFlag} flag
 */
function pushFlagIfMissing(entry, flag) {
    if (!entry.validation) {
        entry.validation = { flags: [], lowConfidence: false }
    }
    const hasExisting = entry.validation.flags.some(
        (existing) => existing.id === flag.id
    )
    if (!hasExisting) {
        entry.validation.flags.push(flag)
    }
}

/**
 * Returns true when fewer than 3 eligible periods are available for the target.
 * Mirrors rolling-reference inclusion rules without changing buildRollingReference's return contract.
 * @param {HolidayEntry[]} sortedEntries
 * @param {HolidayEntry} targetEntry
 * @returns {boolean}
 */
function hasInsufficientReferencePeriods(sortedEntries, targetEntry) {
    const targetDate = targetEntry.parsedDate
    if (!targetDate) {
        return false
    }
    const cutoff = new Date(targetDate)
    cutoff.setDate(cutoff.getDate() - 104 * 7)
    const cutoffMs = cutoff.getTime()
    let periodsCounted = 0
    /** @type {Set<string>} */
    const monthsSeen = new Set()

    for (let i = sortedEntries.length - 1; i >= 0; i -= 1) {
        const entry = sortedEntries[i]
        if (entry === targetEntry) {
            continue
        }
        const entryDate = entry.parsedDate
        if (!entryDate) {
            continue
        }
        if (entryDate >= targetDate) {
            continue
        }
        if (entryDate.getTime() < cutoffMs) {
            break
        }
        const monthKey = `${entryDate.getFullYear()}:${entry.monthIndex}`
        if (monthsSeen.has(monthKey)) {
            continue
        }
        let shouldInclude = false
        if (isReferenceEligible(entry)) {
            shouldInclude = true
        } else if (isGatePassingMixedMonth(sortedEntries, entry)) {
            shouldInclude = true
        }
        if (!shouldInclude) {
            continue
        }
        monthsSeen.add(monthKey)
        periodsCounted += 1
        if (periodsCounted >= 3) {
            return false
        }
    }

    return true
}

/**
 * @param {HolidayEntry[]} sortedEntries
 * @param {HolidayEntry} targetEntry
 * @returns {{ totalBasicPay: number, totalBasicHours: number, totalWeeks: number, periodsCounted: number, limitedData: boolean, mixedMonthsIncluded: number, confidence: ReferenceConfidence } | null}
 */
function buildPureRollingReference(sortedEntries, targetEntry) {
    return buildRollingReference(sortedEntries, targetEntry, { pureOnly: true })
}

/**
 * @param {HolidayEntry[]} sortedEntries
 * @param {HolidayEntry} mixedEntry
 * @returns {boolean}
 */
export function isGatePassingMixedMonth(sortedEntries, mixedEntry) {
    if (!isMixedMonthCandidate(mixedEntry) || !mixedEntry.parsedDate) {
        return false
    }
    const pureRef = buildPureRollingReference(sortedEntries, mixedEntry)
    if (!pureRef || pureRef.totalWeeks < 12 || pureRef.totalBasicHours <= 0) {
        return false
    }
    const expectedHours =
        (pureRef.totalBasicHours / pureRef.totalWeeks) *
        getWeeksInPeriod(mixedEntry.parsedDate)
    if (expectedHours <= 0) {
        return false
    }
    const actualHours = getBasicPay(mixedEntry)?.units ?? 0
    return actualHours / expectedHours >= 0.75
}

/**
 * Returns true if this entry should be included in the rolling reference average.
 *
 * An entry is ineligible when:
 * - basic hours are zero or absent (worker was not paid basic that period)
 * - misc payments contain a statutory/non-regular pay title
 * - the entry itself carries holiday pay (the reference must be prior paid weeks)
 *
 * @param {HolidayEntry} entry
 * @returns {boolean}
 */
export function isReferenceEligible(entry) {
    if (!hasPositiveBasicHours(entry)) {
        return false
    }
    if (hasHolidayPayment(entry)) {
        return false
    }
    if (hasSkippedMiscPayments(entry)) {
        return false
    }
    return true
}

/**
 * Builds a rolling 52-week reference average of basic pay for a given target entry,
 * looking back up to 104 weeks from the target date.
 *
 * Per ACAS guidance for irregular hours / part-year workers:
 * - Only count weeks where the worker received their usual pay (no SSP/SMP/SPP etc.)
 * - Stop once 52 eligible weeks have been accumulated
 * - If fewer than 52 eligible weeks are found within 104 weeks, use what is available
 * - Returns null when fewer than 3 eligible periods are found (not enough data to flag)
 *
 * Deduplicates weeks per calendar month per year to avoid double-counting duplicate payslips.
 *
 * @param {HolidayEntry[]} sortedEntries - All entries sorted ascending by parsedDate
 * @param {HolidayEntry} targetEntry - The payslip containing holiday pay
 * @param {{ pureOnly?: boolean }} [options]
 * @returns {{ totalBasicPay: number, totalBasicHours: number, totalWeeks: number, periodsCounted: number, limitedData: boolean, mixedMonthsIncluded: number, confidence: ReferenceConfidence } | null}
 */
export function buildRollingReference(
    sortedEntries,
    targetEntry,
    options = {}
) {
    const timingEnabled = Boolean(timing?.enabled)
    const startedAt = timingEnabled ? globalThis.performance.now() : 0
    const pureOnly = Boolean(options.pureOnly)
    const targetDate = targetEntry.parsedDate
    if (!targetDate) {
        if (timingEnabled) {
            timing.increment('rollingReference.calls')
            timing.increment('rollingReference.nullTargetDate')
            timing.record(
                'rollingReference.total',
                globalThis.performance.now() - startedAt
            )
        }
        return null
    }
    const cutoff = new Date(targetDate)
    cutoff.setDate(cutoff.getDate() - 104 * 7)
    const cutoffMs = cutoff.getTime()

    let totalBasicPay = 0
    let totalBasicHours = 0
    let totalWeeks = 0
    let periodsCounted = 0
    let mixedMonthsIncluded = 0
    let scannedEntries = 0
    /** @type {Set<string>} — `yearKey:monthIndex` to deduplicate same-month payslips */
    const monthsSeen = new Set()

    for (let i = sortedEntries.length - 1; i >= 0; i--) {
        const entry = sortedEntries[i]
        scannedEntries += 1
        if (entry === targetEntry) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.targetEntry')
            }
            continue
        }
        const entryDate = entry.parsedDate
        if (!entryDate) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.noDate')
            }
            continue
        }
        if (entryDate >= targetDate) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.notBeforeTarget')
            }
            continue
        }
        if (entryDate.getTime() < cutoffMs) {
            if (timingEnabled) {
                timing.increment('rollingReference.break.cutoff')
            }
            break
        }
        const calYear = entryDate.getFullYear()
        const monthKey = `${calYear}:${entry.monthIndex}`
        if (monthsSeen.has(monthKey)) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.duplicateMonth')
            }
            continue
        }
        let shouldInclude = false
        let countedAsMixedMonth = false
        if (isReferenceEligible(entry)) {
            shouldInclude = true
        } else if (!pureOnly && isGatePassingMixedMonth(sortedEntries, entry)) {
            shouldInclude = true
            countedAsMixedMonth = true
        }
        if (!shouldInclude) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.ineligible')
            }
            continue
        }
        monthsSeen.add(monthKey)

        const basic = getBasicPay(entry)
        const weeks = getWeeksInPeriod(entryDate)
        totalBasicPay += basic.amount ?? 0
        totalBasicHours += basic.units ?? 0
        totalWeeks += weeks
        periodsCounted += 1
        if (countedAsMixedMonth) {
            mixedMonthsIncluded += 1
            if (timingEnabled) {
                timing.increment('rollingReference.include.mixedMonth')
            }
        }

        if (totalWeeks >= 52) {
            break
        }
    }

    if (timingEnabled) {
        timing.increment('rollingReference.calls')
        timing.increment('rollingReference.scannedEntries', scannedEntries)
        timing.increment('rollingReference.periodsCounted', periodsCounted)
        timing.recordMax('rollingReference.maxScannedEntries', scannedEntries)
        timing.recordMax('rollingReference.maxPeriodsCounted', periodsCounted)
    }

    if (periodsCounted < 3) {
        if (timingEnabled) {
            timing.increment('rollingReference.nullResult')
            timing.record(
                'rollingReference.total',
                globalThis.performance.now() - startedAt
            )
        }
        return null
    }
    const result = {
        totalBasicPay,
        totalBasicHours,
        totalWeeks,
        periodsCounted,
        limitedData: totalWeeks < 52,
        mixedMonthsIncluded,
        confidence: buildReferenceConfidence({
            limitedData: totalWeeks < 52,
            totalWeeks,
            mixedMonthsIncluded,
        }),
    }
    if (timingEnabled) {
        if (result.limitedData) {
            timing.increment('rollingReference.limitedData')
        }
        timing.record(
            'rollingReference.total',
            globalThis.performance.now() - startedAt
        )
    }
    return result
}

/**
 * Appends holiday-rate anomaly flags to each entry's validation.flags array.
 *
 * Signal A: holiday implied rate below basic rate on the same payslip.
 * Signal B: holiday implied rate below the 52-week rolling average basic rate
 *           (catches pay-rise scenarios and cross-year underpayment).
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
    if (timing?.enabled) {
        timing.start('holidayFlags.total')
        timing.increment('holidayFlags.calls')
        timing.increment('holidayFlags.entriesSeen', entries.length)
    }
    const sortedEntries = [...entries].sort((a, b) => {
        const aTime = a.parsedDate?.getTime() ?? 0
        const bTime = b.parsedDate?.getTime() ?? 0
        return aTime - bTime
    })

    for (const entry of entries) {
        const hourly = entry.record?.payrollDoc?.payments?.hourly
        const basic = hourly?.basic
        const holiday = hourly?.holiday

        const holidayUnits = holiday?.units ?? 0
        const holidayAmount = holiday?.amount ?? 0

        if (holidayUnits <= 0 || holidayAmount <= 0) {
            continue
        }
        if (timing?.enabled) {
            timing.increment('holidayFlags.entriesWithHolidayPay')
            timing.increment('holidayFlags.rollingReferenceCalls')
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

        const ref = buildRollingReference(sortedEntries, entry)
        applyMixedMonthLowConfidence(entry, ref)

        if (!ref && hasHolidayPayment(entry)) {
            const shouldMarkInsufficientHistory =
                hasInsufficientReferencePeriods(sortedEntries, entry)
            if (shouldMarkInsufficientHistory) {
                entry.validation.lowConfidence = true
                pushFlagIfMissing(entry, {
                    id: 'holiday_reference_insufficient_history',
                    severity: 'notice',
                    label: formatFlagLabel(
                        'holiday_reference_insufficient_history'
                    ),
                    ruleId: 'holiday_reference_insufficient_history',
                    inputs: {},
                })
            }
        }

        if (
            ref &&
            (ref.mixedMonthsIncluded ?? 0) > 0 &&
            isMixedMonthCandidate(entry)
        ) {
            pushFlagIfMissing(entry, {
                id: 'holiday_mixed_basic_holiday_pay',
                severity: 'notice',
                label: formatFlagLabel('holiday_mixed_basic_holiday_pay'),
                ruleId: 'holiday_mixed_basic_holiday_pay',
                inputs: {
                    mixedMonthsIncluded: ref.mixedMonthsIncluded,
                },
            })
        }

        const holidayMatchesBasic =
            basicRate !== null &&
            Math.abs(basicRate - impliedHolidayRate) <= HOLIDAY_RATE_TOLERANCE

        const rollingAvgRate =
            ref && ref.totalBasicHours > 0
                ? ref.totalBasicPay / ref.totalBasicHours
                : null
        const rollingAvgFlagWillFire =
            ref !== null &&
            !holidayMatchesBasic &&
            rollingAvgRate !== null &&
            rollingAvgRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE

        if (
            basicRate !== null &&
            basicRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE &&
            !rollingAvgFlagWillFire
        ) {
            entry.validation.flags.push({
                id: 'holiday_rate_below_basic',
                label: formatFlagLabel('holiday_rate_below_basic', {
                    impliedHolidayRate,
                    basicRate,
                }),
                ruleId: 'holiday_rate_below_basic',
                inputs: { impliedHolidayRate, basicRate },
            })
            if (timing?.enabled) {
                timing.increment('holidayFlags.flag.holiday_rate_below_basic')
            }
        }

        if (rollingAvgFlagWillFire) {
            entry.validation.flags.push({
                id: 'holiday_rate_below_rolling_avg',
                label: formatFlagLabel('holiday_rate_below_rolling_avg', {
                    impliedHolidayRate,
                    rollingAvgRate,
                    totalWeeks: ref.totalWeeks,
                    periodsCounted: ref.periodsCounted,
                    limitedData: ref.limitedData,
                    mixedMonthsIncluded: ref.mixedMonthsIncluded,
                }),
                ruleId: 'holiday_rate_below_rolling_avg',
                inputs: {
                    impliedHolidayRate,
                    rollingAvgRate,
                    totalWeeks: ref.totalWeeks,
                    periodsCounted: ref.periodsCounted,
                    mixedMonthsIncluded: ref.mixedMonthsIncluded,
                },
            })
            if (timing?.enabled) {
                timing.increment(
                    'holidayFlags.flag.holiday_rate_below_rolling_avg'
                )
            }
        }
    }
    if (timing?.enabled) {
        timing.end('holidayFlags.total')
    }
}

/**
 * Computes rolling 52-week holiday context for each entry and stores it as entry.holidayContext.
 *
 * holidayContext: { avgWeeklyHours, avgHoursPerDay, avgRatePerHour, hasBaseline, typicalDays }
 * hasBaseline is false when fewer than 3 months of basic hours exist in the rolling window.
 *
 * @param {HolidayEntry[]} entries
 * @param {{ workerType?: string, typicalDays?: number, statutoryHolidayDays?: number | null, leaveYearStartMonth?: number } | null} workerProfile
 * @returns {void}
 */
export function buildYearHolidayContext(entries, workerProfile) {
    if (timing?.enabled) {
        timing.start('holidayContext.total')
        timing.increment('holidayContext.calls')
        timing.increment('holidayContext.entriesSeen', entries.length)
    }
    const typicalDays =
        workerProfile?.typicalDays != null && workerProfile.typicalDays >= 0
            ? workerProfile.typicalDays
            : 0
    const leaveYearStartMonth = workerProfile?.leaveYearStartMonth ?? 4

    const sortedEntries = [...entries].sort((a, b) => {
        const aTime = a.parsedDate?.getTime() ?? 0
        const bTime = b.parsedDate?.getTime() ?? 0
        return aTime - bTime
    })

    for (const entry of entries) {
        if (timing?.enabled) {
            timing.increment('holidayContext.rollingReferenceCalls')
        }
        const ref = buildRollingReference(sortedEntries, entry)
        applyMixedMonthLowConfidence(entry, ref)

        /** @type {any} */
        const anyEntry = entry
        if (!ref || ref.totalBasicHours <= 0) {
            anyEntry.holidayContext = { hasBaseline: false, typicalDays }
            if (timing?.enabled) {
                timing.increment('holidayContext.noBaseline')
            }
            continue
        }

        const avgWeeklyHours = ref.totalBasicHours / ref.totalWeeks
        const avgHoursPerDay =
            typicalDays > 0 ? avgWeeklyHours / typicalDays : 0
        const avgRatePerHour = ref.totalBasicPay / ref.totalBasicHours
        const useAccrual =
            typicalDays === 0 && entry.parsedDate
                ? getLeaveYearStart(entry.parsedDate, leaveYearStartMonth) >=
                  ACCRUAL_CUTOFF
                : false

        anyEntry.holidayContext = {
            hasBaseline: true,
            avgWeeklyHours,
            avgHoursPerDay,
            avgRatePerHour,
            typicalDays,
            mixedMonthsIncluded: ref.mixedMonthsIncluded,
            confidence: ref.confidence,
            entitlementHours:
                typicalDays === 0 && avgWeeklyHours > 0
                    ? avgWeeklyHours * 5.6
                    : undefined,
            useAccrualMethod:
                typicalDays === 0 && avgWeeklyHours > 0
                    ? useAccrual
                    : undefined,
        }
        if (timing?.enabled) {
            timing.increment('holidayContext.hasBaseline')
            if (typicalDays === 0 && avgWeeklyHours > 0) {
                timing.increment('holidayContext.zeroHoursBaseline')
            }
        }
    }
    if (timing?.enabled) {
        timing.end('holidayContext.total')
    }
}

/**
 * Calculates an annual second-tier reasonableness cross-check for irregular/zero-hours hourly workers.
 * Composes confidence from the rolling reference confidence, constraining annual confidence to match.
 *
 * Returns null if baseline is missing, holiday hours are zero, or holiday pay is zero.
 * Otherwise returns an AnnualHolidayCheckResult with full traceability.
 *
 * @param {number} totalHolidayHours - accumulated holiday hours for the leave year
 * @param {number} totalHolidayPay - accumulated holiday pay amount for the leave year
 * @param {number} recordedRemaining - recorded remaining hours as of end of leave year
 * @param {any} ref - rolling reference result from buildRollingReference (assumed to have totalBasicPay, totalBasicHours, confidence, mixedMonthsIncluded)
 * @param {{ expectedEntitlementHours?: number, hasIndependentRemainingSource?: boolean }} [options] - optional overrides
 * @returns {AnnualHolidayCheckResult | null}
 */
export function buildAnnualHolidayCheckResult(
    totalHolidayHours,
    totalHolidayPay,
    recordedRemaining,
    ref,
    options
) {
    if (timing?.enabled) {
        timing.start('annualCheck.total')
        timing.increment('annualCheck.calls')
    }

    // Null/no-output cases: no baseline, zero holiday hours, zero holiday pay.
    if (
        !ref ||
        ref.totalBasicHours <= 0 ||
        totalHolidayHours <= 0 ||
        totalHolidayPay <= 0
    ) {
        if (timing?.enabled) {
            timing.end('annualCheck.total')
        }
        return null
    }

    if (timing?.enabled) {
        timing.increment('annualCheck.emittedResults')
    }

    const avgHourlyRate = ref.totalBasicPay / ref.totalBasicHours
    const expectedHolidayPay = totalHolidayHours * avgHourlyRate
    const payVarianceAmount = totalHolidayPay - expectedHolidayPay
    const payVariancePercent =
        expectedHolidayPay > 0
            ? (payVarianceAmount / expectedHolidayPay) * 100
            : 0
    const impliedHolidayHours =
        avgHourlyRate > 0 ? totalHolidayPay / avgHourlyRate : 0
    const avgWeeklyHours = ref.totalBasicHours / ref.totalWeeks
    const expectedEntitlementHours =
        options?.expectedEntitlementHours != null
            ? options.expectedEntitlementHours
            : avgWeeklyHours * 5.6
    const expectedRemaining = expectedEntitlementHours - totalHolidayHours
    const discrepancyHours = recordedRemaining - expectedRemaining
    const hasIndependentRemainingSource = Boolean(
        options?.hasIndependentRemainingSource
    )

    // Compose confidence: annual confidence cannot exceed reference confidence.
    /** @type {ReferenceConfidence} */
    const confidenceLevel = ref.confidence ?? {
        level: 'high',
        reasons: [],
    }
    /** @type {'high' | 'medium' | 'low'} */
    let annualDataQuality = 'high'
    const annualReasons = [...(confidenceLevel.reasons ?? [])]

    // Downgrade if we have limited data or mixed months in the reference.
    if (confidenceLevel.level === 'medium') {
        annualDataQuality = 'medium'
    } else if (confidenceLevel.level === 'low') {
        annualDataQuality = 'low'
    }
    if (!annualReasons.includes('leave year reference-informed')) {
        annualReasons.push('leave year reference-informed')
    }
    if (!hasIndependentRemainingSource) {
        annualReasons.push(
            'remaining hours are model-derived (no independent leave ledger)'
        )
    }

    // Determine status based on thresholds.
    // Aligned: payVariancePercent <= +/-5 and, when independent remaining data exists, discrepancyHours <= +/-2.
    // Review: +/-5-15 pay variance, or (with independent remaining data) +/-2-8 hours discrepancy.
    // Mismatch: beyond review thresholds.
    const remainingDiscrepancyForStatus = hasIndependentRemainingSource
        ? Math.abs(discrepancyHours)
        : 0
    const isAligned =
        Math.abs(payVariancePercent) <= 5 && remainingDiscrepancyForStatus <= 2
    const isReview =
        (Math.abs(payVariancePercent) > 5 &&
            Math.abs(payVariancePercent) <= 15) ||
        (hasIndependentRemainingSource &&
            Math.abs(discrepancyHours) > 2 &&
            Math.abs(discrepancyHours) <= 8)
    const status = isAligned ? 'aligned' : isReview ? 'review' : 'mismatch'

    // Build reasons list based on status.
    const statusReasons = []
    if (!isAligned) {
        if (Math.abs(payVariancePercent) > 5) {
            const direction = payVarianceAmount < 0 ? 'below' : 'above'
            statusReasons.push(
                `actual holiday pay £${Math.abs(payVarianceAmount).toFixed(2)} ${direction} expected ` +
                    `(${Math.abs(payVariancePercent).toFixed(1)}%)`
            )
        }
        if (Math.abs(discrepancyHours) > 2) {
            const direction = discrepancyHours < 0 ? 'more' : 'fewer'
            statusReasons.push(
                `recorded remaining ${direction} than expected by ${Math.abs(discrepancyHours).toFixed(1)} hours`
            )
        }
    } else {
        statusReasons.push(
            'annual holiday pay and hours reconcile within expected variance'
        )
    }

    /** @type {AnnualHolidayCheckResult} */
    const result = {
        expectedHolidayPay,
        actualHolidayPay: totalHolidayPay,
        payVarianceAmount,
        payVariancePercent,
        impliedHolidayHours,
        expectedEntitlementHours,
        remainingHoursComparison: {
            recordedRemaining,
            expectedRemaining,
            discrepancyHours,
        },
        confidence: {
            level: annualDataQuality,
            reasons: annualReasons,
        },
        status,
        reasons: statusReasons,
    }

    if (timing?.enabled) {
        timing.end('annualCheck.total')
    }

    return result
}
