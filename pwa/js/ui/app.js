/**
 * @typedef {import("../parse/payroll.types").PayrollRecord} PayrollRecord
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
 * @property {number} contributionFileCount
 * @property {File[]} contributionFiles
 * @property {Array<{ id: string, name: string, type: "pdf" | "xlsx", file: File }>} stagedFiles
 * @property {number} stagedPdfCount
 * @property {number} stagedExcelCount
 * @property {string} reportHtml
 * @property {string} reportTimestamp
 * @property {boolean} reportReady
 * @property {string} suggestedFilename
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
 * @property {{ parsed: string, matches: string, excelSource: string, excelRows: string, excelParsed: string }} debugInfo
 * @property {boolean} debugCopySuccess
 * @property {number | null} debugCopyResetTimer
 * @property {boolean} acceptedDisclaimer
 * @property {boolean} showScrollTop
 * @property {boolean} parsingExcel
 */

import { parseContributionWorkbook } from '../parse/contribution_validation.js'
import { PATTERNS } from '../parse/parser_config.js'
import { parsePayrollPdf } from '../parse/pdf_validation.js'
import { buildReport } from '../report/build.js'

/** @type {string | null} */
const DEBUG_LEVEL = new URLSearchParams(window.location.search).get('debug')
/** @type {boolean} */
const DEBUG_ENABLED = DEBUG_LEVEL === '1' || DEBUG_LEVEL === '2'
/** @type {boolean} */
const DEBUG_PERSIST_PASSWORD = DEBUG_LEVEL === '2'

/** @returns {void} */
export function initPayrollApp() {
    const app = Vue.createApp({
        /** @returns {PayrollAppState} */
        data() {
            return {
                pdfPassword: '',
                status: 'idle',
                progress: { current: 0, total: 0 },
                fileCount: 0,
                contributionFileCount: 0,
                contributionFiles: [],
                stagedFiles: [],
                stagedPdfCount: 0,
                stagedExcelCount: 0,
                reportHtml: '',
                reportTimestamp: '',
                reportReady: false,
                suggestedFilename: '',
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
                dragActive: false,
                debugEnabled: DEBUG_ENABLED,
                error: '',
                updateAvailable: false,
                waitingWorker: null,
                swRegistration: null,
                debugText: '',
                notice: '',
                failedFiles: [],
                failedPayPeriods: [],
                debugInfo: {
                    parsed: '',
                    matches: '',
                    excelSource: '',
                    excelRows: '',
                    excelParsed: '',
                },
                debugCopySuccess: false,
                debugCopyResetTimer: null,
                acceptedDisclaimer: false,
                showScrollTop: false,
                parsingExcel: false,
            }
        },
        computed: {
            /** @returns {number} */
            progressPercent() {
                if (!this.progress.total) {
                    return 0
                }
                return Math.round(
                    (this.progress.current / this.progress.total) * 100
                )
            },
            /** @returns {boolean} */
            canRunReport() {
                return (
                    this.stagedPdfCount > 0 &&
                    this.acceptedDisclaimer &&
                    this.status !== 'processing'
                )
            },
        },
        watch: {
            /** @param {string} value */
            pdfPassword(value) {
                if (!DEBUG_PERSIST_PASSWORD) {
                    return
                }
                if (value) {
                    sessionStorage.setItem('pdf_password_debug', value)
                    return
                }
                sessionStorage.removeItem('pdf_password_debug')
            },
        },
        methods: {
            /** @param {Event} event */
            handleContributionFiles(event) {
                const input = /** @type {HTMLInputElement} */ (event.target)
                const rawFiles = Array.from(input.files || [])
                if (!rawFiles.length) {
                    return
                }
                const files = rawFiles.filter((file) => {
                    const name = file.name || ''
                    return (
                        file.type ===
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                        name.toLowerCase().endsWith('.xlsx')
                    )
                })
                if (files.length !== rawFiles.length) {
                    this.error =
                        'One or more of your uploaded files was not an XLSX. Please try again.'
                    input.value = ''
                    return
                }
                this.contributionFiles = files
                this.contributionFileCount = files.length
                input.value = ''
            },
            /** @param {File[]} rawFiles */
            stageFiles(rawFiles) {
                const files = rawFiles.filter(Boolean)
                if (!files.length) {
                    return
                }
                const staged = []
                const invalid = []
                const existingIds = new Set(
                    this.stagedFiles.map((item) => item.id)
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
                    (item) => item.type === 'pdf'
                ).length
                this.stagedExcelCount = this.stagedFiles.filter(
                    (item) => item.type === 'xlsx'
                ).length
                this.contributionFileCount = this.stagedExcelCount
            },
            /** @param {unknown} value */
            parseContributionDate(value) {
                if (value instanceof Date) {
                    return value
                }
                if (
                    typeof value === 'number' &&
                    window.XLSX?.SSF?.parse_date_code
                ) {
                    const parsed = window.XLSX.SSF.parse_date_code(value)
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
            /** @param {unknown} value */
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
            /** @param {File[]} files */
            async parseContributionFiles(files) {
                if (!files || !files.length) {
                    return null
                }
                if (!window.XLSX) {
                    throw new Error('XLSX_NOT_AVAILABLE')
                }
                /** @type {ContributionEntry[]} */
                const entries = []
                const failures = []
                for (const file of files) {
                    try {
                        const buffer = await file.arrayBuffer()
                        const workbook = window.XLSX.read(buffer, {
                            type: 'array',
                        })
                        const parsed = parseContributionWorkbook(
                            workbook,
                            file.name || 'Unknown',
                            window.XLSX
                        )
                        entries.push(...parsed.entries)
                        if (this.debugEnabled && !this.debugInfo.excelRows) {
                            this.debugInfo.excelSource = file.name || 'Unknown'
                            this.debugInfo.excelRows = JSON.stringify(
                                parsed.debugRows || [],
                                null,
                                2
                            )
                        }
                        if (this.debugEnabled && !this.debugInfo.excelParsed) {
                            this.debugInfo.excelParsed = JSON.stringify(
                                parsed.debugEntries || [],
                                null,
                                2
                            )
                        }
                    } catch (err) {
                        failures.push({
                            name: file.name || 'Unknown',
                            code: err?.message || 'UNKNOWN',
                            employers: err?.employers || [],
                            missingTypes: err?.missingTypes || [],
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
                    sourceFiles: files.map((file) => file.name || 'Unknown'),
                }
            },
            /** @returns {Promise<void>} */
            async copyDebugOutput() {
                const payload = [
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
                ].join('\n\n')

                try {
                    await navigator.clipboard.writeText(payload)
                    console.log('Debug output copied to clipboard')
                } catch {
                    const textarea = document.createElement('textarea')
                    textarea.value = payload
                    textarea.setAttribute('readonly', '')
                    textarea.style.position = 'absolute'
                    textarea.style.left = '-9999px'
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
            /** @param {DragEvent} event */
            onDragOver(event) {
                event.preventDefault()
                if (this.status === 'processing') {
                    return
                }
                this.dragActive = true
            },
            /** @param {DragEvent} event */
            onDragLeave(event) {
                event.preventDefault()
                const currentTarget = /** @type {HTMLElement} */ (
                    event.currentTarget
                )
                const relatedTarget = /** @type {Node | null} */ (
                    event.relatedTarget
                )
                if (relatedTarget && currentTarget.contains(relatedTarget)) {
                    return
                }
                this.dragActive = false
            },
            /** @param {DragEvent} event */
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
                    .filter(Boolean)
                const rawFiles = itemFiles.length
                    ? itemFiles
                    : Array.from(event.dataTransfer?.files || [])
                this.stageFiles(rawFiles)
            },
            /** @param {Event} event */
            async handleFiles(event) {
                const input = /** @type {HTMLInputElement} */ (event.target)
                const rawFiles = Array.from(input.files || [])
                if (!rawFiles.length) {
                    return
                }
                this.stageFiles(rawFiles)
                input.value = ''
            },
            /** @returns {Promise<void>} */
            async runReport() {
                if (!this.canRunReport) {
                    return
                }
                const pdfFiles = this.stagedFiles
                    .filter((item) => item.type === 'pdf')
                    .map((item) => item.file)
                const excelFiles = this.stagedFiles
                    .filter((item) => item.type === 'xlsx')
                    .map((item) => item.file)
                this.contributionFiles = excelFiles
                this.fileCount = pdfFiles.length
                await this.processFiles(pdfFiles)
            },
            /** @returns {void} */
            clearUploads() {
                this.stagedFiles = []
                this.stagedPdfCount = 0
                this.stagedExcelCount = 0
                this.contributionFiles = []
                this.fileCount = 0
                this.contributionFileCount = 0
                this.resetReportState()
            },
            /** @returns {void} */
            resetReportState() {
                this.status = 'idle'
                this.error = ''
                this.notice = ''
                this.reportHtml = ''
                this.reportReady = false
                this.debugText = ''
                this.debugInfo = {
                    parsed: '',
                    matches: '',
                    excelSource: '',
                    excelRows: '',
                    excelParsed: '',
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
            /** @param {File[]} files */
            async processFiles(files) {
                if (!this.acceptedDisclaimer) {
                    this.status = 'idle'
                    this.error =
                        'Please accept the accuracy disclaimer before running the report.'
                    return
                }
                this.resetReportState()
                this.status = 'processing'
                this.progress = { current: 0, total: files.length }
                console.info('Payroll: starting processing', {
                    files: files.length,
                })

                /** @type {PayrollRecordCollection} */
                const records = []
                let stopProcessing = false

                for (let i = 0; i < files.length; i += 1) {
                    const file = files[i]
                    this.progress.current = i + 1
                    try {
                        console.info('Payroll: extracting', {
                            index: i + 1,
                            name: file.name,
                        })
                        const record = await this.extractPayrollRecord(
                            file,
                            i === 0
                        )
                        if (record) {
                            records.push(record)
                            console.info('Payroll: extracted', {
                                name: record.employee?.name,
                                period: record.payrollDoc?.processDate?.date,
                            })
                        } else if (!this.failedFiles.includes(file.name)) {
                            this.failedFiles.push(file.name)
                        }
                    } catch (err) {
                        console.error('Payroll: extraction failed', {
                            name: file.name,
                            message: err?.message,
                            error: err,
                        })
                        if (err && err.message === 'PASSWORD_REQUIRED') {
                            this.error =
                                'A password is required for one or more of the uploaded PDF(s). Enter a password and try again.'
                            document.getElementById('pdf-password')?.focus()
                            stopProcessing = true
                        } else if (
                            err &&
                            err.message === 'INCORRECT_PASSWORD'
                        ) {
                            this.error = `Incorrect password for ${file.name}. Please re-enter the PDF password.`
                            document.getElementById('pdf-password')?.focus()
                            stopProcessing = true
                        } else {
                            this.error = `Failed to read the following files:`
                            this.failedFiles.push(file.name)
                        }
                    }
                    if (stopProcessing) {
                        break
                    }
                }

                if (stopProcessing) {
                    this.status = 'idle'
                    return
                }

                console.info('Payroll: failed files summary', {
                    count: this.failedFiles.length,
                    files: [...this.failedFiles],
                })

                if (this.failedFiles.length && !this.error) {
                    this.error = `Failed to read ${this.failedFiles.length} PDF(s).`
                }

                if (!records.length) {
                    this.status = 'idle'
                    this.error = this.error || 'No payroll data was extracted.'
                    console.warn('Payroll: no records extracted', {
                        files: files.length,
                        error: this.error,
                    })
                    return
                }

                let contributionData = null
                try {
                    this.parsingExcel = this.contributionFiles.length > 0
                    if (this.parsingExcel) {
                        console.info(
                            'Payroll: parsing Excel contribution history',
                            {
                                files: this.contributionFiles.map(
                                    (file) => file.name || 'Unknown'
                                ),
                            }
                        )
                    }
                    contributionData = await this.parseContributionFiles(
                        this.contributionFiles
                    )
                    if (this.debugEnabled) {
                        console.info(
                            'Payroll: Excel contribution history parsed',
                            {
                                entries: contributionData?.entries?.length || 0,
                            }
                        )
                    }
                } catch (err) {
                    console.warn('Payroll: contribution parsing failed', {
                        message: err?.message,
                        error: err,
                    })
                    if (err?.message === 'XLSX_NOT_AVAILABLE') {
                        this.error =
                            'Excel parser is not available. Please refresh and try again.'
                    } else if (err?.message === 'CONTRIBUTION_SHEET_MISSING') {
                        this.error =
                            "Excel file is missing the 'Contribution Details' sheet."
                    } else if (err?.message === 'CONTRIBUTION_FILE_FAILURES') {
                        const failureDetails = (err?.failures || []).map(
                            (failure) => {
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
                    } else if (err?.message === 'CONTRIBUTION_HEADER_INVALID') {
                        this.error =
                            'Excel file headers do not match the expected format (Date, Type, Amount).'
                    } else if (err?.message === 'CONTRIBUTION_NO_ROWS') {
                        this.error =
                            'Excel file contains no valid contribution rows. Check the sheet formatting.'
                    } else {
                        this.error =
                            'Failed to read contribution history Excel file(s). The report was not generated.'
                    }
                    this.status = 'idle'
                    return
                } finally {
                    this.parsingExcel = false
                }
                records.contributionData = contributionData

                this.status = 'rendering'
                const report = buildReport(records, this.failedPayPeriods)
                this.reportHtml = report.html
                this.reportReady = true
                this.status = 'done'
                this.reportTimestamp = new Date().toLocaleString('en-GB')
                this.suggestedFilename = report.filename
                this.reportStats = {
                    ...this.reportStats,
                    ...report.stats,
                    contributionMeta: {
                        ...this.reportStats.contributionMeta,
                        ...(report.stats?.contributionMeta || {}),
                    },
                }
                document.title = report.filename
                console.info('Payroll: report ready', {
                    filename: report.filename,
                })
                this.$nextTick(() => {
                    document
                        .getElementById('report-summary')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    document.getElementById('print-report-btn')?.focus()
                })
                this.handleScroll()
            },
            /**
             * @param {File} file
             * @param {boolean} captureDebug
             * @returns {Promise<PayrollRecordWithImage | null>}
             */
            async extractPayrollRecord(file, captureDebug) {
                const { record: payrollRecord, debug } = await parsePayrollPdf(
                    file,
                    this.pdfPassword
                )
                if (this.debugEnabled && captureDebug && !this.debugText) {
                    this.debugText = debug.text
                }
                payrollRecord.imageData = debug.imageData

                const employeeName = payrollRecord.employee?.name || null
                const employer = payrollRecord.employer || null
                const payPeriod =
                    payrollRecord.payrollDoc?.processDate?.date || null

                if (
                    this.debugEnabled &&
                    captureDebug &&
                    this.debugText &&
                    !this.debugInfo.parsed
                ) {
                    const debugRecord = { ...payrollRecord }
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
                    this.debugInfo.parsed = JSON.stringify(debugRecord, null, 2)
                    this.debugInfo.matches = JSON.stringify(
                        {
                            nameDateId:
                                debug.text.match(PATTERNS.nameDateId)?.[0] ||
                                null,
                            employerLine:
                                debug.text.match(PATTERNS.employerLine)?.[0] ||
                                null,
                            payeTax:
                                debug.text.match(PATTERNS.payeTax)?.[0] || null,
                            nationalInsurance:
                                debug.text.match(
                                    PATTERNS.nationalInsurance
                                )?.[0] || null,
                            nestEmployee:
                                debug.text.match(PATTERNS.nestEmployee)?.[0] ||
                                null,
                            nestEmployer:
                                debug.text.match(PATTERNS.nestEmployer)?.[0] ||
                                null,
                            earningsForNI:
                                debug.text.match(PATTERNS.earningsForNI)?.[0] ||
                                null,
                            grossForTax:
                                debug.text.match(PATTERNS.grossForTax)?.[0] ||
                                null,
                            totalGrossPay:
                                debug.text.match(PATTERNS.totalGrossPay)?.[0] ||
                                null,
                            payCycle:
                                debug.text.match(PATTERNS.payCycle)?.[0] ||
                                null,
                            totalGrossPayTD:
                                debug.text.match(
                                    PATTERNS.totalGrossPayTD
                                )?.[0] || null,
                            grossForTaxTD:
                                debug.text.match(PATTERNS.grossForTaxTD)?.[0] ||
                                null,
                            taxPaidTD:
                                debug.text.match(PATTERNS.taxPaidTD)?.[0] ||
                                null,
                            earningsForNITD:
                                debug.text.match(
                                    PATTERNS.earningsForNITD
                                )?.[0] || null,
                            nationalInsuranceTD:
                                debug.text.match(
                                    PATTERNS.nationalInsuranceTD
                                )?.[0] || null,
                            employeePensionTD:
                                debug.text.match(
                                    PATTERNS.employeePensionTD
                                )?.[0] || null,
                            employerPensionTD:
                                debug.text.match(
                                    PATTERNS.employerPensionTD
                                )?.[0] || null,
                            netPay:
                                debug.text.match(PATTERNS.netPay)?.[0] || null,
                        },
                        null,
                        2
                    )
                }

                if (!employeeName || !employer) {
                    console.warn('Payroll: missing required fields', {
                        name: employeeName,
                        employer,
                        payPeriod,
                    })
                    if (
                        payPeriod &&
                        !this.failedPayPeriods.includes(payPeriod)
                    ) {
                        this.failedPayPeriods.push(payPeriod)
                    }
                    return null
                }

                return payrollRecord
            },
            /** @returns {void} */
            printReport() {
                if (!this.reportReady) {
                    return
                }
                window.print()
            },
            /** @returns {void} */
            applyUpdate() {
                if (!this.waitingWorker) {
                    if (this.swRegistration) {
                        this.swRegistration.update()
                    }
                    window.location.reload()
                    return
                }
                if (!sessionStorage.getItem('sw_refresh_pending')) {
                    sessionStorage.setItem('sw_refresh_pending', 'true')
                    this.waitingWorker.postMessage({ type: 'SKIP_WAITING' })
                    setTimeout(() => {
                        window.location.reload()
                    }, 800)
                }
            },
            /** @returns {void} */
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
            /** @returns {void} */
            scrollToTop() {
                window.scrollTo({ top: 0, behavior: 'smooth' })
            },
        },
        /** @returns {void} */
        mounted() {
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
                    this.reportStats = {}
                }
                if (!this.reportStats.validationSummary) {
                    this.reportStats.validationSummary = {}
                }
                this.reportStats.validationSummary.flaggedPeriods = []
                console.info(
                    'Payroll: normalized reportStats.validationSummary.flaggedPeriods'
                )
            }
            if (DEBUG_PERSIST_PASSWORD) {
                this.acceptedDisclaimer = true
                this.pdfPassword =
                    sessionStorage.getItem('pdf_password_debug') || ''
            }
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker
                    .register('sw.js')
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
            window.addEventListener('scroll', this.handleScroll, {
                passive: true,
            })
        },
    })

    app.mount('#app')
}
