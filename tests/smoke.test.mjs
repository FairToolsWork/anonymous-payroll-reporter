import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
    buildBrowserShims,
    runReportFromFixtures,
} from './utils/report_runner.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PDF = path.resolve(
    __dirname,
    'test_files/report-workflow/fixtures/payslip-2024-04.pdf'
)
const EXCEL = path.resolve(
    __dirname,
    'test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx'
)

describe('smoke', () => {
    it('processes a PDF payslip and Excel contribution file without errors', async () => {
        buildBrowserShims()

        const result = await runReportFromFixtures({
            pdfPaths: [PDF],
            excelPaths: [EXCEL],
            requireEmployeeDetails: false,
        })

        expect(
            result.failedFiles,
            'no files should fail to parse'
        ).toHaveLength(0)
        expect(
            result.records.length,
            'at least one payroll record extracted'
        ).toBeGreaterThan(0)
        expect(result.report, 'report should be produced').toBeTruthy()
    })
})
