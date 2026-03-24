import { getWeeksInPeriod } from './tax_year_utils.js'

const timing = /** @type {any} */ (globalThis).__payrollTiming || null

/**
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ hasBaseline: false, typicalDays: number } | { hasBaseline: true, avgWeeklyHours: number, avgHoursPerDay: number, avgRatePerHour: number, typicalDays: number, entitlementHours?: number, useAccrualMethod?: boolean }} HolidayContext
 * @typedef {{ record: any, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, holidayContext?: HolidayContext }} HolidayEntry
 */

/** @type {number} £0.05/hr tolerance — covers float rounding without masking real discrepancies */
export const HOLIDAY_RATE_TOLERANCE = 0.05

/** Leave years starting on or after this date use the 12.07% accrual method */
const ACCRUAL_CUTOFF = new Date(2024, 3, 1) // 1 April 2024

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
    const basic = entry.record?.payrollDoc?.payments?.hourly?.basic
    if (!basic || (basic.units ?? 0) <= 0) {
        return false
    }
    const holiday = entry.record?.payrollDoc?.payments?.hourly?.holiday
    if ((holiday?.units ?? 0) > 0 || (holiday?.amount ?? 0) > 0) {
        return false
    }
    const misc = entry.record?.payrollDoc?.payments?.misc ?? []
    for (const item of misc) {
        const title = (item.title ?? '').toLowerCase()
        if (SKIP_PAY_TITLES.some((s) => title.includes(s))) {
            return false
        }
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
 * @returns {{ totalBasicPay: number, totalBasicHours: number, totalWeeks: number, periodsCounted: number, limitedData: boolean } | null}
 */
export function buildRollingReference(sortedEntries, targetEntry) {
    const timingEnabled = Boolean(timing?.enabled)
    const startedAt = timingEnabled ? globalThis.performance.now() : 0
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
        if (!isReferenceEligible(entry)) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.ineligible')
            }
            continue
        }
        const calYear = entryDate.getFullYear()
        const monthKey = `${calYear}:${entry.monthIndex}`
        if (monthsSeen.has(monthKey)) {
            if (timingEnabled) {
                timing.increment('rollingReference.skip.duplicateMonth')
            }
            continue
        }
        monthsSeen.add(monthKey)

        const basic = entry.record.payrollDoc.payments.hourly.basic
        const weeks = getWeeksInPeriod(entryDate)
        totalBasicPay += basic.amount ?? 0
        totalBasicHours += basic.units ?? 0
        totalWeeks += weeks
        periodsCounted += 1

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
                label: `Holiday rate (£${impliedHolidayRate.toFixed(2)}/hr implied) is below basic rate (£${basicRate.toFixed(2)}/hr) on this payslip`,
            })
            if (timing?.enabled) {
                timing.increment('holidayFlags.flag.holiday_rate_below_basic')
            }
        }

        if (rollingAvgFlagWillFire) {
            const weeksNote = ref.limitedData
                ? ` (based on ${Math.round(ref.totalWeeks)} weeks available from ${ref.periodsCounted} months)`
                : ` (${Math.round(ref.totalWeeks)}-week rolling average)`
            entry.validation.flags.push({
                id: 'holiday_rate_below_rolling_avg',
                label: `Holiday rate (£${impliedHolidayRate.toFixed(2)}/hr implied) is below average basic rate (£${rollingAvgRate.toFixed(2)}/hr)${weeksNote} — request employer's weekly records to confirm`,
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
            entitlementHours:
                typicalDays === 0 && avgWeeklyHours > 0
                    ? useAccrual
                        ? avgWeeklyHours * 52 * 0.1207
                        : avgWeeklyHours * 5.6
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
