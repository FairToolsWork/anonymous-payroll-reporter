import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURES_DIR = path.join(
    root,
    'tests/test_files/report-workflow/fixtures-good-predictable'
)
const EXPECTED_PATH = path.join(
    root,
    'tests/test_files/report-workflow/expected-snapshot-good-predictable.json'
)

const fixturesExist = fs.existsSync(FIXTURES_DIR)

let runReportFromFixtures
let buildRunSnapshot
let allPdfPaths

describe.skipIf(!fixturesExist)(
    'run snapshot — good-place-predictable (no flags expected)',
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
            const result = await runReportSlice(count)
            return buildRunSnapshot(
                result.records,
                result.reportContext,
                result.contributionData
            )
        }

        async function runReportSlice(count) {
            const pdfPaths = allPdfPaths.slice(0, count)
            return runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })
        }

        describe('3-month slice (Apr–Jun 2025)', () => {
            it('has 3 records with no flags', async () => {
                const snapshot = await runSlice(3)
                expect(snapshot.recordCount).toBe(3)
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).toEqual([])
                }
            }, 30000)
        })

        describe('6-month slice (Apr–Sep 2025)', () => {
            it('has 6 records with no flags', async () => {
                const snapshot = await runSlice(6)
                expect(snapshot.recordCount).toBe(6)
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).toEqual([])
                }
            }, 45000)
        })

        describe('14-month full run (Apr 2025–May 2026)', () => {
            it('renders annual cross-check section and month breakdown in HTML output', async () => {
                const result = await runReportSlice(14)
                const html = result.report?.html || ''
                expect(html).toContain('Annual holiday pay cross-check')
                expect(html).toContain('Reference state')
                expect(html).toContain('Mixed month')
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
                for (const entry of snapshot.entries) {
                    expect(entry.flagIds).toEqual([])
                }
                expect(snapshot).toEqual(expected)
            }, 90000)
        })
    }
)
