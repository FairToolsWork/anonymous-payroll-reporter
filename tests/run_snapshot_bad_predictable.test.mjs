import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-bad-predictable'
)
const EXPECTED_PATH = path.join(
    root,
    'tests/test_files/report-workflow/expected-snapshot-bad-predictable.json'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let buildRunSnapshot
let allPdfPaths

describe.skipIf(!fixturesExist)(
    'run snapshot — bad-place-predictable (holiday rate flag expected)',
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

        async function runSlice(count) {
            const pdfPaths = allPdfPaths.slice(0, count)
            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })
            return buildRunSnapshot(
                result.records,
                result.reportContext,
                result.contributionData
            )
        }

        describe('3-month slice (Apr–Jun 2025)', () => {
            it('flags holiday_rate_below_basic in Jun 2025 (index 2) only', async () => {
                const snapshot = await runSlice(3)
                expect(snapshot.recordCount).toBe(3)
                expect(snapshot.entries[0].flagIds).toEqual([])
                expect(snapshot.entries[1].flagIds).toEqual([])
                expect(snapshot.entries[2].flagIds).toContain(
                    'holiday_rate_below_basic'
                )
            }, 30000)
        })

        describe('6-month slice (Apr–Sep 2025)', () => {
            it('flags a holiday rate anomaly in Jun (index 2) and Sep (index 5)', async () => {
                const snapshot = await runSlice(6)
                expect(snapshot.recordCount).toBe(6)
                for (const i of [2, 5]) {
                    const ids = snapshot.entries[i].flagIds
                    expect(
                        ids.includes('holiday_rate_below_basic') ||
                            ids.includes('holiday_rate_below_rolling_avg')
                    ).toBe(true)
                }
                const cleanIndices = [0, 1, 3, 4]
                for (const i of cleanIndices) {
                    expect(snapshot.entries[i].flagIds).toEqual([])
                }
            }, 45000)
        })

        describe('14-month full run (Apr 2025–May 2026)', () => {
            it('flags a holiday rate anomaly in all 4 holiday months', async () => {
                const snapshot = await runSlice(14)
                const flaggedIndices = [2, 5, 8, 11]
                const cleanIndices = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13]
                for (const i of flaggedIndices) {
                    const ids = snapshot.entries[i].flagIds
                    expect(
                        ids.includes('holiday_rate_below_basic') ||
                            ids.includes('holiday_rate_below_rolling_avg')
                    ).toBe(true)
                }
                for (const i of cleanIndices) {
                    expect(snapshot.entries[i].flagIds).toEqual([])
                }
            }, 90000)

            it('matches the expected snapshot', async () => {
                if (!fs.existsSync(EXPECTED_PATH)) {
                    throw new Error(
                        `Expected snapshot not found: ${EXPECTED_PATH}\n` +
                            `Run the regenerate_profile_snapshot utility to create it.`
                    )
                }
                const expected = JSON.parse(
                    fs.readFileSync(EXPECTED_PATH, 'utf8')
                )
                const snapshot = await runSlice(14)
                expect(snapshot).toEqual(expected)
            }, 90000)
        })
    }
)
