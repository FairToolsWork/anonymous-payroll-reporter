import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { test } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures'
)
const EXCEL_FIXTURE = path.join(
    root,
    'tests/test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx'
)
const OUTPUT_PATH = path.join(
    root,
    'tests/test_files/report-workflow/expected-run-snapshot.json'
)

test('regenerate expected run snapshot', async () => {
    const { buildBrowserShims, runReportFromFixtures } = await import(
        pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
    )
    buildBrowserShims()

    const { buildRunSnapshot } = await import(
        pathToFileURL(path.join(root, 'pwa/src/report/run_snapshot.js'))
    )

    const pdfPaths = fs
        .readdirSync(FIXTURES_DIR)
        .filter((file) => file.endsWith('.pdf'))
        .map((file) => path.join(FIXTURES_DIR, file))

    const result = await runReportFromFixtures({
        pdfPaths,
        excelPaths: [EXCEL_FIXTURE],
        requireEmployeeDetails: false,
        includeReportContext: true,
    })

    const snapshot = buildRunSnapshot(
        result.records,
        result.reportContext,
        result.contributionData
    )

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 4)}\n`)
}, 15000)
