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

const PDF_PATH = path.resolve(
    __dirname,
    './test_files/payslips/test-payslip-no-pw.pdf'
)

function buildBrowserShims() {
    const pdfjsLibForTests = {
        ...pdfjsLib,
        getDocument: (args) =>
            pdfjsLib.getDocument({ ...args, disableWorker: true }),
    }
    globalThis.window = {
        pdfjsLib: pdfjsLibForTests,
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
    } catch (error) {
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

async function run() {
    buildBrowserShims()
    const { parsePayrollPdf } = await import(
        pathToFileURL(
            path.resolve(__dirname, '../pwa/js/parse/pdf_validation.js')
        )
    )
    if (typeof parsePayrollPdf !== 'function') {
        throw new Error('parsePayrollPdf is not available')
    }

    const buffer = fs.readFileSync(PDF_PATH)
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
    const { text, lines } = debug
    const expectedModule = await import(
        pathToFileURL(
            path.resolve(
                __dirname,
                './test_files/payslips/payslip_target_data_shape.js'
            )
        )
    )
    const expected = expectedModule.default

    const { diffs, extraKeys } = diffValues(expected, actual, 'result', [])
    if (diffs.length) {
        console.error('\nParse test failed:')
        diffs.forEach((diff) => console.error(`- ${diff}`))
        if (extraKeys.length) {
            console.error('\nExtra keys found (not used for failure):')
            extraKeys.forEach((key) => console.error(`- ${key}`))
        }
        console.error('\nActual output:')
        console.error(JSON.stringify(actual, null, 2))
        process.exitCode = 1
        return
    }
    if (extraKeys.length) {
        console.warn('\nParse test warning: extra keys found:')
        extraKeys.forEach((key) => console.warn(`- ${key}`))
    }
    console.log('\nParse test passed.')
}

run().catch((error) => {
    console.error('Parse test error:', error)
    process.exitCode = 1
})
