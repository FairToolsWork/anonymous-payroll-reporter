/* global Blob, setInterval, clearInterval, performance */
import { logMemoryUsage, MEMORY_LOG_ENABLED } from './debug_tools.js'

/** @type {Promise<any> | null} */
let pdfExportPromise = null

export function loadPdfExport() {
    if (!pdfExportPromise) {
        pdfExportPromise = import('../report/pdf_export.js')
    }
    return pdfExportPromise
}

/** @this {import('./app.js').PayrollAppInstance} @returns {Promise<void>} */
export async function downloadPdf() {
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
        const pdfBytes = await exportReportPdf(this.reportContext, {
            filename: this.suggestedFilename,
            appVersion: this.appVersion,
            employeeName: this.employeeName,
            dateRangeLabel: this.reportStats.dateRangeLabel,
        })
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
}

/** @this {import('./app.js').PayrollAppInstance} @returns {Promise<void>} */
export async function sharePdf() {
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
        const pdfBytes = await exportReportPdf(this.reportContext, {
            filename: this.suggestedFilename,
            appVersion: this.appVersion,
            employeeName: this.employeeName,
            dateRangeLabel: this.reportStats.dateRangeLabel,
        })
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
}

/** @this {import('./app.js').PayrollAppInstance} @returns {void} */
export function printReport() {
    if (!this.reportReady) {
        return
    }
    window.print()
}
