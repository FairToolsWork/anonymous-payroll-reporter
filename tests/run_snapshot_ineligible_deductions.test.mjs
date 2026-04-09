import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-issue45-ineligible-deductions'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let buildRunSnapshot
let allPdfPaths

describe.skipIf(!fixturesExist)(
    'run snapshot — issue45 ineligible deductions fixtures',
    () => {
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

        it('emits all issue45 ineligible-deduction warning IDs in a physical fixture run', async () => {
            const result = await runReportFromFixtures({
                pdfPaths: allPdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })
            const snapshot = buildRunSnapshot(
                result.records,
                result.reportContext,
                result.contributionData
            )

            const expectedFlagIds = [
                'nat_ins_taken_below_threshold',
                'paye_taken_not_due',
                'pension_employer_contrib_not_required',
            ]

            expect(snapshot.recordCount).toBe(3)
            for (const entry of snapshot.entries) {
                expect([...entry.flagIds].sort()).toEqual(expectedFlagIds)
            }
        }, 45000)
    }
)
