/** @this {import('./app.js').PayrollAppInstance} @returns {void} */
export function handleScroll() {
    if (!this.reportReady) {
        this.showScrollTop = false
        return
    }
    const doc = document.documentElement
    const scrollTop = window.scrollY || doc.scrollTop || 0
    const viewportHeight = window.innerHeight || doc.clientHeight || 0
    const scrollHeight = doc.scrollHeight || 0
    const scrollableHeight = Math.max(scrollHeight - viewportHeight, 0)
    if (!scrollableHeight) {
        this.showScrollTop = false
        return
    }
    this.showScrollTop = scrollTop / scrollableHeight >= 0.1
}

/** @returns {void} */
export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** @this {import('./app.js').PayrollAppInstance} @returns {void} */
export function initScrollListener() {
    window.addEventListener('scroll', this.handleScroll, { passive: true })
}
