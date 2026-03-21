/**
 * @typedef {import('../parse/payroll.types.js').PayrollRecord} PayrollRecord
 * @typedef {import('../parse/payroll.types.js').PayrollPayItem} PayrollPayItem
 * @typedef {import('../parse/payroll.types.js').PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {{ id: string, label: string, noteIndex?: number }} ValidationFlag
 * @typedef {{ flags: ValidationFlag[], lowConfidence: boolean }} ValidationResult
 * @typedef {{ record: PayrollRecordWithImage, parsedDate: Date | null, validation?: ValidationResult }} ReportEntry
 * @typedef {{ id: string, marker: string | null, text: string }} FooterNote
 */
import { APRIL_BOUNDARY_NOTE, formatMiscLabel } from './report_formatters.js'
import { formatDateLabel } from './tax_year_utils.js'
import { buildEntryHolidaySummary } from './year_holiday_summary.js'

const EMPLOYER_CONTRIBUTION_NOTE =
    'Employer contribution — paid by the employer on top of your salary, not deducted from your net pay.'

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
                      `Avg ${entryHolidaySummary.avgWeeklyHours.toFixed(2)} hrs/week over ${entryHolidaySummary.typicalDays} days -> 1 day ≈ ${entryHolidaySummary.avgHoursPerDay.toFixed(2)} hrs.`,
                      `This payslip: ${entryHolidaySummary.holidayHours.toFixed(2)} hrs ≈ ${holidayEstimatedDays} days.`,
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
        footerNotes,
        flags: {
            lowConfidence: Boolean(validation.lowConfidence),
            warningCount: warnings.length,
        },
    }
}
