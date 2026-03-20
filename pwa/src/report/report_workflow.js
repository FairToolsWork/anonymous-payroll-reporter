import { ACTIVE_PENSION_FORMAT } from '../parse/active_format.js'
import { parsePayrollPdf } from '../parse/pdf_validation.js'
import { buildReport } from './build.js'

const timing = /** @type {any} */ (globalThis).__payrollTiming || null

/**
 * @param {{
 *  pdfFiles: File[],
 *  excelFiles?: File[],
 *  pdfPassword?: string,
 *  xlsx?: any,
 *  failedPayPeriods?: string[],
 *  failedFiles?: string[],
 *  captureDebug?: boolean,
 *  onProgress?: (info: { current: number, total: number, file: File }) => void,
 *  requireEmployeeDetails?: boolean,
 *  includeReportContext?: boolean,
 *  workerProfile?: { workerType?: string, typicalDays?: number, statutoryHolidayDays?: number, leaveYearStartMonth?: number } | null
 * }} options
 * @returns {Promise<{
 *  records: any[],
 *  report: { html: string, filename: string, stats: any } | null,
 *  failedFiles: string[],
 *  failedPayPeriods: string[],
 *  contributionData: { entries: Array<{ date: Date, type: "ee" | "er", amount: number }>, sourceFiles: string[] } | null,
 *  debug: { text: string, lines: string[], lineItems: Array<any>, imageData: string | null } | null,
 *  excelDebug: { source: string, rows: unknown[], entries: Array<{ date: Date, type: "ee" | "er", amount: number }> } | null,
 *  reportContext?: {
 *      entries: any[],
 *      yearGroups: Map<string, any[]>,
 *      yearKeys: Array<string>,
 *      contributionSummary: any | null,
 *      missingMonths: any,
 *      validationSummary: any,
 *      contributionTotals: any
 *  } | null
 * }>}
 */
export async function runPayrollReportWorkflow(options) {
    const pdfFiles = Array.isArray(options?.pdfFiles) ? options.pdfFiles : []
    const excelFiles = Array.isArray(options?.excelFiles)
        ? options.excelFiles
        : []
    const pdfPassword = options?.pdfPassword || ''
    const xlsx = options?.xlsx || null
    const failedPayPeriods = Array.isArray(options?.failedPayPeriods)
        ? [...options.failedPayPeriods]
        : []
    const failedFiles = Array.isArray(options?.failedFiles)
        ? [...options.failedFiles]
        : []
    const captureDebug = Boolean(options?.captureDebug)
    const onProgress = options?.onProgress
    const requireEmployeeDetails = options?.requireEmployeeDetails !== false
    const includeReportContext = Boolean(options?.includeReportContext)
    const workerProfile = options?.workerProfile ?? null
    const totalSteps = pdfFiles.length + excelFiles.length

    /** @type {any[]} */
    const records = []
    let debug = null
    let excelDebug = null

    if (timing?.enabled) {
        timing.start('workflow.total')
        timing.setMeta('workflow.pdfFiles', pdfFiles.length)
        timing.setMeta('workflow.excelFiles', excelFiles.length)
    }

    try {
        if (timing?.enabled) {
            timing.start('workflow.pdf.total')
        }
        try {
            for (let i = 0; i < pdfFiles.length; i += 1) {
                const file = pdfFiles[i]
                if (typeof onProgress === 'function') {
                    onProgress({ current: i + 1, total: totalSteps, file })
                }
                try {
                    if (timing?.enabled) {
                        timing.start('workflow.pdf.file', {
                            'workflow.pdf.fileName': file.name || 'Unknown',
                        })
                    }
                    const { record: payrollRecord, debug: recordDebug } =
                        await parsePayrollPdf(file, pdfPassword)
                    if (timing?.enabled) {
                        timing.end('workflow.pdf.file')
                        timing.increment('workflow.pdf.success')
                    }
                    if (captureDebug && !debug) {
                        debug = recordDebug
                    }
                    payrollRecord.imageData = recordDebug.imageData

                    const employeeName = payrollRecord.employee?.name || null
                    const employer = payrollRecord.employer || null
                    const payPeriod =
                        payrollRecord.payrollDoc?.processDate?.date || null

                    if (
                        requireEmployeeDetails &&
                        (!employeeName || !employer)
                    ) {
                        if (
                            payPeriod &&
                            !failedPayPeriods.includes(payPeriod)
                        ) {
                            failedPayPeriods.push(payPeriod)
                        }
                        if (!failedFiles.includes(file.name)) {
                            failedFiles.push(file.name)
                        }
                        continue
                    }

                    records.push(payrollRecord)
                } catch (err) {
                    if (timing?.enabled) {
                        timing.end('workflow.pdf.file')
                        timing.increment('workflow.pdf.failure')
                    }
                    const e = /** @type {any} */ (err)
                    console.error('Payroll: PDF parse failed', {
                        file: file?.name || 'Unknown',
                        message: e?.message,
                        error: e,
                    })
                    if (e?.message === 'PASSWORD_REQUIRED') {
                        const passwordError =
                            /** @type {Error & { fileName?: string }} */ (
                                new Error('PASSWORD_REQUIRED')
                            )
                        passwordError.fileName = file.name
                        throw passwordError
                    }
                    if (e?.message === 'INCORRECT_PASSWORD') {
                        const passwordError =
                            /** @type {Error & { fileName?: string }} */ (
                                new Error('INCORRECT_PASSWORD')
                            )
                        passwordError.fileName = file.name
                        throw passwordError
                    }
                    if (!failedFiles.includes(file.name)) {
                        failedFiles.push(file.name)
                    }
                }
            }
        } finally {
            if (timing?.enabled) {
                timing.end('workflow.pdf.total')
                timing.setMeta('workflow.recordsAfterPdf', records.length)
            }
        }

        if (records.length > 1) {
            const employeeNames = new Set(
                records
                    .map((record) => record.employee?.name)
                    .filter((name) => name)
            )
            if (employeeNames.size > 1) {
                throw new Error('PAYROLL_EMPLOYEE_MIXED')
            }
            const employerNames = new Set(
                records.map((record) => record.employer).filter((name) => name)
            )
            if (employerNames.size > 1) {
                throw new Error('PAYROLL_EMPLOYER_MIXED')
            }
        }

        let contributionData = null
        if (excelFiles.length) {
            if (!xlsx) {
                throw new Error('XLSX_NOT_AVAILABLE')
            }
            const parseContributionWorkbook =
                await ACTIVE_PENSION_FORMAT.parser()
            /** @type {Array<{ date: Date, type: "ee" | "er", amount: number }>} */
            const entries = []
            const failures = []
            const startIndex = pdfFiles.length
            if (timing?.enabled) {
                timing.start('workflow.excel.total')
            }
            try {
                for (let i = 0; i < excelFiles.length; i += 1) {
                    const file = excelFiles[i]
                    if (typeof onProgress === 'function') {
                        onProgress({
                            current: startIndex + i + 1,
                            total: totalSteps,
                            file,
                        })
                    }
                    try {
                        if (timing?.enabled) {
                            timing.start('workflow.excel.file', {
                                'workflow.excel.fileName':
                                    file.name || 'Unknown',
                            })
                            timing.start('workflow.excel.file.buffer')
                        }
                        const buffer = await file.arrayBuffer()
                        if (timing?.enabled) {
                            timing.end('workflow.excel.file.buffer')
                            timing.start('workflow.excel.file.xlsxRead')
                        }
                        const workbook = xlsx.read(buffer, { type: 'array' })
                        if (timing?.enabled) {
                            timing.end('workflow.excel.file.xlsxRead')
                            timing.start('workflow.excel.file.parse')
                        }
                        const parsed = parseContributionWorkbook(
                            workbook,
                            file.name || 'Unknown',
                            xlsx
                        )
                        if (timing?.enabled) {
                            timing.end('workflow.excel.file.parse')
                            timing.end('workflow.excel.file')
                            timing.increment('workflow.excel.success')
                        }
                        entries.push(...parsed.entries)
                        if (captureDebug && !excelDebug) {
                            excelDebug = {
                                source: file.name || 'Unknown',
                                rows: parsed.debugRows || [],
                                entries: parsed.debugEntries || [],
                            }
                        }
                    } catch (err) {
                        if (timing?.enabled) {
                            timing.end('workflow.excel.file.buffer')
                            timing.end('workflow.excel.file.xlsxRead')
                            timing.end('workflow.excel.file.parse')
                            timing.end('workflow.excel.file')
                            timing.increment('workflow.excel.failure')
                        }
                        const e = /** @type {any} */ (err)
                        failures.push({
                            name: file.name || 'Unknown',
                            code: e?.message || 'UNKNOWN',
                            employers: e?.employers || [],
                            missingTypes: e?.missingTypes || [],
                        })
                    }
                }
            } finally {
                if (timing?.enabled) {
                    timing.end('workflow.excel.total')
                    timing.setMeta('workflow.excelEntries', entries.length)
                }
            }
            if (failures.length) {
                const error = /** @type {Error & { failures: any[] }} */ (
                    new Error('CONTRIBUTION_FILE_FAILURES')
                )
                error.failures = failures
                throw error
            }
            contributionData = {
                entries,
                sourceFiles: excelFiles.map((file) => file.name || 'Unknown'),
            }
        }

        let reportResult = null
        const buildReportTimingStarted = timing?.enabled && records.length > 0
        if (buildReportTimingStarted) {
            timing.start('workflow.buildReport')
        }
        try {
            reportResult =
                records.length > 0
                    ? buildReport(
                          records,
                          failedPayPeriods,
                          contributionData,
                          workerProfile
                      )
                    : null
        } finally {
            if (buildReportTimingStarted) {
                timing.end('workflow.buildReport')
            }
        }
        const reportContext =
            includeReportContext && reportResult ? reportResult.context : null

        return {
            records,
            report: reportResult,
            failedFiles,
            failedPayPeriods,
            contributionData,
            debug,
            excelDebug,
            reportContext,
        }
    } finally {
        if (timing?.enabled) {
            timing.end('workflow.total')
            timing.setMeta('workflow.failedFiles', failedFiles.length)
            timing.setMeta('workflow.failedPayPeriods', failedPayPeriods.length)
        }
    }
}
