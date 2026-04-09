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

        it('includes warning detail labels and evidence payloads for ineligible deductions', async () => {
            const result = await runReportFromFixtures({
                pdfPaths: allPdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })
            const snapshot = buildRunSnapshot(
                result.records,
                result.reportContext,
                result.contributionData,
                { includeFlagDetails: true }
            )

            for (const entry of snapshot.entries) {
                const details = entry.flagDetails || []
                const detailsById = Object.fromEntries(
                    details.map((flag) => [flag.id, flag])
                )

                const niFlag = detailsById.nat_ins_taken_below_threshold
                expect(niFlag).toBeDefined()
                expect(niFlag.ruleId).toBe('nat_ins_taken_below_threshold')
                expect(niFlag.severity).toBe('warning')
                expect(niFlag.label).toContain(
                    'at or below the primary threshold'
                )
                expect(typeof niFlag.inputs.nationalInsurance).toBe('number')
                expect(typeof niFlag.inputs.grossPay).toBe('number')
                expect(typeof niFlag.inputs.niPrimaryThresholdMonthly).toBe(
                    'number'
                )

                const payeFlag = detailsById.paye_taken_not_due
                expect(payeFlag).toBeDefined()
                expect(payeFlag.ruleId).toBe('paye_taken_not_due')
                expect(payeFlag.severity).toBe('warning')
                expect(payeFlag.label).toContain('PAYE Tax')
                expect(typeof payeFlag.inputs.payeTax).toBe('number')
                expect(typeof payeFlag.inputs.grossForTax).toBe('number')
                expect(typeof payeFlag.inputs.periodAllowance).toBe('number')
                expect(typeof payeFlag.inputs.payeCalculationMode).toBe(
                    'string'
                )

                const pensionFlag =
                    detailsById.pension_employer_contrib_not_required
                expect(pensionFlag).toBeDefined()
                expect(pensionFlag.ruleId).toBe(
                    'pension_employer_contrib_not_required'
                )
                expect(pensionFlag.severity).toBe('warning')
                expect(pensionFlag.label).toContain(
                    'Employer pension contributions'
                )
                expect(typeof pensionFlag.inputs.pensionER).toBe('number')
                expect(typeof pensionFlag.inputs.earnings).toBe('number')
                expect(
                    typeof pensionFlag.inputs.periodQualifyingEarningsLower
                ).toBe('number')
            }
        }, 45000)
    }
)
