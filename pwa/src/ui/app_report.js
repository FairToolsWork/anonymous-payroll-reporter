import { ACTIVE_PAYROLL_FORMAT } from '../parse/active_format.js'
import { RULES_VERSION, THRESHOLDS_VERSION } from '../report/uk_thresholds.js'
import { UNKNOWN_APP_VERSION } from './app_version.js'
import { loadXlsx } from './app_xlsx.js'
import { logMemoryUsage, MEMORY_LOG_EVERY, timingApi } from './debug_tools.js'

/** @type {Promise<any> | null} */
let reportWorkflowPromise = null
/** @type {Promise<any> | null} */
let patternsPromise = null
/** @type {Promise<any> | null} */
let runSnapshotPromise = null

export function loadReportWorkflow() {
    if (!reportWorkflowPromise) {
        reportWorkflowPromise = import('../report/report_workflow.js')
    }
    return reportWorkflowPromise
}

export function loadPatterns() {
    if (!patternsPromise) {
        patternsPromise = ACTIVE_PAYROLL_FORMAT.patterns().then((PATTERNS) => ({
            PATTERNS,
        }))
    }
    return patternsPromise
}

export function loadRunSnapshot() {
    if (!runSnapshotPromise) {
        runSnapshotPromise = import('../report/run_snapshot.js')
    }
    return runSnapshotPromise
}

/**
 * @param {string} reportHtml
 * @param {string} appVersion
 * @param {{ rulesVersion?: string, thresholdsVersion?: string } | null} [auditMetadata=null]
 * @returns {string}
 */
export function injectReportVersionFootnote(
    reportHtml,
    appVersion,
    auditMetadata = null
) {
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
    const rulesVersionLabel = auditMetadata?.rulesVersion || RULES_VERSION
    const thresholdsVersionLabel =
        auditMetadata?.thresholdsVersion || THRESHOLDS_VERSION
    const versionMarkup = `<p class="report-footnote">Release: ${versionLabel} Rules: ${rulesVersionLabel} · Thresholds: ${thresholdsVersionLabel}</p>`
    return (
        reportHtml.slice(0, pageCloseIndex) +
        versionMarkup +
        reportHtml.slice(pageCloseIndex)
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {Promise<void>}
 */
export async function runReport() {
    if (!this.canRunReport) {
        return
    }
    const pdfFiles = this.stagedFiles
        .filter((/** @type {{ type: string }} */ item) => item.type === 'pdf')
        .map((/** @type {{ file: File }} */ item) => item.file)
    const excelFiles = this.stagedFiles
        .filter((/** @type {{ type: string }} */ item) => item.type === 'xlsx')
        .map((/** @type {{ file: File }} */ item) => item.file)
    this.contributionFiles = excelFiles
    this.fileCount = pdfFiles.length
    await this.processFiles(pdfFiles)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {void}
 */
export function clearUploads() {
    this.stagedFiles = []
    this.stagedPdfCount = 0
    this.stagedExcelCount = 0
    this.contributionFiles = []
    this.fileCount = 0
    this.resetReportState()
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {void}
 */
export function resetReportState() {
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
        workerProfile: '',
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
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {number}
 */
export function progressPercent() {
    if (!this.progress.total) {
        return 0
    }
    return Math.round((this.progress.current / this.progress.total) * 100)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {boolean}
 */
export function canRunReport() {
    return (
        this.stagedPdfCount > 0 &&
        this.acceptedDisclaimer &&
        this.status !== 'processing'
    )
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @returns {boolean}
 */
export function canShare() {
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
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {File[]} files
 * @returns {Promise<void>}
 */
export async function processFiles(files) {
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
    let timingFlushed = false
    /**
     * @param {string} outcome
     * @param {Record<string, any> | null} [meta=null]
     */
    const flushRunTiming = (outcome, meta = null) => {
        if (!timingApi.enabled || timingFlushed) {
            return
        }
        timingFlushed = true
        timingApi.end('run.total')
        timingApi.setMeta('run.outcome', outcome)
        if (meta && typeof meta === 'object') {
            Object.entries(meta).forEach(([key, value]) => {
                timingApi.setMeta(key, value)
            })
        }
        timingApi.flush('run.total')
    }
    if (timingApi.enabled) {
        timingApi.reset()
        timingApi.setMeta('run.pdfFiles', files.length)
        timingApi.setMeta('run.excelFiles', this.contributionFiles.length)
        timingApi.start('run.total')
    }
    logMemoryUsage('run-start')
    console.info('Payroll: starting processing', {
        files: files.length,
    })

    let workflowResult = null
    let loggedExcelStart = false
    try {
        const XLSX = await loadXlsx()
        const { runPayrollReportWorkflow } = await loadReportWorkflow()
        this.parsingExcel = this.contributionFiles.length > 0
        if (this.parsingExcel) {
            console.info('Payroll: parsing Excel contribution history', {
                files: this.contributionFiles.map(
                    (/** @type {File} */ file) => file.name || 'Unknown'
                ),
            })
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
            console.info('Payroll: PDF extraction debug captured')
        }
        if (this.debugEnabled && workflowResult?.contributionData) {
            console.info('Payroll: Excel contribution history parsed', {
                entries: workflowResult?.contributionData?.entries?.length || 0,
            })
        }
    } catch (err) {
        const e = /** @type {any} */ (err)
        console.error('Payroll: extraction failed', {
            message: e?.message,
            error: e,
        })
        if (e && e.message === 'PASSWORD_REQUIRED') {
            this.error =
                'ERROR: A password is required for one or more of the uploaded PDF(s). Enter a password and try again.'
            document.getElementById('pdf-password')?.focus()
        } else if (e && e.message === 'INCORRECT_PASSWORD') {
            const fileLabel = e?.fileName ? ` for ${e.fileName}` : ''
            this.error = `Incorrect password${fileLabel}. Please re-enter the PDF password.`
            document.getElementById('pdf-password')?.focus()
        } else if (e?.message === 'XLSX_NOT_AVAILABLE') {
            this.error =
                'Excel parser is not available. Please refresh and try again.'
        } else if (e?.message === 'CONTRIBUTION_SHEET_MISSING') {
            this.error =
                "Excel file is missing the 'Contribution Details' sheet."
        } else if (e?.message === 'CONTRIBUTION_FILE_FAILURES') {
            const failureDetails = (e?.failures || []).map(
                (
                    /** @type {import('./app.js').ContributionFailure} */ failure
                ) => {
                    const reason =
                        failure.code === 'CONTRIBUTION_SHEET_MISSING'
                            ? "missing 'Contribution Details' sheet"
                            : failure.code === 'CONTRIBUTION_HEADER_INVALID'
                              ? 'headers do not match expected format'
                              : failure.code === 'CONTRIBUTION_NO_ROWS'
                                ? 'no valid contribution rows'
                                : failure.code === 'CONTRIBUTION_EMPLOYER_MIXED'
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
        } else if (e?.message === 'CONTRIBUTION_HEADER_INVALID') {
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
        flushRunTiming('error', {
            'run.errorMessage': e?.message || 'UNKNOWN_ERROR',
        })
        this.status = 'idle'
        return
    } finally {
        this.parsingExcel = false
    }

    this.failedFiles = workflowResult?.failedFiles || []
    this.failedPayPeriods = workflowResult?.failedPayPeriods || []
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
        this.error = this.error || 'No payroll data was extracted.'
        console.warn('Payroll: no records extracted', {
            files: files.length,
            error: this.error,
        })
        flushRunTiming('no-records', {
            'run.records': 0,
            'run.failedFiles': this.failedFiles.length,
            'run.failedPayPeriods': this.failedPayPeriods.length,
            'run.errorMessage': this.error,
        })
        return
    }

    if (this.debugEnabled && workflowResult?.debug) {
        if (!this.debugInfo.pdfSource) {
            this.debugInfo.pdfSource = files[0]?.name || 'Unknown'
        }
        if (!this.debugText) {
            this.debugText = workflowResult.debug.text
        }
        if (!this.debugInfo.workerProfile) {
            this.debugInfo.workerProfile = JSON.stringify(
                this.workerProfile,
                null,
                2
            )
        }
        if (workflowResult?.excelDebug) {
            if (!this.debugInfo.excelSource) {
                this.debugInfo.excelSource =
                    workflowResult.excelDebug.source || 'Unknown'
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
                debugRecord.imageData = debugRecord.imageData.startsWith(marker)
                    ? `${marker}<truncated>`
                    : '<truncated>'
            }
            this.debugInfo.parsed = JSON.stringify(debugRecord, null, 2)
            const { PATTERNS } = await loadPatterns()
            this.debugInfo.matches = JSON.stringify(
                {
                    nameDateId:
                        this.debugText.match(PATTERNS.nameDateId)?.[0] || null,
                    employerLine:
                        this.debugText.match(PATTERNS.employerLine)?.[0] ||
                        null,
                    payeTax:
                        this.debugText.match(PATTERNS.payeTax)?.[0] || null,
                    nationalInsurance:
                        this.debugText.match(PATTERNS.natIns)?.[0] || null,
                    pensionEmployee:
                        this.debugText.match(PATTERNS.pensionEe)?.[0] || null,
                    pensionEmployer:
                        this.debugText.match(PATTERNS.pensionEr)?.[0] || null,
                    earningsForNI:
                        this.debugText.match(PATTERNS.earningsNi)?.[0] || null,
                    grossForTax:
                        this.debugText.match(PATTERNS.grossTax)?.[0] || null,
                    totalGrossPay:
                        this.debugText.match(PATTERNS.totalGrossPay)?.[0] ||
                        null,
                    payCycle:
                        this.debugText.match(PATTERNS.payCycle)?.[0] || null,
                    totalGrossPayTD:
                        this.debugText.match(PATTERNS.totalGrossPayTd)?.[0] ||
                        null,
                    grossForTaxTD:
                        this.debugText.match(PATTERNS.grossTaxTd)?.[0] || null,
                    taxPaidTD:
                        this.debugText.match(PATTERNS.taxPaidTd)?.[0] || null,
                    earningsForNITD:
                        this.debugText.match(PATTERNS.earningsNiTd)?.[0] ||
                        null,
                    nationalInsuranceTD:
                        this.debugText.match(PATTERNS.niTd)?.[0] || null,
                    employeePensionTD:
                        this.debugText.match(PATTERNS.pensionEeTd)?.[0] || null,
                    employerPensionTD:
                        this.debugText.match(PATTERNS.pensionErTd)?.[0] || null,
                    netPay: this.debugText.match(PATTERNS.netPay)?.[0] || null,
                },
                null,
                2
            )
        }
    }

    const report = workflowResult.report
    if (!report) {
        this.status = 'idle'
        this.error = this.error || 'No payroll data was extracted.'
        flushRunTiming('no-report', {
            'run.records': records.length,
            'run.failedFiles': this.failedFiles.length,
            'run.failedPayPeriods': this.failedPayPeriods.length,
            'run.errorMessage': this.error,
        })
        return
    }

    this.status = 'rendering'
    this.reportHtml = injectReportVersionFootnote(
        report.html,
        this.appVersion,
        report.context?.auditMetadata || null
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
                workflowResult?.contributionData || null,
                { includeFlagDetails: true, includePayeDiagnostics: true }
            ),
            null,
            2
        )
    }
    this.employeeName = records[0]?.employee?.name || 'Unknown'
    this.reportStats = /** @type {import('./app.js').ReportStats} */ ({
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
    flushRunTiming('done', {
        'run.records': records.length,
        'run.failedFiles': this.failedFiles.length,
        'run.failedPayPeriods': this.failedPayPeriods.length,
    })
    this.stagedFiles = []
    this.stagedPdfCount = 0
    this.stagedExcelCount = 0
    this.contributionFiles = []
    this.$nextTick(() => {
        logMemoryUsage('run-finished')
        document.getElementById('report-summary')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        })
        document.getElementById('download-pdf-btn')?.focus()
    })
    this.handleScroll()
}
