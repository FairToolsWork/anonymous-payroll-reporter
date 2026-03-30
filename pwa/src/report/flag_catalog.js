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
