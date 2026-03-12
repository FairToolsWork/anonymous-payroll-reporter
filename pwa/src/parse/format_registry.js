/**
 * @typedef {{ id: string, label: string, className: string, patterns: () => Promise<import('./formats/payroll/sage-uk/patterns.js').ParserPatterns>, parser: () => Promise<import('./formats/payroll/sage-uk/parser.js').buildPayrollDocument> }} PayrollFormat
 * @typedef {{ id: string, label: string, className: string, parser: () => Promise<import('./formats/pension/nest/parser.js').parseContributionWorkbook> }} PensionFormat
 */

/** @type {Record<string, PayrollFormat>} */
export const PAYROLL_FORMATS = {
    'sage-uk': {
        id: 'sage-uk',
        label: 'Sage Payroll (BETA)',
        className: 'sage',
        patterns: () =>
            import('./formats/payroll/sage-uk/patterns.js').then(
                (m) => m.PATTERNS
            ),
        parser: () =>
            import('./formats/payroll/sage-uk/parser.js').then(
                (m) => m.buildPayrollDocument
            ),
    },
}

/** @type {Record<string, PensionFormat>} */
export const PENSION_FORMATS = {
    nest: {
        id: 'nest',
        label: 'Nest Pensions (BETA)',
        className: 'nest',
        parser: () =>
            import('./formats/pension/nest/parser.js').then(
                (m) => m.parseContributionWorkbook
            ),
    },
}
