/** @this {import('./app.js').PayrollAppInstance} @param {string} refName @returns {void} */
export function openDialog(refName) {
    const dialog = /** @type {HTMLDialogElement | undefined} */ (
        this.$refs[refName]
    )
    dialog?.showModal()
    document.body.classList.add('scroll-locked')
}

/** @this {import('./app.js').PayrollAppInstance} @param {string} refName @returns {void} */
export function closeDialog(refName) {
    const dialog = /** @type {HTMLDialogElement | undefined} */ (
        this.$refs[refName]
    )
    dialog?.close()
    document.body.classList.remove('scroll-locked')
}

/** @returns {void} */
export function onDialogClose() {
    document.body.classList.remove('scroll-locked')
}

/** @this {import('./app.js').PayrollAppInstance} @param {string} refName @param {MouseEvent} event @returns {void} */
export function onDialogBackdropClick(refName, event) {
    if (event.target !== this.$refs[refName]) {
        return
    }
    closeDialog.call(this, refName)
}

/** @this {import('./app.js').PayrollAppInstance} @returns {void} */
export function openHolCalc() {
    openDialog.call(this, 'holCalcDialog')
}
