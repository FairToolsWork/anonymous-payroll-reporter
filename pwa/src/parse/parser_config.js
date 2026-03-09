/**
 * @typedef {Record<string, string[]>} MissingMonthsByYear
 * @typedef {{ monthIndex: number }} MonthEntry
 */

/**
 * Update this to import the patterns for the active format.
 *
 * @type {typeof import('./formats/sage-uk/patterns.js').PATTERNS}
 */
export { PATTERNS } from './formats/sage-uk/patterns.js'

/**
 * @param {number} monthIndex
 * @returns {string}
 */
export function formatMonthLabel(monthIndex) {
    return new Date(2024, monthIndex - 1, 1).toLocaleDateString('en-GB', {
        month: 'long',
    })
}

/**
 * @param {MonthEntry[]} entries
 * @returns {string[]}
 */
export function getMissingMonths(entries) {
    const monthIndexes = entries
        .map((entry) => entry.monthIndex)
        .filter((month) => month >= 1 && month <= 12)
    if (!monthIndexes.length) {
        return []
    }
    const minMonth = Math.min(...monthIndexes)
    const maxMonth = Math.max(...monthIndexes)
    const present = new Set(monthIndexes)
    const missing = []
    for (let month = minMonth; month <= maxMonth; month += 1) {
        if (!present.has(month)) {
            missing.push(formatMonthLabel(month))
        }
    }
    return missing
}

/**
 * @param {MissingMonthsByYear} missingByYear
 * @returns {string}
 */
export function buildMissingMonthsLabel(missingByYear) {
    const entries = Object.entries(missingByYear).filter(
        ([, months]) => months.length
    )
    if (!entries.length) {
        return 'None'
    }
    return entries
        .map(([year, months]) => `${year}: ${months.join(', ')}`)
        .join(' | ')
}

/**
 * @param {MissingMonthsByYear} missingByYear
 * @returns {string}
 */
export function buildMissingMonthsHtml(missingByYear) {
    const entries = Object.entries(missingByYear).filter(
        ([, months]) => months.length
    )
    if (!entries.length) {
        return '<span class="missing-none">None</span>'
    }
    return entries
        .map(([year, months]) => {
            const pills = months
                .map((month) => `<span class="pill">${month}</span>`)
                .join('')
            return `<span class="missing-group"><span class="missing-year">${year}</span>${pills}</span>`
        })
        .join('')
}

/**
 * @param {string[]} months
 * @returns {string}
 */
export function buildMissingMonthsHtmlForYear(months) {
    if (!months.length) {
        return '<span class="missing-none">None</span>'
    }
    return months.map((month) => `<span class="pill">${month}</span>`).join('')
}
