/**
 * Central catalog of validation flag IDs used in report calculations.
 *
 * This manifest is intentionally static so auditors can review all current
 * rule outputs in one place.
 */

/**
 * @typedef {{ id: string, label: string, section: 'identity' | 'tax' | 'validation' | 'holiday', severity: 'notice' | 'warning' }} FlagCatalogEntry
 */

/** @type {Record<string, FlagCatalogEntry>} */
export const FLAG_CATALOG = {
    missing_nat_ins: {
        id: 'missing_nat_ins',
        label: 'Missing NAT INS No',
        section: 'identity',
        severity: 'warning',
    },
    missing_tax_code: {
        id: 'missing_tax_code',
        label: 'Missing tax code',
        section: 'tax',
        severity: 'warning',
    },
    paye_zero: {
        id: 'paye_zero',
        label: 'PAYE Tax missing or £0',
        section: 'tax',
        severity: 'warning',
    },
    paye_tax_code_unsupported: {
        id: 'paye_tax_code_unsupported',
        label: 'This tax code is outside the standard PAYE check path and should be verified manually',
        section: 'tax',
        severity: 'warning',
    },
    paye_pay_cycle_unsupported: {
        id: 'paye_pay_cycle_unsupported',
        label: 'PAYE checks currently support weekly and monthly payslips only',
        section: 'tax',
        severity: 'warning',
    },
    nat_ins_zero: {
        id: 'nat_ins_zero',
        label: 'National Insurance missing or £0',
        section: 'tax',
        severity: 'warning',
    },
    nat_ins_taken_below_threshold: {
        id: 'nat_ins_taken_below_threshold',
        label: 'National Insurance deductions taken while gross pay is at or below the primary threshold',
        section: 'tax',
        severity: 'warning',
    },
    paye_taken_not_due: {
        id: 'paye_taken_not_due',
        label: 'PAYE Tax was deducted even though earnings appear to be within the tax-free allowance',
        section: 'tax',
        severity: 'warning',
    },
    paye_basic_rate_code: {
        id: 'paye_basic_rate_code',
        label: 'A basic rate (BR/SBR) tax code was detected — this typically indicates a second employment where the personal allowance is applied elsewhere',
        section: 'tax',
        severity: 'notice',
    },
    tax_year_thresholds_unavailable: {
        id: 'tax_year_thresholds_unavailable',
        label: 'Tax-year thresholds unavailable for this payslip',
        section: 'tax',
        severity: 'warning',
    },
    tax_year_thresholds_partial_support: {
        id: 'tax_year_thresholds_partial_support',
        label: 'In 2022 due to mid-year HMRC changes, threshold-based checks are only partially supported before 6 July 2022. PAYE and NI threshold checks are skipped for this payslip, but pension auto-enrolment checks still run.',
        section: 'tax',
        severity: 'notice',
    },
    pension_auto_enrolment_missing_deductions: {
        id: 'pension_auto_enrolment_missing_deductions',
        label: 'Pension auto-enrolment may apply for this pay period, but no pension deductions were detected',
        section: 'validation',
        severity: 'warning',
    },
    pension_opt_in_possible: {
        id: 'pension_opt_in_possible',
        label: 'Pre-tax earnings are below the auto-enrolment trigger; worker may be able to opt in to a workplace pension',
        section: 'validation',
        severity: 'notice',
    },
    pension_join_no_mandatory_employer_contrib: {
        id: 'pension_join_no_mandatory_employer_contrib',
        label: 'Pre-tax earnings are below the lower qualifying threshold; worker may ask to join, but employer contributions may not be required',
        section: 'validation',
        severity: 'notice',
    },
    pension_employer_contrib_not_required: {
        id: 'pension_employer_contrib_not_required',
        label: 'Employer pension contributions were detected even though earnings are below the lower qualifying threshold',
        section: 'validation',
        severity: 'warning',
    },
    unrecognised_deduction: {
        id: 'unrecognised_deduction',
        label: 'Unrecognised deduction detected',
        section: 'validation',
        severity: 'notice',
    },
    payment_line_mismatch: {
        id: 'payment_line_mismatch',
        label: 'A payment line units × rate does not match its amount',
        section: 'validation',
        severity: 'warning',
    },
    gross_mismatch: {
        id: 'gross_mismatch',
        label: 'Payments total does not match Total Gross Pay',
        section: 'validation',
        severity: 'warning',
    },
    net_mismatch: {
        id: 'net_mismatch',
        label: 'Net Pay does not match payments less deductions',
        section: 'validation',
        severity: 'warning',
    },
    holiday_rate_below_basic: {
        id: 'holiday_rate_below_basic',
        label: 'Holiday rate implied by amount is below basic rate on this payslip',
        section: 'holiday',
        severity: 'warning',
    },
    holiday_rate_below_rolling_avg: {
        id: 'holiday_rate_below_rolling_avg',
        label: 'Holiday rate implied by amount is below rolling average basic rate',
        section: 'holiday',
        severity: 'warning',
    },
    holiday_reference_insufficient_history: {
        id: 'holiday_reference_insufficient_history',
        label: "Fewer than 3 pay periods available — not enough to estimate holiday days taken. If you're a new starter, ask your employer how many holiday days this payment represents. Otherwise, adding earlier payslips to this run will improve accuracy.",
        section: 'holiday',
        severity: 'notice',
    },
    holiday_mixed_basic_holiday_pay: {
        id: 'holiday_mixed_basic_holiday_pay',
        label: 'Mixed basic pay + holiday pay detected in this period. Holiday calculations are based on estimated weekly pay and so for monthly payslips we make a best guess estimate based on your previous working patterns.',
        section: 'holiday',
        severity: 'notice',
    },
}

/**
 * @param {string} id
 * @param {string} [fallback='']
 * @returns {string}
 */
export function resolveFlagLabel(id, fallback = '') {
    return FLAG_CATALOG[id]?.label || fallback || id
}

/**
 * @param {number | null | undefined} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    if (!Number.isFinite(amount)) {
        return 'Unknown'
    }
    return Number(amount).toLocaleString('en-GB', {
        style: 'currency',
        currency: 'GBP',
    })
}

/**
 * @param {string} id
 * @param {{ impliedHolidayRate?: number, basicRate?: number, rollingAvgRate?: number, totalWeeks?: number, periodsCounted?: number, limitedData?: boolean, mixedMonthsIncluded?: number, context?: string, payCycle?: string | null, taxCode?: string | null, payeTax?: number | null, grossForTax?: number | null, grossForTaxTD?: number | null, periodAllowance?: number | null, cumulativeAllowance?: number | null, earnings?: number | null, periodTrigger?: number | null, periodLabel?: string | null, region?: string | null, qualifyingLower?: number | null, autoEnrolmentTrigger?: number | null, elapsedRunDays?: number | null, taxYearStartLabel?: string, fallbackTaxYearStartLabel?: string, grossPay?: number | null, niPrimaryThresholdMonthly?: number | null, pensionER?: number | null, nationalInsurance?: number | null, deductionTitle?: string | null, deductionAmount?: number | null }} [params]
 * @returns {string}
 */
export function formatFlagLabel(id, params = {}) {
    if (id === 'paye_pay_cycle_unsupported') {
        if (params.context === 'reported_pay_cycle') {
            return `${resolveFlagLabel(id)} Reported pay cycle: ${String(params.payCycle || 'Unknown')}.`
        }
        if (params.context === 'period_position_unknown') {
            return 'PAYE period position could not be determined for this payslip, so standard PAYE checks were skipped.'
        }
    }

    if (id === 'paye_tax_code_unsupported') {
        if (params.context === 'reported_tax_code') {
            return `${resolveFlagLabel(id)} Reported tax code: ${params.taxCode || 'Unknown'}.`
        }
        if (params.context === 'region_unknown') {
            return 'PAYE region could not be determined from the tax code, so standard PAYE checks were skipped.'
        }
    }

    if (id === 'paye_basic_rate_code') {
        const codeStr = params.taxCode ? ` (${params.taxCode})` : ''
        const rateLabel =
            params.region === 'scotland' ? 'Scottish basic rate' : 'basic rate'
        return `Tax code${codeStr} is a ${rateLabel} second job code. The personal allowance is being applied against other employment, and all earnings here will be taxed at the full 20% ${rateLabel} with no personal allowance.`
    }

    if (id === 'paye_zero' && params.context === 'missing_tax_code') {
        return 'PAYE Tax is £0 and the tax code is missing, so the threshold check could not be completed for this payslip.'
    }

    if (id === 'paye_zero') {
        if (params.context === 'ytd_above_allowance') {
            return `No PAYE deduction recorded. Your taxable gross pay to date is ${formatCurrency(params.grossForTaxTD)} — and these earnings appear to be above your tax-free allowance.`
        }
        if (params.context === 'period_above_allowance') {
            return `No PAYE deduction recorded. Gross pay for this period is ${formatCurrency(params.grossForTax)} — and these earnings appear to be above your tax-free allowance for this pay period.`
        }
    }

    if (id === 'paye_taken_not_due') {
        if (params.context === 'ytd_within_allowance') {
            return `PAYE Tax of ${formatCurrency(params.payeTax)} was deducted, but your taxable gross pay to date is ${formatCurrency(params.grossForTaxTD)} — and these earnings appear to fall within your tax-free allowance.`
        }
        if (params.context === 'period_within_allowance') {
            return `PAYE Tax of ${formatCurrency(params.payeTax)} was deducted, but gross pay for this period is ${formatCurrency(params.grossForTax)} — and these earnings appear to fall within your tax-free allowance for this pay period.`
        }
        return `PAYE Tax of ${formatCurrency(params.payeTax)} was deducted, but earnings appear to fall within the tax-free allowance.`
    }

    if (id === 'pension_auto_enrolment_missing_deductions') {
        const periodLabel = params.periodLabel || 'period'
        if (params.context === 'pre_enrolment_notice') {
            return `Pension deductions have not yet appeared, so this is being treated as a pre-enrolment period. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the ${periodLabel} auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'three_month_warning') {
            return `Pension deductions have still not appeared after ${params.elapsedRunDays} days, so the worker should have been auto-enrolled by now unless valid postponement was notified. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the ${periodLabel} auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'six_week_notice') {
            return `Pension deductions have still not appeared after more than 6 weeks (${params.elapsedRunDays} days), so the worker should now be auto-enrolled or told in writing about postponement (up to 3 months). Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the ${periodLabel} auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'default_warning') {
            return `Pension deductions do not appear to be present. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the ${periodLabel} auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
    }

    if (id === 'pension_opt_in_possible') {
        const periodLabel = params.periodLabel || 'period'
        return `The worker may be able to opt in to a workplace pension. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the ${periodLabel} lower qualifying earnings threshold of ${formatCurrency(params.qualifyingLower)} but below the ${periodLabel} auto-enrolment trigger of ${formatCurrency(params.autoEnrolmentTrigger)}.`
    }

    if (id === 'pension_join_no_mandatory_employer_contrib') {
        const periodLabel = params.periodLabel || 'period'
        return `The worker may ask to join a workplace pension, but employer contributions may not be required. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are below the ${periodLabel} lower qualifying earnings threshold of ${formatCurrency(params.qualifyingLower)}.`
    }

    if (id === 'pension_employer_contrib_not_required') {
        const periodLabel = params.periodLabel || 'period'
        return `Employer pension contributions ${formatCurrency(params.pensionER)} were detected while pre-tax earnings are ${formatCurrency(params.earnings)}, below the ${periodLabel} lower qualifying earnings threshold of ${formatCurrency(params.qualifyingLower)} where employer contributions are not normally required. The employee may still choose to opt in and make voluntary contributions.`
    }

    if (id === 'unrecognised_deduction') {
        if (params.context === 'reported_deduction') {
            return `Unrecognised deduction ${String(params.deductionTitle || 'Unknown deduction')} of ${formatCurrency(params.deductionAmount)} was detected. This does not match NI, PAYE, or pension deduction categories and should be reviewed manually.`
        }
    }

    if (id === 'tax_year_thresholds_unavailable') {
        if (params.context === 'fallback-to-previous-tax-year') {
            return `Tax-year thresholds are not configured for ${String(params.taxYearStartLabel || 'unknown tax year')}. Using ${String(params.fallbackTaxYearStartLabel || 'an earlier available tax year')} thresholds as a temporary baseline for threshold-based checks on this payslip.`
        }
        if (params.context === 'unsupported-tax-year') {
            return `Tax-year thresholds are not configured for ${String(params.taxYearStartLabel || 'unknown tax year')}. Threshold-based checks were skipped for this payslip.`
        }
        if (params.context === 'unknown-tax-year') {
            return 'Tax year could not be determined for this payslip. Threshold-based checks were skipped.'
        }
    }

    if (id === 'nat_ins_zero') {
        const grossPayLabel = formatCurrency(params.grossPay)
        const thresholdLabel = formatCurrency(params.niPrimaryThresholdMonthly)
        if (params.context === 'above_threshold_warning') {
            return `National Insurance missing or £0 while gross pay ${grossPayLabel} is above the primary threshold of ${thresholdLabel}`
        }
    }

    if (id === 'nat_ins_taken_below_threshold') {
        const grossPayLabel = formatCurrency(params.grossPay)
        const thresholdLabel = formatCurrency(params.niPrimaryThresholdMonthly)
        return `NI deductions of ${formatCurrency(params.nationalInsurance)} were taken while gross pay ${grossPayLabel} is at or below the primary threshold of ${thresholdLabel}`
    }

    if (id === 'holiday_rate_below_basic') {
        const impliedHolidayRate = Number(params.impliedHolidayRate)
        const basicRate = Number(params.basicRate)
        if (Number.isFinite(impliedHolidayRate) && Number.isFinite(basicRate)) {
            return `Holiday rate (\u00a3${impliedHolidayRate.toFixed(2)}/hr implied) is below basic rate (\u00a3${basicRate.toFixed(2)}/hr) on this payslip`
        }
        return resolveFlagLabel(
            id,
            'Holiday rate implied by amount is below basic rate on this payslip'
        )
    }

    if (id === 'holiday_rate_below_rolling_avg') {
        const impliedHolidayRate = Number(params.impliedHolidayRate)
        const rollingAvgRate = Number(params.rollingAvgRate)
        const totalWeeks = Number(params.totalWeeks)
        const periodsCounted = Number(params.periodsCounted)
        const limitedData = Boolean(params.limitedData)
        const mixedMonthsIncluded = Number(params.mixedMonthsIncluded ?? 0)

        if (
            Number.isFinite(impliedHolidayRate) &&
            Number.isFinite(rollingAvgRate)
        ) {
            const weeksNote = limitedData
                ? ` (based on ${Math.round(totalWeeks)} weeks available from ${periodsCounted} months)`
                : ` (${Math.round(totalWeeks)}-week rolling average)`
            const mixedMonthNote =
                mixedMonthsIncluded > 0
                    ? ` — low confidence: includes ${mixedMonthsIncluded} mixed work+holiday ${mixedMonthsIncluded === 1 ? 'month' : 'months'}`
                    : ''
            return `Holiday rate (\u00a3${impliedHolidayRate.toFixed(2)}/hr implied) is below average basic rate (\u00a3${rollingAvgRate.toFixed(2)}/hr)${weeksNote}${mixedMonthNote} \u2014 request employer's weekly records to confirm`
        }
        return resolveFlagLabel(
            id,
            'Holiday rate implied by amount is below rolling average basic rate'
        )
    }

    return resolveFlagLabel(id)
}
