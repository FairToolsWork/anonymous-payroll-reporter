import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'
import XLSX from 'xlsx'
import { parseContributionWorkbook } from '../pwa/src/parse/formats/pension/nest/parser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURE_DIR = path.resolve(
    __dirname,
    './test_files/excel-contribution/fixtures'
)

const SUMMARY_PATH = path.resolve(
    __dirname,
    './test_files/excel-contribution/expected/nest_contribution_target_summary.js'
)

const FIXTURES = {
    malformed: {
        file: 'malformed.xlsx',
        error: 'CONTRIBUTION_HEADER_INVALID',
    },
    mixedCompanies: {
        file: 'nest-contribution-history-mixed-companies.xlsx',
        error: 'CONTRIBUTION_EMPLOYER_MIXED',
    },
    missingEE: {
        file: 'nest-contribution-history-missing-EE.xlsx',
        error: 'CONTRIBUTION_MISSING_EE_ER',
        missingTypes: ['Employee'],
    },
    missingER: {
        file: 'nest-contribution-history-missing-ER.xlsx',
        error: 'CONTRIBUTION_MISSING_EE_ER',
        missingTypes: ['Employer'],
    },
    correct: {
        file: 'nest-contribution-history-correct.xlsx',
        error: null,
    },
}

function localDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function readWorkbook(filename) {
    const filePath = path.join(FIXTURE_DIR, filename)
    const buffer = fs.readFileSync(filePath)
    return XLSX.read(buffer, { type: 'buffer' })
}

function buildSummary(entries) {
    const summary = {
        totalEntries: entries.length,
        eeCount: 0,
        erCount: 0,
        eeTotal: 0,
        erTotal: 0,
        startDate: null,
        endDate: null,
    }
    entries.forEach((entry) => {
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
    summary.eeTotal = Number(summary.eeTotal.toFixed(2))
    summary.erTotal = Number(summary.erTotal.toFixed(2))
    summary.startDate =
        summary.startDate === null
            ? null
            : localDateString(new Date(summary.startDate))
    summary.endDate =
        summary.endDate === null
            ? null
            : localDateString(new Date(summary.endDate))
    return summary
}

function runFixture(expectedSummary, { file, error, missingTypes }) {
    const workbook = readWorkbook(file)
    if (!error) {
        const result = parseContributionWorkbook(workbook, file, XLSX)
        if (!result.entries || !result.entries.length) {
            throw new Error(`${file}: expected entries, got none`)
        }
        const summary = buildSummary(result.entries)
        expect(summary).toEqual(expectedSummary)
        return
    }
    try {
        parseContributionWorkbook(workbook, file, XLSX)
    } catch (err) {
        expect(err?.message).toBe(error)
        if (error === 'CONTRIBUTION_EMPLOYER_MIXED') {
            expect(Array.isArray(err?.employers)).toBe(true)
        }
        if (error === 'CONTRIBUTION_MISSING_EE_ER' && missingTypes) {
            expect(err?.missingTypes || []).toEqual(missingTypes)
        }
        return
    }
    throw new Error(`${file}: expected error ${error}, got success`)
}

describe('contribution workbook parsing', () => {
    let expectedSummary

    beforeAll(async () => {
        expectedSummary = (await import(pathToFileURL(SUMMARY_PATH))).default
    })

    Object.values(FIXTURES).forEach((fixture) => {
        const label = fixture.file
        it(`handles ${label}`, () => {
            runFixture(expectedSummary, fixture)
        })
    })

    it('parses contribution dates', () => {
        const numericDate = 45123
        const parsedNumeric = XLSX.SSF.parse_date_code(numericDate)
        const expectedNumeric = new Date(
            parsedNumeric.y,
            parsedNumeric.m - 1,
            parsedNumeric.d
        )
            .toISOString()
            .slice(0, 10)
        const rows = [
            ['Date', 'Type', 'Amount', 'Employer'],
            [numericDate, 'From your salary', 10, 'Test Co'],
            ['01/02/25', 'From your employer', 12, 'Test Co'],
            ['not-a-date', 'From your salary', 5, 'Test Co'],
        ]
        const sheet = XLSX.utils.aoa_to_sheet(rows)
        const workbook = { Sheets: { 'Contribution Details': sheet } }
        const result = parseContributionWorkbook(
            workbook,
            'date-test.xlsx',
            XLSX
        )
        const dates = result.entries.map((entry) =>
            entry.date.toISOString().slice(0, 10)
        )
        expect(dates).toEqual([expectedNumeric, '2025-02-01'])
        expect(result.entries.length).toBe(2)
    })

    it('throws when the contribution sheet is missing', () => {
        const workbook = { Sheets: {} }
        expect(() =>
            parseContributionWorkbook(workbook, 'missing-sheet.xlsx', XLSX)
        ).toThrow('CONTRIBUTION_SHEET_MISSING')
    })

    it('throws when no valid rows are found', () => {
        const rows = [
            ['Date', 'Type', 'Amount', 'Employer'],
            ['not-a-date', 'From your salary', null, 'Test Co'],
            [null, 'From your employer', '£12.00', 'Test Co'],
        ]
        const sheet = XLSX.utils.aoa_to_sheet(rows)
        const workbook = { Sheets: { 'Contribution Details': sheet } }
        expect(() =>
            parseContributionWorkbook(workbook, 'no-rows.xlsx', XLSX)
        ).toThrow('CONTRIBUTION_NO_ROWS')
    })

    it('throws when employer values are missing', () => {
        const rows = [
            ['Date', 'Type', 'Amount', 'Employer'],
            ['01/02/25', 'From your salary', 10, null],
            ['01/02/25', 'From your employer', 12, null],
        ]
        const sheet = XLSX.utils.aoa_to_sheet(rows)
        const workbook = { Sheets: { 'Contribution Details': sheet } }
        expect(() =>
            parseContributionWorkbook(workbook, 'missing-employer.xlsx', XLSX)
        ).toThrow('CONTRIBUTION_HEADER_INVALID')
    })

    it('normalizes contribution type labels', () => {
        const rows = [
            ['Date', 'Type', 'Amount', 'Employer'],
            ['01/02/25', 'FROM YOUR SALARY', 10, 'Test Co'],
            ['01/02/25', 'From Your Employer', 12, 'Test Co'],
        ]
        const sheet = XLSX.utils.aoa_to_sheet(rows)
        const workbook = { Sheets: { 'Contribution Details': sheet } }
        const result = parseContributionWorkbook(
            workbook,
            'type-normalization.xlsx',
            XLSX
        )
        const types = result.entries.map((entry) => entry.type)
        expect(types).toEqual(['ee', 'er'])
    })
})
