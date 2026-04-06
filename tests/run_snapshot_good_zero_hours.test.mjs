import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-good-zero-hours'
)
const EXPECTED_PATH = path.join(
    root,
    'tests/test_files/report-workflow/expected-snapshot-good-zero-hours.json'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let buildRunSnapshot
let allPdfPaths

describe.skipIf(!fixturesExist)(
    'run snapshot — good-place-zero-hours (no flags expected)',
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
            it('has 3 records with no holiday rate flags despite variable hours', async () => {
                const snapshot = await runSlice(3)
                expect(snapshot.recordCount).toBe(3)
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_basic'
                    )
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_rolling_avg'
                    )
                }
            }, 30000)

            it('shows varied basicHours across months', async () => {
                const snapshot = await runSlice(3)
                const hours = snapshot.entries.map((e) => e.basicHours)
                const unique = new Set(hours)
                expect(unique.size).toBeGreaterThan(1)
            }, 30000)
        })

        describe('6-month slice (Apr–Sep 2025)', () => {
            it('has 6 records with no holiday rate flags', async () => {
                const snapshot = await runSlice(6)
                expect(snapshot.recordCount).toBe(6)
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_basic'
                    )
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_rolling_avg'
                    )
                }
            }, 45000)
        })

        describe('14-month full run (Apr 2025–May 2026)', () => {
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
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_basic'
                    )
                    expect(entry.flagIds).not.toContain(
                        'holiday_rate_below_rolling_avg'
                    )
                }
                const belowThresholdIndices = [0, 3, 6, 9, 12]
                for (const i of belowThresholdIndices) {
                    const ids = snapshot.entries[i].flagIds
                    expect(ids).toContain('paye_zero')
                    expect(ids).toContain('nat_ins_zero')
                }
                expect(snapshot).toEqual(expected)
            }, 90000)
        })
    }
)
