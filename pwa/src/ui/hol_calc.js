/**
 * Holiday pay calculator functions for irregular hours workers.
 * Based on UK statutory rules: average pay over 52 paid weeks.
 * @see https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay
 */

const DASH = '—'
const WEEKS = 52

/**
 * Average hours worked per week over the reference period.
 * @param {number} totalHours
 * @returns {string}
 */
export function holCalcAvgWeekly(totalHours) {
    if (!totalHours) return DASH
    return (totalHours / WEEKS).toFixed(2) + ' hrs'
}

/**
 * Expected £ pay per week of holiday (the legally correct entitlement unit).
 * @param {number} totalHours
 * @param {number} hourlyRate
 * @returns {string}
 */
export function holCalcExpectedWeeklyPay(totalHours, hourlyRate) {
    if (!totalHours || !hourlyRate) return DASH
    return '£' + ((totalHours / WEEKS) * hourlyRate).toFixed(2)
}

/**
 * Estimated hours for a given number of holiday days taken.
 * Uses typical working days per week to derive a daily slice.
 * Note: this is a convenience estimate — the legal entitlement is weekly.
 * @param {number} totalHours
 * @param {number} workDaysPerWeek
 * @param {number} daysTaken
 * @returns {string}
 */
export function holCalcExpectedHours(totalHours, workDaysPerWeek, daysTaken) {
    if (!totalHours || !workDaysPerWeek || !daysTaken) return DASH
    return (
        ((totalHours / WEEKS / workDaysPerWeek) * daysTaken).toFixed(2) + ' hrs'
    )
}

/**
 * Estimated £ pay for a given number of holiday days taken.
 * Note: this is a convenience estimate — the legal entitlement is weekly.
 * @param {number} totalHours
 * @param {number} hourlyRate
 * @param {number} workDaysPerWeek
 * @param {number} daysTaken
 * @returns {string}
 */
export function holCalcExpectedPay(
    totalHours,
    hourlyRate,
    workDaysPerWeek,
    daysTaken
) {
    if (!totalHours || !hourlyRate || !workDaysPerWeek || !daysTaken)
        return DASH
    return (
        '£' +
        (
            (totalHours / WEEKS / workDaysPerWeek) *
            daysTaken *
            hourlyRate
        ).toFixed(2)
    )
}
