/**
 * @typedef {import("../parse/payroll.types.js").PayrollPayItem} PayrollPayItem
 * @typedef {import("../parse/payroll.types.js").PayrollMiscDeduction} PayrollMiscDeduction
 */

/**
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
    const roundedValue = Number(value.toFixed(2))
    const normalizedValue = Object.is(roundedValue, -0) ? 0 : roundedValue
    return `£${normalizedValue.toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatDeduction(value) {
    return `-£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatContribution(value) {
    return `£${Math.abs(value).toFixed(2)}`
}

/**
 * @param {PayrollPayItem | PayrollMiscDeduction | { title?: string, units?: number | null, rate?: number | null }} item
 * @returns {string}
 */
export function formatMiscLabel(item) {
    if (!item) {
        return ''
    }
    const label = item.title || ''
    if (item.units == null || item.rate == null) {
        return label
    }
    return `${label} (${Number(item.units).toFixed(2)} @ ${formatCurrency(
        Number(item.rate)
    )})`
}

/**
 * @param {number | null} total
 * @param {number | null} ee
 * @param {number | null} er
 * @param {boolean} [allowNA=false]
 * @returns {string}
 */
export function formatBreakdownCell(total, ee, er, allowNA = false) {
    if (allowNA && total === null) {
        return 'N/A'
    }
    const formatOrNA = (/** @type {number | null} */ value) =>
        value === null ? 'N/A' : formatCurrency(value)
    const totalLabel = allowNA ? formatOrNA(total) : formatCurrency(total ?? 0)
    const eeLabel = allowNA ? formatOrNA(ee) : formatCurrency(ee ?? 0)
    const erLabel = allowNA ? formatOrNA(er) : formatCurrency(er ?? 0)
    return `${totalLabel}<br><span class="summary-breakdown">${eeLabel} EE / ${erLabel} ER</span>`
}

/**
 * @param {number | null} value
 * @returns {string}
 */
export function formatContributionDifference(value) {
    if (value === null) {
        return 'N/A'
    }
    const roundedValue = Number(value.toFixed(2))
    const diffClass =
        roundedValue === 0
            ? 'diff--neutral'
            : roundedValue > 0
              ? 'diff--positive'
              : 'diff--negative'
    return `<span class="${diffClass}">${formatCurrency(value)}</span>`
}
