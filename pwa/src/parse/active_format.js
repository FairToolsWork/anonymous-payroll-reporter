import { PAYROLL_FORMATS, PENSION_FORMATS } from './format_registry.js'

const ACTIVE_PAYROLL_FORMAT_ID = 'sage-uk'
const ACTIVE_PENSION_FORMAT_ID = 'nest'

/**
 * Active format selectors for static builds.
 * To switch formats, change the ID constants above.
 */
const resolvedPayroll = PAYROLL_FORMATS[ACTIVE_PAYROLL_FORMAT_ID]
if (!resolvedPayroll) {
    throw new Error(
        `Unknown payroll format ID "${ACTIVE_PAYROLL_FORMAT_ID}". Valid IDs: ${Object.keys(PAYROLL_FORMATS).join(', ')}`
    )
}

const resolvedPension = PENSION_FORMATS[ACTIVE_PENSION_FORMAT_ID]
if (!resolvedPension) {
    throw new Error(
        `Unknown pension format ID "${ACTIVE_PENSION_FORMAT_ID}". Valid IDs: ${Object.keys(PENSION_FORMATS).join(', ')}`
    )
}

export const ACTIVE_PAYROLL_FORMAT = resolvedPayroll
export const ACTIVE_PENSION_FORMAT = resolvedPension
