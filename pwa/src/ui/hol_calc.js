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
 * Returns DASH when workDaysPerWeek is 0 (unknown/irregular pattern).
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
 * Returns DASH when workDaysPerWeek is 0 (unknown/irregular pattern).
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

/**
 * Estimated £ pay for a given number of holiday days taken, derived from total gross.
 * Returns DASH when workDaysPerWeek is 0 (unknown/irregular pattern).
 * @param {number} totalGross
 * @param {number} workDaysPerWeek
 * @param {number} daysTaken
 * @returns {string}
 */
export function holCalcGrossExpectedPay(
    totalGross,
    workDaysPerWeek,
    daysTaken
) {
    if (!totalGross || !workDaysPerWeek || !daysTaken) return DASH
    return '£' + ((totalGross / WEEKS / workDaysPerWeek) * daysTaken).toFixed(2)
}

/**
 * Expected £ pay per week of holiday derived from total gross earnings.
 * This correctly handles variable pay (overtime premiums, bonuses, pay rises).
 * @param {number} totalGross
 * @returns {string}
 */
export function holCalcGrossWeeklyPay(totalGross) {
    if (!totalGross) return DASH
    return '£' + (totalGross / WEEKS).toFixed(2)
}

/**
 * Annual holiday entitlement in hours for irregular/zero-hours workers.
 * Uses the 12.07% accrual method (statutory since 1 April 2024).
 * 12.07% = 5.6 weeks / (52 − 5.6) weeks, accounting for the fact
 * that holiday weeks are non-working weeks.
 * @param {number} totalHours
 * @returns {string}
 */
export function holCalcEntitlementHours(totalHours) {
    if (!totalHours) return DASH
    // return ((totalHours / WEEKS) * 5.6).toFixed(1) + ' hrs' //(pre 2024 method)
    return (totalHours * 0.1207).toFixed(1) + ' hrs'
}
