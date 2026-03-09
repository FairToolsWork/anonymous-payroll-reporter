import { parseContributionWorkbook } from '../parse/contribution_validation.js'
import { parsePayrollPdf } from '../parse/pdf_validation.js'
import { buildReport } from './build.js'

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
 *  includeReportContext?: boolean
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
    const totalSteps = pdfFiles.length + excelFiles.length

    /** @type {any[]} */
    const records = []
    let debug = null
    let excelDebug = null

    for (let i = 0; i < pdfFiles.length; i += 1) {
        const file = pdfFiles[i]
        if (typeof onProgress === 'function') {
            onProgress({ current: i + 1, total: totalSteps, file })
        }
        try {
            const { record: payrollRecord, debug: recordDebug } =
                await parsePayrollPdf(file, pdfPassword)
            if (captureDebug && !debug) {
                debug = recordDebug
            }
            payrollRecord.imageData = recordDebug.imageData

            const employeeName = payrollRecord.employee?.name || null
            const employer = payrollRecord.employer || null
            const payPeriod =
                payrollRecord.payrollDoc?.processDate?.date || null

            if (requireEmployeeDetails && (!employeeName || !employer)) {
                if (payPeriod && !failedPayPeriods.includes(payPeriod)) {
                    failedPayPeriods.push(payPeriod)
                }
                if (!failedFiles.includes(file.name)) {
                    failedFiles.push(file.name)
                }
                continue
            }

            records.push(payrollRecord)
        } catch (err) {
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
        /** @type {Array<{ date: Date, type: "ee" | "er", amount: number }>} */
        const entries = []
        const failures = []
        const startIndex = pdfFiles.length
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
                const buffer = await file.arrayBuffer()
                const workbook = xlsx.read(buffer, { type: 'array' })
                const parsed = parseContributionWorkbook(
                    workbook,
                    file.name || 'Unknown',
                    xlsx
                )
                entries.push(...parsed.entries)
                if (captureDebug && !excelDebug) {
                    excelDebug = {
                        source: file.name || 'Unknown',
                        rows: parsed.debugRows || [],
                        entries: parsed.debugEntries || [],
                    }
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

    const report =
        records.length > 0
            ? buildReport(records, failedPayPeriods, contributionData)
            : null
    const reportContext = includeReportContext && report ? report.context : null

    return {
        records,
        report,
        failedFiles,
        failedPayPeriods,
        contributionData,
        debug,
        excelDebug,
        reportContext,
    }
}
