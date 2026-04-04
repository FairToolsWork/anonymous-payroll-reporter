import { createApp, defineComponent } from 'vue'
import {
    ACTIVE_PAYROLL_FORMAT,
    ACTIVE_PENSION_FORMAT,
} from '../parse/active_format.js'
import {
    normalizeContributionType,
    parseContributionDate,
    parseContributionFiles,
} from './app_contributions.js'
import {
    closeDialog,
    onDialogBackdropClick,
    onDialogClose,
    openDialog,
    openHolCalc,
} from './app_dialogs.js'
import {
    holCalcAvgWeekly,
    holCalcEntitlementHours,
    holCalcExpectedHours,
    holCalcExpectedPay,
    holCalcSuggestedStatutoryDays,
    holCalcExpectedWeeklyPay,
    holCalcGrossExpectedPay,
    holCalcGrossWeeklyPay,
} from './app_hol_calc.js'
import {
    initConnectivityHandlers,
    initServiceWorkerUpdates,
    initUiHelpers,
} from './app_lifecycle.js'
import { downloadPdf, printReport, sharePdf } from './app_pdf.js'
import {
    canRunReport,
    canShare,
    clearUploads,
    processFiles,
    progressPercent,
    resetReportState,
    runReport,
} from './app_report.js'
import { handleScroll, initScrollListener, scrollToTop } from './app_scroll.js'
import {
    expandSection,
    handleAnimatedDetailsClick,
    handleSectionFocus,
    setSectionCollapsed,
    syncCollapseShellState,
    toggleSection,
} from './app_sections.js'
import {
    handleFiles,
    onDragLeave,
    onDragOver,
    onDrop,
    stageFiles,
} from './app_uploads.js'
import {
    getAppVersionFromDemoLink,
    UNKNOWN_APP_VERSION,
} from './app_version.js'
import { RULES_VERSION, THRESHOLDS_VERSION } from '../report/uk_thresholds.js'
import {
    entitlementBelowMinimum,
    isZeroHoursWorker,
    statutoryHolidayInputValue,
    suggestedStatutoryDays,
    updateStatutoryHolidayDays,
} from './app_worker_profile.js'
import { AboutContent } from './components/AboutContent.js'
import { AppBreadcrumb } from './components/AppBreadcrumb.js'
import { copyDebugOutput, DEBUG_ENABLED, DEBUG_LEVEL } from './debug_tools.js'

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
 * @property {{ pdfSource: string, parsed: string, matches: string, excelSource: string, excelRows: string, excelParsed: string, runSnapshot: string, workerProfile: string }} debugInfo
 * @property {boolean} debugCopySuccess
 * @property {number | null} debugCopyResetTimer
 * @property {boolean} acceptedDisclaimer
 * @property {{ prep: boolean, nextSteps: boolean, [key: string]: boolean }} collapsedSections
 * @property {boolean} showScrollTop
 * @property {boolean} parsingExcel
 * @property {boolean} staleInstance
 * @property {string} appVersion
 * @property {string} rulesVersion
 * @property {string} thresholdsVersion
 * @property {{ label: string, className: string } | null} activePayrollPill
 * @property {{ label: string, className: string } | null} activePensionPill
 * @property {{ workerType: string, typicalDays: number, statutoryHolidayDays: number | null, leaveYearStartMonth: number }} workerProfile
 * @property {boolean} _updatingWorkerProfile
 * @property {number} holCalcHours
 * @property {number} holCalcRate
 * @property {number} holCalcDaysTaken
 * @property {number} holCalcWorkDays
 * @property {string} holCalcMode
 * @property {number} holCalcGross
 */

/**
 * @typedef {PayrollAppState &
 *   import('vue').ComponentPublicInstance<PayrollAppState> &
 *   { $refs: { aboutDialog?: HTMLDialogElement, holCalcDialog?: HTMLDialogElement } } &
 *   {
 *     stageFiles(files: File[]): void,
 *     handleFiles(event: Event): Promise<void>,
 *     onDragOver(event: DragEvent): void,
 *     onDragLeave(event: DragEvent): void,
 *     onDrop(event: DragEvent): Promise<void>,
 *     processFiles(files: File[]): Promise<void>,
 *     resetReportState(): void,
 *     downloadPdf(): Promise<void>,
 *     handleScroll(): void,
 *     scrollToTop(): void,
 *     openDialog(refName: string): void,
 *     closeDialog(refName: string): void,
 *     onDialogClose(): void,
 *     onDialogBackdropClick(refName: string, event: MouseEvent): void,
 *     openHolCalc(): void,
 *     holCalcAvgWeekly: string,
 *     holCalcExpectedWeeklyPay: string,
 *     holCalcExpectedHours: string,
 *     holCalcExpectedPay: string,
 *     holCalcEntitlementHours: string,
 *     holCalcSuggestedStatutoryDays: number | null,
 *     canRunReport: boolean,
 *     canShare: boolean,
 *     suggestedStatutoryDays: number | null,
 *     isZeroHoursWorker: boolean,
 *     entitlementBelowMinimum: boolean,
 *     statutoryHolidayInputValue: string | number,
 *     updateStatutoryHolidayDays(event: Event): void,
 *     sharePdf(): Promise<void>,
 *     setSectionCollapsed(sectionKey: string, isCollapsed: boolean): void,
 *     toggleSection(sectionKey: string): void,
 *     expandSection(sectionKey: string): void,
 *     handleSectionFocus(sectionKey: string): void,
 *     syncCollapseShellState(sectionKey: string): void,
 *     handleAnimatedDetailsClick(event: MouseEvent): void,
 *     _onOnline: (() => void),
 *     _onOffline: (() => void),
 *   }
 * } PayrollAppInstance
 */
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

/** @returns {void} */
export function initPayrollApp() {
    const appConfig = defineComponent(
        /** @type {any} */ ({
            components: {
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
                        typicalDays: 0,
                        statutoryHolidayDays: null,
                        leaveYearStartMonth: 4,
                    },
                    _updatingWorkerProfile: false,
                    holCalcHours: 0,
                    holCalcRate: 0,
                    holCalcDaysTaken: 1,
                    holCalcWorkDays: 0,
                    holCalcMode: 'hourly',
                    holCalcGross: 0,
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
                        workerProfile: '',
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
                    rulesVersion: RULES_VERSION,
                    thresholdsVersion: THRESHOLDS_VERSION,
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
                holCalcAvgWeekly,
                holCalcExpectedWeeklyPay,
                holCalcExpectedHours,
                holCalcExpectedPay,
                holCalcGrossExpectedPay,
                holCalcGrossWeeklyPay,
                holCalcEntitlementHours,
                holCalcSuggestedStatutoryDays,
                progressPercent,
                canRunReport,
                canShare,
                suggestedStatutoryDays,
                isZeroHoursWorker,
                entitlementBelowMinimum,
                statutoryHolidayInputValue,
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
                        (this.workerProfile.statutoryHolidayDays ===
                            prevSuggestion ||
                            this.workerProfile.statutoryHolidayDays === null) &&
                        newSuggestion !== null
                    ) {
                        this._updatingWorkerProfile = true
                        this.workerProfile.statutoryHolidayDays = newSuggestion
                        this.$nextTick(() => {
                            this._updatingWorkerProfile = false
                        })
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
                updateStatutoryHolidayDays,
                parseContributionDate,
                normalizeContributionType,
                parseContributionFiles,
                copyDebugOutput,
                runReport,
                clearUploads,
                resetReportState,
                processFiles,
                printReport,
                downloadPdf,
                sharePdf,
                openDialog,
                closeDialog,
                onDialogClose,
                onDialogBackdropClick,
                openHolCalc,
                setSectionCollapsed,
                toggleSection,
                expandSection,
                handleSectionFocus,
                syncCollapseShellState,
                handleAnimatedDetailsClick,
                handleScroll,
                scrollToTop,
                stageFiles,
                handleFiles,
                onDragOver,
                onDragLeave,
                onDrop,
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
                initConnectivityHandlers.call(this)

                this.appVersion = getAppVersionFromDemoLink()

                if (
                    DEBUG_LEVEL === '2' ||
                    DEBUG_LEVEL === '3' ||
                    DEBUG_LEVEL === '4'
                ) {
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
                                        : 0,
                                statutoryHolidayDays:
                                    typeof parsed.statutoryHolidayDays ===
                                    'number'
                                        ? parsed.statutoryHolidayDays
                                        : null,
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

                initUiHelpers.call(this)
                initServiceWorkerUpdates.call(this)
                initScrollListener.call(this)
            },
        })
    )

    const app = createApp(appConfig)
    app.component('AboutContent', AboutContent)
    app.mount('#app')
}
