/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../parse/payroll.types.js").PayrollDeductions} PayrollDeductions
 * @typedef {import("../parse/payroll.types.js").PayrollPayments} PayrollPayments
 */

import {
    buildMissingMonthsHtml,
    buildMissingMonthsLabel,
    formatMonthLabel,
} from '../parse/parser_config.js'
import { renderHtmlReport } from './html_export.js'
import {
    buildHolidayPayFlags,
    buildYearHolidayContext,
} from './holiday_calculations.js'
import { buildValidation } from './hourly_pay_calculations.js'
import {
    CONTRIBUTION_RECENCY_DAYS_THRESHOLD,
    PERSONAL_ALLOWANCE_MONTHLY,
    RULES_VERSION,
    THRESHOLDS_VERSION,
} from './uk_thresholds.js'
import { buildContributionSummary } from './pension_calculations.js'
import { buildReportEntries } from './report_calculations.js'
import {
    CONTRACT_TYPE_MISMATCH_HOURLY_WARNING,
    CONTRACT_TYPE_MISMATCH_SALARIED_WARNING,
} from './report_formatters.js'
import {
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getCalendarMonthFromFiscalIndex,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
} from './tax_year_utils.js'
import { buildLeaveYearGroups } from './year_holiday_summary.js'

const timing = /** @type {any} */ (globalThis).__payrollTiming || null

/**
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ date: Date | null, type: string, amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number, balance: number }} ContributionMonthSummary
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number }} ContributionYearTotals
 * @typedef {{ months: Map<number, ContributionMonthSummary>, totals: ContributionYearTotals, yearEndBalance: number }} ContributionYearSummary
 * @typedef {{ years: Map<string, ContributionYearSummary>, balance: number, sourceFiles: string[] }} ContributionSummary
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, yearKey: string | null, monthIndex: number, validation?: ValidationResult, reconciliation?: ContributionYearSummary | null }} ReportEntry
 * @typedef {ReportEntry[] & { yearKey?: string, reconciliation?: ContributionYearSummary | null }} YearEntries
 * @typedef {PayrollRecord[] & { contributionData?: ContributionData }} PayrollRecordCollection
 * @typedef {{ fileCount: number, recordCount: number, dateRangeLabel: string }} ContributionMeta
 * @typedef {{ workerType: string | null, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }} WorkerProfileContext
 * @typedef {{ flaggedCount: number, lowConfidenceCount: number, flaggedPeriods: string[] }} ValidationSummary
 * @typedef {{ dateRangeLabel: string, missingMonthsLabel: string, missingMonthsHtml: string, missingMonthsByYear: Record<string, string[]>, contributionMeta: ContributionMeta, validationSummary: ValidationSummary }} ReportStats
 * @typedef {{ entries: ReportEntry[], yearGroups: Map<string, YearEntries>, yearKeys: string[], contributionSummary: ContributionSummary | null, contributionMeta: ContributionMeta, reportGeneratedLabel: string, auditMetadata: { rulesVersion: string, thresholdsVersion: string }, missingMonths: { missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }, validationSummary: { flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }, contributionTotals: { payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }, contributionRecency: { lastContributionLabel: string, daysSinceContribution: number | null, daysThreshold: number }, workerProfile: { workerType: string | null, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }, contractTypeMismatchWarning: string | null, leaveYearGroups: Map<string, YearEntries> }} ReportContext
 */

/**
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}${month}${day}${hours}${minutes}${seconds}`
}

/**
 * @param {PayrollRecordCollection} records
 * @param {string[]} [failedPayPeriods=[]]
 * @param {ContributionData | null} [contributionData=null]
 * @param {{ typicalDays?: number, workerType?: string, statutoryHolidayDays?: number | null, leaveYearStartMonth?: number } | null} [workerProfile=null]
 * @returns {{ html: string, filename: string, stats: ReportStats, context: ReportContext }}
 */
export function buildReport(
    records,
    failedPayPeriods = [],
    contributionData = null,
    workerProfile = null
) {
    if (!records.length) {
        throw new Error('No payroll records provided')
    }
    /**
     * @template T
     * @param {string} label
     * @param {() => T} callback
     * @param {Record<string, any> | null} [meta=null]
     * @returns {T}
     */
    const timeBuildPhase = (label, callback, meta = null) => {
        if (!timing?.enabled) {
            return callback()
        }
        timing.start(label, meta)
        try {
            return callback()
        } finally {
            timing.end(label)
        }
    }
    if (timing?.enabled) {
        timing.start('buildReport.total')
        timing.increment('buildReport.calls')
        timing.setMeta('buildReport.records', records.length)
    }
    try {
        const reportRunDate = new Date()
        const rawLeaveYear = workerProfile?.leaveYearStartMonth ?? 4
        const leaveYearStartMonth =
            Number.isInteger(rawLeaveYear) &&
            rawLeaveYear >= 1 &&
            rawLeaveYear <= 12
                ? rawLeaveYear
                : 4
        /** @type {ReportEntry[]} */
        const entries = timeBuildPhase('buildReport.entries', () =>
            buildReportEntries(records, leaveYearStartMonth)
        )

        timeBuildPhase('buildReport.validation', () => {
            entries.forEach((entry) => {
                entry.validation = buildValidation(entry)
            })
        })
        const workerType = workerProfile?.workerType ?? null
        const typicalDays = workerProfile?.typicalDays ?? 0
        const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? null

        timeBuildPhase('buildReport.holidayFlags', () => {
            buildHolidayPayFlags(entries)
        })
        timeBuildPhase('buildReport.holidayContext', () => {
            buildYearHolidayContext(entries, workerProfile)
        })

        let contractTypeMismatchWarning = null
        if (workerType === 'hourly') {
            const hasSalaryPayslip = entries.some(
                (entry) =>
                    (entry.record.payrollDoc?.payments?.salary?.basic?.amount ??
                        0) > 0
            )
            if (hasSalaryPayslip) {
                contractTypeMismatchWarning =
                    CONTRACT_TYPE_MISMATCH_HOURLY_WARNING
            }
        } else if (workerType === 'salary') {
            const hasHourlyPayslip = entries.some(
                (entry) =>
                    (entry.record.payrollDoc?.payments?.hourly?.basic?.units ??
                        0) > 0 ||
                    (entry.record.payrollDoc?.payments?.hourly?.holiday
                        ?.units ?? 0) > 0
            )
            if (hasHourlyPayslip) {
                contractTypeMismatchWarning =
                    CONTRACT_TYPE_MISMATCH_SALARIED_WARNING
            }
        }

        const yearGroups = timeBuildPhase('buildReport.grouping', () => {
            entries.sort((a, b) => {
                const yearA = getTaxYearSortKey(a.yearKey ?? 'Unknown')
                const yearB = getTaxYearSortKey(b.yearKey ?? 'Unknown')
                if (yearA !== yearB) {
                    return yearA - yearB
                }
                if (a.monthIndex !== b.monthIndex) {
                    return a.monthIndex - b.monthIndex
                }
                const fallbackA =
                    a.record.payrollDoc?.processDate?.date || 'Unknown'
                const fallbackB =
                    b.record.payrollDoc?.processDate?.date || 'Unknown'
                return fallbackA.localeCompare(fallbackB)
            })

            const groups = new Map()
            entries.forEach((entry) => {
                const key = entry.yearKey ?? 'Unknown'
                if (!groups.has(key)) {
                    groups.set(key, [])
                }
                const yearEntries = groups.get(key)
                if (yearEntries) {
                    yearEntries.push(entry)
                }
            })
            return groups
        })
        const leaveYearGroups = buildLeaveYearGroups(entries)
        const yearKeys = Array.from(yearGroups.keys())
        const contributionSummary = timeBuildPhase(
            'buildReport.contributions',
            () => {
                const summary = buildContributionSummary(
                    entries,
                    contributionData,
                    yearKeys
                )
                yearGroups.forEach(
                    (
                        /** @type {ReportEntry[]} */ entriesForYear,
                        /** @type {string} */ yearKey
                    ) => {
                        const yearEntriesWithReconciliation =
                            /** @type {YearEntries} */ (entriesForYear)
                        yearEntriesWithReconciliation.reconciliation =
                            summary?.years.get(yearKey) || null
                    }
                )
                return summary
            }
        )

        const derivedSummaryData = timeBuildPhase(
            'buildReport.derivedSummaries',
            () => {
                const parsedDates = entries
                    .map((entry) => entry.parsedDate)
                    .filter(
                        /** @returns {date is Date} */ (date) =>
                            date instanceof Date
                    )
                    .sort((a, b) => a.getTime() - b.getTime())
                const failedDates = failedPayPeriods
                    .map((period) => parsePayPeriodStart(period))
                    .filter((date) => date instanceof Date)
                const rangeStart = parsedDates[0] || null
                const rangeEnd = parsedDates[parsedDates.length - 1] || null
                const dateRangeLabel =
                    rangeStart && rangeEnd
                        ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
                        : 'Unknown'
                const contributionEntries = contributionData?.entries || []
                const contributionDates = contributionEntries
                    .map((entry) => entry.date)
                    .filter(
                        /** @returns {date is Date} */ (date) =>
                            date instanceof Date
                    )
                const lastContributionDate = contributionDates.length
                    ? new Date(
                          Math.max(
                              ...contributionDates.map((date) => date.getTime())
                          )
                      )
                    : null
                let contributionRangeLabel = 'None'
                if (contributionDates.length) {
                    const minContribution = new Date(
                        Math.min(
                            ...contributionDates.map((date) => date.getTime())
                        )
                    )
                    const maxContribution = new Date(
                        Math.max(
                            ...contributionDates.map((date) => date.getTime())
                        )
                    )
                    contributionRangeLabel = `${formatMonthYearLabel(minContribution)} – ${formatMonthYearLabel(maxContribution)}`
                } else if ((contributionData?.sourceFiles || []).length) {
                    contributionRangeLabel = 'Unknown'
                }
                const contributionMeta = {
                    fileCount: contributionData?.sourceFiles?.length || 0,
                    recordCount: contributionData?.entries?.length || 0,
                    dateRangeLabel: contributionRangeLabel,
                }
                const miscFootnotes =
                    /** @type {Array<{ type: string, dateLabel: string, item: PayrollPayItem | PayrollMiscDeduction }>} */ (
                        entries.reduce((/** @type {any[]} */ acc, entry) => {
                            const dateLabel = entry.parsedDate
                                ? formatDateLabel(entry.parsedDate)
                                : entry.record.payrollDoc?.processDate?.date ||
                                  'Unknown'
                            const miscPayments =
                                entry.record.payrollDoc?.payments?.misc || []
                            const miscDeductions =
                                entry.record.payrollDoc?.deductions?.misc || []
                            miscPayments.forEach((item) => {
                                acc.push({
                                    type: 'payment',
                                    dateLabel,
                                    item,
                                })
                            })
                            miscDeductions.forEach((item) => {
                                acc.push({
                                    type: 'deduction',
                                    dateLabel,
                                    item,
                                })
                            })
                            return acc
                        }, [])
                    )
                const missingMonths = buildMissingMonths(
                    yearGroups,
                    failedDates
                )
                const validationSummary = buildValidationSummary(entries)
                const hasLowPretaxPay = entries.some((entry) => {
                    const totalGrossPay =
                        entry.record.payrollDoc?.thisPeriod?.totalGrossPay
                            ?.amount
                    return (
                        typeof totalGrossPay === 'number' &&
                        totalGrossPay < PERSONAL_ALLOWANCE_MONTHLY
                    )
                })
                const contributionTotalsResult = buildContributionTotals(
                    entries,
                    contributionSummary
                )
                const daysThreshold = CONTRIBUTION_RECENCY_DAYS_THRESHOLD
                const contributionRecency = buildContributionRecency(
                    lastContributionDate,
                    reportRunDate,
                    daysThreshold
                )
                return {
                    rangeStart,
                    rangeEnd,
                    dateRangeLabel,
                    contributionMeta,
                    miscFootnotes,
                    missingMonths,
                    validationSummary,
                    hasLowPretaxPay,
                    contributionTotalsResult,
                    daysThreshold,
                    contributionRecency,
                }
            }
        )
        const {
            rangeStart,
            rangeEnd,
            dateRangeLabel,
            contributionMeta,
            miscFootnotes,
            missingMonths,
            validationSummary,
            hasLowPretaxPay,
            contributionTotalsResult,
            daysThreshold,
            contributionRecency,
        } = derivedSummaryData
        const {
            missingMonthsByYear,
            hasMissingMonths,
            missingMonthsLabel,
            missingMonthsHtml,
        } = missingMonths
        const {
            flaggedEntries,
            lowConfidenceEntries,
            flaggedPeriods,
            validationPill,
        } = validationSummary
        const employeeName = records[0].employee?.name || 'Unknown'

        const reportGeneratedLabel = reportRunDate.toLocaleString('en-GB')
        const reportResult = timeBuildPhase('buildReport.finalize', () => {
            const timestamp = formatTimestamp(reportRunDate)
            const dateStart = rangeStart ? formatDateKey(rangeStart) : 'unknown'
            const dateFinish = rangeEnd ? formatDateKey(rangeEnd) : 'unknown'
            const employeeSlug = employeeName.trim().replace(/\s+/g, '-')
            const filename = `${timestamp}-${employeeSlug}_${dateStart}-${dateFinish}.pdf`

            const validationSummaryResult = {
                flaggedEntries,
                lowConfidenceEntries,
                flaggedPeriods,
                validationPill,
            }
            const missingMonthsResult = {
                missingMonthsByYear,
                hasMissingMonths,
                missingMonthsLabel,
                missingMonthsHtml,
            }
            const context = {
                entries,
                yearGroups,
                yearKeys,
                contributionSummary,
                reportGeneratedLabel,
                auditMetadata: {
                    rulesVersion: RULES_VERSION,
                    thresholdsVersion: THRESHOLDS_VERSION,
                },
                contributionMeta,
                missingMonths: missingMonthsResult,
                validationSummary: validationSummaryResult,
                contributionTotals: contributionTotalsResult,
                contributionRecency: {
                    ...contributionRecency,
                    daysThreshold,
                },
                workerProfile: {
                    workerType,
                    typicalDays,
                    statutoryHolidayDays,
                    leaveYearStartMonth,
                },
                contractTypeMismatchWarning,
                leaveYearGroups: /** @type {Map<string, YearEntries>} */ (
                    leaveYearGroups
                ),
            }
            return {
                html: renderHtmlReport(context, {
                    employeeName,
                    dateRangeLabel,
                }),
                filename,
                stats: {
                    dateRangeLabel,
                    missingMonthsLabel,
                    missingMonthsHtml,
                    missingMonthsByYear,
                    contributionMeta,
                    validationSummary: {
                        flaggedCount: flaggedEntries.length,
                        lowConfidenceCount: lowConfidenceEntries.length,
                        flaggedPeriods,
                    },
                },
                context,
            }
        })
        if (timing?.enabled) {
            timing.setMeta('buildReport.entriesCount', entries.length)
            timing.setMeta('buildReport.yearGroups', yearKeys.length)
        }
        return reportResult
    } finally {
        if (timing?.enabled) {
            timing.end('buildReport.total')
        }
    }
}

/**
 * @param {Map<string | number, YearEntries>} yearGroups
 * @param {Date[]} failedDates
 * @returns {{ missingMonthsByYear: Record<string, string[]>, hasMissingMonths: boolean, missingMonthsLabel: string, missingMonthsHtml: string }}
 */
function buildMissingMonths(yearGroups, failedDates) {
    /** @type {Record<string, number[]>} */
    const failedMonthsByYear = {}
    failedDates.forEach((date) => {
        const yearKey = getTaxYearKey(date)
        const monthIndex = getFiscalMonthIndex(date)
        if (!yearKey || yearKey === 'Unknown' || !monthIndex) {
            return
        }
        if (!failedMonthsByYear[yearKey]) {
            failedMonthsByYear[yearKey] = []
        }
        if (!failedMonthsByYear[yearKey].includes(monthIndex)) {
            failedMonthsByYear[yearKey].push(monthIndex)
        }
    })

    const currentDate = new Date()
    const currentYearKey = getTaxYearKey(currentDate)
    const currentMonthIndex = getFiscalMonthIndex(currentDate)
    /** @type {Record<string, string[]>} */
    const missingMonthsByYear = {}
    yearGroups.forEach(
        (
            /** @type {ReportEntry[]} */ entriesForYear,
            /** @type {string | number} */ yearKey
        ) => {
            const presentMonths = entriesForYear
                .map((entry) => entry.monthIndex)
                .filter((month) => month >= 1 && month <= 12)
            const failedMonths = failedMonthsByYear[yearKey] || []
            const combinedMonths = presentMonths.concat(failedMonths)
            const maxMonth =
                yearKey === currentYearKey && currentMonthIndex
                    ? currentMonthIndex - 1
                    : 12
            if (maxMonth <= 0) {
                missingMonthsByYear[yearKey] = []
                return
            }
            if (!combinedMonths.length) {
                missingMonthsByYear[yearKey] = []
                return
            }
            const present = new Set([...presentMonths, ...failedMonths])
            const missing = []
            for (let month = 1; month <= maxMonth; month += 1) {
                if (!present.has(month)) {
                    const calendarMonth = getCalendarMonthFromFiscalIndex(month)
                    if (calendarMonth) {
                        missing.push(formatMonthLabel(calendarMonth))
                    }
                }
            }
            missingMonthsByYear[yearKey] = missing
        }
    )

    const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear)
    const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear)
    const hasMissingMonths = Object.values(missingMonthsByYear).some(
        (/** @type {string[]} */ months) => months.length
    )

    return {
        missingMonthsByYear,
        hasMissingMonths,
        missingMonthsLabel,
        missingMonthsHtml,
    }
}

/**
 * @param {ReportEntry[]} entries
 * @returns {{ flaggedEntries: ReportEntry[], lowConfidenceEntries: ReportEntry[], flaggedPeriods: string[], validationPill: string }}
 */
function buildValidationSummary(entries) {
    const flaggedEntries = entries.filter(
        (entry) => entry.validation?.flags && entry.validation.flags.length
    )
    const lowConfidenceEntries = entries.filter(
        (entry) => entry.validation?.lowConfidence
    )
    const flaggedPeriods = flaggedEntries.map((entry) =>
        entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
    )
    const validationPill = flaggedEntries.length
        ? `Flags: <span class="validation-count">${flaggedEntries.length}</span> | ` +
          `Low confidence: <span class="validation-count">${lowConfidenceEntries.length}</span>`
        : 'Validation flags: None'
    return {
        flaggedEntries,
        lowConfidenceEntries,
        flaggedPeriods,
        validationPill,
    }
}

/**
 * @param {ReportEntry[]} entries
 * @param {ContributionSummary | null} contributionSummary
 * @returns {{ payrollEE: number, payrollER: number, payrollContribution: number, pensionEE: number | null, pensionER: number | null, reportedContribution: number | null, contributionDifference: number | null }}
 */
function buildContributionTotals(entries, contributionSummary) {
    const totals = entries.reduce(
        (acc, entry) => {
            acc.nestEmployee +=
                entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
            acc.nestEmployer +=
                entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
            // acc.miscPayments += sumMiscAmounts(
            //     entry.record.payrollDoc?.payments?.misc || []
            // )
            // acc.miscDeductions += sumMiscAmounts(
            //     entry.record.payrollDoc?.deductions?.misc || []
            // )
            return acc
        },
        {
            nestEmployee: 0,
            nestEmployer: 0,
            // TODO: miscPayments and miscDeductions aggregates are computed here
            // for potential use as summary table columns (e.g. "Misc Pay" / "Misc Ded."
            // per year). Not implemented yet — misc items are already shown via the
            // per-payslip card and the per-year/global footnote sections.

            // miscPayments: 0,
            // miscDeductions: 0,
        }
    )

    const payrollEE = totals.nestEmployee
    const payrollER = totals.nestEmployer
    const payrollContribution = payrollEE + payrollER

    let pensionEE = null
    let pensionER = null
    let reportedContribution = null
    let contributionDifference = null

    if (contributionSummary) {
        const pensionTotals = Array.from(
            contributionSummary.years.values()
        ).reduce(
            (acc, yearData) => {
                acc.ee += yearData.totals.actualEE || 0
                acc.er += yearData.totals.actualER || 0
                return acc
            },
            { ee: 0, er: 0 }
        )
        pensionEE = pensionTotals.ee
        pensionER = pensionTotals.er
        reportedContribution = pensionEE + pensionER
        contributionDifference = reportedContribution - payrollContribution
    }

    return {
        payrollEE,
        payrollER,
        payrollContribution,
        pensionEE,
        pensionER,
        reportedContribution,
        contributionDifference,
    }
}

/**
 * @param {Date | null} lastContributionDate
 * @param {Date} reportRunDate
 * @param {number} daysThreshold
 * @returns {{ daysSinceContribution: number | null, lastContributionLabel: string }}
 */
function buildContributionRecency(
    lastContributionDate,
    reportRunDate,
    daysThreshold
) {
    let daysSinceContribution = null
    let lastContributionLabel = 'N/A'
    if (lastContributionDate) {
        const millisecondsSince =
            reportRunDate.getTime() - lastContributionDate.getTime()
        const dayCount = Math.floor(millisecondsSince / (1000 * 60 * 60 * 24))
        daysSinceContribution = Math.max(0, dayCount)
        lastContributionLabel = formatDateLabel(lastContributionDate)
    }
    return { daysSinceContribution, lastContributionLabel }
}

export { buildContributionTotals, buildMissingMonths, buildValidationSummary }
