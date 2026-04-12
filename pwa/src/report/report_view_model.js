/**
 * @typedef {import('../parse/payroll.types.js').PayrollRecord} PayrollRecord
 * @typedef {import('../parse/payroll.types.js').PayrollPayItem} PayrollPayItem
 * @typedef {import('../parse/payroll.types.js').PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {{ id: string, label: string, severity?: 'notice' | 'warning', noteIndex?: number, inputs?: { grossPay?: number, niPrimaryThresholdMonthly?: number } }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, validation?: ValidationResult, monthIndex: number, yearKey?: string | null, leaveYearKey?: string | null }} ReportEntry
 * @typedef {ReportEntry & { yearKey: string | null }} HolidayCoverageEntry
 * @typedef {{ id: string, marker: string | null, text: string }} FooterNote
 * @typedef {{ kind: 'limited_weeks' | 'insufficient_months', periodsCounted: number, totalWeeks: number, message: string }} CoverageWarning
 */
import { formatMonthLabel } from '../parse/parser_config.js'
import { getTaxYearThresholdsForContext } from './uk_thresholds.js'
import {
    ACCUMULATED_TOTALS_NOTE,
    buildAnnualCrossCheckDisplay,
    buildCoverageWarningMessage,
    buildGlobalCoverageNoticeMessage,
    buildThresholdStalenessNoticeMessage,
    buildZeroTaxAllowanceNote,
    APRIL_BOUNDARY_NOTE,
    formatMiscLabel,
} from './report_formatters.js'
import {
    formatDateLabel,
    getCalendarMonthFromFiscalIndex,
} from './tax_year_utils.js'
import { getRollingReferenceCoverage } from './holiday_calculations.js'
import {
    buildEntryHolidaySummary,
    buildLeaveYearGroups,
    buildYearHolidaySummary,
} from './year_holiday_summary.js'

const EMPLOYER_CONTRIBUTION_NOTE =
    'Employer contribution — paid by the employer on top of your salary, not deducted from your pay.'

/** @param {ReportEntry} entry */
export function buildPayslipViewModel(entry) {
    const record = entry.record
    const validation = entry.validation || { flags: [], lowConfidence: false }
    const parsedDate = entry.parsedDate
    const dateLabel = parsedDate
        ? formatDateLabel(parsedDate)
        : record.payrollDoc?.processDate?.date || 'Unknown'
    const hourlyPayments = record.payrollDoc?.payments?.hourly || {}
    const salaryPayments = record.payrollDoc?.payments?.salary || {}
    const miscPayments = record.payrollDoc?.payments?.misc || []
    const miscDeductions = record.payrollDoc?.deductions?.misc || []
    const payeTax = record.payrollDoc?.deductions?.payeTax?.amount || 0
    const nationalInsurance = record.payrollDoc?.deductions?.natIns?.amount || 0
    const nestEmployee = record.payrollDoc?.deductions?.pensionEE?.amount || 0
    const nestEmployer = record.payrollDoc?.deductions?.pensionER?.amount || 0
    const netPay = record.payrollDoc?.netPay?.amount || 0
    const combinedNest = nestEmployee + nestEmployer
    const entryHolidaySummary = buildEntryHolidaySummary(entry)
    const holidayEstimatedDays =
        entryHolidaySummary.kind === 'hours_days'
            ? entryHolidaySummary.estimatedDays.toFixed(1)
            : null
    const basicHours = hourlyPayments.basic?.units || 0
    const basicRate = hourlyPayments.basic?.rate || 0
    const basicAmount = hourlyPayments.basic?.amount || 0
    const holidayHours = hourlyPayments.holiday?.units || 0
    const holidayRate = hourlyPayments.holiday?.rate || 0
    const holidayAmount = hourlyPayments.holiday?.amount || 0
    const basicSalaryAmount = salaryPayments.basic?.amount ?? null
    const holidaySalaryUnits = salaryPayments.holiday?.units ?? null
    const holidaySalaryRate = salaryPayments.holiday?.rate ?? null
    const holidaySalaryAmount = salaryPayments.holiday?.amount ?? null
    const hasHolidayHourly = [holidayHours, holidayRate, holidayAmount].some(
        (value) => value !== null && value !== 0
    )
    const hasHolidaySalary = [
        holidaySalaryUnits,
        holidaySalaryRate,
        holidaySalaryAmount,
    ].some((value) => value !== null && value !== 0)

    const paymentRows = []
    if (basicHours || basicRate || basicAmount) {
        paymentRows.push({
            id: 'basic-hours',
            group: 'core',
            label: 'Basic Hours',
            amount: basicAmount,
            units: basicHours,
            rate: basicRate,
            holidayEstimatedDaysSuffix: null,
        })
    }
    if (hasHolidayHourly) {
        paymentRows.push({
            id: 'holiday-hours',
            group: 'core',
            label: 'Holiday Hours',
            amount: holidayAmount,
            units: holidayHours,
            rate: holidayRate,
            holidayEstimatedDaysSuffix:
                holidayEstimatedDays !== null
                    ? `est ${holidayEstimatedDays} days holiday`
                    : null,
        })
    }
    if (basicSalaryAmount !== null) {
        paymentRows.push({
            id: 'basic-salary',
            group: 'core',
            label: 'Basic Salary',
            amount: basicSalaryAmount,
            units: null,
            rate: null,
            holidayEstimatedDaysSuffix: null,
        })
    }
    if (hasHolidaySalary) {
        paymentRows.push({
            id: 'holiday-salary',
            group: 'core',
            label: 'Holiday Salary',
            amount: holidaySalaryAmount,
            units: holidaySalaryUnits,
            rate: holidaySalaryRate,
            holidayEstimatedDaysSuffix: null,
        })
    }
    miscPayments.forEach((/** @type {PayrollPayItem} */ item) => {
        paymentRows.push({
            id: 'misc-payment',
            group: 'misc',
            label: formatMiscLabel(item),
            amount: item.amount || 0,
            units: null,
            rate: null,
            holidayEstimatedDaysSuffix: null,
        })
    })

    const deductionRows = [
        {
            id: 'paye-tax',
            group: 'core',
            label: 'PAYE Tax',
            amount: payeTax,
            amountType: 'deduction',
            noteId: null,
            marker: null,
        },
        {
            id: 'national-insurance',
            group: 'core',
            label: 'National Insurance',
            amount: nationalInsurance,
            amountType: 'deduction',
            noteId: null,
            marker: null,
        },
        {
            id: 'nest-ee',
            group: 'core',
            label: 'NEST Corp - EE',
            amount: nestEmployee,
            amountType: 'deduction',
            noteId: null,
            marker: null,
        },
        {
            id: 'nest-er',
            group: 'core',
            label: 'NEST Corp - ER',
            amount: nestEmployer,
            amountType: 'contribution',
            noteId: 'employer-contribution',
            marker: '†',
        },
    ]
    miscDeductions.forEach((/** @type {PayrollMiscDeduction} */ item) => {
        deductionRows.push({
            id: 'misc-deduction',
            group: 'misc',
            label: formatMiscLabel(item),
            amount: item.amount || 0,
            amountType: 'deduction',
            noteId: null,
            marker: null,
        })
    })
    deductionRows.push(
        {
            id: 'combined-nest',
            group: 'summary',
            label: 'Combined NEST',
            amount: combinedNest,
            amountType: 'currency',
            noteId: null,
            marker: null,
        },
        {
            id: 'net-pay',
            group: 'summary',
            label: 'Net Pay (after deductions)',
            amount: netPay,
            amountType: 'currency',
            noteId: null,
            marker: null,
        }
    )

    const noticeItems = /** @type {string[]} */ ([])
    const warningItems = /** @type {string[]} */ ([])
    validation.flags.forEach((/** @type {ValidationFlag} */ flag) => {
        if (flag.severity === 'notice') {
            noticeItems.push(flag.label)
            return
        }
        warningItems.push(flag.label)
    })
    const warnings = validation.flags.map(
        (/** @type {ValidationFlag} */ flag) => flag.label
    )
    const holidayAnalysis =
        holidayEstimatedDays !== null &&
        entryHolidaySummary.kind === 'hours_days'
            ? {
                  title: 'Holiday analysis',
                  intro: 'Year average, estimate only.',
                  items: [
                      // NOTE: Use ~ instead of ≈ (U+2248) - the ≈ character is not in jsPDF's
                      // Helvetica font and corrupts text rendering state, causing letter spacing
                      // issues in PDF exports. See sanitizeText() in pdf_export.js for details.
                      `Avg ${entryHolidaySummary.avgWeeklyHours.toFixed(2)} hrs/week over ${entryHolidaySummary.typicalDays} days -> 1 day ~${entryHolidaySummary.avgHoursPerDay.toFixed(2)} hrs.`,
                      `This payslip: ${entryHolidaySummary.holidayHours.toFixed(2)} hrs ~${holidayEstimatedDays} days.`,
                  ],
                  footer: `If ${holidayEstimatedDays} days doesn't match the days you agreed, ask your employer how they calculated the number of hours for holiday.`,
                  estimatedDays: holidayEstimatedDays,
                  avgHoursPerDay: entryHolidaySummary.avgHoursPerDay,
                  avgHoursPerWeek: entryHolidaySummary.avgWeeklyHours,
                  typicalDays: entryHolidaySummary.typicalDays,
                  holidayHours: entryHolidaySummary.holidayHours,
              }
            : null
    const footerNotes = /** @type {FooterNote[]} */ ([
        {
            id: 'employer-contribution',
            marker: '†',
            text: EMPLOYER_CONTRIBUTION_NOTE,
        },
    ])
    if (parsedDate instanceof Date && parsedDate.getMonth() === 3) {
        footerNotes.push({
            id: 'april-boundary',
            marker: null,
            text: APRIL_BOUNDARY_NOTE,
        })
    }

    return {
        dateLabel,
        imageData: record.imageData || null,
        paymentRows,
        deductionRows,
        warnings,
        holidayAnalysis,
        noticeItems,
        warningItems,
        footerNotes,
        flags: {
            lowConfidence: Boolean(validation.lowConfidence),
            warningCount: warningItems.length,
        },
    }
}

/** @param {string | null | undefined} yearKey */
function formatYearAnchor(yearKey) {
    return String(yearKey || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
}

/** @param {string[]} periods */
function groupPeriodsByYear(periods) {
    if (!periods.length) {
        return []
    }
    const grouped = /** @type {Record<string, string[]>} */ ({})
    periods.forEach((period) => {
        const yearMatch = String(period).match(/\d{4}$/)
        const year = yearMatch ? yearMatch[0] : 'Unknown'
        if (!grouped[year]) {
            grouped[year] = []
        }
        grouped[year].push(String(period).replace(/\s*\d{4}$/, ''))
    })
    return Object.entries(grouped).map(([year, items]) => ({
        year,
        items,
    }))
}

/** @param {Record<string, string[]> | null | undefined} groupedMonths */
function groupMonthsByYear(groupedMonths) {
    if (!groupedMonths) {
        return []
    }
    const entries = Object.entries(groupedMonths).filter(
        ([, months]) => months.length
    )
    return entries.map(([year, months]) => ({ year, months }))
}

/** @param {string[]} periods @param {string} emptyValue */
function formatPeriodsByYear(periods, emptyValue) {
    const grouped = groupPeriodsByYear(periods)
    if (!grouped.length) {
        return emptyValue
    }
    return grouped
        .map(({ year, items }) => `${year}: ${items.join(', ')}`)
        .join('; ')
}

/** @param {Record<string, string[]> | null | undefined} groupedMonths */
function formatMonthsByYear(groupedMonths) {
    const grouped = groupMonthsByYear(groupedMonths)
    if (!grouped.length) {
        return 'None'
    }
    return grouped
        .map(({ year, months }) => `${year}: ${months.join(', ')}`)
        .join('; ')
}

/** @param {any} workerProfile */
function buildWorkerProfileMeta(workerProfile) {
    const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ]
    const workerType = workerProfile?.workerType ?? null
    const typicalDays = workerProfile?.typicalDays ?? 0
    const statutoryHolidayDays = workerProfile?.statutoryHolidayDays ?? null
    const leaveYearStartMonth = workerProfile?.leaveYearStartMonth ?? 4
    return {
        workerType,
        workerTypeLabel: workerType
            ? workerType.charAt(0).toUpperCase() + workerType.slice(1)
            : 'Not specified',
        typicalDays,
        statutoryHolidayDays,
        leaveYearStartMonth,
        leaveYearStartMonthName: monthNames[leaveYearStartMonth - 1] || 'April',
        hasVariablePattern: typicalDays <= 0,
    }
}

/** @param {ReportEntry[]} entries */
function collectMiscReviewItems(entries) {
    const result = /** @type {Array<any>} */ ([])
    entries.forEach((entry) => {
        const dateLabel = entry.parsedDate
            ? formatDateLabel(entry.parsedDate)
            : entry.record.payrollDoc?.processDate?.date || 'Unknown'
        const miscPayments = entry.record.payrollDoc?.payments?.misc || []
        const miscDeductions = entry.record.payrollDoc?.deductions?.misc || []
        miscPayments.forEach((/** @type {PayrollPayItem} */ item) => {
            result.push({
                type: 'payment',
                dateLabel,
                label: formatMiscLabel(item),
                amount: item.amount || 0,
                units: item.units ?? null,
                rate: item.rate ?? null,
            })
        })
        miscDeductions.forEach((/** @type {PayrollMiscDeduction} */ item) => {
            result.push({
                type: 'deduction',
                dateLabel,
                label: formatMiscLabel(item),
                amount: item.amount || 0,
                units: item.units ?? null,
                rate: item.rate ?? null,
            })
        })
    })
    return result
}

/**
 * @param {Array<{ type: string, dateLabel: string, yearKey?: string, item: PayrollPayItem | PayrollMiscDeduction }> | null | undefined} miscFootnotes
 */
function buildMiscReviewItemsFromFootnotes(miscFootnotes) {
    if (!Array.isArray(miscFootnotes) || !miscFootnotes.length) {
        return []
    }
    return miscFootnotes.map((footnote) => ({
        type: footnote.type,
        dateLabel: footnote.dateLabel,
        label: formatMiscLabel(footnote.item),
        amount: footnote.item?.amount || 0,
        units: footnote.item?.units ?? null,
        rate: footnote.item?.rate ?? null,
    }))
}

/** @param {ReportEntry[]} entriesForYear */
function buildYearFlagModel(entriesForYear) {
    const noteIndexByLabel = new Map()
    const noteLabels =
        /** @type {Array<{ id: string, index: number, label: string }>} */ ([])
    const refsByEntry = new Map()
    entriesForYear.forEach((entry) => {
        const entryFlags = (entry.validation?.flags || []).filter(
            (flag) => flag.severity !== 'notice'
        )
        const refs = entryFlags.map((flag) => {
            const noteKey = String(flag.label || '')
            let noteIndex = noteIndexByLabel.get(noteKey)
            if (noteIndex === undefined) {
                noteIndex = noteLabels.length + 1
                noteIndexByLabel.set(noteKey, noteIndex)
                noteLabels.push({
                    id: flag.id,
                    index: noteIndex,
                    label: flag.label,
                })
            }
            return String(noteIndex)
        })
        refsByEntry.set(entry, refs)
    })
    return { noteLabels, refsByEntry }
}

/**
 * @param {ReportEntry[]} allEntries
 * @param {any} entriesForYear
 * @param {string} yearKey
 * @param {Map<string, any>} leaveYearGroups
 * @param {any} workerProfile
 * @param {{ sortedEntries: HolidayCoverageEntry[], normalizedEntryByOriginalEntry: Map<ReportEntry, HolidayCoverageEntry> } | null} [coverageEntriesPrecomputed]
 */
function buildSummaryYearRow(
    allEntries,
    entriesForYear,
    yearKey,
    leaveYearGroups,
    workerProfile,
    coverageEntriesPrecomputed = null
) {
    const holidaySummary = buildYearHolidaySummary(
        entriesForYear,
        leaveYearGroups,
        workerProfile
    )
    const annualCrossCheck =
        holidaySummary.kind === 'hourly_hours'
            ? holidaySummary.annualCrossCheck || null
            : null
    const monthBreakdown =
        holidaySummary.kind === 'hourly_hours'
            ? holidaySummary.monthBreakdown || []
            : []
    const hours = entriesForYear.reduce(
        (/** @type {number} */ acc, /** @type {ReportEntry} */ entry) =>
            acc +
            (entry.record.payrollDoc?.payments?.hourly?.basic?.units || 0),
        0
    )
    const payrollEE = entriesForYear.reduce(
        (/** @type {number} */ acc, /** @type {ReportEntry} */ entry) =>
            acc + (entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0),
        0
    )
    const payrollER = entriesForYear.reduce(
        (/** @type {number} */ acc, /** @type {ReportEntry} */ entry) =>
            acc + (entry.record.payrollDoc?.deductions?.pensionER?.amount || 0),
        0
    )
    const payrollContribution = payrollEE + payrollER
    const reconciliation = entriesForYear.reconciliation || null
    const reportedEE = reconciliation?.totals?.actualEE ?? null
    const reportedER = reconciliation?.totals?.actualER ?? null
    const reportedContribution =
        reportedEE === null || reportedER === null
            ? null
            : reportedEE + reportedER
    const overUnder =
        reportedContribution === null
            ? null
            : reportedContribution - payrollContribution
    const zeroReview =
        reportedContribution !== null &&
        payrollContribution === 0 &&
        reportedContribution === 0
    const coverageWarning = buildCoverageWarning(
        allEntries,
        entriesForYear,
        coverageEntriesPrecomputed
    )
    return {
        yearKey,
        anchorId: `year-summary-${formatYearAnchor(yearKey)}`,
        hours,
        holidaySummary,
        annualCrossCheck,
        monthBreakdown,
        annualCrossCheckDisplay: annualCrossCheck
            ? buildAnnualCrossCheckDisplay(
                  annualCrossCheck,
                  holidaySummary.kind === 'hourly_hours'
                      ? holidaySummary.holidayHours
                      : 0
              )
            : null,
        payrollContribution: {
            total: payrollContribution,
            ee: payrollEE,
            er: payrollER,
        },
        reportedContribution: {
            total: reportedContribution,
            ee: reportedEE,
            er: reportedER,
        },
        overUnder,
        zeroReview,
        coverageWarning,
        hasFlags: entriesForYear.some((/** @type {ReportEntry} */ entry) =>
            (entry.validation?.flags || []).some(
                (flag) => flag.severity !== 'notice'
            )
        ),
    }
}

/** @param {any} context @param {any} meta */
export function buildSummaryViewModel(context, meta) {
    const entries = /** @type {ReportEntry[]} */ (context.entries || [])
    const yearGroups = /** @type {Map<string, any>} */ (
        context.yearGroups || new Map()
    )
    const workerProfile = buildWorkerProfileMeta(context.workerProfile || null)
    const contributionMeta = context.contributionMeta || {
        fileCount: 0,
        recordCount: 0,
        dateRangeLabel: 'Unknown',
    }
    const leaveYearGroups = /** @type {Map<string, any>} */ (
        context.leaveYearGroups || buildLeaveYearGroups(entries)
    )
    const flaggedPeriods = context.validationSummary?.flaggedPeriods ?? []
    const lowConfidencePeriods =
        context.validationSummary?.lowConfidenceEntries?.map(
            (/** @type {ReportEntry} */ entry) =>
                entry.parsedDate
                    ? formatDateLabel(entry.parsedDate)
                    : entry.record.payrollDoc?.processDate?.date || 'Unknown'
        ) ?? []
    const groupedMissingMonths = groupMonthsByYear(
        context.missingMonths?.missingMonthsByYear
    )
    const groupedFlaggedPeriods = groupPeriodsByYear(flaggedPeriods)
    const groupedLowConfidencePeriods = groupPeriodsByYear(lowConfidencePeriods)
    const miscReviewItems = buildMiscReviewItemsFromFootnotes(
        context.miscFootnotes
    )
    const auditMetadata = context.auditMetadata || null
    const pdfCount = entries.length
    const metaRows = [
        {
            id: 'payroll',
            label: 'Payroll',
            value: `${meta.dateRangeLabel || 'Unknown'} · ${pdfCount} PDF${pdfCount !== 1 ? 's' : ''}`,
            displayValue: `${meta.dateRangeLabel || 'Unknown'} · ${pdfCount} PDF${pdfCount !== 1 ? 's' : ''}`,
        },
        {
            id: 'pension',
            label: 'Pension',
            value: contributionMeta.fileCount
                ? `${contributionMeta.dateRangeLabel || 'Unknown'} · ${contributionMeta.fileCount} file${contributionMeta.fileCount !== 1 ? 's' : ''} (${contributionMeta.recordCount ?? 0} records)`
                : 'None',
            displayValue: contributionMeta.fileCount
                ? `${contributionMeta.dateRangeLabel || 'Unknown'} · ${contributionMeta.fileCount} file${contributionMeta.fileCount !== 1 ? 's' : ''} (${contributionMeta.recordCount ?? 0} records)`
                : 'None',
        },
        ...(auditMetadata?.rulesVersion && auditMetadata?.thresholdsVersion
            ? [
                  {
                      id: 'rule-snapshot',
                      label: 'Rule snapshot',
                      value: `Rules ${auditMetadata.rulesVersion} · Thresholds ${auditMetadata.thresholdsVersion}`,
                      displayValue: `Rules ${auditMetadata.rulesVersion} · Thresholds ${auditMetadata.thresholdsVersion}`,
                  },
              ]
            : []),
        {
            id: 'worker-profile',
            label: 'Worker profile',
            value: null,
            displayValue: null,
            workerProfile,
        },
        {
            id: 'missing-payroll-months',
            label: 'Missing payroll months',
            value: formatMonthsByYear(
                context.missingMonths?.missingMonthsByYear
            ),
            displayValue: formatMonthsByYear(
                context.missingMonths?.missingMonthsByYear
            ),
            groupedMonths: groupedMissingMonths,
            emptyLabel: 'None',
        },
        {
            id: 'flagged-periods',
            label: 'Flagged periods',
            value: formatPeriodsByYear(flaggedPeriods, 'None'),
            displayValue: formatPeriodsByYear(flaggedPeriods, 'None'),
            groupedPeriods: groupedFlaggedPeriods,
            emptyLabel: 'None',
        },
        {
            id: 'low-confidence-periods',
            label: 'Low confidence periods',
            value: formatPeriodsByYear(lowConfidencePeriods, '0'),
            displayValue: formatPeriodsByYear(lowConfidencePeriods, '0'),
            groupedPeriods: groupedLowConfidencePeriods,
            emptyLabel: '0',
        },
    ]
    const coverageEntriesPrecomputed = prepareCoverageEntries(entries)
    const yearSummaryRows = Array.from(yearGroups.entries())
        .filter(([yearKey]) => Boolean(yearKey) && yearKey !== 'Unknown')
        .map(([yearKey, entriesForYear]) =>
            buildSummaryYearRow(
                entries,
                entriesForYear,
                String(yearKey),
                leaveYearGroups,
                context.workerProfile || null,
                coverageEntriesPrecomputed
            )
        )
    const yearsWithCoverageWarnings = yearSummaryRows
        .filter((row) => Boolean(row.coverageWarning))
        .map((row) => row.yearKey)
    const globalCoverageNotice = yearsWithCoverageWarnings.length
        ? {
              message: buildGlobalCoverageNoticeMessage(
                  yearsWithCoverageWarnings
              ),
              affectedYears: yearsWithCoverageWarnings,
          }
        : null

    const thresholdStalenessContext = context.thresholdStaleness || null
    const runDate = thresholdStalenessContext?.reportRunDateIso
        ? new Date(thresholdStalenessContext.reportRunDateIso)
        : null
    const isValidRunDate =
        runDate instanceof Date && !Number.isNaN(runDate.getTime())
    const runMonth = isValidRunDate ? runDate.getMonth() : -1
    const runDay = isValidRunDate ? runDate.getDate() : -1
    const isAfterAprilSix =
        isValidRunDate && (runMonth > 3 || (runMonth === 3 && runDay > 6))
    const hasNewTaxYearFallback =
        Boolean(thresholdStalenessContext?.hasRunTaxYearFallback) &&
        (thresholdStalenessContext?.affectedPeriods?.length || 0) > 0
    const thresholdStalenessNotice =
        isAfterAprilSix && hasNewTaxYearFallback
            ? {
                  message: buildThresholdStalenessNoticeMessage({
                      runTaxYearLabel:
                          thresholdStalenessContext?.runTaxYearLabel || null,
                      fallbackTaxYearLabels:
                          thresholdStalenessContext?.fallbackTaxYearLabels ||
                          [],
                      affectedPeriods:
                          thresholdStalenessContext?.affectedPeriods || [],
                  }),
                  affectedPeriods:
                      thresholdStalenessContext?.affectedPeriods || [],
              }
            : null

    const notes = /** @type {Array<{ id: string, text: string }>} */ ([
        {
            id: 'accumulated-totals',
            text: ACCUMULATED_TOTALS_NOTE,
        },
    ])
    const hasAprilEntry = entries.some(
        (entry) =>
            entry.parsedDate instanceof Date &&
            entry.parsedDate.getMonth() === 3
    )
    let lowPayThresholds =
        /** @type {{ personalAllowanceAnnual: number, personalAllowanceMonthly: number } | null} */ (
            null
        )
    const hasLowPretaxPay = entries.some((entry) => {
        const gross = entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        const thresholds = getTaxYearThresholdsForContext(
            entry.parsedDate,
            entry.yearKey
        )
        if (!thresholds) {
            return false
        }
        const isLowPay =
            typeof gross === 'number' &&
            gross < thresholds.personalAllowanceMonthly
        if (isLowPay && !lowPayThresholds) {
            lowPayThresholds = thresholds
        }
        return isLowPay
    })
    if (hasAprilEntry) {
        notes.push({
            id: 'april-boundary',
            text: APRIL_BOUNDARY_NOTE,
        })
    }
    if (hasLowPretaxPay) {
        notes.push({
            id: 'zero-tax-allowance',
            text: buildZeroTaxAllowanceNote(lowPayThresholds),
        })
    }
    return {
        heading: {
            employeeName: meta.employeeName || 'Unknown',
            dateRangeLabel: meta.dateRangeLabel || 'Unknown',
            generatedLabel: context.reportGeneratedLabel || null,
        },
        metaRows,
        contractTypeMismatchWarning:
            context.contractTypeMismatchWarning || null,
        globalCoverageNotice,
        thresholdStalenessNotice,
        yearSummaryRows,
        accumulatedTotals: {
            dateRangeLabel: meta.dateRangeLabel || 'Unknown',
            payrollContribution: {
                total: context.contributionTotals?.payrollContribution ?? 0,
                ee: context.contributionTotals?.payrollEE ?? 0,
                er: context.contributionTotals?.payrollER ?? 0,
            },
            reportedContribution: {
                total: context.contributionTotals?.reportedContribution ?? null,
                ee: context.contributionTotals?.pensionEE ?? null,
                er: context.contributionTotals?.pensionER ?? null,
            },
            contributionDifference:
                context.contributionTotals?.contributionDifference ?? null,
            contributionRecency: context.contributionRecency || null,
            hasContributionSummary: Boolean(context.contributionSummary?.years),
        },
        miscReviewItems: miscReviewItems.length
            ? miscReviewItems
            : collectMiscReviewItems(entries),
        notes,
    }
}

/** @param {any} entriesForYear @param {string} yearKey @param {any} context @param {number} openingBalance @param {{ sortedEntries: HolidayCoverageEntry[], normalizedEntryByOriginalEntry: Map<ReportEntry, HolidayCoverageEntry> } | null} [coverageEntriesPrecomputed] */
export function buildYearViewModel(
    entriesForYear,
    yearKey,
    context,
    openingBalance,
    coverageEntriesPrecomputed = null
) {
    const yearEntries = /** @type {ReportEntry[]} */ (entriesForYear || [])
    const allEntries = /** @type {ReportEntry[]} */ (context.entries || [])
    const globalEntryIndexByEntry = new Map(
        allEntries.map((entry, index) => [entry, index])
    )
    const monthEntries = new Map()
    yearEntries.forEach((entry) => {
        if (entry.monthIndex >= 1 && entry.monthIndex <= 12) {
            if (!monthEntries.has(entry.monthIndex)) {
                monthEntries.set(entry.monthIndex, [])
            }
            monthEntries.get(entry.monthIndex).push(entry)
        }
    })
    const reconciliation = entriesForYear.reconciliation || null
    const { noteLabels, refsByEntry } = buildYearFlagModel(yearEntries)
    const workerProfile = context.workerProfile || null
    const leaveYearGroups = buildLeaveYearGroups(yearEntries)
    const yearHolidaySummary = buildYearHolidaySummary(
        yearEntries,
        leaveYearGroups,
        workerProfile
    )
    const isSalarySummaryKind =
        yearHolidaySummary.kind === 'salary_days' ||
        yearHolidaySummary.kind === 'salary_amount'
    const hasSalaryPaymentEntries = yearEntries.some((entry) => {
        const salary = entry.record?.payrollDoc?.payments?.salary
        return (
            (salary?.basic?.amount ?? 0) > 0 ||
            (salary?.holiday?.amount ?? 0) > 0
        )
    })
    const isSalaryContext = isSalarySummaryKind || hasSalaryPaymentEntries
    const typicalDays = workerProfile?.typicalDays ?? 0
    const workingDaysPerMonth = typicalDays > 0 ? (typicalDays * 52) / 12 : 0
    const rows = /** @type {Array<any>} */ ([])
    let totalHours = 0
    let totalHolidayHours = 0
    let totalPayrollEE = 0
    let totalPayrollER = 0
    let totalPayrollContribution = 0
    let totalReportedEE = null
    let totalReportedER = null

    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const calendarMonthIndex = getCalendarMonthFromFiscalIndex(monthIndex)
        const monthLabelBase = calendarMonthIndex
            ? formatMonthLabel(calendarMonthIndex)
            : 'Unknown'
        const monthAnchorId = `year-monthly-${formatYearAnchor(yearKey)}-${String(
            monthIndex
        ).padStart(2, '0')}`
        const monthRows = /** @type {ReportEntry[]} */ (
            monthEntries.get(monthIndex) || []
        )
            .slice()
            .sort((a, b) => {
                const aDate =
                    a.parsedDate ||
                    a.record.payrollDoc?.processDate?.date ||
                    null
                const bDate =
                    b.parsedDate ||
                    b.record.payrollDoc?.processDate?.date ||
                    null
                if (!aDate && !bDate) {
                    return 0
                }
                if (!aDate) {
                    return 1
                }
                if (!bDate) {
                    return -1
                }
                return new Date(aDate).getTime() - new Date(bDate).getTime()
            })
        const reconMonth = reconciliation?.months?.get(monthIndex) || null
        const actualEE = reconMonth?.actualEE ?? null
        const actualER = reconMonth?.actualER ?? null
        const reportedContribution =
            actualEE === null || actualER === null ? null : actualEE + actualER

        if (monthRows.length) {
            monthRows.forEach((entry, entryIndex) => {
                const hours =
                    entry.record.payrollDoc?.payments?.hourly?.basic?.units || 0
                const holidaySummary = buildEntryHolidaySummary(entry)
                const salaryBasicAmount =
                    entry.record.payrollDoc?.payments?.salary?.basic?.amount ||
                    0
                const salaryHolidayAmount =
                    entry.record.payrollDoc?.payments?.salary?.holiday
                        ?.amount || 0
                const salaryHolidayEstimatedDays =
                    workingDaysPerMonth > 0 && salaryBasicAmount > 0
                        ? salaryHolidayAmount /
                          (salaryBasicAmount / workingDaysPerMonth)
                        : null
                const payrollEE =
                    entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
                const payrollER =
                    entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
                const payrollContribution = payrollEE + payrollER
                const overUnder =
                    reportedContribution === null
                        ? null
                        : reportedContribution - payrollContribution
                const zeroReview =
                    payrollContribution === 0 && reportedContribution === 0
                rows.push({
                    id: `${yearKey}-${monthIndex}-${entryIndex}`,
                    kind: 'entry',
                    monthIndex,
                    monthLabel:
                        monthRows.length > 1
                            ? `${monthLabelBase} (${entryIndex + 1})`
                            : monthLabelBase,
                    monthAnchorId,
                    globalEntryIndex:
                        globalEntryIndexByEntry.get(entry) ?? null,
                    hours,
                    holidaySummary,
                    salaryHolidayAmount,
                    salaryHolidayEstimatedDays,
                    payrollContribution: {
                        total: payrollContribution,
                        ee: payrollEE,
                        er: payrollER,
                    },
                    reportedContribution: {
                        total: reportedContribution,
                        ee: actualEE,
                        er: actualER,
                    },
                    overUnder,
                    zeroReview,
                    flagRefs: refsByEntry.get(entry) || [],
                })
                totalHours += hours
                totalHolidayHours += holidaySummary.holidayHours
                totalPayrollEE += payrollEE
                totalPayrollER += payrollER
                totalPayrollContribution += payrollContribution
            })
        } else {
            rows.push({
                id: `${yearKey}-${monthIndex}-empty`,
                kind: 'empty',
                monthIndex,
                monthLabel: monthLabelBase,
                monthAnchorId,
                globalEntryIndex: null,
                hours: 0,
                holidaySummary: {
                    kind: 'hours_only',
                    holidayHours: 0,
                    hasVariablePattern: false,
                },
                salaryHolidayAmount: 0,
                salaryHolidayEstimatedDays: null,
                payrollContribution: {
                    total: 0,
                    ee: 0,
                    er: 0,
                },
                reportedContribution: {
                    total: reportedContribution,
                    ee: actualEE,
                    er: actualER,
                },
                overUnder:
                    reportedContribution === null ? null : reportedContribution,
                zeroReview:
                    reportedContribution !== null && reportedContribution === 0,
                flagRefs: [],
            })
        }
    }

    if (reconciliation) {
        totalReportedEE = reconciliation.totals?.actualEE ?? null
        totalReportedER = reconciliation.totals?.actualER ?? null
    }
    const totalReportedContribution =
        totalReportedEE === null || totalReportedER === null
            ? null
            : totalReportedEE + totalReportedER
    const totalOverUnder =
        totalReportedContribution === null
            ? null
            : totalReportedContribution - totalPayrollContribution
    const closingBalance =
        reconciliation && totalOverUnder !== null
            ? openingBalance + totalOverUnder
            : null
    const footerRows = /** @type {Array<any>} */ ([])
    if (reconciliation && openingBalance !== 0) {
        footerRows.push({
            id: 'opening-balance',
            label: 'Opening Balance',
            hours: null,
            holidayHours: null,
            payrollContribution: null,
            reportedContribution: null,
            overUnder: openingBalance,
            zeroReview: false,
            flagRefs: [],
        })
    }
    const coverageWarning = buildCoverageWarning(
        allEntries,
        yearEntries,
        coverageEntriesPrecomputed ?? prepareCoverageEntries(allEntries)
    )
    const annualCrossCheck =
        yearHolidaySummary.kind === 'hourly_hours'
            ? yearHolidaySummary.annualCrossCheck || null
            : null
    footerRows.push({
        id: 'total',
        label: 'Total',
        hours: totalHours,
        holidayHours: totalHolidayHours,
        yearHolidaySummary,
        payrollContribution: {
            total: totalPayrollContribution,
            ee: totalPayrollEE,
            er: totalPayrollER,
        },
        reportedContribution: {
            total: totalReportedContribution,
            ee: totalReportedEE,
            er: totalReportedER,
        },
        overUnder: totalOverUnder,
        zeroReview:
            totalPayrollContribution === 0 && totalReportedContribution === 0,
        flagRefs: [],
    })
    if (reconciliation && closingBalance !== null) {
        footerRows.push({
            id: 'closing-balance',
            label: 'Closing Pensions Balance',
            hours: null,
            holidayHours: null,
            payrollContribution: null,
            reportedContribution: null,
            overUnder: closingBalance,
            zeroReview: false,
            flagRefs: [],
        })
    }
    const notes = /** @type {Array<{ id: string, text: string }>} */ ([])
    const hasAprilEntry = yearEntries.some(
        (entry) =>
            entry.parsedDate instanceof Date &&
            entry.parsedDate.getMonth() === 3
    )
    let lowPayThresholds =
        /** @type {{ personalAllowanceAnnual: number, personalAllowanceMonthly: number } | null} */ (
            null
        )
    const hasLowPretaxPay = yearEntries.some((entry) => {
        const gross = entry.record.payrollDoc?.thisPeriod?.totalGrossPay?.amount
        const thresholds = getTaxYearThresholdsForContext(
            entry.parsedDate,
            entry.yearKey
        )
        if (!thresholds) {
            return false
        }
        const isLowPay =
            typeof gross === 'number' &&
            gross < thresholds.personalAllowanceMonthly
        if (isLowPay && !lowPayThresholds) {
            lowPayThresholds = thresholds
        }
        return isLowPay
    })
    if (hasAprilEntry) {
        notes.push({
            id: 'april-boundary',
            text: APRIL_BOUNDARY_NOTE,
        })
    }
    if (hasLowPretaxPay) {
        notes.push({
            id: 'zero-tax-allowance',
            text: buildZeroTaxAllowanceNote(lowPayThresholds),
        })
    }
    return {
        heading: {
            yearKey,
            anchorId: `year-summary-${formatYearAnchor(yearKey)}`,
        },
        yearHolidaySummary,
        annualCrossCheck,
        isAccrualHourlyContext:
            yearHolidaySummary.kind === 'hourly_hours' ||
            yearHolidaySummary.kind === 'hourly_variable',
        isFixedScheduleHourlyContext:
            yearHolidaySummary.kind === 'hourly_hours' &&
            (workerProfile?.typicalDays ?? 0) > 0,
        isSalaryContext,
        monthBreakdown:
            yearHolidaySummary.kind === 'hourly_hours'
                ? yearHolidaySummary.monthBreakdown || []
                : [],
        annualCrossCheckDisplay: annualCrossCheck
            ? buildAnnualCrossCheckDisplay(
                  annualCrossCheck,
                  yearHolidaySummary.kind === 'hourly_hours'
                      ? yearHolidaySummary.holidayHours
                      : 0
              )
            : null,
        coverageWarning,
        missingMonths:
            context.missingMonths?.missingMonthsByYear?.[yearKey] || [],
        rows,
        footerRows,
        miscReviewItems: (() => {
            const fromCtx = buildMiscReviewItemsFromFootnotes(
                (context.miscFootnotes || []).filter(
                    (/** @type {{ yearKey?: string | null }} */ fn) =>
                        fn.yearKey === yearKey
                )
            )
            return fromCtx.length
                ? fromCtx
                : collectMiscReviewItems(yearEntries)
        })(),
        flagNotes: noteLabels,
        notes,
    }
}

/**
 * @param {ReportEntry} entry
 * @returns {boolean}
 */
function isHolidayCoverageTarget(entry) {
    if (!(entry.parsedDate instanceof Date)) {
        return false
    }
    if (Number.isNaN(entry.parsedDate.getTime())) {
        return false
    }
    const holiday = entry.record?.payrollDoc?.payments?.hourly?.holiday
    return (holiday?.units ?? 0) > 0 && (holiday?.amount ?? 0) > 0
}

/**
 * @param {ReportEntry[]} entries
 * @returns {HolidayCoverageEntry[]}
 */
function normalizeHolidayCoverageEntries(entries) {
    return entries.map((entry) => ({
        ...entry,
        yearKey: entry.yearKey ?? null,
    }))
}

/**
 * Precompute normalized + sorted coverage entries and a lookup map from original
 * to normalized entry. Call once per report and pass the result into
 * buildCoverageWarning to avoid redundant O(N log N) sorts across year rows.
 *
 * @param {ReportEntry[]} allEntries
 * @returns {{ sortedEntries: HolidayCoverageEntry[], normalizedEntryByOriginalEntry: Map<ReportEntry, HolidayCoverageEntry> }}
 */
export function prepareCoverageEntries(allEntries) {
    // Normalize allEntries once so that the same object references appear in both
    // sortedEntries and normalizedHolidayTargets. getRollingReferenceCoverage uses
    // entry === targetEntry (object identity) to skip the target month; a second
    // independent normalization pass would create different objects and break that skip.
    const normalizedAllEntries = normalizeHolidayCoverageEntries(allEntries)
    const normalizedEntryByOriginalEntry = new Map(
        allEntries.map((entry, index) => [entry, normalizedAllEntries[index]])
    )
    const sortedEntries = normalizedAllEntries
        .slice()
        .sort(
            (
                /** @type {HolidayCoverageEntry} */ a,
                /** @type {HolidayCoverageEntry} */ b
            ) => {
                const aTime =
                    a.parsedDate instanceof Date ? a.parsedDate.getTime() : 0
                const bTime =
                    b.parsedDate instanceof Date ? b.parsedDate.getTime() : 0
                return aTime - bTime
            }
        )
    return { sortedEntries, normalizedEntryByOriginalEntry }
}

/**
 * Compute the holiday-reference coverage warning for a set of year entries.
 * @param {ReportEntry[]} allEntries
 * @param {ReportEntry[]} entriesForYear
 * @param {{ sortedEntries: HolidayCoverageEntry[], normalizedEntryByOriginalEntry: Map<ReportEntry, HolidayCoverageEntry> } | null} [precomputed]
 * @returns {CoverageWarning | null}
 */
function buildCoverageWarning(allEntries, entriesForYear, precomputed = null) {
    const holidayTargets = entriesForYear.filter(isHolidayCoverageTarget)
    if (!holidayTargets.length) {
        return null
    }

    const { sortedEntries, normalizedEntryByOriginalEntry } =
        precomputed ?? prepareCoverageEntries(allEntries)
    const normalizedHolidayTargets = holidayTargets
        .map((entry) => normalizedEntryByOriginalEntry.get(entry))
        .filter(
            (/** @type {HolidayCoverageEntry | undefined} */ entry) =>
                entry !== undefined
        )

    /** @type {{ periodsCounted: number, totalWeeks: number } | null} */
    let insufficientCoverage = null
    /** @type {{ periodsCounted: number, totalWeeks: number } | null} */
    let limitedCoverage = null

    normalizedHolidayTargets.forEach((entry) => {
        const coverage = getRollingReferenceCoverage(sortedEntries, entry)
        if (coverage.periodsCounted < 3) {
            if (
                !insufficientCoverage ||
                coverage.periodsCounted < insufficientCoverage.periodsCounted ||
                (coverage.periodsCounted ===
                    insufficientCoverage.periodsCounted &&
                    coverage.totalWeeks < insufficientCoverage.totalWeeks)
            ) {
                insufficientCoverage = {
                    periodsCounted: coverage.periodsCounted,
                    totalWeeks: coverage.totalWeeks,
                }
            }
            return
        }

        if (coverage.totalWeeks >= 52) {
            return
        }

        if (
            !limitedCoverage ||
            coverage.totalWeeks < limitedCoverage.totalWeeks ||
            (coverage.totalWeeks === limitedCoverage.totalWeeks &&
                coverage.periodsCounted < limitedCoverage.periodsCounted)
        ) {
            limitedCoverage = {
                periodsCounted: coverage.periodsCounted,
                totalWeeks: coverage.totalWeeks,
            }
        }
    })

    if (insufficientCoverage) {
        const warning =
            /** @type {{ periodsCounted: number, totalWeeks: number }} */ (
                insufficientCoverage
            )
        return {
            kind: 'insufficient_months',
            periodsCounted: warning.periodsCounted,
            totalWeeks: warning.totalWeeks,
            message: buildCoverageWarningMessage(warning),
        }
    }

    if (!limitedCoverage) {
        return null
    }

    const warning =
        /** @type {{ periodsCounted: number, totalWeeks: number }} */ (
            limitedCoverage
        )

    return {
        kind: 'limited_weeks',
        periodsCounted: warning.periodsCounted,
        totalWeeks: warning.totalWeeks,
        message: buildCoverageWarningMessage(warning),
    }
}
