import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { test } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

const fixtureDirs = [
    path.join(root, 'tests/test_files/pdf-parse/fixtures'),
    path.join(root, 'tests/test_files/pdf-parse/edge-fixtures'),
]
const expectedDir = path.join(root, 'tests/test_files/pdf-parse/expected')

test('regenerate expected payslip JSON fixtures', async () => {
    const { buildBrowserShims } = await import(
        pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
    )
    buildBrowserShims()

    const { parsePayrollPdf } = await import(
        pathToFileURL(path.join(root, 'pwa/src/parse/pdf_validation.js'))
    )

    for (const fixturesDir of fixtureDirs) {
        const isEdgeFixture = path.basename(fixturesDir) === 'edge-fixtures'
        const files = fs
            .readdirSync(fixturesDir)
            .filter((file) => file.endsWith('.pdf'))

        for (const filename of files) {
            const pdfPath = path.join(fixturesDir, filename)
            const buffer = fs.readFileSync(pdfPath)
            const file = {
                arrayBuffer: async () =>
                    buffer.buffer.slice(
                        buffer.byteOffset,
                        buffer.byteOffset + buffer.byteLength
                    ),
            }
            const { record } = await parsePayrollPdf(file, '')
            if (record && typeof record === 'object' && 'imageData' in record) {
                delete record.imageData
            }
            const expectedFilename = isEdgeFixture
                ? filename.replace(/\.pdf$/i, '.edge.json')
                : filename.replace(/\.pdf$/i, '.json')
            const expectedPath = path.join(expectedDir, expectedFilename)
            fs.writeFileSync(
                expectedPath,
                `${JSON.stringify(record, null, 4)}\n`
            )
        }
    }
}, 15000)
