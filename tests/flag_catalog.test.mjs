import { describe, expect, it } from 'vitest'
import {
    FLAG_CATALOG,
    formatFlagLabel,
    resolveFlagLabel,
} from '../pwa/src/report/flag_catalog.js'

describe('FLAG_CATALOG', () => {
    it('contains all expected flag IDs', () => {
        const expectedIds = [
            'missing_nat_ins',
            'missing_tax_code',
            'paye_zero',
            'paye_tax_code_unsupported',
            'paye_pay_cycle_unsupported',
            'nat_ins_zero',
            'nat_ins_taken_below_threshold',
            'paye_taken_not_due',
            'tax_year_thresholds_unavailable',
            'tax_year_thresholds_partial_support',
            'pension_auto_enrolment_missing_deductions',
            'pension_opt_in_possible',
            'pension_join_no_mandatory_employer_contrib',
            'pension_employer_contrib_not_required',
            'payment_line_mismatch',
            'gross_mismatch',
            'net_mismatch',
            'holiday_rate_below_basic',
            'holiday_rate_below_rolling_avg',
            'holiday_reference_insufficient_history',
            'holiday_mixed_basic_holiday_pay',
        ]
        for (const id of expectedIds) {
            expect(FLAG_CATALOG).toHaveProperty(id)
            expect(FLAG_CATALOG[id].id).toBe(id)
        }
    })

    it('has notice severity for pension opt-in and join flags', () => {
        expect(FLAG_CATALOG.pension_opt_in_possible.severity).toBe('notice')
        expect(
            FLAG_CATALOG.pension_join_no_mandatory_employer_contrib.severity
        ).toBe('notice')
        expect(
            FLAG_CATALOG.holiday_reference_insufficient_history.severity
        ).toBe('notice')
        expect(FLAG_CATALOG.holiday_mixed_basic_holiday_pay.severity).toBe(
            'notice'
        )
    })

    it('has warning severity for pension missing-deductions flag', () => {
        expect(
            FLAG_CATALOG.pension_auto_enrolment_missing_deductions.severity
        ).toBe('warning')
    })

    it('has warning severity for PAYE flags', () => {
        expect(FLAG_CATALOG.paye_zero.severity).toBe('warning')
        expect(FLAG_CATALOG.paye_taken_not_due.severity).toBe('warning')
        expect(FLAG_CATALOG.paye_tax_code_unsupported.severity).toBe('warning')
        expect(FLAG_CATALOG.paye_pay_cycle_unsupported.severity).toBe('warning')
    })

    it('has warning severity for ineligible deduction flags', () => {
        expect(FLAG_CATALOG.nat_ins_taken_below_threshold.severity).toBe(
            'warning'
        )
        expect(
            FLAG_CATALOG.pension_employer_contrib_not_required.severity
        ).toBe('warning')
    })
})

describe('resolveFlagLabel', () => {
    it('returns catalog label for a known id', () => {
        expect(resolveFlagLabel('missing_tax_code')).toBe('Missing tax code')
        expect(resolveFlagLabel('paye_zero')).toBe('PAYE Tax missing or £0')
    })

    it('returns fallback for unknown id when provided', () => {
        expect(resolveFlagLabel('unknown_flag', 'Custom fallback')).toBe(
            'Custom fallback'
        )
    })

    it('returns the id itself when no fallback and id is unknown', () => {
        expect(resolveFlagLabel('unknown_flag')).toBe('unknown_flag')
    })
})

describe('formatFlagLabel — paye_pay_cycle_unsupported', () => {
    it('formats reported_pay_cycle context', () => {
        const label = formatFlagLabel('paye_pay_cycle_unsupported', {
            context: 'reported_pay_cycle',
            payCycle: 'Fortnightly',
        })
        expect(label).toContain(
            'PAYE checks currently support weekly and monthly payslips only'
        )
        expect(label).toContain('Reported pay cycle: Fortnightly.')
    })

    it('formats period_position_unknown context', () => {
        const label = formatFlagLabel('paye_pay_cycle_unsupported', {
            context: 'period_position_unknown',
        })
        expect(label).toBe(
            'PAYE period position could not be determined for this payslip, so standard PAYE checks were skipped.'
        )
    })

    it('defaults to catalog label for unknown context', () => {
        const label = formatFlagLabel('paye_pay_cycle_unsupported', {})
        expect(label).toBe(
            'PAYE checks currently support weekly and monthly payslips only'
        )
    })
})

describe('formatFlagLabel — paye_tax_code_unsupported', () => {
    it('formats reported_tax_code context', () => {
        const label = formatFlagLabel('paye_tax_code_unsupported', {
            context: 'reported_tax_code',
            taxCode: 'D1',
        })
        expect(label).toContain(
            'This tax code is outside the standard PAYE check path'
        )
        expect(label).toContain('Reported tax code: D1.')
    })

    it('uses Unknown when taxCode is missing', () => {
        const label = formatFlagLabel('paye_tax_code_unsupported', {
            context: 'reported_tax_code',
        })
        expect(label).toContain('Reported tax code: Unknown.')
    })

    it('formats region_unknown context', () => {
        const label = formatFlagLabel('paye_tax_code_unsupported', {
            context: 'region_unknown',
        })
        expect(label).toBe(
            'PAYE region could not be determined from the tax code, so standard PAYE checks were skipped.'
        )
    })
})

describe('formatFlagLabel — paye_zero', () => {
    it('formats missing_tax_code context', () => {
        const label = formatFlagLabel('paye_zero', {
            context: 'missing_tax_code',
        })
        expect(label).toBe(
            'PAYE Tax is £0 and the tax code is missing, so the threshold check could not be completed for this payslip.'
        )
    })

    it('formats ytd_above_allowance context', () => {
        const label = formatFlagLabel('paye_zero', {
            context: 'ytd_above_allowance',
            grossForTaxTD: 4000,
            cumulativeAllowance: 3144,
        })
        expect(label).toContain('No PAYE deduction recorded')
        expect(label).toContain('£4,000.00')
        expect(label).toContain('above your tax-free allowance')
    })

    it('formats period_above_allowance context', () => {
        const label = formatFlagLabel('paye_zero', {
            context: 'period_above_allowance',
            grossForTax: 1200,
            periodAllowance: 1048,
        })
        expect(label).toContain('No PAYE deduction recorded')
        expect(label).toContain('£1,200.00')
        expect(label).toContain(
            'above your tax-free allowance for this pay period'
        )
    })

    it('returns catalog label for paye_zero without context', () => {
        const label = formatFlagLabel('paye_zero', {})
        expect(label).toBe('PAYE Tax missing or £0')
    })
})

describe('formatFlagLabel — nat_ins_zero', () => {
    it('formats above_threshold_warning context', () => {
        const label = formatFlagLabel('nat_ins_zero', {
            context: 'above_threshold_warning',
            grossPay: 1500,
            niPrimaryThresholdMonthly: 1048,
        })
        expect(label).toContain(
            'National Insurance missing or £0 while gross pay £1,500.00 is above the primary threshold of £1,048.00'
        )
    })

    it('uses Unknown for null gross pay', () => {
        const label = formatFlagLabel('nat_ins_zero', {
            context: 'above_threshold_warning',
            grossPay: null,
            niPrimaryThresholdMonthly: 1048,
        })
        expect(label).toContain('Unknown')
    })

    it('returns catalog label for unknown context', () => {
        const label = formatFlagLabel('nat_ins_zero', {})
        expect(label).toBe('National Insurance missing or £0')
    })
})

describe('formatFlagLabel — nat_ins_taken_below_threshold', () => {
    it('formats NI taken while at or below threshold', () => {
        const label = formatFlagLabel('nat_ins_taken_below_threshold', {
            nationalInsurance: 15,
            grossPay: 800,
            niPrimaryThresholdMonthly: 1048,
        })
        expect(label).toContain('NI deductions of £15.00 were taken')
        expect(label).toContain('gross pay £800.00 is at or below')
        expect(label).toContain('£1,048.00')
    })
})

describe('formatFlagLabel — paye_taken_not_due', () => {
    it('formats period_within_allowance context', () => {
        const label = formatFlagLabel('paye_taken_not_due', {
            context: 'period_within_allowance',
            payeTax: 20,
            grossForTax: 800,
            periodAllowance: 1048,
        })
        expect(label).toContain('PAYE Tax of £20.00 was deducted')
        expect(label).toContain('£800.00')
        expect(label).toContain(
            'within your tax-free allowance for this pay period'
        )
    })

    it('formats ytd_within_allowance context', () => {
        const label = formatFlagLabel('paye_taken_not_due', {
            context: 'ytd_within_allowance',
            payeTax: 25,
            grossForTaxTD: 2000,
            cumulativeAllowance: 3144,
        })
        expect(label).toContain('PAYE Tax of £25.00 was deducted')
        expect(label).toContain('taxable gross pay to date')
        expect(label).toContain('£2,000.00')
        expect(label).toContain('within your tax-free allowance')
    })

    it('returns a fallback message when no context is provided', () => {
        const label = formatFlagLabel('paye_taken_not_due', { payeTax: 10 })
        expect(label).toContain('PAYE Tax of £10.00 was deducted')
        expect(label).toContain('within the tax-free allowance')
    })
})

describe('formatFlagLabel — tax_year_thresholds_unavailable', () => {
    it('formats fallback-to-previous-tax-year context', () => {
        const label = formatFlagLabel('tax_year_thresholds_unavailable', {
            context: 'fallback-to-previous-tax-year',
            taxYearStartLabel: '2028/29',
            fallbackTaxYearStartLabel: '2026/27',
        })
        expect(label).toContain(
            'Tax-year thresholds are not configured for 2028/29'
        )
        expect(label).toContain(
            'Using 2026/27 thresholds as a temporary baseline'
        )
    })

    it('formats unsupported-tax-year context', () => {
        const label = formatFlagLabel('tax_year_thresholds_unavailable', {
            context: 'unsupported-tax-year',
            taxYearStartLabel: '2015/16',
        })
        expect(label).toContain(
            'Tax-year thresholds are not configured for 2015/16'
        )
        expect(label).toContain(
            'Threshold-based checks were skipped for this payslip'
        )
    })

    it('formats unknown-tax-year context', () => {
        const label = formatFlagLabel('tax_year_thresholds_unavailable', {
            context: 'unknown-tax-year',
        })
        expect(label).toBe(
            'Tax year could not be determined for this payslip. Threshold-based checks were skipped.'
        )
    })

    it('uses fallback text when labels are missing in fallback context', () => {
        const label = formatFlagLabel('tax_year_thresholds_unavailable', {
            context: 'fallback-to-previous-tax-year',
        })
        expect(label).toContain('unknown tax year')
        expect(label).toContain('an earlier available tax year')
    })
})

describe('formatFlagLabel — pension_auto_enrolment_missing_deductions', () => {
    it('formats pre_enrolment_notice context', () => {
        const label = formatFlagLabel(
            'pension_auto_enrolment_missing_deductions',
            {
                context: 'pre_enrolment_notice',
                earnings: 1200,
                periodTrigger: 833,
            }
        )
        expect(label).toContain('Pension deductions have not yet appeared')
        expect(label).toContain('pre-enrolment period')
        expect(label).toContain('£1,200.00')
        expect(label).toContain('£833.00')
    })

    it('formats three_month_warning context with elapsed days', () => {
        const label = formatFlagLabel(
            'pension_auto_enrolment_missing_deductions',
            {
                context: 'three_month_warning',
                earnings: 1200,
                periodTrigger: 833,
                elapsedRunDays: 95,
            }
        )
        expect(label).toContain('95 days')
        expect(label).toContain('should have been auto-enrolled by now')
        expect(label).toContain('£1,200.00')
    })

    it('formats six_week_notice context with elapsed days', () => {
        const label = formatFlagLabel(
            'pension_auto_enrolment_missing_deductions',
            {
                context: 'six_week_notice',
                earnings: 1200,
                periodTrigger: 833,
                elapsedRunDays: 50,
            }
        )
        expect(label).toContain('after more than 6 weeks (50 days)')
        expect(label).toContain('postponement (up to 3 months)')
        expect(label).toContain('£1,200.00')
    })

    it('formats default_warning context', () => {
        const label = formatFlagLabel(
            'pension_auto_enrolment_missing_deductions',
            {
                context: 'default_warning',
                earnings: 1200,
                periodTrigger: 833,
            }
        )
        expect(label).toContain(
            'Pension deductions do not appear to be present'
        )
        expect(label).toContain('£1,200.00')
        expect(label).toContain('£833.00')
    })
})

describe('formatFlagLabel — pension_opt_in_possible', () => {
    it('formats the opt-in label with earnings and thresholds', () => {
        const label = formatFlagLabel('pension_opt_in_possible', {
            earnings: 700,
            qualifyingLower: 520,
            autoEnrolmentTrigger: 833,
        })
        expect(label).toContain('may be able to opt in to a workplace pension')
        expect(label).toContain('£700.00')
        expect(label).toContain('£520.00')
        expect(label).toContain('£833.00')
    })

    it('uses Unknown for null earnings', () => {
        const label = formatFlagLabel('pension_opt_in_possible', {
            earnings: null,
            qualifyingLower: 520,
            autoEnrolmentTrigger: 833,
        })
        expect(label).toContain('Unknown')
    })
})

describe('formatFlagLabel — pension_join_no_mandatory_employer_contrib', () => {
    it('formats the join label with earnings and qualifying lower threshold', () => {
        const label = formatFlagLabel(
            'pension_join_no_mandatory_employer_contrib',
            {
                earnings: 400,
                qualifyingLower: 520,
            }
        )
        expect(label).toContain('may ask to join a workplace pension')
        expect(label).toContain('employer contributions may not be required')
        expect(label).toContain('£400.00')
        expect(label).toContain('£520.00')
    })
})

describe('formatFlagLabel — pension_employer_contrib_not_required', () => {
    it('formats employer contribution below lower qualifying threshold', () => {
        const label = formatFlagLabel('pension_employer_contrib_not_required', {
            pensionER: 25,
            earnings: 400,
            qualifyingLower: 520,
        })
        expect(label).toContain('Employer pension contributions £25.00')
        expect(label).toContain('pre-tax earnings are £400.00')
        expect(label).toContain(
            'lower qualifying earnings threshold of £520.00'
        )
    })
})

describe('formatFlagLabel — fallback behavior', () => {
    it('returns catalog label for an unknown id', () => {
        const label = formatFlagLabel('gross_mismatch')
        expect(label).toBe('Payments total does not match Total Gross Pay')
    })

    it('returns the id itself for completely unknown flags', () => {
        const label = formatFlagLabel('totally_unknown_flag')
        expect(label).toBe('totally_unknown_flag')
    })
})
