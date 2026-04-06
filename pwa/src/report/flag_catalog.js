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
    paye_mismatch: {
        id: 'paye_mismatch',
        label: 'PAYE Tax does not match the expected amount for this payslip',
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
    tax_year_thresholds_unavailable: {
        id: 'tax_year_thresholds_unavailable',
        label: 'Tax-year thresholds unavailable for this payslip',
        section: 'tax',
        severity: 'warning',
    },
    tax_year_thresholds_partial_support: {
        id: 'tax_year_thresholds_partial_support',
        label: 'In 2022 due to mid-year changes, threshold-based checks are only partially supported before 6 July 2022. PAYE and NI threshold checks are skipped for this payslip, but pension auto-enrolment checks still run.',
        section: 'tax',
        severity: 'warning',
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
 * @param {{ impliedHolidayRate?: number, basicRate?: number, rollingAvgRate?: number, totalWeeks?: number, periodsCounted?: number, limitedData?: boolean, mixedMonthsIncluded?: number, context?: string, payCycle?: string | null, taxCode?: string | null, payeTax?: number | null, expectedPaye?: number | null, isSignificantMismatch?: boolean, payeDifference?: number | null, explanation?: string, earnings?: number | null, periodTrigger?: number | null, cumulativeAllowance?: number | null, grossForTaxTD?: number | null, region?: string | null, qualifyingLower?: number | null, autoEnrolmentTrigger?: number | null, elapsedRunDays?: number | null, taxYearStartLabel?: string, fallbackTaxYearStartLabel?: string, grossPay?: number | null, niPrimaryThresholdMonthly?: number | null }} [params]
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

    if (id === 'paye_zero' && params.context === 'missing_tax_code') {
        return 'PAYE Tax is £0 and the tax code is missing, so the exact PAYE check could not be completed for this payslip.'
    }

    if (id === 'paye_mismatch') {
        if (params.context === 'explanation_emergency') {
            return `Emergency code ${String(params.taxCode || 'Unknown')} uses period-only PAYE with ${formatCurrency(params.periodTrigger)} tax-free pay this ${String(params.payCycle || 'Unknown').toLowerCase()} period.`
        }
        if (params.context === 'explanation_period_only') {
            return `Gross for Tax TD and Tax Paid TD are missing, so this uses a period-only approximation with ${formatCurrency(params.periodTrigger)} tax-free pay.`
        }
        if (params.context === 'explanation_cumulative') {
            return `Cumulative PAYE for ${String(params.taxCode || 'Unknown')} uses Gross for Tax TD ${formatCurrency(params.grossForTaxTD)} less cumulative allowance ${formatCurrency(params.cumulativeAllowance)} in the ${String(params.region || 'Unknown')} tax bands.`
        }
        if (params.context === 'zero_or_mismatch') {
            const payeTax = Number(params.payeTax)
            const expectedPaye = Number(params.expectedPaye)
            const diff = Number(params.payeDifference)
            const isSignificantMismatch = params.isSignificantMismatch === true
            const explanation = String(params.explanation || '')
            const isZeroFlag = payeTax <= 0
            const discrepancyDirection =
                diff < 0
                    ? 'under the expected PAYE amount'
                    : 'above the expected PAYE amount'
            if (isZeroFlag) {
                if (isSignificantMismatch) {
                    return `PAYE Tax is ${formatCurrency(payeTax)} but standard PAYE for this payslip is about ${formatCurrency(expectedPaye)}. ${explanation}`
                }
                return `PAYE Tax is ${formatCurrency(payeTax)} and standard PAYE also works out to about ${formatCurrency(expectedPaye)} for this payslip. ${explanation}`
            }
            return `PAYE Tax ${formatCurrency(payeTax)} is ${formatCurrency(Math.abs(diff))} ${discrepancyDirection}; standard PAYE is about ${formatCurrency(expectedPaye)}. ${explanation}`
        }
    }

    if (id === 'pension_auto_enrolment_missing_deductions') {
        if (params.context === 'pre_enrolment_notice') {
            return `Pension deductions have not yet appeared, so this is being treated as a pre-enrolment period. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the monthly auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'three_month_warning') {
            return `Pension deductions have still not appeared after ${params.elapsedRunDays} days, so the worker should have been auto-enrolled by now unless valid postponement was notified. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the monthly auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'six_week_notice') {
            return `Pension deductions have still not appeared after more than 6 weeks (${params.elapsedRunDays} days), so the worker should now be auto-enrolled or told in writing about postponement (up to 3 months). Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the monthly auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
        if (params.context === 'default_warning') {
            return `Pension deductions do not appear to be present. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the monthly auto-enrolment trigger of ${formatCurrency(params.periodTrigger)}.`
        }
    }

    if (id === 'pension_opt_in_possible') {
        return `The worker may be able to opt in to a workplace pension. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are above the lower qualifying earnings threshold of ${formatCurrency(params.qualifyingLower)} but below the monthly auto-enrolment trigger of ${formatCurrency(params.autoEnrolmentTrigger)}.`
    }

    if (id === 'pension_join_no_mandatory_employer_contrib') {
        return `The worker may ask to join a workplace pension, but employer contributions may not be required. Pre-tax earnings are ${formatCurrency(params.earnings)}, which are below the lower qualifying earnings threshold of ${formatCurrency(params.qualifyingLower)}.`
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
        if (params.context === 'at_or_below_threshold_notice') {
            return `NI deductions not taken as gross pay ${grossPayLabel} is at or below the primary threshold of ${thresholdLabel}`
        }
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
