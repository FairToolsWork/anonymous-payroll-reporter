import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { buildRunSnapshot } from '../pwa/src/report/run_snapshot.js'
import {
    buildBrowserShims,
    runReportFromFixtures,
} from './utils/report_runner.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow/fixtures'
)
const EXCEL_FIXTURE = path.resolve(
    __dirname,
    './test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx'
)
const EXPECTED_PATH = path.resolve(
    __dirname,
    './test_files/report-workflow/expected-run-snapshot.json'
)

describe('run snapshot regression', () => {
    it('matches the expected snapshot for the 13-payslip fixture set', async () => {
        buildBrowserShims()

        const expected = JSON.parse(fs.readFileSync(EXPECTED_PATH, 'utf8'))

        const pdfPaths = fs
            .readdirSync(FIXTURES_DIR)
            .filter((file) => file.endsWith('.pdf'))
            .map((file) => path.resolve(FIXTURES_DIR, file))

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

        expect(snapshot).toEqual(expected)
    })
})
