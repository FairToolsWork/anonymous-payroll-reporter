/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {Event} event
 * @returns {void}
 */
export function updateStatutoryHolidayDays(event) {
    if (!this.isZeroHoursWorker) {
        const target = /** @type {HTMLInputElement} */ (event.target)
        this.workerProfile.statutoryHolidayDays = parseFloat(target.value) || 0
    }
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {number | null}
 */
export function suggestedStatutoryDays() {
    const days = this.workerProfile?.typicalDays
    if (days && days > 0) {
        return Math.round(Math.min(5.6 * days, 28) * 10) / 10
    }
    return null
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {boolean}
 */
export function isZeroHoursWorker() {
    return (
        this.workerProfile.workerType === 'hourly' &&
        this.workerProfile.typicalDays === 0
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {string | number}
 */
export function statutoryHolidayInputValue() {
    if (
        this.isZeroHoursWorker ||
        this.workerProfile.statutoryHolidayDays === null
    ) {
        return ''
    }
    return this.workerProfile.statutoryHolidayDays
}
