/* global process */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import XLSX from 'xlsx'

const root = path.resolve(process.cwd())

const FIXTURE_PATH = path.join(
    root,
    'tests/test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx'
)
const EXPECTED_PATH = path.join(
    root,
    'tests/test_files/excel-contribution/expected/nest_contribution_target_summary.js'
)

const { parseContributionWorkbook } = await import(
    pathToFileURL(path.join(root, 'pwa/src/parse/contribution_validation.js'))
)

const buffer = fs.readFileSync(FIXTURE_PATH)
const workbook = XLSX.read(buffer, { type: 'buffer' })
const result = parseContributionWorkbook(
    workbook,
    'nest-contribution-history-correct.xlsx',
    XLSX
)

if (result.entries.length === 0) {
    throw new Error('No contribution entries were parsed from the workbook')
}

const summary = {
    totalEntries: result.entries.length,
    eeCount: 0,
    erCount: 0,
    eeTotal: 0,
    erTotal: 0,
    startDate: null,
    endDate: null,
}

result.entries.forEach((entry) => {
    if (entry.type === 'ee') {
        summary.eeCount += 1
        summary.eeTotal += entry.amount
    } else if (entry.type === 'er') {
        summary.erCount += 1
        summary.erTotal += entry.amount
    }
    const timeValue = entry.date.getTime()
    if (summary.startDate === null || timeValue < summary.startDate) {
        summary.startDate = timeValue
    }
    if (summary.endDate === null || timeValue > summary.endDate) {
        summary.endDate = timeValue
    }
})

function localDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

summary.eeTotal = Number(summary.eeTotal.toFixed(2))
summary.erTotal = Number(summary.erTotal.toFixed(2))
summary.startDate = localDateString(new Date(summary.startDate))
summary.endDate = localDateString(new Date(summary.endDate))

const content =
    `/**\n` +
    ` * This is a reference object for a Nest pension contribution target summary.\n` +
    ` */\n` +
    `\n` +
    `export default {\n` +
    `    totalEntries: ${summary.totalEntries},\n` +
    `    eeCount: ${summary.eeCount},\n` +
    `    erCount: ${summary.erCount},\n` +
    `    eeTotal: ${summary.eeTotal},\n` +
    `    erTotal: ${summary.erTotal},\n` +
    `    startDate: '${summary.startDate}',\n` +
    `    endDate: '${summary.endDate}',\n` +
    `}\n`

fs.mkdirSync(path.dirname(EXPECTED_PATH), { recursive: true })
fs.writeFileSync(EXPECTED_PATH, content)
console.log(`Written: ${EXPECTED_PATH}`)
