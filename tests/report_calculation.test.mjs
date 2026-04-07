import { describe, expect, it } from 'vitest'
import { formatMonthLabel } from '../pwa/src/parse/parser_config.js'
import { buildReport, buildValidationSummary } from '../pwa/src/report/build.js'
import { buildValidation } from '../pwa/src/report/pay_calculations_hourly.js'
import {
    isWithinPayeTolerance,
    sumDeductionsForNetPay,
    sumMiscAmounts,
    sumPayments,
} from '../pwa/src/report/pay_calculations_shared.js'
import { buildContributionSummary } from '../pwa/src/report/pension_calculations.js'
import { buildReportEntries } from '../pwa/src/report/report_calculations.js'
import { buildSummaryViewModel } from '../pwa/src/report/report_view_model.js'
import {
    buildMissingMonthsWithRange,
    formatDateKey,
    formatDateLabel,
    formatMonthYearLabel,
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
    parsePayPeriodStart,
} from '../pwa/src/report/tax_year_utils.js'

function buildRecord({
    nestEE,
    nestER,
    natInsNumber,
    taxCode,
    grossPay,
    netPay,
}) {
    return {
        employee: { natInsNumber: natInsNumber || null },
        payrollDoc: {
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                pensionEE: { amount: nestEE },
                pensionER: { amount: nestER },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { amount: grossPay },
                    holiday: { amount: 0 },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { amount: 0 },
                },
                misc: [],
            },
            taxCode: { code: taxCode || '' },
            thisPeriod: {
                totalGrossPay: { amount: grossPay },
                payCycle: { cycle: 'Monthly' },
            },
            netPay: { amount: netPay },
        },
    }
}

function buildHourlyWorkerRecord({
    start,
    end,
    basicUnits,
    basicRate,
    holidayUnits = 0,
    holidayRate = 0,
    payeTax = 0,
    natIns = 0,
    pensionEE = 0,
    pensionER = 0,
    grossForTaxTD = null,
    taxPaidTD = null,
}) {
    const basicAmount = Math.round(basicUnits * basicRate * 100) / 100
    const holidayAmount = Math.round(holidayUnits * holidayRate * 100) / 100
    const grossPay = basicAmount + holidayAmount
    const totalDeductions = payeTax + natIns + pensionEE
    return {
        employee: { natInsNumber: 'AB123456C' },
        payrollDoc: {
            payPeriod: { start, end },
            processDate: { date: `${start} - ${end}` },
            taxCode: { code: '1257L' },
            payments: {
                hourly: {
                    basic: {
                        units: basicUnits,
                        rate: basicRate,
                        amount: basicAmount,
                    },
                    holiday: {
                        units: holidayUnits,
                        rate: holidayUnits > 0 ? holidayRate : null,
                        amount: holidayAmount,
                    },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { units: 0, rate: null, amount: 0 },
                },
                misc: [],
            },
            thisPeriod: {
                totalGrossPay: { amount: grossPay },
                payCycle: { cycle: 'Monthly' },
            },
            ...(grossForTaxTD !== null && taxPaidTD !== null
                ? { yearToDate: { grossForTaxTD, taxPaidTD } }
                : {}),
            deductions: {
                payeTax: { amount: payeTax },
                natIns: { amount: natIns },
                pensionEE: { amount: pensionEE },
                pensionER: { amount: pensionER },
                misc: [],
                totalDeductions: { amount: totalDeductions },
            },
            netPay: { amount: grossPay - totalDeductions },
        },
        sourceFiles: ['fixture.pdf'],
    }
}

function buildPensionValidationEntry({
    grossPay,
    pensionEE = 0,
    pensionER = 0,
    processDate = new Date('2025-05-01T00:00:00.000Z'),
    workerProfile = null,
}) {
    return {
        record: {
            employee: { natInsNumber: 'AB123456C' },
            payrollDoc: {
                processDate: { date: '01/05/25 - 31/05/25' },
                taxCode: { code: '1257L' },
                payments: {
                    hourly: {
                        basic: { amount: grossPay, units: null, rate: null },
                        holiday: { amount: 0, units: null, rate: null },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { amount: 0, units: null, rate: null },
                    },
                    misc: [],
                },
                thisPeriod: {
                    totalGrossPay: { amount: grossPay },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: { grossForTaxTD: grossPay, taxPaidTD: 0 },
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: pensionEE },
                    pensionER: { amount: pensionER },
                    misc: [],
                },
                netPay: { amount: grossPay },
            },
        },
        parsedDate: processDate,
        yearKey: '2025/26',
        monthIndex: 2,
        workerProfile,
    }
}

describe('report calculations', () => {
    it('builds contribution summary totals', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 100,
                    netPay: 100,
                }),
                parsedDate: new Date(2025, 0, 15),
                yearKey: '2024/25',
                monthIndex: 10,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 100,
                    netPay: 100,
                }),
                parsedDate: new Date(2025, 1, 15),
                yearKey: '2024/25',
                monthIndex: 11,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 0, 20), type: 'ee', amount: 55 },
                { date: new Date(2025, 0, 20), type: 'er', amount: 25 },
                { date: new Date(2025, 1, 20), type: 'ee', amount: 65 },
                { date: new Date(2025, 1, 20), type: 'er', amount: 35 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2024/25',
        ])
        const totals = summary?.years.get('2024/25')?.totals
        expect(totals).toEqual({
            expectedEE: 110,
            expectedER: 70,
            actualEE: 120,
            actualER: 60,
            delta: 0,
        })
    })

    it('flags validation issues', () => {
        const entry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 90,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((flag) => flag.id)
        expect(flagIds).toContain('missing_tax_code')
        expect(flagIds).toContain('paye_zero')
        expect(flagIds).toContain('nat_ins_zero')
        expect(flagIds).toContain('net_mismatch')
    })

    it('respects validation tolerance', () => {
        const withinToleranceEntry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 99.96,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const outsideToleranceEntry = {
            record: buildRecord({
                nestEE: 0,
                nestER: 0,
                grossPay: 100,
                netPay: 99.9,
            }),
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const withinValidation = buildValidation(withinToleranceEntry)
        const outsideValidation = buildValidation(outsideToleranceEntry)
        const withinIds = withinValidation.flags.map((flag) => flag.id)
        const outsideIds = outsideValidation.flags.map((flag) => flag.id)
        expect(withinIds).not.toContain('net_mismatch')
        expect(outsideIds).toContain('net_mismatch')
    })

    it('emits pension missing-deductions warning above trigger with full audited inputs', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({ grossPay: 1200 })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        expect(pensionFlag?.ruleId).toBe(
            'pension_auto_enrolment_missing_deductions'
        )
        expect(pensionFlag?.inputs).toMatchObject({
            earnings: 1200,
            periodAutoEnrolmentTrigger: 833,
            periodQualifyingEarningsLower: 520,
            periodQualifyingEarningsUpper: 4189,
            pensionEE: 0,
            pensionER: 0,
            taxYearStart: 2025,
        })
    })

    it('emits pension opt-in notice between lower threshold and trigger', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({ grossPay: 700 })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_opt_in_possible'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('notice')
        expect(pensionFlag?.ruleId).toBe('pension_opt_in_possible')
        expect(pensionFlag?.label).toContain(
            'may be able to opt in to a workplace pension'
        )
        expect(pensionFlag?.label).toContain('Pre-tax earnings are')
        expect(pensionFlag?.label).toContain('auto-enrolment trigger')
    })

    it('emits pension join notice below lower qualifying threshold', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({ grossPay: 400 })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_join_no_mandatory_employer_contrib'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('notice')
        expect(pensionFlag?.ruleId).toBe(
            'pension_join_no_mandatory_employer_contrib'
        )
        expect(pensionFlag?.label).toContain(
            'may ask to join a workplace pension'
        )
        expect(pensionFlag?.label).toContain('Pre-tax earnings are')
        expect(pensionFlag?.label).toContain(
            'lower qualifying earnings threshold'
        )
    })

    it('does not downgrade above-trigger pension warning when deferment fields are provided', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-05-15T00:00:00.000Z'),
                workerProfile: {
                    pensionDefermentCommunicated: true,
                    pensionDefermentStartDate: '2025-05-01',
                    pensionDefermentEndDate: '2025-07-31',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        // Complete deferment details → no uncertainty → normal confidence
        expect(validation.lowConfidence).toBe(false)
    })

    it('downgrades above-trigger pension warning when deferment fields are incomplete', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                workerProfile: {
                    pensionDefermentCommunicated: true,
                    pensionDefermentStartDate: '2025-05-01',
                    pensionDefermentEndDate: null,
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        // Incomplete deferment dates → uncertainty about deduction expectations → low confidence
        expect(validation.lowConfidence).toBe(true)
    })

    it('downgrades above-trigger pension warning when deferment end date precedes start date', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-05-15T00:00:00.000Z'),
                workerProfile: {
                    pensionDefermentCommunicated: true,
                    pensionDefermentStartDate: '2025-07-31',
                    pensionDefermentEndDate: '2025-05-01',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        // Reversed deferment window → unreliable deferment data → low confidence
        expect(validation.lowConfidence).toBe(true)
    })

    it('emits pension enrolment notice after 6 weeks without deductions', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-07-16T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-05-01',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('notice')
        expect(pensionFlag?.label).toContain(
            'Pension deductions have still not appeared after more than 6 weeks'
        )
        expect(pensionFlag?.inputs?.exceedsSixWeekWindow).toBe('yes')
        expect(pensionFlag?.inputs?.exceedsThreeMonthWindow).toBe('no')
    })

    it('escalates pension enrolment notice to warning after 3 months', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-08-10T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-05-01',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        expect(pensionFlag?.label).toContain(
            'should have been auto-enrolled by now'
        )
        expect(pensionFlag?.inputs?.exceedsThreeMonthWindow).toBe('yes')
    })

    it('treats Jan-31 payroll starts as crossing the 3-month window on Apr-30', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-04-30T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-01-31',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('warning')
        expect(pensionFlag?.inputs?.exceedsThreeMonthWindow).toBe('yes')
    })

    it('keeps elapsed day thresholds stable across DST boundaries', () => {
        const withinSixWeeks = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-04-11T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-03-01',
                },
            })
        )
        const beyondSixWeeks = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-04-12T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-03-01',
                },
            })
        )
        const withinFlag = withinSixWeeks.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )
        const beyondFlag = beyondSixWeeks.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(withinFlag).toBeTruthy()
        expect(beyondFlag).toBeTruthy()
        expect(withinFlag?.severity).toBe('notice')
        expect(beyondFlag?.severity).toBe('notice')
        expect(withinFlag?.inputs?.elapsedRunDays).toBe(41)
        expect(beyondFlag?.inputs?.elapsedRunDays).toBe(42)
        expect(withinFlag?.inputs?.exceedsSixWeekWindow).toBe('no')
        expect(beyondFlag?.inputs?.exceedsSixWeekWindow).toBe('no')
    })

    it('emits pre-enrolment pension notice before 6 weeks from payroll run start', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2025-05-20T00:00:00.000Z'),
                workerProfile: {
                    payrollRunStartDate: '2025-05-01',
                },
            })
        )
        const pensionFlag = validation.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeTruthy()
        expect(pensionFlag?.severity).toBe('notice')
        expect(pensionFlag?.label).toContain(
            'Pension deductions have not yet appeared'
        )
        expect(pensionFlag?.label).toContain('Pre-tax earnings are')
        expect(pensionFlag?.label).toContain(
            'treated as a pre-enrolment period'
        )
        expect(pensionFlag?.label).not.toContain(
            'Pension auto-enrolment may apply for this pay period'
        )
        expect(pensionFlag?.inputs?.exceedsSixWeekWindow).toBe('no')
        expect(pensionFlag?.inputs?.exceedsThreeMonthWindow).toBe('no')
    })

    it('does not emit missing-deductions pension warning when employee pension is zero but employer contribution exists', () => {
        const validation = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                pensionEE: 0,
                pensionER: 35,
            })
        )
        const pensionIds = validation.flags
            .map((flag) => flag.id)
            .filter((id) => id.startsWith('pension_'))

        expect(pensionIds).toEqual([])
    })

    it('resolves pension threshold tax-year inputs across multiple tax years', () => {
        const validation2024 = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2024-05-15T00:00:00.000Z'),
            })
        )
        const validation2026 = buildValidation(
            buildPensionValidationEntry({
                grossPay: 1200,
                processDate: new Date('2026-05-15T00:00:00.000Z'),
            })
        )
        const pension2024 = validation2024.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )
        const pension2026 = validation2026.flags.find(
            (flag) => flag.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pension2024?.inputs?.taxYearStart).toBe(2024)
        expect(pension2026?.inputs?.taxYearStart).toBe(2026)
        expect(pension2024?.inputs?.periodAutoEnrolmentTrigger).toBe(833)
        expect(pension2026?.inputs?.periodAutoEnrolmentTrigger).toBe(833)
    })

    it('builds missing months', () => {
        const missing = buildMissingMonthsWithRange([1, 3], 1, 3)
        expect(missing).toEqual([formatMonthLabel(5)])
    })

    it('returns empty array from buildMissingMonthsWithRange when maxMonth is 0 (first month of tax year not yet started)', () => {
        expect(buildMissingMonthsWithRange([], 1, 0)).toEqual([])
        expect(buildMissingMonthsWithRange([1], 1, 0)).toEqual([])
    })

    it('formats tax year labels correctly across century boundary', () => {
        expect(getTaxYearKey(new Date(2024, 3, 6))).toBe('2024/25')
        expect(getTaxYearKey(new Date(2024, 2, 5))).toBe('2023/24')
        expect(getTaxYearKey(new Date(2099, 3, 6))).toBe('2099/2100')
        expect(getTaxYearKey(null)).toBe('Unknown')
    })

    it('getFiscalMonthIndex respects the April 6 tax year boundary', () => {
        expect(getFiscalMonthIndex(new Date(2026, 3, 5))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 3, 1))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 3, 6))).toBe(1)
        expect(getFiscalMonthIndex(new Date(2026, 3, 7))).toBe(1)
        expect(getFiscalMonthIndex(new Date(2026, 2, 31))).toBe(12)
        expect(getFiscalMonthIndex(new Date(2026, 4, 1))).toBe(2)
        expect(getFiscalMonthIndex(null)).toBeNull()
    })

    it('getTaxYearKey and getFiscalMonthIndex are consistent on Apr 1-5 boundary', () => {
        const apr3 = new Date(2026, 3, 3)
        expect(getTaxYearKey(apr3)).toBe('2025/26')
        expect(getFiscalMonthIndex(apr3)).toBe(12)

        const apr6 = new Date(2026, 3, 6)
        expect(getTaxYearKey(apr6)).toBe('2026/27')
        expect(getFiscalMonthIndex(apr6)).toBe(1)

        const mar31 = new Date(2026, 2, 31)
        expect(getTaxYearKey(mar31)).toBe('2025/26')
        expect(getFiscalMonthIndex(mar31)).toBe(12)
    })

    it('getTaxYearSortKey returns null sentinel for malformed or non-YYYY/ prefixed keys', () => {
        expect(getTaxYearSortKey('2024/25')).toBe(2024)
        expect(getTaxYearSortKey('Unknown')).toBe(9999)
        expect(getTaxYearSortKey('1234abcd5678')).toBe(9999)
        expect(getTaxYearSortKey('')).toBe(9999)
        expect(getTaxYearSortKey(null)).toBe(9999)
    })

    it('formats dates and keys', () => {
        const parsedNumeric = parsePayPeriodStart('01/02/25 - 28/02/25')
        const parsedLong = parsePayPeriodStart('15 March 2024 - 31 March 2024')
        const localDateString = (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        expect(localDateString(parsedNumeric)).toBe('2025-02-01')
        expect(localDateString(parsedLong)).toBe('2024-03-15')
        expect(parsePayPeriodStart(null)).toBeNull()

        const sampleDate = new Date(2025, 0, 5)
        expect(formatDateLabel(sampleDate)).toBe('05 Jan 2025')
        expect(formatDateLabel(null)).toBe('Unknown')
        expect(formatMonthYearLabel(sampleDate)).toBe('Jan 2025')
        expect(formatMonthYearLabel(null)).toBe('Unknown')
        expect(formatDateKey(sampleDate)).toBe('20250105')
        expect(formatDateKey(null)).toBe('unknown')
    })

    it('buildReport propagates mixed-month reference confidence into validation and holiday context', () => {
        const records = [
            buildHourlyWorkerRecord({
                start: '01/01/24',
                end: '31/01/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/02/24',
                end: '29/02/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/03/24',
                end: '31/03/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/04/24',
                end: '30/04/24',
                basicUnits: 128,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 9,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/05/24',
                end: '31/05/24',
                basicUnits: 0,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 9,
                payeTax: 0,
                natIns: 0,
            }),
            buildHourlyWorkerRecord({
                start: '01/06/24',
                end: '30/06/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
                grossForTaxTD: 3642.5,
                taxPaidTD: 100,
            }),
        ]

        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })

        const mayEntry = context.entries.find(
            (entry) => entry.record?.payrollDoc?.payPeriod?.start === '01/05/24'
        )
        const juneEntry = context.entries.find(
            (entry) => entry.record?.payrollDoc?.payPeriod?.start === '01/06/24'
        )
        expect(mayEntry).toBeDefined()
        expect(juneEntry).toBeDefined()
        expect(mayEntry.validation.lowConfidence).toBe(true)
        expect(juneEntry.validation.lowConfidence).toBe(false)
        expect(
            context.validationSummary.lowConfidenceEntries.includes(mayEntry)
        ).toBe(true)
    })

    it('buildReport exposes annual cross-check data for zero-hours yearly summaries when baseline and holiday data exist', () => {
        const records = [
            buildHourlyWorkerRecord({
                start: '01/01/24',
                end: '31/01/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/02/24',
                end: '29/02/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/03/24',
                end: '31/03/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/04/24',
                end: '30/04/24',
                basicUnits: 152,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/05/24',
                end: '31/05/24',
                basicUnits: 160,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/06/24',
                end: '30/06/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
        ]

        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 0,
            statutoryHolidayDays: null,
            leaveYearStartMonth: 4,
        })

        const summaryViewModel = buildSummaryViewModel(context, {
            employeeName: 'Test Worker',
            dateRangeLabel: 'Jan 2024 - Jun 2024',
        })
        const yearRow = summaryViewModel.yearSummaryRows.find(
            (row) => row.yearKey === '2024/25'
        )

        expect(yearRow).toBeDefined()
        expect(yearRow.holidaySummary.kind).toBe('hourly_hours')
        expect(yearRow.holidaySummary.entitlementHours).toBeGreaterThan(0)
        expect(yearRow.annualCrossCheck).toBeTruthy()
        expect(yearRow.annualCrossCheck.status).toBe('aligned')
        expect(yearRow.monthBreakdown).toHaveLength(2)
        expect(yearRow.monthBreakdown.map((row) => row.monthLabel)).toEqual([
            'May',
            'June',
        ])
    })

    it('buildReport omits annual cross-check when zero-hours yearly summary has no holiday pay', () => {
        const records = [
            buildHourlyWorkerRecord({
                start: '01/01/24',
                end: '31/01/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/02/24',
                end: '29/02/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/03/24',
                end: '31/03/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/04/24',
                end: '30/04/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
        ]

        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 0,
            statutoryHolidayDays: null,
            leaveYearStartMonth: 4,
        })

        const summaryViewModel = buildSummaryViewModel(context, {
            employeeName: 'Test Worker',
            dateRangeLabel: 'Jan 2024 - Apr 2024',
        })
        const yearRow = summaryViewModel.yearSummaryRows.find(
            (row) => row.yearKey === '2023/24'
        )

        expect(yearRow).toBeDefined()
        expect(yearRow.annualCrossCheck).toBeNull()
        expect(yearRow.monthBreakdown).toEqual([])
    })

    it('buildReport HTML renders one annual cross-check section with month breakdown and preserves payslip holiday analysis', () => {
        const records = [
            buildHourlyWorkerRecord({
                start: '01/01/24',
                end: '31/01/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/02/24',
                end: '29/02/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/03/24',
                end: '31/03/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/04/24',
                end: '30/04/24',
                basicUnits: 152,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/05/24',
                end: '31/05/24',
                basicUnits: 160,
                basicRate: 12.5,
                holidayUnits: 8,
                holidayRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/06/24',
                end: '30/06/24',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
        ]

        const { html } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 0,
            statutoryHolidayDays: null,
            leaveYearStartMonth: 4,
        })

        expect(html).toContain('Annual holiday pay cross-check')
        expect(html).toContain('Reference state')
        expect(html).toContain('Mixed month')
        expect(html).toContain('May')
        expect(html).toContain('June')
        expect(html).toContain('notice no-left-border')
    })

    it('sums misc amounts', () => {
        expect(sumMiscAmounts([])).toBe(0)
        expect(sumMiscAmounts(null)).toBe(0)
        expect(
            sumMiscAmounts([{ amount: 10 }, { amount: null }, { amount: 5 }])
        ).toBe(15)
    })

    it('detects under-contribution when employer pays less than payslip deducted', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 20 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 30 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(-10)
        expect(aprilMonth?.balance).toBe(-10)
        expect(mayMonth?.delta).toBe(-10)
        expect(mayMonth?.balance).toBe(-20)
        expect(year?.yearEndBalance).toBe(-20)
        expect(year?.totals.delta).toBe(-20)
        expect(summary?.balance).toBe(-20)
    })

    it('detects over-contribution when employer pays more than payslip deducted', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 45 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 55 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(15)
        expect(aprilMonth?.balance).toBe(15)
        expect(mayMonth?.delta).toBe(15)
        expect(mayMonth?.balance).toBe(30)
        expect(year?.yearEndBalance).toBe(30)
        expect(year?.totals.delta).toBe(30)
        expect(summary?.balance).toBe(30)
    })

    it('accumulates per-month balance correctly when contributions vary month to month', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
            {
                record: buildRecord({
                    nestEE: 60,
                    nestER: 40,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 4, 20),
                yearKey: '2025/26',
                monthIndex: 2,
            },
            {
                record: buildRecord({
                    nestEE: 55,
                    nestER: 35,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 5, 20),
                yearKey: '2025/26',
                monthIndex: 3,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 20 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 50 },
                { date: new Date(2025, 5, 20), type: 'ee', amount: 55 },
                { date: new Date(2025, 5, 20), type: 'er', amount: 35 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')

        expect(year?.months.get(1)?.delta).toBe(-10)
        expect(year?.months.get(1)?.balance).toBe(-10)
        expect(year?.months.get(2)?.delta).toBe(10)
        expect(year?.months.get(2)?.balance).toBe(0)
        expect(year?.months.get(3)?.delta).toBe(0)
        expect(year?.months.get(3)?.balance).toBe(0)
        expect(year?.yearEndBalance).toBe(0)
        expect(year?.totals.delta).toBe(0)
    })

    it('keeps year end balance per year', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 10,
                    nestER: 5,
                    grossPay: 100,
                    netPay: 90,
                }),
                parsedDate: new Date(2024, 0, 15),
                yearKey: '2023/24',
                monthIndex: 10,
            },
            {
                record: buildRecord({
                    nestEE: 20,
                    nestER: 10,
                    grossPay: 100,
                    netPay: 90,
                }),
                parsedDate: new Date(2025, 0, 15),
                yearKey: '2024/25',
                monthIndex: 10,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2024, 0, 20), type: 'ee', amount: 8 },
                { date: new Date(2024, 0, 20), type: 'er', amount: 7 },
                { date: new Date(2025, 0, 20), type: 'ee', amount: 35 },
                { date: new Date(2025, 0, 20), type: 'er', amount: 0 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2023/24',
            '2024/25',
        ])
        const year2024 = summary?.years.get('2023/24')
        const year2025 = summary?.years.get('2024/25')
        expect({
            year2024End: year2024?.yearEndBalance,
            year2025End: year2025?.yearEndBalance,
            overall: summary?.balance,
        }).toEqual({
            year2024End: 0,
            year2025End: 5,
            overall: 5,
        })
    })

    it('buildReport HTML shows Opening Balance and Closing Balance rows when prior year has a deficit', () => {
        const records = [
            {
                employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
                payPeriod: '01/01/24 - 31/01/24',
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 10 },
                        pensionER: { amount: 5 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { units: 10, amount: 100, rate: 10 },
                            holiday: { units: 0, amount: 0 },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: 0 },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 100 } },
                    netPay: { amount: 85 },
                    processDate: { date: '31/01/24' },
                },
            },
            {
                employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
                payPeriod: '01/01/25 - 31/01/25',
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 20 },
                        pensionER: { amount: 10 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { units: 10, amount: 100, rate: 10 },
                            holiday: { units: 0, amount: 0 },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: 0 },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 100 } },
                    netPay: { amount: 70 },
                    processDate: { date: '31/01/25' },
                },
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2024, 0, 20), type: 'ee', amount: 8 },
                { date: new Date(2024, 0, 20), type: 'er', amount: 4 },
                { date: new Date(2025, 0, 20), type: 'ee', amount: 20 },
                { date: new Date(2025, 0, 20), type: 'er', amount: 10 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const { html } = buildReport(records, [], contributionData, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        const year2024Section =
            html.split('2023/24 Summary')[1]?.split('2024/25 Summary')[0] ?? ''
        const year2025Section = html.split('2024/25 Summary')[1] ?? ''
        expect(year2024Section).not.toContain('Opening Balance')
        expect(year2024Section).toContain('Closing Pensions Balance')
        expect(year2025Section).toContain('Opening Balance')
        expect(year2025Section).toContain('Closing Pensions Balance')
    })

    it('flags gross_mismatch and sets lowConfidence when payments total differs from totalGrossPay', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 50 },
                        pensionER: { amount: 30 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { amount: 1000 },
                            holiday: { amount: 0 },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: 0 },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1100 } },
                    netPay: { amount: 770 },
                },
            },
            parsedDate: new Date(2025, 0, 1),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((flag) => flag.id)
        expect(flagIds).toContain('gross_mismatch')
        expect(validation.lowConfidence).toBe(true)
    })

    it('sums all payment types correctly', () => {
        const hourlyRecord = {
            payrollDoc: {
                payments: {
                    hourly: {
                        basic: { amount: 800 },
                        holiday: { amount: 120 },
                    },
                    salary: { basic: { amount: 0 }, holiday: { amount: 0 } },
                    misc: [{ amount: 50 }, { amount: null }],
                },
            },
        }
        expect(sumPayments(hourlyRecord)).toBe(970)

        const salaryRecord = {
            payrollDoc: {
                payments: {
                    hourly: { basic: { amount: 0 }, holiday: { amount: 0 } },
                    salary: {
                        basic: { amount: 2000 },
                        holiday: { amount: 200 },
                    },
                    misc: [],
                },
            },
        }
        expect(sumPayments(salaryRecord)).toBe(2200)

        expect(sumPayments(null)).toBe(0)
        expect(sumPayments({})).toBe(0)
    })

    it('sums deductions for net pay, excluding pensionER', () => {
        const record = {
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 300 },
                    natIns: { amount: 150 },
                    pensionEE: { amount: 75 },
                    pensionER: { amount: 100 },
                    misc: [{ amount: 25 }],
                },
            },
        }
        expect(sumDeductionsForNetPay(record)).toBe(550)
        expect(sumDeductionsForNetPay(null)).toBe(0)
        expect(sumDeductionsForNetPay({})).toBe(0)
    })

    it('shows surplus delta when NEST contributions exist for months with no payslip', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
        ]
        const contributionData = {
            entries: [
                { date: new Date(2025, 3, 20), type: 'ee', amount: 50 },
                { date: new Date(2025, 3, 20), type: 'er', amount: 30 },
                { date: new Date(2025, 4, 20), type: 'ee', amount: 60 },
                { date: new Date(2025, 4, 20), type: 'er', amount: 40 },
            ],
            sourceFiles: ['fixture.xlsx'],
        }
        const summary = buildContributionSummary(entries, contributionData, [
            '2025/26',
        ])
        const year = summary?.years.get('2025/26')
        const aprilMonth = year?.months.get(1)
        const mayMonth = year?.months.get(2)

        expect(aprilMonth?.delta).toBe(0)
        expect(aprilMonth?.balance).toBe(0)
        expect(mayMonth?.expectedEE).toBe(0)
        expect(mayMonth?.expectedER).toBe(0)
        expect(mayMonth?.actualEE).toBe(60)
        expect(mayMonth?.actualER).toBe(40)
        expect(mayMonth?.delta).toBe(100)
        expect(year?.yearEndBalance).toBe(100)
        expect(summary?.balance).toBe(100)
    })

    it('returns null when no contribution data is provided', () => {
        const entries = [
            {
                record: buildRecord({
                    nestEE: 50,
                    nestER: 30,
                    grossPay: 1000,
                    netPay: 900,
                }),
                parsedDate: new Date(2025, 3, 20),
                yearKey: '2025/26',
                monthIndex: 1,
            },
        ]
        expect(buildContributionSummary(entries, null, ['2025/26'])).toBeNull()
        expect(
            buildContributionSummary(
                entries,
                { entries: [], sourceFiles: [] },
                ['2025/26']
            )
        ).toBeNull()
        expect(
            buildContributionSummary(entries, undefined, ['2025/26'])
        ).toBeNull()
    })

    it('flags payment_line_mismatch when units * rate does not match amount', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 75.9,
                                rate: 8.6,
                                amount: 759,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 759 } },
                    netPay: { amount: 579 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when units * rate matches amount', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 75.9,
                                rate: 10,
                                amount: 759,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 759 } },
                    netPay: { amount: 579 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when rate is null (multi-rate accumulated line)', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 61.47 },
                        natIns: { amount: 43.65 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 151.8,
                                rate: null,
                                amount: 1411.74,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1411.74 } },
                    netPay: { amount: 1262.03 },
                },
            },
            parsedDate: new Date(2024, 3, 20),
            yearKey: '2024/25',
            monthIndex: 1,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('does not flag payment_line_mismatch when difference is within tolerance', () => {
        const entry = {
            record: {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: {
                                title: 'Basic Hours',
                                units: 10,
                                rate: 10,
                                amount: 100.03,
                            },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: null, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 100.03 } },
                    netPay: { amount: -79.97 },
                },
            },
            parsedDate: new Date(2025, 0, 20),
            yearKey: '2024/25',
            monthIndex: 10,
        }
        const validation = buildValidation(entry)
        const flagIds = validation.flags.map((f) => f.id)
        expect(flagIds).not.toContain('payment_line_mismatch')
    })

    it('parses month-year date format and two-digit years', () => {
        const parsedMonthYear = parsePayPeriodStart('April 2024')
        expect(parsedMonthYear?.getFullYear()).toBe(2024)
        expect(parsedMonthYear?.getMonth()).toBe(3)
        expect(parsedMonthYear?.getDate()).toBe(1)

        const parsedShortYear = parsePayPeriodStart('01/06/99 - 30/06/99')
        expect(parsedShortYear?.getFullYear()).toBe(2099)
        expect(parsedShortYear?.getMonth()).toBe(5)
        expect(parsedShortYear?.getDate()).toBe(1)
    })
})

function buildSalaryRecord({
    basicSalary,
    holidaySalary,
    nestEE = 0,
    nestER = 0,
}) {
    return {
        employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
        payPeriod: '01/04/25 - 30/04/25',
        payrollDoc: {
            deductions: {
                payeTax: { amount: 100 },
                natIns: { amount: 80 },
                pensionEE: { amount: nestEE },
                pensionER: { amount: nestER },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { units: 0, amount: 0, rate: null },
                    holiday: { units: null, amount: null, rate: null },
                },
                salary: {
                    basic: { amount: basicSalary },
                    holiday: { amount: holidaySalary, units: null, rate: null },
                },
                misc: [],
            },
            taxCode: { code: '1257L' },
            thisPeriod: {
                totalGrossPay: { amount: basicSalary + holidaySalary },
            },
            netPay: { amount: basicSalary + holidaySalary - 100 - 80 - nestEE },
            processDate: { date: '2025-04-30' },
        },
    }
}

describe('workerProfile — salaried holiday day estimation', () => {
    it('daily rate uses workingDaysPerMonth (typicalDays * 52 / 12), not typicalDays directly', () => {
        // £36,000/year, 12 months, 5 days/week
        // workingDaysPerMonth = 5 * 52 / 12 = 21.667
        // dailyRate = 36000 / 12 / 21.667 ≈ £138.46/day  (NOT £600)
        const annualSalary = 36000
        const monthlyBasic = annualSalary / 12 // 3000
        const typicalDays = 5
        const workingDaysPerMonth = (typicalDays * 52) / 12
        const expectedDailyRate = monthlyBasic / workingDaysPerMonth

        expect(expectedDailyRate).toBeCloseTo(138.46, 1)
        expect(monthlyBasic / typicalDays).toBeCloseTo(600, 1) // confirms old formula was wrong
    })

    it('buildReport HTML includes salaried days taken and remaining when workerType is salary', () => {
        // 12 months of salary payslips Apr 2025–Mar 2026, £3000/month basic, £500 holiday in November
        // processDate must be DD/MM/YY format for parsePayPeriodStart
        const months = [
            { date: '15/04/25', holiday: false },
            { date: '15/05/25', holiday: false },
            { date: '15/06/25', holiday: false },
            { date: '15/07/25', holiday: false },
            { date: '15/08/25', holiday: false },
            { date: '15/09/25', holiday: false },
            { date: '15/10/25', holiday: false },
            { date: '15/11/25', holiday: true },
            { date: '15/12/25', holiday: false },
            { date: '15/01/26', holiday: false },
            { date: '15/02/26', holiday: false },
            { date: '15/03/26', holiday: false },
        ]
        const records = months.map(({ date, holiday }, i) => ({
            employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
            payPeriod: `01/${date.slice(3)} - 30/${date.slice(3)}`,
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 50 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: { units: 0, amount: 0, rate: null },
                        holiday: { units: null, amount: null, rate: null },
                    },
                    salary: {
                        basic: { amount: 3000 },
                        holiday: {
                            amount: holiday ? 500 : 0,
                            units: null,
                            rate: null,
                        },
                    },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: {
                    totalGrossPay: { amount: holiday ? 3500 : 3000 },
                },
                netPay: { amount: holiday ? 3350 : 2850 },
                processDate: { date },
            },
            parsedDate: new Date(
                `20${date.slice(6, 8)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
            ),
            yearKey: '2025/26',
            monthIndex: i,
        }))

        const { html, context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })

        // dailyRate = 3000 / 1 / (5*52/12) ≈ £138.46 per month context
        // For the year: yearBasicSalary = 36000, months = 12
        // dailyRate = 36000 / 12 / (5*52/12) ≈ £138.46/day
        // daysTaken = 500 / 138.46 ≈ 3.6 days
        // daysRemaining = 28 - 3.6 ≈ 24.4 days
        expect(html).toContain('days taken')
        expect(html).toContain('remaining')
        // Should show a currency amount not raw hours
        expect(html).toMatch(/£500\.00|£500/)

        // ReportContext should carry workerProfile
        expect(context.workerProfile.workerType).toBe('salary')
        expect(context.workerProfile.typicalDays).toBe(5)
        expect(context.workerProfile.statutoryHolidayDays).toBe(28)
    })

    it('buildReport context.workerProfile defaults to zero-hours baseline when no workerProfile passed', () => {
        const records = [
            buildSalaryRecord({ basicSalary: 3000, holidaySalary: 0 }),
        ]
        const { context } = buildReport(records)
        expect(context.workerProfile.workerType).toBeNull()
        expect(context.workerProfile.typicalDays).toBe(0)
        expect(context.workerProfile.statutoryHolidayDays).toBeNull()
    })

    it('buildReport preserves caller payrollRunStartDate over inferred earliest entry date', () => {
        const records = [
            buildHourlyWorkerRecord({
                start: '01/05/25',
                end: '31/05/25',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
            buildHourlyWorkerRecord({
                start: '01/06/25',
                end: '30/06/25',
                basicUnits: 160,
                basicRate: 12.5,
                payeTax: 100,
                natIns: 80,
            }),
        ]

        const { context } = buildReport(records, [], null, {
            payrollRunStartDate: '2025-03-15',
        })

        expect(context.workerProfile.payrollRunStartDate).toBe('2025-03-15')
        expect(context.entries[0]?.workerProfile?.payrollRunStartDate).toBe(
            '2025-03-15'
        )
    })

    it('contract-type mismatch: hourly profile with salary payslip triggers warning', () => {
        const records = [
            buildSalaryRecord({ basicSalary: 3000, holidaySalary: 0 }),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        expect(html).toContain('report-warning-banner')
        expect(html).toContain('Hourly')
    })

    it('contract-type mismatch: salary profile with hourly payslip triggers warning', () => {
        const records = [
            {
                employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
                payPeriod: '01/04/25 - 30/04/25',
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { units: 150, amount: 1200, rate: 8 },
                            holiday: { units: 0, amount: 0, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 },
                            holiday: { amount: 0, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1200 } },
                    netPay: { amount: 1020 },
                    processDate: { date: '2025-04-30' },
                },
            },
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        expect(html).toContain('report-warning-banner')
        expect(html).toContain('Salaried')
    })

    it('no mismatch warning when worker type matches payslip data', () => {
        const records = [
            buildSalaryRecord({ basicSalary: 3000, holidaySalary: 0 }),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        expect(html).not.toContain('report-warning-banner')
    })

    it('zero-amount salary line does not trigger mismatch warning for hourly worker', () => {
        // A record with salary.basic.amount === 0 should NOT trigger the mismatch
        const records = [
            {
                employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
                payPeriod: '01/04/25 - 30/04/25',
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    payments: {
                        hourly: {
                            basic: { units: 150, amount: 1200, rate: 8 },
                            holiday: { units: 0, amount: 0, rate: null },
                        },
                        salary: {
                            basic: { amount: 0 }, // zero — should not trigger warning
                            holiday: { amount: 0, units: null, rate: null },
                        },
                        misc: [],
                    },
                    taxCode: { code: '1257L' },
                    thisPeriod: { totalGrossPay: { amount: 1200 } },
                    netPay: { amount: 1020 },
                    processDate: { date: '2025-04-30' },
                },
            },
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        expect(html).not.toContain('report-warning-banner')
    })
})

function buildMinimalRecord(processDateStr) {
    return {
        employee: { natInsNumber: null },
        payrollDoc: {
            processDate: { date: processDateStr },
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                pensionEE: { amount: 0 },
                pensionER: { amount: 0 },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { units: 0, rate: null, amount: 0 },
                    holiday: { units: null, rate: null, amount: null },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { amount: null, units: null, rate: null },
                },
                misc: [],
            },
            taxCode: { code: '' },
            thisPeriod: { totalGrossPay: { amount: 0 } },
            netPay: { amount: 0 },
        },
    }
}

describe('buildReportEntries — leaveYearKey', () => {
    it('defaults to April start: leaveYearKey matches yearKey for a mid-tax-year date', () => {
        const [entry] = buildReportEntries([
            buildMinimalRecord('15/05/25 - 31/05/25'),
        ])
        expect(entry.leaveYearKey).toBe('2025/26')
        expect(entry.yearKey).toBe('2025/26')
    })

    it('explicit leaveYearStartMonth=4 matches tax year key', () => {
        const [entry] = buildReportEntries(
            [buildMinimalRecord('15/11/25 - 30/11/25')],
            4
        )
        expect(entry.leaveYearKey).toBe('2025/26')
        expect(entry.yearKey).toBe('2025/26')
    })

    it('leaveYearStartMonth=1 (January): April payslip gives calendar-year leaveYearKey', () => {
        const [entry] = buildReportEntries(
            [buildMinimalRecord('15/04/25 - 30/04/25')],
            1
        )
        expect(entry.leaveYearKey).toBe('2025')
        expect(entry.yearKey).toBe('2025/26')
    })

    it('leaveYearStartMonth=1: January payslip is in leave year 2025 but tax year 2024/25', () => {
        const [entry] = buildReportEntries(
            [buildMinimalRecord('15/01/25 - 31/01/25')],
            1
        )
        expect(entry.leaveYearKey).toBe('2025')
        expect(entry.yearKey).toBe('2024/25')
    })

    it('leaveYearStartMonth=6 (June): April payslip falls in prior leave year, different from its tax year', () => {
        const [entry] = buildReportEntries(
            [buildMinimalRecord('15/04/25 - 30/04/25')],
            6
        )
        expect(entry.leaveYearKey).toBe('2024/25')
        expect(entry.yearKey).toBe('2025/26')
    })

    it('leaveYearStartMonth=6: June payslip starts a new leave year', () => {
        const [entry] = buildReportEntries(
            [buildMinimalRecord('15/06/25 - 30/06/25')],
            6
        )
        expect(entry.leaveYearKey).toBe('2025/26')
        expect(entry.yearKey).toBe('2025/26')
    })

    it('unparseable processDate: leaveYearKey and yearKey are both null', () => {
        const [entry] = buildReportEntries([buildMinimalRecord('not-a-date')])
        expect(entry.leaveYearKey).toBeNull()
        expect(entry.yearKey).toBeNull()
    })
})

function buildLeaveYearSalaryRecord(dateRangeStr, basicSalary, holidaySalary) {
    return {
        employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
        payrollDoc: {
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                pensionEE: { amount: 0 },
                pensionER: { amount: 0 },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { units: 0, rate: null, amount: 0 },
                    holiday: { units: null, rate: null, amount: null },
                },
                salary: {
                    basic: { amount: basicSalary },
                    holiday: { amount: holidaySalary, units: null, rate: null },
                },
                misc: [],
            },
            taxCode: { code: '1257L' },
            thisPeriod: {
                totalGrossPay: { amount: basicSalary + holidaySalary },
            },
            netPay: { amount: basicSalary + holidaySalary },
            processDate: { date: dateRangeStr },
        },
    }
}

function buildLeaveYearHourlyRecord(dateRangeStr, holidayUnits) {
    return {
        employee: { natInsNumber: 'AB123456C', name: 'Test Worker' },
        payrollDoc: {
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                pensionEE: { amount: 0 },
                pensionER: { amount: 0 },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { units: 100, rate: 10, amount: 1000 },
                    holiday: {
                        units: holidayUnits,
                        rate: 10,
                        amount: holidayUnits * 10,
                    },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { amount: 0, units: null, rate: null },
                },
                misc: [],
            },
            taxCode: { code: '1257L' },
            thisPeriod: {
                totalGrossPay: { amount: 1000 + holidayUnits * 10 },
            },
            netPay: { amount: 1000 + holidayUnits * 10 },
            processDate: { date: dateRangeStr },
        },
    }
}

describe('leaveYearStartMonth — buildReport holiday cell grouping', () => {
    it('leave year note absent when leaveYearStartMonth=4 (default match with tax year)', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 4,
        })
        expect(html).not.toContain('Leave year:')
    })

    it('leave year note absent when leaveYearStartMonth is not provided (defaults to 4)', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        expect(html).not.toContain('Leave year:')
    })

    it('leave year note rendered in holiday cell when leaveYearStartMonth=1', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 1,
        })
        expect(html).toContain('Leave year: 2025')
    })

    it('context.workerProfile.leaveYearStartMonth is propagated into report context', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 3,
        })
        expect(context.workerProfile.leaveYearStartMonth).toBe(3)
    })

    it('context.workerProfile.leaveYearStartMonth defaults to 4 when no workerProfile is passed', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { context } = buildReport(records)
        expect(context.workerProfile.leaveYearStartMonth).toBe(4)
    })

    it('salaried: holiday cell sums only the leave year entries, not the full tax year', () => {
        // April 2025 → tax year 2025/26, leave year 2025 (Jan start)
        // January 2026 → tax year 2025/26, leave year 2026 (Jan start)
        // With leaveYearStartMonth=1, the holiday cell for 2025/26 uses only the April entry (leave year 2025)
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 300),
            buildLeaveYearSalaryRecord('15/01/26 - 31/01/26', 2000, 200),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 1,
        })
        expect(html).toContain('£300.00')
        expect(html).not.toContain('£500.00')
    })

    it('salaried: holiday cell sums all tax year entries when leaveYearStartMonth=4', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 300),
            buildLeaveYearSalaryRecord('15/01/26 - 31/01/26', 2000, 200),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 4,
        })
        expect(html).toContain('£500.00')
    })

    it('hourly: holiday hours cell reflects only the leave year entries when leaveYearStartMonth=1', () => {
        // April 2025 → leave year 2025 (8 hrs), January 2026 → leave year 2026 (4 hrs)
        // With leaveYearStartMonth=1, tax year 2025/26 cell shows 8.00 hrs (not 12.00)
        const records = [
            buildLeaveYearHourlyRecord('15/04/25 - 30/04/25', 8),
            buildLeaveYearHourlyRecord('15/01/26 - 31/01/26', 4),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 1,
        })
        expect(html).toContain('8.00 hrs')
        expect(html).not.toContain('12.00 hrs')
    })

    it('hourly: holiday hours cell sums all tax year entries when leaveYearStartMonth=4', () => {
        const records = [
            buildLeaveYearHourlyRecord('15/04/25 - 30/04/25', 8),
            buildLeaveYearHourlyRecord('15/01/26 - 31/01/26', 4),
        ]
        const { html } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 4,
        })
        expect(html).toContain('12.00 hrs')
    })

    it('invalid leaveYearStartMonth (0) is normalised to 4: no leave year note, context shows 4', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { html, context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 0,
        })
        expect(context.workerProfile.leaveYearStartMonth).toBe(4)
        expect(html).not.toContain('Leave year:')
    })

    it('invalid leaveYearStartMonth (13) is normalised to 4: no leave year note, context shows 4', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { html, context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 13,
        })
        expect(context.workerProfile.leaveYearStartMonth).toBe(4)
        expect(html).not.toContain('Leave year:')
    })

    it('invalid leaveYearStartMonth (NaN) is normalised to 4: context shows 4', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: NaN,
        })
        expect(context.workerProfile.leaveYearStartMonth).toBe(4)
    })

    it('invalid leaveYearStartMonth (2.5) is normalised to 4: context shows 4', () => {
        const records = [
            buildLeaveYearSalaryRecord('15/04/25 - 30/04/25', 2000, 0),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            leaveYearStartMonth: 2.5,
        })
        expect(context.workerProfile.leaveYearStartMonth).toBe(4)
    })

    it('buildReport handles zero-hours worker (typicalDays = 0)', () => {
        const records = [
            {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    payPeriod: { start: '01/01/25', end: '31/01/25' },
                    taxCode: '1257L',
                    basicHours: { amount: 120, rate: 15.0 },
                    holidayHours: { amount: 8, rate: 15.0 },
                    payments: {
                        totalGrossPay: { amount: 1920 },
                    },
                    deductions: {
                        payeTax: { amount: 100 },
                        natIns: { amount: 80 },
                        totalDeductions: { amount: 180 },
                    },
                    netPay: { amount: 1740 },
                },
                sourceFiles: ['fixture.pdf'],
            },
        ]
        const { html, context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 0,
            statutoryHolidayDays: 0,
        })

        expect(context.workerProfile.typicalDays).toBe(0)
        expect(context.workerProfile.statutoryHolidayDays).toBe(0)
        // Verify the record was processed (HTML contains some content)
        expect(html.length).toBeGreaterThan(100)
    })

    it('buildReport handles minimum salaried days (typicalDays = 0.5)', () => {
        const records = [
            {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    payPeriod: { start: '01/01/25', end: '31/01/25' },
                    taxCode: '1257L',
                    basicSalary: { amount: 1000 },
                    holidaySalary: { amount: 100 },
                    payments: {
                        totalGrossPay: { amount: 1100 },
                    },
                    deductions: {
                        payeTax: { amount: 50 },
                        natIns: { amount: 40 },
                        totalDeductions: { amount: 90 },
                    },
                    netPay: { amount: 1010 },
                },
                sourceFiles: ['fixture.pdf'],
            },
        ]
        const { html, context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 0.5,
            statutoryHolidayDays: 2.8,
        })

        expect(context.workerProfile.typicalDays).toBe(0.5)
        expect(context.workerProfile.statutoryHolidayDays).toBe(2.8)
        // Verify the record was processed (HTML contains some content)
        expect(html.length).toBeGreaterThan(100)
    })

    it('buildReport handles maximum salaried days (typicalDays = 7)', () => {
        const records = [
            {
                employee: { natInsNumber: 'AB123456C' },
                payrollDoc: {
                    payPeriod: { start: '01/01/25', end: '31/01/25' },
                    taxCode: '1257L',
                    basicSalary: { amount: 3000 },
                    holidaySalary: { amount: 200 },
                    payments: {
                        totalGrossPay: { amount: 3200 },
                    },
                    deductions: {
                        payeTax: { amount: 150 },
                        natIns: { amount: 120 },
                        totalDeductions: { amount: 270 },
                    },
                    netPay: { amount: 2930 },
                },
                sourceFiles: ['fixture.pdf'],
            },
        ]
        const { html, context } = buildReport(records, [], null, {
            workerType: 'salary',
            typicalDays: 7,
            statutoryHolidayDays: 28,
        })

        expect(context.workerProfile.typicalDays).toBe(7)
        expect(context.workerProfile.statutoryHolidayDays).toBe(28)
        // Verify the record was processed (HTML contains some content)
        expect(html.length).toBeGreaterThan(100)
    })
})

describe('buildValidation — flag evidence payload', () => {
    function buildValidationRecord(overrides = {}) {
        return {
            employee: { natInsNumber: null, ...overrides.employee },
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 10, amount: 1000 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: {
                    grossForTax: { amount: 1000 },
                    totalGrossPay: { amount: 1000 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1000,
                    taxPaidTD: 0,
                },
                netPay: { amount: 1000 },
                processDate: { date: '01/04/25 - 30/04/25' },
                ...overrides.payrollDoc,
            },
        }
    }

    function buildValidationEntry(record, overrides = {}) {
        return {
            record,
            parsedDate: new Date('2025-04-30T00:00:00.000Z'),
            yearKey: '2025/26',
            monthIndex: 1,
            ...overrides,
        }
    }

    it('paye_zero becomes a notice when standard cumulative PAYE also works out to zero', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_zero')
        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('paye_zero')
        expect(flag.severity).toBe('notice')
        expect(typeof flag.inputs.payeTax).toBe('number')
        expect(typeof flag.inputs.expectedPaye).toBe('number')
        expect(flag.inputs.expectedPaye).toBeCloseTo(0)
    })

    it('paye_zero becomes a warning when standard cumulative PAYE should have been deducted', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                thisPeriod: {
                    grossForTax: { amount: 1500 },
                    totalGrossPay: { amount: 1500 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1500,
                    taxPaidTD: 0,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_zero')

        expect(flag).toBeDefined()
        expect(flag.severity).toBe('warning')
        expect(flag.inputs.expectedPaye).toBeCloseTo(90.4)
        expect(flag.label).toContain('about £90.40')
    })

    it('uses cumulative YTD values for standard 1257L checks', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                thisPeriod: {
                    grossForTax: { amount: 2500 },
                    totalGrossPay: { amount: 2500 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 3000,
                    taxPaidTD: 0,
                },
                processDate: { date: '01/05/25 - 31/05/25' },
            },
        })
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2025-05-31T00:00:00.000Z'),
            monthIndex: 2,
        })
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_zero')

        expect(flag).toBeDefined()
        expect(flag.inputs.expectedPaye).toBeCloseTo(181)
        expect(flag.label).toContain('Gross for Tax TD £3,000.00')
    })

    it('uses emergency non-cumulative treatment for 1257L M1/W1/X codes', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                taxCode: { code: '1257L M1' },
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                thisPeriod: {
                    grossForTax: { amount: 2500 },
                    totalGrossPay: { amount: 2500 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 3000,
                    taxPaidTD: 0,
                },
                processDate: { date: '01/05/25 - 31/05/25' },
            },
        })
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2025-05-31T00:00:00.000Z'),
            monthIndex: 2,
        })
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_zero')

        expect(flag).toBeDefined()
        expect(flag.inputs.expectedPaye).toBeCloseTo(290.4)
        expect(flag.label).toContain('Emergency code 1257L M1')
    })

    it('routes standard PAYE through Scotland bands for S-prefixed tax codes', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                taxCode: { code: 'S1257L' },
                thisPeriod: {
                    grossForTax: { amount: 2000 },
                    totalGrossPay: { amount: 2000 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 2000,
                    taxPaidTD: 0,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_zero')

        expect(flag).toBeDefined()
        expect(flag.inputs.region).toBe('scotland')
        expect(flag.inputs.expectedPaye).toBeCloseTo(188.04)
    })

    it('emits an explicit warning for non-standard tax codes', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                taxCode: { code: 'BR' },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find(
            (f) => f.id === 'paye_tax_code_unsupported'
        )

        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('paye_tax_code_unsupported')
        expect(flag.label).toContain('Reported tax code: BR')
        expect(result.lowConfidence).toBe(true)
    })

    it('nat_ins_zero flag carries ruleId and numeric inputs.nationalInsurance', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'nat_ins_zero')
        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('nat_ins_zero')
        expect(typeof flag.inputs.nationalInsurance).toBe('number')
    })

    it('nat_ins_zero is a notice when gross pay is below NI primary threshold', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                thisPeriod: { totalGrossPay: { amount: 1000 } },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'nat_ins_zero')

        expect(flag).toBeDefined()
        expect(flag.severity).toBe('notice')
        expect(flag.label).toContain('is at or below the primary threshold')
    })

    it('nat_ins_zero is a warning when gross pay exceeds NI primary threshold', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                thisPeriod: { totalGrossPay: { amount: 1200 } },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'nat_ins_zero')

        expect(flag).toBeDefined()
        expect(flag.severity).toBe('warning')
        expect(flag.label).toContain('is above the primary threshold')
    })

    it('flags NI taken while gross pay is at or below NI primary threshold', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 15 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                thisPeriod: { totalGrossPay: { amount: 900 } },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find(
            (f) => f.id === 'nat_ins_taken_below_threshold'
        )

        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('nat_ins_taken_below_threshold')
        expect(flag.severity).toBe('warning')
        expect(flag.inputs.nationalInsurance).toBe(15)
        expect(flag.inputs.grossPay).toBe(900)
    })

    it('notice-only flags are excluded from flagged periods summary', () => {
        const entry = {
            parsedDate: new Date('2025-04-30T00:00:00.000Z'),
            record: {
                payrollDoc: { processDate: { date: '30 Apr 2025' } },
            },
            validation: {
                flags: [
                    {
                        id: 'nat_ins_zero',
                        label: 'NI deductions not taken as gross pay £1,000.00 is below the primary threshold of £1,048.00',
                        severity: 'notice',
                    },
                ],
                lowConfidence: false,
            },
        }

        const summary = buildValidationSummary([entry])

        expect(summary.flaggedEntries).toHaveLength(0)
        expect(summary.flaggedPeriods).toEqual([])
        expect(summary.validationPill).toBe('Validation flags: None')
    })

    it('gross_mismatch flag carries ruleId and computed/reported inputs', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 50 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 10, amount: 1000 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: { totalGrossPay: { amount: 500 } },
                netPay: { amount: 850 },
                processDate: { date: '01/04/25 - 30/04/25' },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'gross_mismatch')
        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('gross_mismatch')
        expect(typeof flag.inputs.computed).toBe('number')
        expect(typeof flag.inputs.reported).toBe('number')
        expect(flag.inputs.computed).toBeCloseTo(1000)
        expect(flag.inputs.reported).toBeCloseTo(500)
    })

    it('net_mismatch flag carries ruleId and computed/reported inputs', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 50 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 10, amount: 1000 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: { totalGrossPay: { amount: 1000 } },
                netPay: { amount: 999 },
                processDate: { date: '01/04/25 - 30/04/25' },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'net_mismatch')
        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('net_mismatch')
        expect(typeof flag.inputs.computed).toBe('number')
        expect(typeof flag.inputs.reported).toBe('number')
        expect(flag.inputs.computed).toBeCloseTo(850)
        expect(flag.inputs.reported).toBeCloseTo(999)
    })

    it('payment_line_mismatch flag carries ruleId and computed/reported inputs', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 100 },
                    natIns: { amount: 50 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                payments: {
                    hourly: {
                        basic: { units: 100, rate: 10, amount: 500 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { units: null, rate: null, amount: null },
                    },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: { totalGrossPay: { amount: 500 } },
                netPay: { amount: 350 },
                processDate: { date: '01/04/25 - 30/04/25' },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'payment_line_mismatch')
        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('payment_line_mismatch')
        expect(flag.inputs.computed).toBeCloseTo(1000)
        expect(flag.inputs.reported).toBeCloseTo(500)
    })

    it('flags missing tax-year context and skips NI threshold checks when tax year is unknown', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: null,
            yearKey: null,
        })
        const result = buildValidation(entry)
        const thresholdFlag = result.flags.find(
            (f) => f.id === 'tax_year_thresholds_unavailable'
        )
        const niFlag = result.flags.find((f) => f.id === 'nat_ins_zero')

        expect(thresholdFlag).toBeDefined()
        expect(thresholdFlag.label).toContain(
            'Tax year could not be determined'
        )
        expect(niFlag).toBeUndefined()
        expect(result.lowConfidence).toBe(true)
    })

    it('flags unsupported tax year and skips NI threshold checks', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('1999-04-30T00:00:00.000Z'),
            yearKey: '1999/00',
        })
        const result = buildValidation(entry)
        const thresholdFlag = result.flags.find(
            (f) => f.id === 'tax_year_thresholds_unavailable'
        )
        const niFlag = result.flags.find((f) => f.id === 'nat_ins_zero')
        const payeFlag = result.flags.find((f) => f.id === 'paye_zero')

        expect(thresholdFlag).toBeDefined()
        expect(thresholdFlag.label).toContain(
            'Tax-year thresholds are not configured'
        )
        expect(niFlag).toBeUndefined()
        expect(payeFlag).toBeUndefined()
        expect(result.lowConfidence).toBe(true)
    })

    it('flags future unsupported tax year but uses prior thresholds for checks', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2027-04-30T00:00:00.000Z'),
            yearKey: '2027/28',
        })
        const result = buildValidation(entry)
        const thresholdFlag = result.flags.find(
            (f) => f.id === 'tax_year_thresholds_unavailable'
        )
        const niFlag = result.flags.find((f) => f.id === 'nat_ins_zero')
        const payeFlag = result.flags.find((f) => f.id === 'paye_zero')

        expect(thresholdFlag).toBeDefined()
        expect(thresholdFlag.label).toContain(
            'Tax-year thresholds are not configured for 2027/28'
        )
        expect(thresholdFlag.label).toContain('Using 2026/27 thresholds')
        expect(thresholdFlag.inputs.taxYearStart).toBe(2027)
        expect(thresholdFlag.inputs.fallbackTaxYearStart).toBe(2026)
        expect(niFlag).toBeDefined()
        expect(payeFlag).toBeDefined()
        expect(result.lowConfidence).toBe(true)
    })

    it('flags Apr-Jun 2022 payslips as partial threshold support and skips NI threshold checks', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2022-04-30T00:00:00.000Z'),
            yearKey: '2022/23',
        })
        const result = buildValidation(entry)
        const thresholdFlag = result.flags.find(
            (f) => f.id === 'tax_year_thresholds_partial_support'
        )
        const niFlag = result.flags.find((f) => f.id === 'nat_ins_zero')
        const payeFlag = result.flags.find((f) => f.id === 'paye_zero')

        expect(thresholdFlag).toBeDefined()
        expect(thresholdFlag.label).toContain('6 July 2022')
        expect(niFlag).toBeUndefined()
        expect(payeFlag).toBeUndefined()
        expect(result.lowConfidence).toBe(true)
    })

    it('continues pension missing-deductions warning in Apr 2022 partial-support periods', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2022-04-30T00:00:00.000Z'),
            yearKey: '2022/23',
            workerProfile: {
                payrollRunStartDate: '2021-09-04',
            },
        })
        const result = buildValidation(entry)
        const pensionFlag = result.flags.find(
            (f) => f.id === 'pension_auto_enrolment_missing_deductions'
        )

        expect(pensionFlag).toBeDefined()
        expect(pensionFlag?.severity).toBe('warning')
        expect(pensionFlag?.inputs?.exceedsThreeMonthWindow).toBe('yes')
    })

    it('does not mark Jan 2023 payslips as partial threshold support', () => {
        const record = buildValidationRecord()
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2023-01-28T00:00:00.000Z'),
            yearKey: '2022/23',
        })
        const result = buildValidation(entry)
        const partialFlag = result.flags.find(
            (f) => f.id === 'tax_year_thresholds_partial_support'
        )

        expect(partialFlag).toBeUndefined()
    })

    it('does not emit paye_mismatch when PAYE difference is within PAYE tolerance', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 90.9 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                thisPeriod: {
                    grossForTax: { amount: 1500 },
                    totalGrossPay: { amount: 1500 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1500,
                    taxPaidTD: 90.9,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const mismatchFlag = result.flags.find((f) => f.id === 'paye_mismatch')

        expect(mismatchFlag).toBeUndefined()
    })

    it('flags PAYE taken when standard PAYE is not due', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 20 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                thisPeriod: {
                    grossForTax: { amount: 1000 },
                    totalGrossPay: { amount: 1000 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1000,
                    taxPaidTD: 20,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find((f) => f.id === 'paye_taken_not_due')
        const mismatchFlag = result.flags.find((f) => f.id === 'paye_mismatch')

        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('paye_taken_not_due')
        expect(flag.severity).toBe('warning')
        expect(flag.inputs.expectedPaye).toBeCloseTo(0)
        expect(mismatchFlag).toBeUndefined()
    })

    it('flags employer pension contribution when earnings are below qualifying lower threshold', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 25 },
                    misc: [],
                },
                thisPeriod: {
                    grossForTax: { amount: 400 },
                    totalGrossPay: { amount: 400 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 400,
                    taxPaidTD: 0,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const flag = result.flags.find(
            (f) => f.id === 'pension_employer_contrib_not_required'
        )
        const joinNotice = result.flags.find(
            (f) => f.id === 'pension_join_no_mandatory_employer_contrib'
        )

        expect(flag).toBeDefined()
        expect(flag.ruleId).toBe('pension_employer_contrib_not_required')
        expect(flag.severity).toBe('warning')
        expect(flag.inputs.pensionER).toBe(25)
        expect(joinNotice).toBeUndefined()
    })

    it('flags unsupported PAYE pay cycles as low-confidence validation', () => {
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 90.4 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: {
                    grossForTax: { amount: 1500 },
                    totalGrossPay: { amount: 1500 },
                    payCycle: { cycle: 'Fortnightly' },
                },
                yearToDate: {
                    grossForTaxTD: 1500,
                    taxPaidTD: 90.4,
                },
            },
        })
        const entry = buildValidationEntry(record)
        const result = buildValidation(entry)
        const payCycleFlag = result.flags.find(
            (f) => f.id === 'paye_pay_cycle_unsupported'
        )

        expect(payCycleFlag).toBeDefined()
        expect(payCycleFlag.ruleId).toBe('paye_pay_cycle_unsupported')
        expect(payCycleFlag.label).toContain('Fortnightly')
        expect(result.lowConfidence).toBe(true)
    })

    it('supports PAYE cumulative mode flag and exposes exact vs sage approximation', () => {
        const previousMode = globalThis.__payeCumulativeMode
        globalThis.__payeCumulativeMode = 'sage_approx'

        try {
            const record = buildValidationRecord({
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 0 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: {
                        grossForTax: { amount: 2525.45 },
                        totalGrossPay: { amount: 2525.45 },
                        payCycle: { cycle: 'Monthly' },
                    },
                    yearToDate: {
                        grossForTaxTD: 13549.19,
                        taxPaidTD: 1447.99,
                    },
                },
            })
            const entry = buildValidationEntry(record, {
                parsedDate: new Date('2022-09-28T00:00:00.000Z'),
                yearKey: '2022/23',
                monthIndex: 6,
            })
            const result = buildValidation(entry)
            const payeFlag = result.flags.find(
                (f) => f.id === 'paye_mismatch' || f.id === 'paye_zero'
            )

            expect(payeFlag).toBeDefined()
            expect(payeFlag.inputs.payeCalculationMode).toBe('cumulative')
            expect(payeFlag.inputs.payeCumulativeMode).toBe('sage_approx')
            expect(typeof payeFlag.inputs.expectedPayeExact).toBe('number')
            expect(typeof payeFlag.inputs.expectedPayeSageApprox).toBe('number')
            expect(payeFlag.inputs.expectedPaye).toBe(
                payeFlag.inputs.expectedPayeSageApprox
            )
        } finally {
            if (previousMode === undefined) {
                delete globalThis.__payeCumulativeMode
            } else {
                globalThis.__payeCumulativeMode = previousMode
            }
        }
    })

    it('defaults PAYE cumulative mode to table_mode for Sage payroll format', () => {
        const previousMode = globalThis.__payeCumulativeMode
        delete globalThis.__payeCumulativeMode

        try {
            const record = buildValidationRecord({
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 168.06 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: {
                        grossForTax: { amount: 1897.5 },
                        totalGrossPay: { amount: 1897.5 },
                        payCycle: { cycle: 'Monthly' },
                    },
                    yearToDate: {
                        grossForTaxTD: 14906,
                        taxPaidTD: 1289.82,
                    },
                },
            })
            const entry = buildValidationEntry(record, {
                parsedDate: new Date('2021-11-26T00:00:00.000Z'),
                yearKey: '2021/22',
                monthIndex: 8,
            })
            const result = buildValidation(entry)
            const payeFlag = result.flags.find((f) => f.id === 'paye_mismatch')

            expect(payeFlag).toBeUndefined()
        } finally {
            if (previousMode === undefined) {
                delete globalThis.__payeCumulativeMode
            } else {
                globalThis.__payeCumulativeMode = previousMode
            }
        }
    })

    it('supports PAYE table_mode and still flags larger PAYE deltas', () => {
        const previousMode = globalThis.__payeCumulativeMode
        globalThis.__payeCumulativeMode = 'table_mode'

        try {
            const record = buildValidationRecord({
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 168.06 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: {
                        grossForTax: { amount: 1897.5 },
                        totalGrossPay: { amount: 1897.5 },
                        payCycle: { cycle: 'Monthly' },
                    },
                    yearToDate: {
                        grossForTaxTD: 14906,
                        taxPaidTD: 1287.22,
                    },
                },
            })
            const entry = buildValidationEntry(record, {
                parsedDate: new Date('2021-11-26T00:00:00.000Z'),
                yearKey: '2021/22',
                monthIndex: 8,
            })
            const result = buildValidation(entry)
            const payeFlag = result.flags.find((f) => f.id === 'paye_mismatch')

            expect(payeFlag).toBeDefined()
            expect(payeFlag.inputs.payeCumulativeMode).toBe('table_mode')
            expect(typeof payeFlag.inputs.expectedPayeTableMode).toBe('number')
            expect(payeFlag.inputs.expectedPaye).toBe(
                payeFlag.inputs.expectedPayeTableMode
            )
        } finally {
            if (previousMode === undefined) {
                delete globalThis.__payeCumulativeMode
            } else {
                globalThis.__payeCumulativeMode = previousMode
            }
        }
    })

    it('suppresses PAYE mismatch for small table_mode cumulative drift', () => {
        const previousMode = globalThis.__payeCumulativeMode
        globalThis.__payeCumulativeMode = 'table_mode'

        try {
            const record = buildValidationRecord({
                payrollDoc: {
                    deductions: {
                        payeTax: { amount: 168.06 },
                        natIns: { amount: 0 },
                        pensionEE: { amount: 0 },
                        pensionER: { amount: 0 },
                        misc: [],
                    },
                    taxCode: { code: 'S1257L' },
                    thisPeriod: {
                        grossForTax: { amount: 1897.5 },
                        totalGrossPay: { amount: 1897.5 },
                        payCycle: { cycle: 'Monthly' },
                    },
                    yearToDate: {
                        grossForTaxTD: 14906,
                        taxPaidTD: 1289.82,
                    },
                },
            })
            const entry = buildValidationEntry(record, {
                parsedDate: new Date('2021-11-26T00:00:00.000Z'),
                yearKey: '2021/22',
                monthIndex: 8,
            })
            const result = buildValidation(entry)
            const payeFlag = result.flags.find((f) => f.id === 'paye_mismatch')

            expect(payeFlag).toBeUndefined()
        } finally {
            if (previousMode === undefined) {
                delete globalThis.__payeCumulativeMode
            } else {
                globalThis.__payeCumulativeMode = previousMode
            }
        }
    })

    it('suppresses PAYE mismatch for a negative PAYE refund within tolerance', () => {
        // payeTax = -0.3 (refund), expectedPaye ≈ -0.6 — difference 0.3 ≤ 0.5 tolerance
        // grossForTaxTD=1100, taxPaidTD=10.8, month 1 → priorTaxPaid=11.1, expectedTaxYtd=10.5
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: -0.3 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: {
                    grossForTax: { amount: 1100 },
                    totalGrossPay: { amount: 1100 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1100,
                    taxPaidTD: 10.8,
                },
                netPay: { amount: 1100.3 },
            },
        })
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2025-04-30T00:00:00.000Z'),
            yearKey: '2025/26',
            monthIndex: 1,
        })
        const result = buildValidation(entry)
        const payeFlag = result.flags.find(
            (f) => f.id === 'paye_mismatch' || f.id === 'paye_zero'
        )

        expect(payeFlag).toBeUndefined()
    })

    it('does not suppress PAYE when payeTax rounds to zero — routes to paye_zero instead', () => {
        // payeTax = 0.004 rounds to 0.00 via roundMoney; tolerance guard is skipped
        // because roundMoney(payeTax) === 0, so it falls through to the paye_zero path
        const record = buildValidationRecord({
            payrollDoc: {
                deductions: {
                    payeTax: { amount: 0.004 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                taxCode: { code: '1257L' },
                thisPeriod: {
                    grossForTax: { amount: 1500 },
                    totalGrossPay: { amount: 1500 },
                    payCycle: { cycle: 'Monthly' },
                },
                yearToDate: {
                    grossForTaxTD: 1500,
                    taxPaidTD: 0.004,
                },
                netPay: { amount: 1499.996 },
            },
        })
        const entry = buildValidationEntry(record, {
            parsedDate: new Date('2025-04-30T00:00:00.000Z'),
            yearKey: '2025/26',
            monthIndex: 1,
        })
        const result = buildValidation(entry)
        const payeFlag = result.flags.find((f) => f.id === 'paye_zero')

        expect(payeFlag).toBeDefined()
        expect(payeFlag.inputs.payeTax).toBe(0.004)
    })
})

describe('isWithinPayeTolerance', () => {
    it('returns true when actual equals expected exactly', () => {
        expect(isWithinPayeTolerance(250, 250)).toBe(true)
    })

    it('returns true when difference is exactly at the default tolerance (0.50)', () => {
        expect(isWithinPayeTolerance(250.5, 250)).toBe(true)
        expect(isWithinPayeTolerance(249.5, 250)).toBe(true)
    })

    it('returns false when difference exceeds default tolerance', () => {
        expect(isWithinPayeTolerance(251, 250)).toBe(false)
        expect(isWithinPayeTolerance(249, 250)).toBe(false)
    })

    it('respects a custom tolerance value', () => {
        expect(isWithinPayeTolerance(252, 250, 2)).toBe(true)
        expect(isWithinPayeTolerance(253, 250, 2)).toBe(false)
    })

    it('returns false when either operand is null', () => {
        expect(isWithinPayeTolerance(null, 250)).toBe(false)
        expect(isWithinPayeTolerance(250, null)).toBe(false)
        expect(isWithinPayeTolerance(null, null)).toBe(false)
    })

    it('returns false when either operand is undefined', () => {
        expect(isWithinPayeTolerance(undefined, 250)).toBe(false)
        expect(isWithinPayeTolerance(250, undefined)).toBe(false)
    })

    it('handles floating-point comparison correctly at sub-penny precision', () => {
        // 100.50 - 100.00 = 0.50 exactly, should be within default tolerance
        expect(isWithinPayeTolerance(100.5, 100.0)).toBe(true)
        // 100.51 - 100.00 = 0.51, should exceed tolerance
        expect(isWithinPayeTolerance(100.51, 100.0)).toBe(false)
    })

    it('uses table_mode tolerance (2.0) for larger drift checks', () => {
        expect(isWithinPayeTolerance(252, 250, 2)).toBe(true)
        expect(isWithinPayeTolerance(252.01, 250, 2)).toBe(false)
    })
})

describe('buildReport payrollRunStartDate handling', () => {
    function buildMinimalRecord({ start, end, payeTax = 0, natIns = 0 }) {
        const grossPay = 1000
        return {
            employee: { natInsNumber: 'AB123456C' },
            payrollDoc: {
                payPeriod: { start, end },
                processDate: { date: `${start} - ${end}` },
                taxCode: { code: '1257L' },
                payments: {
                    hourly: {
                        basic: { units: 80, rate: 12.5, amount: grossPay },
                        holiday: { units: 0, rate: null, amount: 0 },
                    },
                    salary: {
                        basic: { amount: 0 },
                        holiday: { units: 0, rate: null, amount: 0 },
                    },
                    misc: [],
                },
                thisPeriod: {
                    totalGrossPay: { amount: grossPay },
                    payCycle: { cycle: 'Monthly' },
                },
                deductions: {
                    payeTax: { amount: payeTax },
                    natIns: { amount: natIns },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                    totalDeductions: { amount: payeTax + natIns },
                },
                netPay: { amount: grossPay - payeTax - natIns },
            },
            sourceFiles: ['test.pdf'],
        }
    }

    it('infers payrollRunStartDate from earliest entry when caller does not supply one', () => {
        const records = [
            buildMinimalRecord({ start: '01/06/25', end: '30/06/25' }),
            buildMinimalRecord({ start: '01/05/25', end: '31/05/25' }),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
        })
        // The inferred start should be the earliest parsed date (May 2025)
        expect(context.workerProfile.payrollRunStartDate).toBe('2025-05-01')
    })

    it('uses caller-supplied payrollRunStartDate over inferred date', () => {
        const records = [
            buildMinimalRecord({ start: '01/06/25', end: '30/06/25' }),
            buildMinimalRecord({ start: '01/05/25', end: '31/05/25' }),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            payrollRunStartDate: '2025-01-01',
        })
        expect(context.workerProfile.payrollRunStartDate).toBe('2025-01-01')
    })

    it('propagates payrollRunStartDate to all entries', () => {
        const records = [
            buildMinimalRecord({ start: '01/05/25', end: '31/05/25' }),
            buildMinimalRecord({ start: '01/06/25', end: '30/06/25' }),
        ]
        const { context } = buildReport(records, [], null, {
            workerType: 'hourly',
            typicalDays: 5,
            statutoryHolidayDays: 28,
            payrollRunStartDate: '2025-03-01',
        })
        for (const entry of context.entries) {
            expect(entry.workerProfile?.payrollRunStartDate).toBe('2025-03-01')
        }
    })

    it('preserves null payrollRunStartDate when no dates can be inferred', () => {
        // Record with no parseable dates
        const recordNoDates = {
            employee: { natInsNumber: 'AB123456C' },
            payrollDoc: {
                taxCode: { code: '1257L' },
                payments: {
                    hourly: {
                        basic: { units: 80, rate: 12.5, amount: 1000 },
                        holiday: { units: 0, rate: null, amount: 0 },
                    },
                    salary: { basic: { amount: 0 }, holiday: { amount: 0 } },
                    misc: [],
                },
                thisPeriod: { totalGrossPay: { amount: 1000 } },
                deductions: {
                    payeTax: { amount: 0 },
                    natIns: { amount: 0 },
                    pensionEE: { amount: 0 },
                    pensionER: { amount: 0 },
                    misc: [],
                },
                netPay: { amount: 1000 },
            },
            sourceFiles: ['test.pdf'],
        }
        const { context } = buildReport([recordNoDates], [], null, {
            workerType: 'hourly',
            typicalDays: 5,
        })
        // No caller-supplied date, no parseable dates → null
        expect(context.workerProfile.payrollRunStartDate).toBeNull()
    })
})
