/* global setTimeout, clearTimeout */

import { createCanvas } from 'canvas'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { fileURLToPath, pathToFileURL } from 'url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.js')

export function buildBrowserShims() {
    const pdfjsLibForTests = {
        ...pdfjsLib,
        getDocument: (args) =>
            pdfjsLib.getDocument({ ...args, disableWorker: true }),
    }
    globalThis.window = {
        pdfjsLib: pdfjsLibForTests,
        pdfjsDebug: true,
        requestAnimationFrame: (callback) => setTimeout(callback, 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
    }
    globalThis.document = {
        createElement: (tag) => {
            if (tag !== 'canvas') {
                throw new Error(`Unsupported element: ${tag}`)
            }
            return createCanvas(1, 1)
        },
    }
}

function buildFileFromPath(filePath) {
    const buffer = fs.readFileSync(filePath)
    return {
        name: path.basename(filePath),
        arrayBuffer: async () =>
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
            ),
    }
}

/**
 * @param {{ pdfPaths: string[], excelPaths?: string[], pdfPassword?: string, captureDebug?: boolean, requireEmployeeDetails?: boolean, includeReportContext?: boolean }} options
 * @returns {Promise<{
 *  records: any[],
 *  report: { html: string, filename: string, stats: any } | null,
 *  failedFiles: string[],
 *  failedPayPeriods: string[],
 *  contributionData: { entries: Array<{ date: Date, type: "ee" | "er", amount: number }>, sourceFiles: string[] } | null,
 *  debug: { text: string, lines: string[], lineItems: Array<any>, imageData: string | null } | null,
 *  excelDebug: { source: string, rows: unknown[], entries: Array<{ date: Date, type: "ee" | "er", amount: number }> } | null,
 *  reportContext?: any | null
 * }>}
 */
export async function runReportFromFixtures(options) {
    const { runPayrollReportWorkflow } = await import(
        pathToFileURL(
            path.resolve(__dirname, '../../pwa/js/report/report_workflow.js')
        )
    )
    const pdfPaths = Array.isArray(options?.pdfPaths) ? options.pdfPaths : []
    const excelPaths = Array.isArray(options?.excelPaths)
        ? options.excelPaths
        : []

    const pdfFiles = pdfPaths.map((filePath) => buildFileFromPath(filePath))
    const excelFiles = excelPaths.map((filePath) => buildFileFromPath(filePath))

    const xlsx = await import('xlsx')

    return runPayrollReportWorkflow({
        pdfFiles,
        excelFiles,
        pdfPassword: options?.pdfPassword || '',
        xlsx,
        captureDebug: Boolean(options?.captureDebug),
        requireEmployeeDetails: options?.requireEmployeeDetails,
        includeReportContext: options?.includeReportContext,
    })
}
