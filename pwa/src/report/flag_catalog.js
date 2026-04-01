/**
 * Central catalog of validation flag IDs used in report calculations.
 *
 * This manifest is intentionally static so auditors can review all current
 * rule outputs in one place.
 */

/**
 * @typedef {{ id: string, label: string, section: 'identity' | 'tax' | 'validation' | 'holiday', severity: 'warning' }} FlagCatalogEntry
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
    nat_ins_zero: {
        id: 'nat_ins_zero',
        label: 'National Insurance missing or £0',
        section: 'tax',
        severity: 'warning',
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
 * @param {string} id
 * @param {{ impliedHolidayRate?: number, basicRate?: number, rollingAvgRate?: number, totalWeeks?: number, periodsCounted?: number, limitedData?: boolean, mixedMonthsIncluded?: number }} [params]
 * @returns {string}
 */
export function formatFlagLabel(id, params = {}) {
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
