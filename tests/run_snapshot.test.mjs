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

    it('includes flag detail evidence when requested for debug snapshots', async () => {
        buildBrowserShims()

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
            result.contributionData,
            { includeFlagDetails: true, includePayeDiagnostics: true }
        )

        const firstFlagged = snapshot.entries.find(
            (entry) => entry.flagIds.length > 0
        )
        expect(firstFlagged).toBeTruthy()
        expect(Array.isArray(firstFlagged.flagDetails)).toBe(true)
        expect(firstFlagged.flagDetails.length).toBeGreaterThan(0)
        expect(typeof firstFlagged.flagDetails[0].id).toBe('string')
        expect(typeof firstFlagged.flagDetails[0].label).toBe('string')
        expect(Array.isArray(snapshot.payeMismatchDiagnostics)).toBe(true)
        expect(snapshot.payeMismatchDiagnostics.length).toBeGreaterThan(0)
        expect(typeof snapshot.payeMismatchDiagnostics[0].period).toBe('string')
        expect(
            Object.prototype.hasOwnProperty.call(
                snapshot.payeMismatchDiagnostics[0],
                'expectedPayeExact'
            )
        ).toBe(true)
        expect(
            Object.prototype.hasOwnProperty.call(
                snapshot.payeMismatchDiagnostics[0],
                'expectedPayeSageApprox'
            )
        ).toBe(true)
        expect(
            Object.prototype.hasOwnProperty.call(
                snapshot.payeMismatchDiagnostics[0],
                'expectedPayeTableMode'
            )
        ).toBe(true)
    })
})
