import { extractPdfData } from '../pdf/extract.js'
import { ACTIVE_PAYROLL_FORMAT } from './active_format.js'

/**
 * @param {File} file
 * @param {string} password
 * @returns {Promise<{ record: any, debug: { text: string, lines: string[], lineItems: Array<any>, imageData: string | null } }>}
 */
export async function parsePayrollPdf(file, password) {
    if (!file) {
        throw new Error('PDF_FILE_MISSING')
    }
    const [{ text, imageData, lines, lineItems }, buildPayrollDocument] =
        await Promise.all([
            extractPdfData(file, password),
            ACTIVE_PAYROLL_FORMAT.parser(),
        ])
    const record = await buildPayrollDocument({
        text,
        lines: lines || [],
        lineItems: lineItems || [],
        imageData: imageData || null,
    })
    return {
        record,
        debug: {
            text,
            lines: lines || [],
            lineItems: lineItems || [],
            imageData: imageData || null,
        },
    }
}

if (typeof window !== 'undefined') {
    window.parsePayrollPdf = parsePayrollPdf
}
