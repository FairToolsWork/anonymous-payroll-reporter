import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-salary-workers'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let buildRunSnapshot
let allPdfPaths
const SALARY_WORKER_PROFILE = {
    workerType: 'salary',
    typicalDays: 4,
    statutoryHolidayDays: 22.4,
    leaveYearStartMonth: 4,
}

describe.skipIf(!fixturesExist)('report workflow — salary PDF fixtures', () => {
    beforeAll(async () => {
        const runner = await import(
            pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
        )
        runner.buildBrowserShims()
        runReportFromFixtures = runner.runReportFromFixtures

        const snap = await import(
            pathToFileURL(path.join(root, 'pwa/src/report/run_snapshot.js'))
        )
        buildRunSnapshot = snap.buildRunSnapshot

        allPdfPaths = fs
            .readdirSync(FIXTURES_DIR)
            .filter((f) => f.endsWith('.pdf'))
            .sort()
            .map((f) => path.join(FIXTURES_DIR, f))
    }, 10000)

    it('parses fixtures as salary payments without basic hours', async () => {
        const result = await runReportFromFixtures({
            pdfPaths: allPdfPaths,
            requireEmployeeDetails: false,
            includeReportContext: true,
            workerProfile: SALARY_WORKER_PROFILE,
        })

        expect(result.records.length).toBe(12)
        const snapshot = buildRunSnapshot(
            result.records,
            result.reportContext,
            result.contributionData
        )
        expect(snapshot.recordCount).toBe(12)

        for (const entry of snapshot.entries) {
            expect(entry.salariedPay).toBeGreaterThan(0)
            expect(entry.basicHours).toBe(0)
        }
    }, 120000)

    it('renders salary rows in report HTML', async () => {
        const result = await runReportFromFixtures({
            pdfPaths: allPdfPaths,
            requireEmployeeDetails: false,
            includeReportContext: true,
            workerProfile: SALARY_WORKER_PROFILE,
        })

        const html = result.report?.html || ''
        expect(html).toContain('Basic Salary')
        expect(html).not.toContain('Basic Hours')
    }, 120000)

    it('shows N/A for hours worked in annual summary rows', async () => {
        const result = await runReportFromFixtures({
            pdfPaths: allPdfPaths,
            requireEmployeeDetails: false,
            includeReportContext: true,
            workerProfile: SALARY_WORKER_PROFILE,
        })

        const html = result.report?.html || ''
        expect(html).toMatch(
            /<th><a href="#year-summary-[^"]+">[^<]+<\/a><\/th><td>N\/A<\/td><td>/
        )
        expect(html).toContain(
            'Holiday <span class="summary-breakdown">(pay / est. days)</span>'
        )
        expect(html).toMatch(/£\d+\.\d{2} holiday pay/)
        expect(html).toMatch(
            /<th><a href="#year-monthly-[^"]+">[^<]+<\/a><\/th><td>N\/A<\/td><td>[\s\S]*?<\/td><td>N\/A<\/td>/
        )
    }, 120000)
})
