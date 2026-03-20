/* global Blob, setInterval, clearInterval, performance */
import { createApp, defineComponent } from 'vue'
import {
    ACTIVE_PAYROLL_FORMAT,
    ACTIVE_PENSION_FORMAT,
} from '../parse/active_format.js'
import {
    holCalcAvgWeekly,
    holCalcExpectedHours,
    holCalcExpectedPay,
    holCalcExpectedWeeklyPay,
} from './hol_calc.js'

/**
 * @typedef {import("../parse/payroll.types.js").PayrollRecord} PayrollRecord
 * @typedef {PayrollRecord & { imageData?: string | null }} PayrollRecordWithImage
 * @typedef {PayrollRecord[] & { contributionData?: ContributionData | null }} PayrollRecordCollection
 * @typedef {{ date: Date, type: "ee" | "er", amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ name: string, code: string, employers?: string[], missingTypes?: string[] }} ContributionFailure
 * @typedef {{ fileCount: number, dateRangeLabel: string, recordCount: number }} ContributionMeta
 * @typedef {{ flaggedCount: number, lowConfidenceCount: number, flaggedPeriods: string[] }} ValidationSummary
 * @typedef {{ dateRangeLabel: string, missingMonthsLabel: string, missingMonthsByYear: Record<string, string[]>, contributionMeta: ContributionMeta, validationSummary: ValidationSummary }} ReportStats
 * @typedef {Object} PayrollAppState
 * @property {string} pdfPassword
 * @property {"idle" | "processing" | "rendering" | "done"} status
 * @property {{ current: number, total: number }} progress
 * @property {number} fileCount
 * @property {File[]} contributionFiles
 * @property {Array<{ id: string, name: string, type: "pdf" | "xlsx", file: File }>} stagedFiles
 * @property {number} stagedPdfCount
 * @property {number} stagedExcelCount
 * @property {string} reportHtml
 * @property {string} reportTimestamp
 * @property {boolean} reportReady
 * @property {boolean} pdfDownloading
 * @property {boolean} pdfSharing
 * @property {string} suggestedFilename
 * @property {any | null} reportContext
 * @property {string} employeeName
 * @property {ReportStats} reportStats
 * @property {boolean} dragActive
 * @property {boolean} debugEnabled
 * @property {string} error
 * @property {boolean} updateAvailable
 * @property {ServiceWorker | null} waitingWorker
 * @property {ServiceWorkerRegistration | null} swRegistration
 * @property {string} debugText
 * @property {string} notice
 * @property {string[]} failedFiles
 * @property {string[]} failedPayPeriods
 * @property {{ pdfSource: string, parsed: string, matches: string, excelSource: string, excelRows: string, excelParsed: string, runSnapshot: string }} debugInfo
 * @property {boolean} debugCopySuccess
 * @property {number | null} debugCopyResetTimer
 * @property {boolean} acceptedDisclaimer
 * @property {{ prep: boolean, nextSteps: boolean, [key: string]: boolean }} collapsedSections
 * @property {boolean} showScrollTop
 * @property {boolean} parsingExcel
 * @property {boolean} staleInstance
 * @property {string} appVersion
 * @property {{ label: string, className: string } | null} activePayrollPill
 * @property {{ label: string, className: string } | null} activePensionPill
 * @property {{ workerType: string, typicalDays: number, statutoryHolidayDays: number, leaveYearStartMonth: number }} workerProfile
 * @property {boolean} _updatingWorkerProfile
 * @property {number} holCalcHours
 * @property {number} holCalcRate
 * @property {number} holCalcDaysTaken
 * @property {number} holCalcWorkDays
 */

/**
 * @typedef {PayrollAppState &
 *   import('vue').ComponentPublicInstance<PayrollAppState> &
 *   { $refs: { aboutDialog?: HTMLDialogElement, holCalcDialog?: HTMLDialogElement } } &
 *   {
 *     stageFiles(files: File[]): void,
 *     processFiles(files: File[]): Promise<void>,
 *     resetReportState(): void,
 *     downloadPdf(): Promise<void>,
 *     handleScroll(): void,
 *     closeAbout(): void,
 *     closeHolCalc(): void,
 *     holCalcAvgWeekly: string,
 *     holCalcExpectedWeeklyPay: string,
 *     holCalcExpectedHours: string,
 *     holCalcExpectedPay: string,
 *     canRunReport: boolean,
 *     canShare: boolean,
 *     suggestedStatutoryDays: number | null,
 *     isZeroHoursWorker: boolean,
 *     statutoryHolidayInputValue: string | number,
 *     updateStatutoryHolidayDays(event: Event): void,
 *     sharePdf(): Promise<void>,
 *     setSectionCollapsed(sectionKey: string, isCollapsed: boolean): void,
 *     syncCollapseShellState(sectionKey: string): void,
 *     handleAnimatedDetailsClick(event: MouseEvent): void,
 *     _onOnline: (() => void),
 *     _onOffline: (() => void),
 *   }
 * } PayrollAppInstance
 */

/** @type {string | null} */
const DEBUG_LEVEL = new URLSearchParams(window.location.search).get('debug')
/** @type {string | null} */
const MEMORY_LEVEL = new URLSearchParams(window.location.search).get('mem')
/** @type {boolean} */
const DEBUG_ENABLED = DEBUG_LEVEL === '1' || DEBUG_LEVEL === '2'
/** @type {boolean} */
const MEMORY_LOG_ENABLED = MEMORY_LEVEL === '1'
/** @type {number} */
const MEMORY_LOG_EVERY = 5
/** @type {string} */
const PDF_PASSWORD_KEY = 'pdf_password'
/** @type {string} */
const DISCLAIMER_ACCEPTED_KEY = 'disclaimer_accepted'
/** @type {string} */
const SESSION_PERSISTED_AT_KEY = 'session_persisted_at'
/** @type {number} */
const SESSION_TTL_MS = 30 * 60 * 1000
/** @type {string} */
const LAST_LOADED_AT_KEY = 'payroll_last_loaded'
/** @type {string} */
const WORKER_PROFILE_KEY = 'worker_profile'
/** @type {number} */
const STALE_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000
/** @type {string} */
const UNKNOWN_APP_VERSION = 'Unknown'

/** @type {Promise<any> | null} */
let xlsxPromise = null
/** @type {any | null} */
let cachedXlsx = null
/** @type {Promise<any> | null} */
let reportWorkflowPromise = null
/** @type {Promise<any> | null} */
let patternsPromise = null
/** @type {Promise<any> | null} */
let runSnapshotPromise = null
/** @type {Promise<any> | null} */
let pdfExportPromise = null
/** @type {boolean} */
let memoryAttributionUnavailableLogged = false

function loadXlsx() {
    if (!xlsxPromise) {
        xlsxPromise = import('xlsx').then((module) => {
            cachedXlsx = module
            return module
        })
    }
    return xlsxPromise
}

function loadReportWorkflow() {
    if (!reportWorkflowPromise) {
        reportWorkflowPromise = import('../report/report_workflow.js')
    }
    return reportWorkflowPromise
}

function loadPatterns() {
    if (!patternsPromise) {
        patternsPromise = ACTIVE_PAYROLL_FORMAT.patterns().then((PATTERNS) => ({
            PATTERNS,
        }))
    }
    return patternsPromise
}

function loadRunSnapshot() {
    if (!runSnapshotPromise) {
        runSnapshotPromise = import('../report/run_snapshot.js')
    }
    return runSnapshotPromise
}

function loadPdfExport() {
    if (!pdfExportPromise) {
        pdfExportPromise = import('../report/pdf_export.js')
    }
    return pdfExportPromise
}

/** @param {() => void} callback */
function scheduleIdle(callback) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => callback())
        return
    }
    window.setTimeout(() => callback(), 0)
}

/** @param {string} label */
function logMemoryUsage(label) {
    if (!MEMORY_LOG_ENABLED) {
        return
    }
    const memory = /** @type {any} */ (globalThis).performance?.memory
    if (!memory) {
        console.info('Payroll: memory metrics unavailable', { label })
        return
    }
    const toMb = (/** @type {number} */ value) =>
        Math.round((value / (1024 * 1024)) * 10) / 10
    console.info('Payroll: memory usage', {
        label,
        usedMb: toMb(memory.usedJSHeapSize),
        totalMb: toMb(memory.totalJSHeapSize),
        limitMb: toMb(memory.jsHeapSizeLimit),
    })
    void logUserAgentMemory(label)
}

/** @param {string} label */
async function logUserAgentMemory(label) {
    if (!MEMORY_LOG_ENABLED) {
        return
    }
    const perf = /** @type {any} */ (globalThis).performance
    if (typeof perf?.measureUserAgentSpecificMemory !== 'function') {
        if (!memoryAttributionUnavailableLogged) {
            console.info('Payroll: memory attribution unavailable', { label })
            memoryAttributionUnavailableLogged = true
        }
        return
    }
    try {
        const result = await perf.measureUserAgentSpecificMemory()
        const toMb = (/** @type {number} */ value) =>
            Math.round((value / (1024 * 1024)) * 10) / 10
        console.info('Payroll: memory attribution', {
            label,
            totalMb: toMb(result.bytes),
            breakdownCount: Array.isArray(result.breakdown)
                ? result.breakdown.length
                : 0,
        })
    } catch {
        // ignore measurement errors
    }
}

/**
 * @returns {string}
 */
function getAppVersionFromDemoLink() {
    const metaVersion = document
        .querySelector('meta[name="app-version"]')
        ?.getAttribute('content')
    if (metaVersion) {
        return `v${metaVersion}`
    }
    return UNKNOWN_APP_VERSION
}

/**
 * @param {string} reportHtml
 * @param {string} appVersion
 * @returns {string}
 */
function injectReportVersionFootnote(reportHtml, appVersion) {
    if (!reportHtml) {
        return reportHtml
    }
    const firstPageMarker = '<div class="page">'
    const firstPageIndex = reportHtml.indexOf(firstPageMarker)
    if (firstPageIndex === -1) {
        return reportHtml
    }
    const nextPageIndex = reportHtml.indexOf(
        firstPageMarker,
        firstPageIndex + firstPageMarker.length
    )
    const insertionBoundary =
        nextPageIndex === -1 ? reportHtml.length : nextPageIndex
    const pageCloseIndex = reportHtml.lastIndexOf('</div>', insertionBoundary)
    if (pageCloseIndex === -1) {
        return reportHtml
    }
    const versionLabel =
        appVersion && appVersion !== UNKNOWN_APP_VERSION
            ? appVersion
            : UNKNOWN_APP_VERSION
    const versionMarkup = `<p class="report-footnote">App version: ${versionLabel}</p>`
    return (
        reportHtml.slice(0, pageCloseIndex) +
        versionMarkup +
        reportHtml.slice(pageCloseIndex)
    )
}

const AppHeader = defineComponent({
    name: 'AppHeader',
    props: {
        activePayrollPill: {
            type: Object,
            default: null,
        },
        activePensionPill: {
            type: Object,
            default: null,
        },
    },
    emits: ['open-about'],
    template: `
        <header class="app-header">
            <div>
                <p class="eyebrow">Offline &amp; Anonymous</p>
                <h1>Anonymous Payroll Reporter</h1>
                <p class="subhead">
                    All processing happens in the browser — your data never
                    leaves your computer.
                </p>
                <div class="pill-row">
                    <span
                        v-if="activePayrollPill"
                        class="pill"
                        :class="activePayrollPill.className"
                        v-cloak
                    >
                        {{ activePayrollPill.label }}
                    </span>
                    <span
                        v-if="activePensionPill"
                        class="pill"
                        :class="activePensionPill.className"
                        v-cloak
                    >
                        {{ activePensionPill.label }}
                    </span>
                </div>
            </div>
            <button
                class="primary accent"
                type="button"
                @click="$emit('open-about')"
                aria-haspopup="dialog"
            >
                About
            </button>
        </header>
    `,
})

const AppBreadcrumb = defineComponent({
    name: 'AppBreadcrumb',
    props: {
        current: {
            type: String,
            required: true,
        },
    },
    template: `
        <nav class="app-breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="crumb-separator" aria-hidden="true">></span>
            <span aria-current="page">{{ current }}</span>
        </nav>
    `,
})

const COLLAPSE_SHELL_COLLAPSED_HEIGHT = 75
const COLLAPSE_SHELL_TRANSITION_MS = 250
const DETAILS_CONTENT_TRANSITION_MS = 200
/** @type {WeakMap<HTMLElement, () => void>} */
const activeHeightAnimations = new WeakMap()

/** @param {HTMLElement} element */
function clearHeightAnimation(element) {
    const cleanup = activeHeightAnimations.get(element)
    if (!cleanup) {
        return
    }
    cleanup()
    activeHeightAnimations.delete(element)
}

/**
 * @param {HTMLElement} element
 * @param {number} startHeight
 * @param {number} endHeight
 * @param {number} durationMs
 * @param {() => void} onComplete
 * @returns {void}
 */
function animateElementHeight(
    element,
    startHeight,
    endHeight,
    durationMs,
    onComplete
) {
    clearHeightAnimation(element)
    let completed = false
    let timeoutId = 0
    const finish = () => {
        if (completed) {
            return
        }
        completed = true
        element.removeEventListener('transitionend', handleTransitionEnd)
        window.clearTimeout(timeoutId)
        activeHeightAnimations.delete(element)
        onComplete()
    }
    /** @param {TransitionEvent} event */
    const handleTransitionEnd = (event) => {
        if (event.target !== element || event.propertyName !== 'height') {
            return
        }
        finish()
    }
    element.style.height = `${startHeight}px`
    element.addEventListener('transitionend', handleTransitionEnd)
    timeoutId = window.setTimeout(finish, durationMs + 50)
    activeHeightAnimations.set(element, () => {
        if (completed) {
            return
        }
        completed = true
        element.removeEventListener('transitionend', handleTransitionEnd)
        window.clearTimeout(timeoutId)
    })
    window.requestAnimationFrame(() => {
        element.style.height = `${endHeight}px`
    })
}

/** @param {string} sectionKey @returns {HTMLElement | null} */
function getCollapseShell(sectionKey) {
    const content = document.getElementById(`${sectionKey}-content`)
    return /** @type {HTMLElement | null} */ (
        content?.closest('.collapse-shell') || null
    )
}

/** @param {HTMLElement} shell @param {boolean} isCollapsed @returns {void} */
function syncCollapseShell(shell, isCollapsed) {
    clearHeightAnimation(shell)
    shell.style.overflow = isCollapsed ? 'hidden' : ''
    shell.style.height = isCollapsed
        ? `${COLLAPSE_SHELL_COLLAPSED_HEIGHT}px`
        : 'auto'
}

/** @param {HTMLElement} details @returns {HTMLElement | null} */
function getAnimatedDetailsContent(details) {
    for (const child of Array.from(details.children)) {
        if (
            child?.nodeType === 1 &&
            child.classList?.contains('details-content')
        ) {
            return /** @type {HTMLElement} */ (child)
        }
    }
    return null
}

/** @param {HTMLElement} root @returns {void} */
function initializeAnimatedDetails(root) {
    root.querySelectorAll('.card details').forEach((element) => {
        const details = /** @type {HTMLDetailsElement} */ (element)
        if (details.dataset.animated === 'true') {
            return
        }
        const summary = /** @type {HTMLElement | null} */ (
            details.firstElementChild
        )
        if (!summary || summary.tagName !== 'SUMMARY') {
            return
        }
        const content = document.createElement('div')
        content.className = 'details-content'
        for (const child of Array.from(details.children)) {
            if (child !== summary) {
                content.appendChild(child)
            }
        }
        details.appendChild(content)
        content.style.height = details.open ? 'auto' : '0px'
        details.dataset.animated = 'true'
        details.dataset.animating = 'false'
    })
}

/** @returns {void} */
export function initPayrollApp() {
    const appConfig = defineComponent(
        /** @type {any} */ ({
            components: {
                AppHeader,
                AppBreadcrumb,
            },
            /** @returns {PayrollAppState} */
            data() {
                return {
                    pdfPassword: '',
                    status: 'idle',
                    progress: { current: 0, total: 0 },
                    fileCount: 0,
                    contributionFiles: [],
                    stagedFiles: [],
                    stagedPdfCount: 0,
                    stagedExcelCount: 0,
                    reportHtml: '',
                    reportTimestamp: '',
                    reportReady: false,
                    pdfDownloading: false,
                    pdfSharing: false,
                    suggestedFilename: '',
                    reportContext: null,
                    employeeName: '',
                    reportStats: {
                        dateRangeLabel: '',
                        missingMonthsLabel: '',
                        missingMonthsByYear: {},
                        contributionMeta: {
                            fileCount: 0,
                            recordCount: 0,
                            dateRangeLabel: 'None',
                        },
                        validationSummary: {
                            flaggedCount: 0,
                            lowConfidenceCount: 0,
                            flaggedPeriods: [],
                        },
                    },
                    workerProfile: {
                        workerType: 'hourly',
                        typicalDays: 5,
                        statutoryHolidayDays: 28,
                        leaveYearStartMonth: 4,
                    },
                    _updatingWorkerProfile: false,
                    holCalcHours: 0,
                    holCalcRate: 0,
                    holCalcDaysTaken: 1,
                    holCalcWorkDays: 5,
                    dragActive: false,
                    debugEnabled: DEBUG_ENABLED,
                    error: '',
                    updateAvailable: false,
                    waitingWorker: null,
                    swRegistration: null,
                    staleInstance: false,
                    debugText: '',
                    notice: '',
                    failedFiles: [],
                    failedPayPeriods: [],
                    debugInfo: {
                        pdfSource: '',
                        parsed: '',
                        matches: '',
                        excelSource: '',
                        excelRows: '',
                        excelParsed: '',
                        runSnapshot: '',
                    },
                    debugCopySuccess: false,
                    debugCopyResetTimer: null,
                    acceptedDisclaimer: false,
                    collapsedSections: {
                        prep: true,
                        nextSteps: true,
                    },
                    showScrollTop: false,
                    parsingExcel: false,
                    appVersion: UNKNOWN_APP_VERSION,
                    activePayrollPill: ACTIVE_PAYROLL_FORMAT.label
                        ? {
                              label: ACTIVE_PAYROLL_FORMAT.label,
                              className: ACTIVE_PAYROLL_FORMAT.className,
                          }
                        : null,
                    activePensionPill: ACTIVE_PENSION_FORMAT.label
                        ? {
                              label: ACTIVE_PENSION_FORMAT.label,
                              className: ACTIVE_PENSION_FORMAT.className,
                          }
                        : null,
                }
            },
            computed: {
                /** @this {PayrollAppInstance} @returns {string} */
                holCalcAvgWeekly() {
                    return holCalcAvgWeekly(this.holCalcHours)
                },
                /** @this {PayrollAppInstance} @returns {string} */
                holCalcExpectedWeeklyPay() {
                    return holCalcExpectedWeeklyPay(
                        this.holCalcHours,
                        this.holCalcRate
                    )
                },
                /** @this {PayrollAppInstance} @returns {string} */
                holCalcExpectedHours() {
                    return holCalcExpectedHours(
                        this.holCalcHours,
                        this.holCalcWorkDays,
                        this.holCalcDaysTaken
                    )
                },
                /** @this {PayrollAppInstance} @returns {string} */
                holCalcExpectedPay() {
                    return holCalcExpectedPay(
                        this.holCalcHours,
                        this.holCalcRate,
                        this.holCalcWorkDays,
                        this.holCalcDaysTaken
                    )
                },
                /** @this {PayrollAppInstance} @returns {number} */
                progressPercent() {
                    if (!this.progress.total) {
                        return 0
                    }
                    return Math.round(
                        (this.progress.current / this.progress.total) * 100
                    )
                },
                /** @this {PayrollAppInstance} @returns {boolean} */
                canRunReport() {
                    return (
                        this.stagedPdfCount > 0 &&
                        this.acceptedDisclaimer &&
                        this.status !== 'processing'
                    )
                },
                /** @this {PayrollAppInstance} @returns {boolean} */
                canShare() {
                    if (
                        typeof navigator === 'undefined' ||
                        typeof navigator.share !== 'function' ||
                        typeof navigator.canShare !== 'function'
                    ) {
                        return false
                    }
                    try {
                        return navigator.canShare({
                            files: [
                                new File([], 'test.pdf', {
                                    type: 'application/pdf',
                                }),
                            ],
                        })
                    } catch {
                        return false
                    }
                },
                /** @this {PayrollAppInstance} @returns {number | null} */
                suggestedStatutoryDays() {
                    const days = this.workerProfile?.typicalDays
                    if (days && days > 0) {
                        return Math.round(Math.min(5.6 * days, 28) * 10) / 10
                    }
                    return null
                },
                /** @this {PayrollAppInstance} @returns {boolean} */
                isZeroHoursWorker() {
                    return (
                        this.workerProfile.workerType === 'hourly' &&
                        this.workerProfile.typicalDays === 0
                    )
                },
                /** @this {PayrollAppInstance} @returns {string | number} */
                statutoryHolidayInputValue() {
                    return this.isZeroHoursWorker
                        ? ''
                        : this.workerProfile.statutoryHolidayDays
                },
            },
            watch: {
                /** @this {PayrollAppInstance} @param {any} value */
                workerProfile: {
                    deep: true,
                    /** @this {PayrollAppInstance} @param {any} value */
                    handler(value) {
                        try {
                            localStorage.setItem(
                                WORKER_PROFILE_KEY,
                                JSON.stringify(value)
                            )
                        } catch {
                            /* storage unavailable */
                        }
                    },
                },
                /** @this {PayrollAppInstance} @param {number} newDays @param {number} oldDays */
                'workerProfile.typicalDays'(newDays, oldDays) {
                    if (this._updatingWorkerProfile) {
                        return
                    }
                    // Use fallback of 5 for prevSuggestion to preserve auto-update when returning from 0
                    const prevSuggestion =
                        Math.round(Math.min(5.6 * (oldDays || 5), 28) * 10) / 10
                    const newSuggestion =
                        newDays > 0
                            ? Math.round(Math.min(5.6 * newDays, 28) * 10) / 10
                            : null
                    if (
                        this.workerProfile.statutoryHolidayDays ===
                            prevSuggestion &&
                        newSuggestion !== null
                    ) {
                        this._updatingWorkerProfile = true
                        this.workerProfile.statutoryHolidayDays = newSuggestion
                        this.$nextTick(() => {
                            this._updatingWorkerProfile = false
                        })
                    }
                },
                /** @this {PayrollAppInstance} @param {number} newHolidayDays */
                'workerProfile.statutoryHolidayDays'(newHolidayDays) {
                    if (this._updatingWorkerProfile) {
                        return
                    }
                    const currentDays = this.workerProfile.typicalDays
                    if (currentDays <= 0) {
                        return
                    }
                    const statutoryMinimum =
                        Math.round(Math.min(5.6 * currentDays, 28) * 10) / 10

                    // If user sets holiday entitlement below statutory minimum, adjust typicalDays downward
                    // Only adjust if the new value doesn't match the current statutory minimum
                    if (
                        newHolidayDays < statutoryMinimum &&
                        newHolidayDays > 0 &&
                        newHolidayDays !== statutoryMinimum
                    ) {
                        // Reverse calculation: days = holidayDays / 5.6
                        const impliedDays = newHolidayDays / 5.6
                        const newTypicalDays = Math.max(
                            this.workerProfile.workerType === 'salary'
                                ? 0.5
                                : 0,
                            Math.round(impliedDays * 10) / 10
                        )
                        // Only update if it would actually change the value (prevents watcher loop)
                        if (newTypicalDays !== currentDays) {
                            this._updatingWorkerProfile = true
                            this.workerProfile.typicalDays = newTypicalDays
                            this.$nextTick(() => {
                                this._updatingWorkerProfile = false
                            })
                        }
                    }
                },
                /** @this {PayrollAppInstance} @param {string} newType */
                'workerProfile.workerType'(newType) {
                    // Enforce min/max typicalDays for salaried workers
                    if (newType === 'salary') {
                        if (this.workerProfile.typicalDays < 0.5) {
                            this.workerProfile.typicalDays = 5
                        } else if (this.workerProfile.typicalDays > 7) {
                            this.workerProfile.typicalDays = 7
                        }
                    }
                },
                /** @this {PayrollAppInstance} @param {string} value */
                pdfPassword(value) {
                    if (value) {
                        sessionStorage.setItem(PDF_PASSWORD_KEY, value)
                        sessionStorage.setItem(
                            SESSION_PERSISTED_AT_KEY,
                            String(Date.now())
                        )
                        return
                    }
                    sessionStorage.removeItem(PDF_PASSWORD_KEY)
                    if (!this.acceptedDisclaimer) {
                        sessionStorage.removeItem(SESSION_PERSISTED_AT_KEY)
                    }
                },
                /** @this {PayrollAppInstance} @param {boolean} value */
                acceptedDisclaimer(value) {
                    if (value) {
                        sessionStorage.setItem(DISCLAIMER_ACCEPTED_KEY, 'true')
                        sessionStorage.setItem(
                            SESSION_PERSISTED_AT_KEY,
                            String(Date.now())
                        )
                        return
                    }
                    sessionStorage.removeItem(DISCLAIMER_ACCEPTED_KEY)
                    if (!this.pdfPassword) {
                        sessionStorage.removeItem(SESSION_PERSISTED_AT_KEY)
                    }
                },
            },
            methods: {
                /** @this {PayrollAppInstance} @param {Event} event */
                updateStatutoryHolidayDays(event) {
                    if (!this.isZeroHoursWorker) {
                        const target = /** @type {HTMLInputElement} */ (
                            event.target
                        )
                        this.workerProfile.statutoryHolidayDays =
                            parseFloat(target.value) || 0
                    }
                },
                /** @this {PayrollAppInstance} @param {string} sectionKey @param {boolean} isCollapsed @returns {void} */
                setSectionCollapsed(sectionKey, isCollapsed) {
                    if (!this.collapsedSections) {
                        this.collapsedSections = {
                            prep: false,
                            nextSteps: true,
                        }
                    }
                    const shell = getCollapseShell(sectionKey)
                    if (!shell) {
                        this.collapsedSections[sectionKey] = isCollapsed
                        return
                    }
                    const startHeight = shell.getBoundingClientRect().height
                    shell.style.overflow = 'hidden'
                    this.collapsedSections[sectionKey] = isCollapsed
                    this.$nextTick(() => {
                        const activeShell =
                            getCollapseShell(sectionKey) || shell
                        const targetHeight = isCollapsed
                            ? COLLAPSE_SHELL_COLLAPSED_HEIGHT
                            : activeShell.scrollHeight
                        animateElementHeight(
                            activeShell,
                            startHeight,
                            targetHeight,
                            COLLAPSE_SHELL_TRANSITION_MS,
                            () => {
                                syncCollapseShell(activeShell, isCollapsed)
                            }
                        )
                    })
                },
                /** @this {PayrollAppInstance} @param {string} sectionKey @returns {void} */
                toggleSection(sectionKey) {
                    this.setSectionCollapsed(
                        sectionKey,
                        !this.collapsedSections?.[sectionKey]
                    )
                },
                /** @this {PayrollAppInstance} @param {string} sectionKey @returns {void} */
                expandSection(sectionKey) {
                    if (this.collapsedSections?.[sectionKey]) {
                        this.setSectionCollapsed(sectionKey, false)
                    }
                },
                /** @this {PayrollAppInstance} @param {string} sectionKey @returns {void} */
                handleSectionFocus(sectionKey) {
                    if (this.collapsedSections?.[sectionKey]) {
                        this.setSectionCollapsed(sectionKey, false)
                    }
                },
                /** @this {PayrollAppInstance} @param {string} sectionKey @returns {void} */
                syncCollapseShellState(sectionKey) {
                    if (!this.collapsedSections) {
                        return
                    }
                    const shell = getCollapseShell(sectionKey)
                    if (!shell) {
                        return
                    }
                    syncCollapseShell(
                        shell,
                        !!this.collapsedSections[sectionKey]
                    )
                },
                /** @this {PayrollAppInstance} @param {MouseEvent} event @returns {void} */
                handleAnimatedDetailsClick(event) {
                    const eventTarget = /** @type {EventTarget | null} */ (
                        event.target
                    )
                    if (!eventTarget) {
                        return
                    }
                    const targetCandidate =
                        /** @type {{ closest?: unknown }} */ (eventTarget)
                    if (typeof targetCandidate.closest !== 'function') {
                        return
                    }
                    const target = /** @type {Element} */ (eventTarget)
                    const summary = target.closest('summary')
                    if (!summary || summary.tagName !== 'SUMMARY') {
                        return
                    }
                    const details = /** @type {HTMLDetailsElement | null} */ (
                        summary.parentElement
                    )
                    if (!details || details.tagName !== 'DETAILS') {
                        return
                    }
                    if (!details.matches('.card details')) {
                        return
                    }
                    const content = getAnimatedDetailsContent(details)
                    if (!content) {
                        return
                    }
                    event.preventDefault()
                    if (details.dataset.animating === 'true') {
                        return
                    }
                    if (details.open) {
                        details.dataset.animating = 'true'
                        animateElementHeight(
                            content,
                            content.getBoundingClientRect().height,
                            0,
                            DETAILS_CONTENT_TRANSITION_MS,
                            () => {
                                details.open = false
                                details.dataset.animating = 'false'
                                content.style.height = '0px'
                            }
                        )
                        return
                    }
                    const groupName = details.getAttribute('name')
                    if (groupName) {
                        document
                            .querySelectorAll('details[open]')
                            .forEach((node) => {
                                const openDetails =
                                    /** @type {HTMLDetailsElement} */ (node)
                                if (
                                    openDetails.tagName !== 'DETAILS' ||
                                    openDetails === details ||
                                    openDetails.getAttribute('name') !==
                                        groupName
                                ) {
                                    return
                                }
                                const siblingContent =
                                    getAnimatedDetailsContent(openDetails)
                                if (siblingContent) {
                                    clearHeightAnimation(siblingContent)
                                    siblingContent.style.height = '0px'
                                }
                                openDetails.open = false
                                openDetails.dataset.animating = 'false'
                            })
                    }
                    details.open = true
                    details.dataset.animating = 'true'
                    content.style.height = '0px'
                    animateElementHeight(
                        content,
                        0,
                        content.scrollHeight,
                        DETAILS_CONTENT_TRANSITION_MS,
                        () => {
                            details.dataset.animating = 'false'
                            content.style.height = 'auto'
                        }
                    )
                },
                /** @this {PayrollAppInstance} @param {File[]} rawFiles */
                stageFiles(rawFiles) {
                    const files = rawFiles.filter(Boolean)
                    if (!files.length) {
                        return
                    }
                    /** @type {Array<{ id: string, name: string, type: 'pdf' | 'xlsx', file: File }>} */
                    const staged = []
                    /** @type {string[]} */
                    const invalid = []
                    const existingIds = new Set(
                        this.stagedFiles.map(
                            (/** @type {{ id: string }} */ item) => item.id
                        )
                    )
                    const duplicates = []
                    files.forEach((file) => {
                        const name = (file.name || '').toLowerCase()
                        if (
                            file.type === 'application/pdf' ||
                            name.endsWith('.pdf')
                        ) {
                            const id = `${file.name}-${file.size}-${file.lastModified}`
                            if (existingIds.has(id)) {
                                duplicates.push(file.name || 'Unknown')
                                return
                            }
                            staged.push({
                                id,
                                name: file.name,
                                type: 'pdf',
                                file,
                            })
                            return
                        }
                        if (
                            file.type ===
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                            file.type === 'application/vnd.ms-excel' ||
                            name.endsWith('.xlsx') ||
                            name.endsWith('.xls')
                        ) {
                            const id = `${file.name}-${file.size}-${file.lastModified}`
                            if (existingIds.has(id)) {
                                duplicates.push(file.name || 'Unknown')
                                return
                            }
                            staged.push({
                                id,
                                name: file.name,
                                type: 'xlsx',
                                file,
                            })
                            return
                        }
                        invalid.push(file.name || 'Unknown')
                    })

                    if (invalid.length) {
                        this.error =
                            'Some files were not PDFs or Excel files and were skipped.'
                    } else {
                        this.error = ''
                    }
                    if (duplicates.length) {
                        this.notice =
                            'Warning: Duplicate files detected, these will be skipped automatically.'
                    } else {
                        this.notice = ''
                    }
                    this.stagedFiles = [...this.stagedFiles, ...staged]
                    this.stagedPdfCount = this.stagedFiles.filter(
                        (/** @type {{ type: string }} */ item) =>
                            item.type === 'pdf'
                    ).length
                    this.stagedExcelCount = this.stagedFiles.filter(
                        (/** @type {{ type: string }} */ item) =>
                            item.type === 'xlsx'
                    ).length
                },
                /** @this {PayrollAppInstance} @param {unknown} value */
                parseContributionDate(value) {
                    if (value instanceof Date) {
                        return value
                    }
                    const XLSX = cachedXlsx
                    if (
                        typeof value === 'number' &&
                        /** @type {any} */ (XLSX).SSF?.parse_date_code
                    ) {
                        const parsed = /** @type {any} */ (
                            XLSX
                        ).SSF.parse_date_code(value)
                        if (parsed) {
                            return new Date(parsed.y, parsed.m - 1, parsed.d)
                        }
                    }
                    if (typeof value === 'string') {
                        const match = value.match(
                            /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/
                        )
                        if (match) {
                            const day = parseInt(match[1], 10)
                            const month = parseInt(match[2], 10) - 1
                            let year = parseInt(match[3], 10)
                            if (year < 100) {
                                year += 2000
                            }
                            const parsed = new Date(year, month, day)
                            if (!Number.isNaN(parsed.getTime())) {
                                return parsed
                            }
                        }
                    }
                    return null
                },
                /** @this {PayrollAppInstance} @param {unknown} value */
                normalizeContributionType(value) {
                    if (!value) {
                        return null
                    }
                    const normalized = String(value).toLowerCase()
                    if (normalized.includes('from your salary')) {
                        return 'ee'
                    }
                    if (normalized.includes('from your employer')) {
                        return 'er'
                    }
                    return null
                },
                /** @this {PayrollAppInstance} @param {File[]} files */
                async parseContributionFiles(files) {
                    if (!files || !files.length) {
                        return null
                    }
                    const XLSX = await loadXlsx()
                    if (!XLSX) {
                        throw new Error('XLSX_NOT_AVAILABLE')
                    }
                    const parseContributionWorkbook =
                        await ACTIVE_PENSION_FORMAT.parser()
                    const XLSXReader = /** @type {any} */ (XLSX)
                    /** @type {ContributionEntry[]} */
                    const entries = []
                    const failures = []
                    for (const file of files) {
                        try {
                            const buffer = await file.arrayBuffer()
                            const workbook = XLSXReader.read(buffer, {
                                type: 'array',
                            })
                            const parsed = parseContributionWorkbook(
                                workbook,
                                file.name || 'Unknown',
                                XLSX
                            )
                            entries.push(...parsed.entries)
                            if (
                                this.debugEnabled &&
                                !this.debugInfo.excelRows
                            ) {
                                this.debugInfo.excelSource =
                                    file.name || 'Unknown'
                                this.debugInfo.excelRows = JSON.stringify(
                                    parsed.debugRows || [],
                                    null,
                                    2
                                )
                            }
                            if (
                                this.debugEnabled &&
                                !this.debugInfo.excelParsed
                            ) {
                                this.debugInfo.excelParsed = JSON.stringify(
                                    parsed.debugEntries || [],
                                    null,
                                    2
                                )
                            }
                        } catch (err) {
                            const e = /** @type {any} */ (err)
                            failures.push({
                                name: file.name || 'Unknown',
                                code: e?.message || 'UNKNOWN',
                                employers: e?.employers || [],
                                missingTypes: e?.missingTypes || [],
                            })
                        }
                    }
                    if (failures.length) {
                        const error =
                            /** @type {Error & { failures: ContributionFailure[] }} */ (
                                new Error('CONTRIBUTION_FILE_FAILURES')
                            )
                        error.failures = failures
                        throw error
                    }
                    return {
                        entries,
                        sourceFiles: files.map(
                            (file) => file.name || 'Unknown'
                        ),
                    }
                },
                /** @this {PayrollAppInstance} @returns {void} */
                copyDebugOutput() {
                    const payload = [
                        `App version: ${this.appVersion || UNKNOWN_APP_VERSION}`,
                        '=== Debug: PDF Source File ===',
                        this.debugInfo.pdfSource || '<empty>',
                        '=== Debug: Extracted Text ===',
                        this.debugText || '<empty>',
                        '=== Debug: Parsed Values ===',
                        this.debugInfo.parsed || '<empty>',
                        '=== Debug: Regex Matches ===',
                        this.debugInfo.matches || '<empty>',
                        '=== Debug: Excel Source File ===',
                        this.debugInfo.excelSource || '<empty>',
                        '=== Debug: Excel Raw Rows (first 20) ===',
                        this.debugInfo.excelRows || '<empty>',
                        '=== Debug: Excel Parsed Entries (first 20) ===',
                        this.debugInfo.excelParsed || '<empty>',
                        '=== Debug: Run Snapshot ===',
                        this.debugInfo.runSnapshot || '<empty>',
                    ].join('\n\n')

                    try {
                        navigator.clipboard.writeText(payload)
                        console.log('Debug output copied to clipboard')
                    } catch {
                        const textarea = document.createElement('textarea')
                        textarea.value = payload
                        textarea.setAttribute('readonly', '')
                        textarea.className = 'clipboard-copy-buffer'
                        document.body.appendChild(textarea)
                        textarea.select()
                        document.execCommand('copy')
                        document.body.removeChild(textarea)
                    } finally {
                        this.debugCopySuccess = true
                        if (this.debugCopyResetTimer) {
                            clearTimeout(this.debugCopyResetTimer)
                        }
                        this.debugCopyResetTimer = setTimeout(() => {
                            this.debugCopySuccess = false
                        }, 2000)
                    }
                },
                /** @this {PayrollAppInstance} @param {DragEvent} event */
                onDragOver(event) {
                    event.preventDefault()
                    if (this.status === 'processing') {
                        return
                    }
                    this.dragActive = true
                },
                /** @this {PayrollAppInstance} @param {DragEvent} event */
                onDragLeave(event) {
                    event.preventDefault()
                    const currentTarget = /** @type {HTMLElement} */ (
                        event.currentTarget
                    )
                    const relatedTarget = /** @type {Node | null} */ (
                        event.relatedTarget
                    )
                    if (
                        relatedTarget &&
                        currentTarget.contains(relatedTarget)
                    ) {
                        return
                    }
                    this.dragActive = false
                },
                /** @this {PayrollAppInstance} @param {DragEvent} event */
                async onDrop(event) {
                    event.preventDefault()
                    event.stopPropagation()
                    if (this.status === 'processing') {
                        return
                    }
                    this.dragActive = false
                    const items = Array.from(event.dataTransfer?.items || [])
                    const itemFiles = items
                        .filter((item) => item.kind === 'file')
                        .map((item) => item.getAsFile())
                        .filter(/** @returns {f is File} */ (f) => f !== null)
                    const rawFiles = itemFiles.length
                        ? itemFiles
                        : Array.from(event.dataTransfer?.files || [])
                    this.stageFiles(rawFiles)
                },
                /** @this {PayrollAppInstance} @param {Event} event */
                async handleFiles(event) {
                    const input = /** @type {HTMLInputElement} */ (event.target)
                    const rawFiles = Array.from(input.files || [])
                    if (!rawFiles.length) {
                        return
                    }
                    this.stageFiles(rawFiles)
                    input.value = ''
                },
                /** @this {PayrollAppInstance} @returns {Promise<void>} */
                async runReport() {
                    if (!this.canRunReport) {
                        return
                    }
                    const pdfFiles = this.stagedFiles
                        .filter(
                            (/** @type {{ type: string }} */ item) =>
                                item.type === 'pdf'
                        )
                        .map((/** @type {{ file: File }} */ item) => item.file)
                    const excelFiles = this.stagedFiles
                        .filter(
                            (/** @type {{ type: string }} */ item) =>
                                item.type === 'xlsx'
                        )
                        .map((/** @type {{ file: File }} */ item) => item.file)
                    this.contributionFiles = excelFiles
                    this.fileCount = pdfFiles.length
                    await this.processFiles(pdfFiles)
                },
                /** @this {PayrollAppInstance} @returns {void} */
                clearUploads() {
                    this.stagedFiles = []
                    this.stagedPdfCount = 0
                    this.stagedExcelCount = 0
                    this.contributionFiles = []
                    this.fileCount = 0
                    this.resetReportState()
                },
                /** @this {PayrollAppInstance} @returns {void} */
                resetReportState() {
                    this.status = 'idle'
                    this.error = ''
                    this.notice = ''
                    this.reportHtml = ''
                    this.reportReady = false
                    this.reportContext = null
                    this.employeeName = ''
                    this.debugText = ''
                    this.debugInfo = {
                        pdfSource: '',
                        parsed: '',
                        matches: '',
                        excelSource: '',
                        excelRows: '',
                        excelParsed: '',
                        runSnapshot: '',
                    }
                    this.failedFiles = []
                    this.failedPayPeriods = []
                    this.showScrollTop = false
                    this.parsingExcel = false
                    this.reportStats = {
                        dateRangeLabel: '',
                        missingMonthsLabel: '',
                        missingMonthsByYear: {},
                        contributionMeta: {
                            fileCount: 0,
                            recordCount: 0,
                            dateRangeLabel: 'None',
                        },
                        validationSummary: {
                            flaggedCount: 0,
                            lowConfidenceCount: 0,
                            flaggedPeriods: [],
                        },
                    }
                },
                /** @this {PayrollAppInstance} @param {File[]} files */
                async processFiles(files) {
                    if (!this.acceptedDisclaimer) {
                        this.status = 'idle'
                        this.error =
                            'Please accept the accuracy disclaimer before running the report.'
                        return
                    }
                    this.resetReportState()
                    this.status = 'processing'
                    this.progress = {
                        current: 0,
                        total: files.length + this.contributionFiles.length,
                    }
                    logMemoryUsage('run-start')
                    console.info('Payroll: starting processing', {
                        files: files.length,
                    })

                    let workflowResult = null
                    let loggedExcelStart = false
                    try {
                        const XLSX = await loadXlsx()
                        const { runPayrollReportWorkflow } =
                            await loadReportWorkflow()
                        this.parsingExcel = this.contributionFiles.length > 0
                        if (this.parsingExcel) {
                            console.info(
                                'Payroll: parsing Excel contribution history',
                                {
                                    files: this.contributionFiles.map(
                                        (/** @type {File} */ file) =>
                                            file.name || 'Unknown'
                                    ),
                                }
                            )
                        }
                        workflowResult = await runPayrollReportWorkflow({
                            pdfFiles: files,
                            excelFiles: this.contributionFiles,
                            pdfPassword: this.pdfPassword,
                            xlsx: XLSX,
                            failedPayPeriods: this.failedPayPeriods,
                            failedFiles: this.failedFiles,
                            captureDebug: this.debugEnabled,
                            includeReportContext: true,
                            workerProfile: this.workerProfile,
                            onProgress: (
                                /** @type {{ current: number, total: number, file: File }} */
                                { current, total, file }
                            ) => {
                                this.progress.current = current
                                this.progress.total = total
                                if (
                                    !loggedExcelStart &&
                                    this.contributionFiles.length &&
                                    current === files.length + 1
                                ) {
                                    logMemoryUsage('run-excel-start')
                                    loggedExcelStart = true
                                }
                                console.info('Payroll: extracting', {
                                    index: current,
                                    name: file.name,
                                })
                                if (current % MEMORY_LOG_EVERY === 0) {
                                    logMemoryUsage(`run-progress-${current}`)
                                }
                            },
                        })
                        if (this.debugEnabled && workflowResult?.debug) {
                            console.info(
                                'Payroll: PDF extraction debug captured'
                            )
                        }
                        if (
                            this.debugEnabled &&
                            workflowResult?.contributionData
                        ) {
                            console.info(
                                'Payroll: Excel contribution history parsed',
                                {
                                    entries:
                                        workflowResult?.contributionData
                                            ?.entries?.length || 0,
                                }
                            )
                        }
                    } catch (err) {
                        const e = /** @type {any} */ (err)
                        console.error('Payroll: extraction failed', {
                            message: e?.message,
                            error: e,
                        })
                        if (e && e.message === 'PASSWORD_REQUIRED') {
                            this.error =
                                'A password is required for one or more of the uploaded PDF(s). Enter a password and try again.'
                            document.getElementById('pdf-password')?.focus()
                        } else if (e && e.message === 'INCORRECT_PASSWORD') {
                            const fileLabel = e?.fileName
                                ? ` for ${e.fileName}`
                                : ''
                            this.error = `Incorrect password${fileLabel}. Please re-enter the PDF password.`
                            document.getElementById('pdf-password')?.focus()
                        } else if (e?.message === 'XLSX_NOT_AVAILABLE') {
                            this.error =
                                'Excel parser is not available. Please refresh and try again.'
                        } else if (
                            e?.message === 'CONTRIBUTION_SHEET_MISSING'
                        ) {
                            this.error =
                                "Excel file is missing the 'Contribution Details' sheet."
                        } else if (
                            e?.message === 'CONTRIBUTION_FILE_FAILURES'
                        ) {
                            const failureDetails = (e?.failures || []).map(
                                (
                                    /** @type {ContributionFailure} */ failure
                                ) => {
                                    const reason =
                                        failure.code ===
                                        'CONTRIBUTION_SHEET_MISSING'
                                            ? "missing 'Contribution Details' sheet"
                                            : failure.code ===
                                                'CONTRIBUTION_HEADER_INVALID'
                                              ? 'headers do not match expected format'
                                              : failure.code ===
                                                  'CONTRIBUTION_NO_ROWS'
                                                ? 'no valid contribution rows'
                                                : failure.code ===
                                                    'CONTRIBUTION_EMPLOYER_MIXED'
                                                  ? `multiple employers detected (${(failure.employers || []).join(', ') || 'unknown'}). Generate one report per employer.`
                                                  : failure.code ===
                                                      'CONTRIBUTION_MISSING_EE_ER'
                                                    ? `missing ${failure.missingTypes?.length ? failure.missingTypes.join(' and ') : 'employee/employer'} contributions. Regenerate the report with both Employee and Employer contributions.`
                                                    : 'unreadable or corrupted'
                                    return `${failure.name}: ${reason}`
                                }
                            )
                            this.error = failureDetails.length
                                ? `Excel file(s) could not be processed: ${failureDetails.join('; ')}.`
                                : 'Excel file(s) could not be processed.'
                        } else if (
                            e?.message === 'CONTRIBUTION_HEADER_INVALID'
                        ) {
                            this.error =
                                'Excel file headers do not match the expected format (Date, Type, Amount).'
                        } else if (e?.message === 'CONTRIBUTION_NO_ROWS') {
                            this.error =
                                'Excel file contains no valid contribution rows. Check the sheet formatting.'
                        } else if (e?.message === 'PAYROLL_EMPLOYEE_MIXED') {
                            this.error =
                                'The uploaded payslips contain more than one employee. Please upload payslips for a single employee only.'
                        } else if (e?.message === 'PAYROLL_EMPLOYER_MIXED') {
                            this.error =
                                'The uploaded payslips contain more than one employer. Please upload payslips for a single employer only.'
                        } else {
                            this.error =
                                'An unexpected error occurred while processing the files. Please try again.'
                        }
                        this.status = 'idle'
                        return
                    } finally {
                        this.parsingExcel = false
                    }

                    this.failedFiles = workflowResult?.failedFiles || []
                    this.failedPayPeriods =
                        workflowResult?.failedPayPeriods || []
                    console.info('Payroll: failed files summary', {
                        count: this.failedFiles.length,
                        files: [...this.failedFiles],
                    })

                    if (this.failedFiles.length && !this.error) {
                        this.error = `Failed to read ${this.failedFiles.length} PDF(s).`
                    }

                    const records = workflowResult?.records || []
                    if (!records.length) {
                        this.status = 'idle'
                        this.error =
                            this.error || 'No payroll data was extracted.'
                        console.warn('Payroll: no records extracted', {
                            files: files.length,
                            error: this.error,
                        })
                        return
                    }

                    if (this.debugEnabled && workflowResult?.debug) {
                        if (!this.debugInfo.pdfSource) {
                            this.debugInfo.pdfSource =
                                files[0]?.name || 'Unknown'
                        }
                        if (!this.debugText) {
                            this.debugText = workflowResult.debug.text
                        }
                        if (workflowResult?.excelDebug) {
                            if (!this.debugInfo.excelSource) {
                                this.debugInfo.excelSource =
                                    workflowResult.excelDebug.source ||
                                    'Unknown'
                            }
                            if (!this.debugInfo.excelRows) {
                                this.debugInfo.excelRows = JSON.stringify(
                                    workflowResult.excelDebug.rows || [],
                                    null,
                                    2
                                )
                            }
                            if (!this.debugInfo.excelParsed) {
                                this.debugInfo.excelParsed = JSON.stringify(
                                    workflowResult.excelDebug.entries || [],
                                    null,
                                    2
                                )
                            }
                        }
                        if (!this.debugInfo.parsed) {
                            const debugRecord = { ...records[0] }
                            if (
                                debugRecord.imageData &&
                                typeof debugRecord.imageData === 'string'
                            ) {
                                const marker = 'data:image/png;base64,'
                                debugRecord.imageData =
                                    debugRecord.imageData.startsWith(marker)
                                        ? `${marker}<truncated>`
                                        : '<truncated>'
                            }
                            this.debugInfo.parsed = JSON.stringify(
                                debugRecord,
                                null,
                                2
                            )
                            const { PATTERNS } = await loadPatterns()
                            this.debugInfo.matches = JSON.stringify(
                                {
                                    nameDateId:
                                        this.debugText.match(
                                            PATTERNS.nameDateId
                                        )?.[0] || null,
                                    employerLine:
                                        this.debugText.match(
                                            PATTERNS.employerLine
                                        )?.[0] || null,
                                    payeTax:
                                        this.debugText.match(
                                            PATTERNS.payeTax
                                        )?.[0] || null,
                                    nationalInsurance:
                                        this.debugText.match(
                                            PATTERNS.natIns
                                        )?.[0] || null,
                                    pensionEmployee:
                                        this.debugText.match(
                                            PATTERNS.pensionEe
                                        )?.[0] || null,
                                    pensionEmployer:
                                        this.debugText.match(
                                            PATTERNS.pensionEr
                                        )?.[0] || null,
                                    earningsForNI:
                                        this.debugText.match(
                                            PATTERNS.earningsNi
                                        )?.[0] || null,
                                    grossForTax:
                                        this.debugText.match(
                                            PATTERNS.grossTax
                                        )?.[0] || null,
                                    totalGrossPay:
                                        this.debugText.match(
                                            PATTERNS.totalGrossPay
                                        )?.[0] || null,
                                    payCycle:
                                        this.debugText.match(
                                            PATTERNS.payCycle
                                        )?.[0] || null,
                                    totalGrossPayTD:
                                        this.debugText.match(
                                            PATTERNS.totalGrossPayTd
                                        )?.[0] || null,
                                    grossForTaxTD:
                                        this.debugText.match(
                                            PATTERNS.grossTaxTd
                                        )?.[0] || null,
                                    taxPaidTD:
                                        this.debugText.match(
                                            PATTERNS.taxPaidTd
                                        )?.[0] || null,
                                    earningsForNITD:
                                        this.debugText.match(
                                            PATTERNS.earningsNiTd
                                        )?.[0] || null,
                                    nationalInsuranceTD:
                                        this.debugText.match(
                                            PATTERNS.niTd
                                        )?.[0] || null,
                                    employeePensionTD:
                                        this.debugText.match(
                                            PATTERNS.pensionEeTd
                                        )?.[0] || null,
                                    employerPensionTD:
                                        this.debugText.match(
                                            PATTERNS.pensionErTd
                                        )?.[0] || null,
                                    netPay:
                                        this.debugText.match(
                                            PATTERNS.netPay
                                        )?.[0] || null,
                                },
                                null,
                                2
                            )
                        }
                    }

                    const report = workflowResult.report
                    if (!report) {
                        this.status = 'idle'
                        this.error =
                            this.error || 'No payroll data was extracted.'
                        return
                    }

                    this.status = 'rendering'
                    this.reportHtml = injectReportVersionFootnote(
                        report.html,
                        this.appVersion
                    )
                    this.reportReady = true
                    this.status = 'done'
                    this.reportTimestamp = new Date().toLocaleString('en-GB')
                    this.suggestedFilename = report.filename
                    this.reportContext = report.context || null
                    if (this.debugEnabled) {
                        const { buildRunSnapshot } = await loadRunSnapshot()
                        this.debugInfo.runSnapshot = JSON.stringify(
                            buildRunSnapshot(
                                records,
                                this.reportContext,
                                workflowResult?.contributionData || null
                            ),
                            null,
                            2
                        )
                    }
                    this.employeeName = records[0]?.employee?.name || 'Unknown'
                    this.reportStats = /** @type {ReportStats} */ ({
                        ...this.reportStats,
                        ...report.stats,
                        contributionMeta: {
                            ...this.reportStats.contributionMeta,
                            ...(report.stats?.contributionMeta || {}),
                        },
                    })
                    document.title = report.filename
                    console.info('Payroll: report ready', {
                        filename: report.filename,
                    })
                    this.stagedFiles = []
                    this.stagedPdfCount = 0
                    this.stagedExcelCount = 0
                    this.contributionFiles = []
                    this.$nextTick(() => {
                        logMemoryUsage('run-finished')
                        document
                            .getElementById('report-summary')
                            ?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                            })
                        document.getElementById('download-pdf-btn')?.focus()
                    })
                    this.handleScroll()
                },
                /** @this {PayrollAppInstance} @returns {Promise<void>} */
                async downloadPdf() {
                    if (
                        !this.reportReady ||
                        !this.reportContext ||
                        this.pdfDownloading ||
                        this.pdfSharing
                    ) {
                        return
                    }
                    this.pdfDownloading = true
                    await new Promise((resolve) => setTimeout(resolve, 50))
                    /** @type {ReturnType<typeof setInterval> | null} */
                    let memoryPollInterval = null
                    try {
                        console.info('Payroll: PDF export started')
                        logMemoryUsage('pdf-export-start')
                        const { exportReportPdf } = await loadPdfExport()
                        logMemoryUsage('pdf-export-library-loaded')
                        if (MEMORY_LOG_ENABLED) {
                            memoryPollInterval = setInterval(() => {
                                logMemoryUsage('pdf-export-poll')
                            }, 500)
                        }
                        const t0 = performance.now()
                        const pdfBytes = await exportReportPdf(
                            this.reportContext,
                            {
                                filename: this.suggestedFilename,
                                appVersion: this.appVersion,
                                employeeName: this.employeeName,
                                dateRangeLabel: this.reportStats.dateRangeLabel,
                            }
                        )
                        const durationMs = Math.round(performance.now() - t0)
                        if (memoryPollInterval !== null) {
                            clearInterval(memoryPollInterval)
                            memoryPollInterval = null
                        }
                        logMemoryUsage('pdf-export-rendered')
                        console.info('Payroll: PDF export rendered', {
                            durationMs,
                            sizeKb: Math.round(pdfBytes.byteLength / 1024),
                        })
                        const blob = new Blob([pdfBytes], {
                            type: 'application/pdf',
                        })
                        const baseName =
                            typeof this.suggestedFilename === 'string'
                                ? this.suggestedFilename.trim()
                                : ''
                        const fallbackName = 'payroll-report.pdf'
                        const normalizedName = baseName
                            ? baseName.toLowerCase().endsWith('.pdf')
                                ? baseName
                                : `${baseName}.pdf`
                            : fallbackName
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement('a')
                        link.href = url
                        link.download = normalizedName
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        URL.revokeObjectURL(url)
                        console.info('Payroll: PDF download triggered', {
                            filename: normalizedName,
                        })
                        logMemoryUsage('pdf-export-complete')
                    } catch (err) {
                        const e = /** @type {any} */ (err)
                        console.error('Payroll: PDF export failed', {
                            message: e?.message,
                            error: e,
                        })
                        this.error =
                            'Failed to generate PDF. Please try again or use the Print button.'
                    } finally {
                        if (memoryPollInterval !== null) {
                            clearInterval(memoryPollInterval)
                        }
                        this.pdfDownloading = false
                    }
                },
                /** @this {PayrollAppInstance} @returns {Promise<void>} */
                async sharePdf() {
                    if (
                        !this.reportReady ||
                        !this.reportContext ||
                        this.pdfDownloading ||
                        this.pdfSharing
                    ) {
                        return
                    }
                    this.pdfSharing = true
                    await new Promise((resolve) => setTimeout(resolve, 50))
                    /** @type {ReturnType<typeof setInterval> | null} */
                    let memoryPollInterval = null
                    try {
                        console.info('Payroll: PDF share started')
                        logMemoryUsage('pdf-share-start')
                        const { exportReportPdf } = await loadPdfExport()
                        logMemoryUsage('pdf-share-library-loaded')
                        if (MEMORY_LOG_ENABLED) {
                            memoryPollInterval = setInterval(() => {
                                logMemoryUsage('pdf-share-poll')
                            }, 500)
                        }
                        const t0 = performance.now()
                        const pdfBytes = await exportReportPdf(
                            this.reportContext,
                            {
                                filename: this.suggestedFilename,
                                appVersion: this.appVersion,
                                employeeName: this.employeeName,
                                dateRangeLabel: this.reportStats.dateRangeLabel,
                            }
                        )
                        const durationMs = Math.round(performance.now() - t0)
                        if (memoryPollInterval !== null) {
                            clearInterval(memoryPollInterval)
                            memoryPollInterval = null
                        }
                        logMemoryUsage('pdf-share-rendered')
                        console.info('Payroll: PDF share rendered', {
                            durationMs,
                            sizeKb: Math.round(pdfBytes.byteLength / 1024),
                        })
                        const blob = new Blob([pdfBytes], {
                            type: 'application/pdf',
                        })
                        const baseName =
                            typeof this.suggestedFilename === 'string'
                                ? this.suggestedFilename.trim()
                                : ''
                        const fallbackName = 'payroll-report.pdf'
                        const normalizedName = baseName
                            ? baseName.toLowerCase().endsWith('.pdf')
                                ? baseName
                                : `${baseName}.pdf`
                            : fallbackName
                        const shareFile = new File([blob], normalizedName, {
                            type: 'application/pdf',
                        })
                        await navigator.share({
                            files: [shareFile],
                            title: normalizedName,
                        })
                        logMemoryUsage('pdf-share-complete')
                        console.info('Payroll: PDF shared', {
                            filename: normalizedName,
                        })
                    } catch (err) {
                        const e = /** @type {any} */ (err)
                        if (e?.name === 'AbortError') {
                            return
                        }
                        console.error('Payroll: PDF share failed', {
                            message: e?.message,
                            error: e,
                        })
                        this.error =
                            'Failed to share PDF. Please try again or use the Download button.'
                    } finally {
                        if (memoryPollInterval !== null) {
                            clearInterval(memoryPollInterval)
                        }
                        this.pdfSharing = false
                    }
                },
                /** @this {PayrollAppInstance} @returns {void} */
                printReport() {
                    if (!this.reportReady) {
                        return
                    }
                    window.print()
                },
                /** @this {PayrollAppInstance} @returns {void} */
                applyUpdate() {
                    if (!this.waitingWorker) {
                        if (this.swRegistration) {
                            this.swRegistration.update()
                        }
                        window.location.reload()
                        return
                    }
                    this.waitingWorker.postMessage({ type: 'SKIP_WAITING' })
                    setTimeout(() => window.location.reload(), 300)
                },
                /** @this {PayrollAppInstance} @returns {void} */
                handleScroll() {
                    if (!this.reportReady) {
                        this.showScrollTop = false
                        return
                    }
                    const doc = document.documentElement
                    const scrollTop = window.scrollY || doc.scrollTop || 0
                    const viewportHeight =
                        window.innerHeight || doc.clientHeight || 0
                    const scrollHeight = doc.scrollHeight || 0
                    const scrollableHeight = Math.max(
                        scrollHeight - viewportHeight,
                        0
                    )
                    if (!scrollableHeight) {
                        this.showScrollTop = false
                        return
                    }
                    this.showScrollTop = scrollTop / scrollableHeight >= 0.1
                },
                /** @this {PayrollAppInstance} @returns {void} */
                scrollToTop() {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                },
                /** @this {PayrollAppInstance} @returns {void} */
                openAbout() {
                    this.$refs.aboutDialog?.showModal()
                    document.body.classList.add('scroll-locked')
                },
                /** @this {PayrollAppInstance} @returns {void} */
                closeAbout() {
                    this.$refs.aboutDialog?.close()
                    document.body.classList.remove('scroll-locked')
                },
                /** @this {PayrollAppInstance} @returns {void} */
                onAboutDialogClose() {
                    document.body.classList.remove('scroll-locked')
                },
                /** @this {PayrollAppInstance} @param {MouseEvent} event @returns {void} */
                onAboutBackdropClick(event) {
                    const rect = this.$refs.aboutDialog?.getBoundingClientRect()
                    if (!rect) {
                        return
                    }
                    if (
                        event.clientX < rect.left ||
                        event.clientX > rect.right ||
                        event.clientY < rect.top ||
                        event.clientY > rect.bottom
                    ) {
                        this.closeAbout()
                    }
                },
                /** @this {PayrollAppInstance} @returns {void} */
                openHolCalc() {
                    this.$refs.holCalcDialog?.showModal()
                    document.body.classList.add('scroll-locked')
                },
                /** @this {PayrollAppInstance} @returns {void} */
                closeHolCalc() {
                    this.$refs.holCalcDialog?.close()
                    document.body.classList.remove('scroll-locked')
                },
                /** @this {PayrollAppInstance} @returns {void} */
                onHolCalcDialogClose() {
                    document.body.classList.remove('scroll-locked')
                },
                /** @this {PayrollAppInstance} @param {MouseEvent} event @returns {void} */
                onHolCalcBackdropClick(event) {
                    const rect =
                        this.$refs.holCalcDialog?.getBoundingClientRect()
                    if (!rect) {
                        return
                    }
                    if (
                        event.clientX < rect.left ||
                        event.clientX > rect.right ||
                        event.clientY < rect.top ||
                        event.clientY > rect.bottom
                    ) {
                        this.closeHolCalc()
                    }
                },
            },
            /** @this {PayrollAppInstance} @returns {void} */
            beforeUnmount() {
                window.removeEventListener('scroll', this.handleScroll)
                document.removeEventListener(
                    'click',
                    this.handleAnimatedDetailsClick
                )
                if (this._onOnline) {
                    window.removeEventListener('online', this._onOnline)
                }
                if (this._onOffline) {
                    window.removeEventListener('offline', this._onOffline)
                }
            },
            /** @this {PayrollAppInstance} @returns {void} */
            mounted() {
                this._onOnline = () => document.body.classList.remove('offline')
                this._onOffline = () => document.body.classList.add('offline')
                window.addEventListener('online', this._onOnline)
                window.addEventListener('offline', this._onOffline)
                if (!navigator.onLine) {
                    document.body.classList.add('offline')
                }

                this.appVersion = getAppVersionFromDemoLink()
                if (DEBUG_LEVEL === '2') {
                    this.updateAvailable = true
                }
                if (!Array.isArray(this.stagedFiles)) {
                    this.stagedFiles = []
                    console.info(
                        'Payroll: normalized stagedFiles (was not an array)'
                    )
                }
                if (!Array.isArray(this.failedFiles)) {
                    this.failedFiles = []
                    console.info(
                        'Payroll: normalized failedFiles (was not an array)'
                    )
                }
                if (
                    !Array.isArray(
                        this.reportStats?.validationSummary?.flaggedPeriods
                    )
                ) {
                    if (!this.reportStats) {
                        this.reportStats = /** @type {ReportStats} */ ({})
                    }
                    if (!this.reportStats.validationSummary) {
                        this.reportStats.validationSummary =
                            /** @type {ValidationSummary} */ ({})
                    }
                    this.reportStats.validationSummary.flaggedPeriods = []
                    console.info(
                        'Payroll: normalized reportStats.validationSummary.flaggedPeriods'
                    )
                }
                const persistedAt = Number(
                    sessionStorage.getItem(SESSION_PERSISTED_AT_KEY) || 0
                )
                if (persistedAt && Date.now() - persistedAt > SESSION_TTL_MS) {
                    sessionStorage.removeItem(PDF_PASSWORD_KEY)
                    sessionStorage.removeItem(DISCLAIMER_ACCEPTED_KEY)
                    sessionStorage.removeItem(SESSION_PERSISTED_AT_KEY)
                }
                this.pdfPassword =
                    sessionStorage.getItem(PDF_PASSWORD_KEY) || ''
                this.acceptedDisclaimer =
                    sessionStorage.getItem(DISCLAIMER_ACCEPTED_KEY) === 'true'
                try {
                    const storedProfile =
                        localStorage.getItem(WORKER_PROFILE_KEY)
                    if (storedProfile) {
                        const parsed = JSON.parse(storedProfile)
                        if (parsed && typeof parsed === 'object') {
                            this.workerProfile = {
                                workerType: parsed.workerType || 'hourly',
                                typicalDays:
                                    typeof parsed.typicalDays === 'number'
                                        ? parsed.typicalDays
                                        : 5,
                                statutoryHolidayDays:
                                    typeof parsed.statutoryHolidayDays ===
                                    'number'
                                        ? parsed.statutoryHolidayDays
                                        : 28,
                                leaveYearStartMonth:
                                    typeof parsed.leaveYearStartMonth ===
                                        'number' &&
                                    Number.isInteger(
                                        parsed.leaveYearStartMonth
                                    ) &&
                                    parsed.leaveYearStartMonth >= 1 &&
                                    parsed.leaveYearStartMonth <= 12
                                        ? parsed.leaveYearStartMonth
                                        : 4,
                            }
                        }
                    }
                } catch {
                    /* storage unavailable */
                }
                const lastLoadedAt = Number(
                    localStorage.getItem(LAST_LOADED_AT_KEY) || 0
                )
                if (
                    lastLoadedAt &&
                    Date.now() - lastLoadedAt > STALE_INSTANCE_TTL_MS
                ) {
                    this.staleInstance = true
                }
                localStorage.setItem(LAST_LOADED_AT_KEY, String(Date.now()))

                scheduleIdle(() => {
                    void loadXlsx()
                    void loadReportWorkflow()
                    void loadPatterns()
                })
                const appRoot = document.getElementById('app')
                if (appRoot) {
                    initializeAnimatedDetails(appRoot)
                }
                document.addEventListener(
                    'click',
                    this.handleAnimatedDetailsClick
                )
                this.$nextTick(() => {
                    Object.keys(this.collapsedSections || {}).forEach(
                        (sectionKey) => {
                            this.syncCollapseShellState(sectionKey)
                        }
                    )
                })

                const isDevHost =
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1'
                const debugLevel = new URLSearchParams(
                    window.location.search
                ).get('debug')
                const allowDevServiceWorker = isDevHost && debugLevel === '2'
                if (
                    (!isDevHost || allowDevServiceWorker) &&
                    'serviceWorker' in navigator
                ) {
                    const hadController = !!navigator.serviceWorker.controller
                    let reloadPending = false
                    navigator.serviceWorker.addEventListener(
                        'controllerchange',
                        () => {
                            if (hadController && !reloadPending) {
                                reloadPending = true
                                window.location.reload()
                            }
                        }
                    )

                    navigator.serviceWorker
                        .register('/sw.js')
                        .then((registration) => {
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
                                newWorker.addEventListener(
                                    'statechange',
                                    () => {
                                        if (
                                            newWorker.state === 'installed' &&
                                            navigator.serviceWorker.controller
                                        ) {
                                            this.updateAvailable = true
                                            this.waitingWorker = newWorker
                                        }
                                    }
                                )
                            })
                        })
                }
                window.addEventListener('scroll', this.handleScroll, {
                    passive: true,
                })
            },
        })
    )

    const app = createApp(appConfig)
    app.mount('#app')
}
