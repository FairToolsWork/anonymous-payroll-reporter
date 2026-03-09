/* global setTimeout, clearTimeout */

import { createCanvas, Image, ImageData } from 'canvas'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath, pathToFileURL } from 'url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
).toString()

class TestCanvasFactory {
    constructor({ ownerDocument } = {}) {
        this.ownerDocument = ownerDocument || globalThis.document
    }

    create(width, height) {
        const canvas = createCanvas(width, height)
        const context = canvas.getContext('2d')
        return { canvas, context }
    }

    reset(canvasEntry, width, height) {
        canvasEntry.canvas.width = width
        canvasEntry.canvas.height = height
    }

    destroy(canvasEntry) {
        canvasEntry.canvas.width = 0
        canvasEntry.canvas.height = 0
        canvasEntry.canvas = null
        canvasEntry.context = null
    }
}

export function buildBrowserShims() {
    const pdfjsLibForTests = {
        ...pdfjsLib,
        getDocument: (args) =>
            pdfjsLib.getDocument({
                ...args,
                disableWorker: true,
                CanvasFactory: TestCanvasFactory,
            }),
    }
    globalThis.window = {
        pdfjsLib: pdfjsLibForTests,
        pdfjsDebug: true,
        requestAnimationFrame: (callback) => setTimeout(callback, 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
    }
    globalThis.Image = Image
    if (ImageData) {
        globalThis.ImageData = ImageData
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
            path.resolve(__dirname, '../../pwa/src/report/report_workflow.js')
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
