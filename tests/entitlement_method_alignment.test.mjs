import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

/**
 * Entitlement method alignment test.
 *
 * Both pre-2024 (5.6 week avg.) and post-2024 (12.07% accrual) methods
 * project annual entitlement as avgWeeklyHours × 5.6.  The 12.07% figure
 * is the per-period accrual rate (5.6 / 46.4 working weeks) — it does not
 * change the annual total, only the mechanism for tracking it.
 *
 * For different worker profiles running against the same payslip data,
 * the projected entitlement must be exactly avgWeeklyHours × 5.6, and the
 * hourly_days identity (statutoryHolidayDays × avgHoursPerDay) must hold.
 */

const ALL_FIXTURES = [
    {
        id: 'good-predictable',
        dir: 'tests/test_files/report-workflow/fixtures-good-predictable',
    },
    {
        id: 'good-zero-hours',
        dir: 'tests/test_files/report-workflow/fixtures-good-zero-hours',
    },
]

const REGULAR_PROFILE = {
    workerType: 'hourly',
    typicalDays: 4,
    statutoryHolidayDays: 22.4,
    leaveYearStartMonth: 4,
}

const ZERO_HOURS_PROFILE = {
    workerType: 'hourly',
    typicalDays: 0,
    statutoryHolidayDays: null,
    leaveYearStartMonth: 4,
}

/**
 * Extract the last entry with a baseline holiday context from a report run.
 * @param {any} reportContext
 * @returns {{ entitlementHours: number, avgWeeklyHours: number, method: string } | null}
 */
function extractLastEntitlement(reportContext) {
    const entries = reportContext?.entries ?? []
    for (let i = entries.length - 1; i >= 0; i--) {
        const ctx = entries[i].holidayContext
        if (ctx?.hasBaseline && ctx.entitlementHours > 0) {
            return {
                entitlementHours: ctx.entitlementHours,
                avgWeeklyHours: ctx.avgWeeklyHours,
                method: ctx.useAccrualMethod ? '12.07% accrual' : '5.6 weeks',
            }
        }
    }
    return null
}

/**
 * Helper to set up a fixture-based test suite.
 * @param {string} fixturesDir
 * @returns {{ setup: () => Promise<void>, runWithProfile: (profile: any) => Promise<any> }}
 */
function buildFixtureRunner(fixturesDir) {
    let runReportFromFixtures
    let allPdfPaths

    return {
        setup: async () => {
            const runner = await import(
                pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
            )
            runner.buildBrowserShims()
            runReportFromFixtures = runner.runReportFromFixtures

            allPdfPaths = fs
                .readdirSync(fixturesDir)
                .filter((f) => f.endsWith('.pdf'))
                .sort()
                .map((f) => path.join(fixturesDir, f))
        },
        runWithProfile: async (profile) => {
            const result = await runReportFromFixtures({
                pdfPaths: allPdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
                workerProfile: profile,
            })
            return result.reportContext
        },
    }
}

for (const fixture of ALL_FIXTURES) {
    const fixturesDir = path.join(root, fixture.dir)
    const fixturesExist = fs.existsSync(fixturesDir)

    describe.skipIf(!fixturesExist)(
        `entitlement method alignment — ${fixture.id}`,
        () => {
            const runner = buildFixtureRunner(fixturesDir)

            beforeAll(async () => {
                await runner.setup()
            }, 10000)

            it('zero-hours entitlement equals avgWeeklyHours × 5.6', async () => {
                const ctx = await runner.runWithProfile(ZERO_HOURS_PROFILE)
                const entitlement = extractLastEntitlement(ctx)

                expect(entitlement).not.toBeNull()
                expect(entitlement.entitlementHours).toBeCloseTo(
                    entitlement.avgWeeklyHours * 5.6,
                    2
                )
            }, 120000)

            it('regular-pattern and zero-hours profiles give same projected entitlement', async () => {
                const regularCtx = await runner.runWithProfile(REGULAR_PROFILE)
                const zeroHoursCtx =
                    await runner.runWithProfile(ZERO_HOURS_PROFILE)

                // Extract avgWeeklyHours from each profile's last baseline entry
                const regularEntries = regularCtx?.entries ?? []
                let regularAvg = null
                for (let i = regularEntries.length - 1; i >= 0; i--) {
                    const ctx = regularEntries[i].holidayContext
                    if (ctx?.hasBaseline && ctx.avgWeeklyHours > 0) {
                        regularAvg = ctx.avgWeeklyHours
                        break
                    }
                }

                const zeroHoursEntitlement =
                    extractLastEntitlement(zeroHoursCtx)

                expect(regularAvg).not.toBeNull()
                expect(zeroHoursEntitlement).not.toBeNull()

                // Both profiles use the same rolling reference, so
                // avgWeeklyHours × 5.6 must match across profiles.
                expect(zeroHoursEntitlement.entitlementHours).toBeCloseTo(
                    regularAvg * 5.6,
                    2
                )
            }, 120000)

            it('hourly_days identity: statutoryHolidayDays × avgHoursPerDay = avgWeeklyHours × 5.6', async () => {
                const regularCtx = await runner.runWithProfile(REGULAR_PROFILE)
                const entries = regularCtx?.entries ?? []

                let lastCtx = null
                for (let i = entries.length - 1; i >= 0; i--) {
                    const ctx = entries[i].holidayContext
                    if (ctx?.hasBaseline && ctx.avgWeeklyHours > 0) {
                        lastCtx = ctx
                        break
                    }
                }

                expect(lastCtx).not.toBeNull()
                const daysEntitlement =
                    REGULAR_PROFILE.statutoryHolidayDays *
                    lastCtx.avgHoursPerDay
                const weeksEntitlement = lastCtx.avgWeeklyHours * 5.6

                expect(daysEntitlement).toBeCloseTo(weeksEntitlement, 2)
            }, 120000)
        }
    )
}
