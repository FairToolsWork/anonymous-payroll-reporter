/* global setTimeout, clearTimeout, console */

import { createCanvas, Image, ImageData } from 'canvas'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath, pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'

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

const FIXTURE_DIRS = [
    path.resolve(__dirname, './test_files/pdf-parse/fixtures'),
    path.resolve(__dirname, './test_files/pdf-parse/edge-fixtures'),
]
const EXPECTED_DIR = path.resolve(__dirname, './test_files/pdf-parse/expected')

function buildBrowserShims() {
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

function formatDiffValue(value) {
    if (value === null) {
        return 'null'
    }
    if (value === undefined) {
        return 'undefined'
    }
    if (typeof value === 'string') {
        return JSON.stringify(value)
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function diffValues(expected, actual, pathLabel = '', extraKeys = []) {
    const diffs = []
    if (expected === actual) {
        return { diffs, extraKeys }
    }
    if (typeof expected !== typeof actual) {
        diffs.push(
            `${pathLabel}: expected (${typeof expected}) ${formatDiffValue(expected)}, got (${typeof actual}) ${formatDiffValue(actual)}`
        )
        return { diffs, extraKeys }
    }
    if (expected && typeof expected === 'object' && actual) {
        const expectedKeys = Object.keys(expected)
        const actualKeys = Object.keys(actual)
        expectedKeys.forEach((key) => {
            const result = diffValues(
                expected[key],
                actual[key],
                `${pathLabel}.${key}`,
                extraKeys
            )
            diffs.push(...result.diffs)
        })
        actualKeys.forEach((key) => {
            if (!expectedKeys.includes(key)) {
                extraKeys.push(`${pathLabel}.${key}`)
            }
        })
        return { diffs, extraKeys }
    }
    diffs.push(
        `${pathLabel}: expected ${formatDiffValue(expected)}, got ${formatDiffValue(actual)}`
    )
    return { diffs, extraKeys }
}

function buildDiffError(diffs, extraKeys, actual) {
    const lines = ['Parse test failed:']
    diffs.forEach((diff) => lines.push(`- ${diff}`))
    if (extraKeys.length) {
        lines.push('', 'Extra keys found (not used for failure):')
        extraKeys.forEach((key) => lines.push(`- ${key}`))
    }
    lines.push('', 'Actual output:', JSON.stringify(actual, null, 2))
    return new Error(lines.join('\n'))
}

describe('pdf parse', () => {
    it('matches fixture expected outputs', async () => {
        buildBrowserShims()
        const { parsePayrollPdf } = await import(
            pathToFileURL(
                path.resolve(__dirname, '../pwa/src/parse/pdf_validation.js')
            )
        )
        expect(typeof parsePayrollPdf).toBe('function')
        const fixtureFiles = FIXTURE_DIRS.flatMap((fixturesDir) =>
            fs
                .readdirSync(fixturesDir)
                .filter((file) => file.endsWith('.pdf'))
                .map((file) => ({ file, fixturesDir }))
        )

        for (const { file: filename, fixturesDir } of fixtureFiles) {
            const pdfPath = path.resolve(fixturesDir, filename)
            const isEdgeFixture = path.basename(fixturesDir) === 'edge-fixtures'
            const expectedFilename = isEdgeFixture
                ? filename.replace(/\.pdf$/i, '.edge.json')
                : filename.replace(/\.pdf$/i, '.json')
            const expectedPath = path.resolve(EXPECTED_DIR, expectedFilename)
            const buffer = fs.readFileSync(pdfPath)
            const file = {
                arrayBuffer: async () =>
                    buffer.buffer.slice(
                        buffer.byteOffset,
                        buffer.byteOffset + buffer.byteLength
                    ),
            }
            const { record: actual, debug } = await parsePayrollPdf(file, '')
            if (actual && typeof actual === 'object' && 'imageData' in actual) {
                delete actual.imageData
            }
            const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'))

            const { diffs, extraKeys } = diffValues(
                expected,
                actual,
                `result (${filename})`,
                []
            )
            if (diffs.length) {
                throw buildDiffError(diffs, extraKeys, actual)
            }
            if (extraKeys.length) {
                console.warn('\nParse test warning: extra keys found:')
                extraKeys.forEach((key) => console.warn(`- ${key}`))
            }
            expect(debug?.text).toBeDefined()
            expect(debug?.lines).toBeDefined()
        }
    })

    it('throws when no file is provided', async () => {
        const { parsePayrollPdf } = await import(
            pathToFileURL(
                path.resolve(__dirname, '../pwa/src/parse/pdf_validation.js')
            )
        )
        await expect(parsePayrollPdf(null, '')).rejects.toMatchObject({
            message: 'PDF_FILE_MISSING',
        })
    })

    it('handles empty extracted PDF data', async () => {
        const extractPath = path.resolve(__dirname, '../pwa/src/pdf/extract.js')
        const parserPath = path.resolve(
            __dirname,
            '../pwa/src/parse/formats/sage-uk/parser.js'
        )
        const validationPath = path.resolve(
            __dirname,
            '../pwa/src/parse/pdf_validation.js'
        )
        vi.resetModules()
        vi.doMock(pathToFileURL(extractPath).href, () => ({
            extractPdfData: async () => ({
                text: '',
                imageData: null,
                lines: null,
                lineItems: null,
            }),
        }))
        const buildPayrollDocument = vi.fn(async (payload) => ({
            ok: true,
            payload,
        }))
        vi.doMock(pathToFileURL(parserPath).href, () => ({
            buildPayrollDocument,
        }))
        const { parsePayrollPdf } = await import(pathToFileURL(validationPath))
        const file = { arrayBuffer: async () => new ArrayBuffer(0) }
        const result = await parsePayrollPdf(file, '')
        expect(buildPayrollDocument).toHaveBeenCalledWith({
            text: '',
            lines: [],
            lineItems: [],
            imageData: null,
        })
        expect(result.debug).toEqual({
            text: '',
            lines: [],
            lineItems: [],
            imageData: null,
        })
    })

    it('returns full image when no content is detected', async () => {
        const extractPath = path.resolve(__dirname, '../pwa/src/pdf/extract.js')
        vi.resetModules()
        vi.doUnmock(pathToFileURL(extractPath).href)
        const originalWindow = globalThis.window
        const originalDocument = globalThis.document

        const fakePage = {
            getViewport: () => ({ width: 2, height: 2 }),
            getTextContent: async () => ({ items: [] }),
            render: () => ({ promise: Promise.resolve() }),
            view: [0, 0, 2, 2],
        }
        const fakePdf = {
            numPages: 1,
            getPage: async () => fakePage,
        }
        const fakePdfjs = {
            GlobalWorkerOptions: { workerSrc: '' },
            getDocument: () => ({ promise: Promise.resolve(fakePdf) }),
        }
        const fakeCanvas = {
            width: 0,
            height: 0,
            getContext: () => ({
                getImageData: (x, y, width, height) => ({
                    data: new Uint8ClampedArray(width * height * 4).fill(255),
                }),
                drawImage: () => {},
            }),
            toDataURL: () => 'data:image/png;base64,full',
        }

        globalThis.window = { pdfjsLib: fakePdfjs, pdfjsDebug: true }
        globalThis.document = { createElement: () => fakeCanvas }

        const { extractPdfData } = await import(pathToFileURL(extractPath))
        const file = { arrayBuffer: async () => new ArrayBuffer(0) }
        const result = await extractPdfData(file, '')
        expect(result.imageData).toBe('data:image/png;base64,full')

        globalThis.window = originalWindow
        globalThis.document = originalDocument
    })
})
