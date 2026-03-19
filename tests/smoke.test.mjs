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
            includeReportContext: true,
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

        const snapshot = buildRunSnapshot(
            result.records,
            result.reportContext,
            result.contributionData
        )

        expect(snapshot.recordCount, 'one payroll record').toBe(1)
        expect(
            snapshot.contributionEntries,
            'contribution entries from Excel'
        ).toBe(26)

        const entry = snapshot.entries[0]
        expect(entry.period).toBe('20 Apr 2024')
        expect(entry.netPay).toBe(1262.03)
        expect(entry.basicHours).toBe(151.8)
        expect(entry.basicRate).toBeCloseTo(9.3, 4)
        expect(entry.holidayHours).toBe(0)
        expect(entry.holidayRate).toBeNull()
        expect(entry.payeTax).toBe(61.47)
        expect(entry.pensionEE).toBe(44.59)
        expect(entry.flagIds).toEqual([])
    })
})
