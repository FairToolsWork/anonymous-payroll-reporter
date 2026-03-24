import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-bad-zero-hours'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let allPdfPaths

describe.skipIf(!fixturesExist)(
    'variable-pattern worker — entitlement must not default to 28 days',
    () => {
        beforeAll(async () => {
            const runner = await import(
                pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
            )
            runner.buildBrowserShims()
            runReportFromFixtures = runner.runReportFromFixtures

            allPdfPaths = fs
                .readdirSync(FIXTURES_DIR)
                .filter((f) => f.endsWith('.pdf'))
                .sort()
                .map((f) => path.join(FIXTURES_DIR, f))
        }, 10000)

        it('does not assume 28-day entitlement when workerProfile has typicalDays=0 and no statutoryHolidayDays', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: {
                    workerType: 'hourly',
                    typicalDays: 0,
                    leaveYearStartMonth: 4,
                },
            })

            const ctx = result.reportContext
            expect(ctx).toBeTruthy()
            expect(ctx.workerProfile.typicalDays).toBe(0)

            // The report must NOT silently assume 28 days for a variable-pattern worker
            // whose statutory entitlement was not provided (UI shows "N/A").
            // Accrual-based entitlement (12.07% of hours worked) applies instead.
            expect(ctx.workerProfile.statutoryHolidayDays).toBeNull()
        }, 30000)

        it('defaults to zero-hours baseline when no workerProfile is provided', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })

            const ctx = result.reportContext

            // Zero-hours is the baseline: typicalDays=0 (variable pattern),
            // statutoryHolidayDays=null (accrual-based, not a fixed 28).
            // Standard-hours workers must actively key in their values.
            expect(ctx.workerProfile.typicalDays).toBe(0)
            expect(ctx.workerProfile.statutoryHolidayDays).toBeNull()
        }, 30000)

        it('preserves salaried full-time profile (5 days, 28-day entitlement)', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: {
                    workerType: 'salary',
                    typicalDays: 5,
                    statutoryHolidayDays: 28,
                    leaveYearStartMonth: 4,
                },
            })

            const ctx = result.reportContext
            expect(ctx.workerProfile.workerType).toBe('salary')
            expect(ctx.workerProfile.typicalDays).toBe(5)
            expect(ctx.workerProfile.statutoryHolidayDays).toBe(28)
            expect(ctx.workerProfile.leaveYearStartMonth).toBe(4)
        }, 30000)

        it('preserves salaried part-time profile (3.5 days, 19.6-day entitlement)', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: {
                    workerType: 'salary',
                    typicalDays: 3.5,
                    statutoryHolidayDays: 19.6,
                    leaveYearStartMonth: 4,
                },
            })

            const ctx = result.reportContext
            expect(ctx.workerProfile.workerType).toBe('salary')
            expect(ctx.workerProfile.typicalDays).toBe(3.5)
            expect(ctx.workerProfile.statutoryHolidayDays).toBe(19.6)
            expect(ctx.workerProfile.leaveYearStartMonth).toBe(4)
        }, 30000)

        it('preserves hourly fixed full-time profile (5 days, 28-day entitlement)', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: {
                    workerType: 'hourly',
                    typicalDays: 5,
                    statutoryHolidayDays: 28,
                    leaveYearStartMonth: 4,
                },
            })

            const ctx = result.reportContext
            expect(ctx.workerProfile.workerType).toBe('hourly')
            expect(ctx.workerProfile.typicalDays).toBe(5)
            expect(ctx.workerProfile.statutoryHolidayDays).toBe(28)
            expect(ctx.workerProfile.leaveYearStartMonth).toBe(4)
        }, 30000)

        it('preserves hourly fixed part-time profile (3.5 days, 19.6-day entitlement)', async () => {
            const pdfPaths = allPdfPaths.slice(0, 3)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: {
                    workerType: 'hourly',
                    typicalDays: 3.5,
                    statutoryHolidayDays: 19.6,
                    leaveYearStartMonth: 4,
                },
            })

            const ctx = result.reportContext
            expect(ctx.workerProfile.workerType).toBe('hourly')
            expect(ctx.workerProfile.typicalDays).toBe(3.5)
            expect(ctx.workerProfile.statutoryHolidayDays).toBe(19.6)
            expect(ctx.workerProfile.leaveYearStartMonth).toBe(4)
        }, 30000)
    }
)
