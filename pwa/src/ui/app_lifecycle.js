import { initializeAnimatedDetails } from './app_animations.js'
import { loadPatterns, loadReportWorkflow } from './app_report.js'
import { loadXlsx } from './app_xlsx.js'

/** @param {() => void} callback */
export function scheduleIdle(callback) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => callback())
        return
    }
    window.setTimeout(() => callback(), 0)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {void}
 */
export function initConnectivityHandlers() {
    this._onOnline = () => document.body.classList.remove('offline')
    this._onOffline = () => document.body.classList.add('offline')
    window.addEventListener('online', this._onOnline)
    window.addEventListener('offline', this._onOffline)
    if (!navigator.onLine) {
        document.body.classList.add('offline')
    }
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {void}
 */
export function initUiHelpers() {
    scheduleIdle(() => {
        void loadXlsx()
        void loadReportWorkflow()
        void loadPatterns()
    })
    const appRoot = document.getElementById('app')
    if (appRoot) {
        initializeAnimatedDetails(appRoot)
    }
    document.addEventListener('click', this.handleAnimatedDetailsClick)
    this.$nextTick(() => {
        Object.keys(this.collapsedSections || {}).forEach((sectionKey) => {
            this.syncCollapseShellState(sectionKey)
        })
    })
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {void}
 */
export function initServiceWorkerUpdates() {
    const isDevHost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    const debugLevel = new URLSearchParams(window.location.search).get('debug')
    const allowDevServiceWorker = isDevHost && debugLevel === '2'
    if ((!isDevHost || allowDevServiceWorker) && 'serviceWorker' in navigator) {
        const hadController = !!navigator.serviceWorker.controller
        let reloadPending = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (hadController && !reloadPending) {
                reloadPending = true
                window.location.reload()
            }
        })

        navigator.serviceWorker.register('/sw.js').then((registration) => {
            this.swRegistration = registration
            registration.update()
            if (registration.waiting) {
                this.updateAvailable = true
                this.waitingWorker = registration.waiting
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing
                if (!newWorker) {
                    return
                }
                newWorker.addEventListener('statechange', () => {
                    if (
                        newWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        this.updateAvailable = true
                        this.waitingWorker = newWorker
                    }
                })
            })
        })
    }
}
