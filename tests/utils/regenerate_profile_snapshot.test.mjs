import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { test } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

const PROFILES = [
    {
        id: 'good-place-predictable',
        fixturesDir:
            'tests/test_files/report-workflow/fixtures-good-predictable',
        outputPath:
            'tests/test_files/report-workflow/expected-snapshot-good-predictable.json',
    },
    {
        id: 'bad-place-predictable',
        fixturesDir:
            'tests/test_files/report-workflow/fixtures-bad-predictable',
        outputPath:
            'tests/test_files/report-workflow/expected-snapshot-bad-predictable.json',
    },
    {
        id: 'good-place-zero-hours',
        fixturesDir:
            'tests/test_files/report-workflow/fixtures-good-zero-hours',
        outputPath:
            'tests/test_files/report-workflow/expected-snapshot-good-zero-hours.json',
    },
    {
        id: 'bad-place-zero-hours',
        fixturesDir: 'tests/test_files/report-workflow/fixtures-bad-zero-hours',
        outputPath:
            'tests/test_files/report-workflow/expected-snapshot-bad-zero-hours.json',
    },
]

for (const profile of PROFILES) {
    const fixturesDir = path.join(root, profile.fixturesDir)
    const outputPath = path.join(root, profile.outputPath)
    const fixturesExist = fs.existsSync(fixturesDir)

    test.skipIf(!fixturesExist)(
        `regenerate snapshot: ${profile.id}`,
        async () => {
            const { buildBrowserShims, runReportFromFixtures } = await import(
                pathToFileURL(path.join(root, 'tests/utils/report_runner.mjs'))
            )
            buildBrowserShims()

            const { buildRunSnapshot } = await import(
                pathToFileURL(path.join(root, 'pwa/src/report/run_snapshot.js'))
            )

            const pdfPaths = fs
                .readdirSync(fixturesDir)
                .filter((file) => file.endsWith('.pdf'))
                .sort()
                .map((file) => path.join(fixturesDir, file))

            const result = await runReportFromFixtures({
                pdfPaths,
                requireEmployeeDetails: false,
                includeReportContext: true,
            })

            const snapshot = buildRunSnapshot(
                result.records,
                result.reportContext,
                result.contributionData
            )

            fs.mkdirSync(path.dirname(outputPath), { recursive: true })
            fs.writeFileSync(
                outputPath,
                `${JSON.stringify(snapshot, null, 4)}\n`
            )
        },
        60000
    )
}
