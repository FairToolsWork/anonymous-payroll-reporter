import {
    holCalcAvgWeekly as holCalcAvgWeeklyRaw,
    holCalcEntitlementHours as holCalcEntitlementHoursRaw,
    holCalcExpectedHours as holCalcExpectedHoursRaw,
    holCalcExpectedPay as holCalcExpectedPayRaw,
    holCalcExpectedWeeklyPay as holCalcExpectedWeeklyPayRaw,
    holCalcGrossExpectedPay as holCalcGrossExpectedPayRaw,
    holCalcGrossWeeklyPay as holCalcGrossWeeklyPayRaw,
} from './hol_calc.js'

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcAvgWeekly() {
    return holCalcAvgWeeklyRaw(this.holCalcHours)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcExpectedWeeklyPay() {
    return holCalcExpectedWeeklyPayRaw(this.holCalcHours, this.holCalcRate)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcExpectedHours() {
    return holCalcExpectedHoursRaw(
        this.holCalcHours,
        this.holCalcWorkDays,
        this.holCalcDaysTaken
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcExpectedPay() {
    return holCalcExpectedPayRaw(
        this.holCalcHours,
        this.holCalcRate,
        this.holCalcWorkDays,
        this.holCalcDaysTaken
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcGrossExpectedPay() {
    return holCalcGrossExpectedPayRaw(
        this.holCalcGross,
        this.holCalcWorkDays,
        this.holCalcDaysTaken
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcGrossWeeklyPay() {
    return holCalcGrossWeeklyPayRaw(this.holCalcGross)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string}
 */
export function holCalcEntitlementHours() {
    return holCalcEntitlementHoursRaw(this.holCalcHours)
}
