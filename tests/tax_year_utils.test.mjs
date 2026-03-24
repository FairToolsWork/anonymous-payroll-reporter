import { describe, expect, it } from 'vitest'
import {
    getLeaveYearKey,
    getLeaveYearSortKey,
    getTaxYearKey,
    getWeeksInPeriod,
} from '../pwa/src/report/tax_year_utils.js'

describe('getWeeksInPeriod', () => {
    it('returns 31/7 for January (31 days)', () => {
        expect(getWeeksInPeriod(new Date(2024, 0, 15))).toBeCloseTo(31 / 7, 10)
    })

    it('returns 29/7 for February in a leap year (2024)', () => {
        expect(getWeeksInPeriod(new Date(2024, 1, 15))).toBeCloseTo(29 / 7, 10)
    })

    it('returns 28/7 for February in a non-leap year (2023)', () => {
        expect(getWeeksInPeriod(new Date(2023, 1, 15))).toBeCloseTo(28 / 7, 10)
    })

    it('returns 30/7 for April (30 days)', () => {
        expect(getWeeksInPeriod(new Date(2024, 3, 15))).toBeCloseTo(30 / 7, 10)
    })

    it('returns 31/7 for July (31 days)', () => {
        expect(getWeeksInPeriod(new Date(2024, 6, 15))).toBeCloseTo(31 / 7, 10)
    })

    it('returns 31/7 for December (31 days)', () => {
        expect(getWeeksInPeriod(new Date(2024, 11, 15))).toBeCloseTo(31 / 7, 10)
    })

    it('is consistent regardless of which day of the month is used', () => {
        const start = getWeeksInPeriod(new Date(2024, 6, 1))
        const mid = getWeeksInPeriod(new Date(2024, 6, 15))
        const end = getWeeksInPeriod(new Date(2024, 6, 31))
        expect(start).toBeCloseTo(mid, 10)
        expect(mid).toBeCloseTo(end, 10)
    })
})

describe('getLeaveYearKey', () => {
    it('returns "Unknown" for a null date', () => {
        expect(getLeaveYearKey(null, 4)).toBe('Unknown')
    })

    it('April start (4): May 2024 → "2024/25" — matches tax year', () => {
        expect(getLeaveYearKey(new Date(2024, 4, 15), 4)).toBe('2024/25')
    })

    it('April start (4): March 2025 → "2024/25" — matches tax year', () => {
        expect(getLeaveYearKey(new Date(2025, 2, 15), 4)).toBe('2024/25')
    })

    it('April start (4): April 1–5 dates match getTaxYearKey exactly (delegates to it, uses April 6 boundary)', () => {
        const apr1 = new Date(2025, 3, 1)
        expect(getLeaveYearKey(apr1, 4)).toBe('2024/25')
        expect(getTaxYearKey(apr1)).toBe('2024/25')
    })

    it('January start (1): returns plain four-digit year string', () => {
        expect(getLeaveYearKey(new Date(2024, 6, 15), 1)).toBe('2024')
    })

    it('January start (1): January 2025 → "2025"', () => {
        expect(getLeaveYearKey(new Date(2025, 0, 15), 1)).toBe('2025')
    })

    it('January start (1): December 2024 → "2024"', () => {
        expect(getLeaveYearKey(new Date(2024, 11, 15), 1)).toBe('2024')
    })

    it('June start (6): date on June boundary → starts new leave year', () => {
        expect(getLeaveYearKey(new Date(2024, 5, 15), 6)).toBe('2024/25')
    })

    it('June start (6): May date falls in prior leave year', () => {
        expect(getLeaveYearKey(new Date(2024, 4, 15), 6)).toBe('2023/24')
    })

    it('June start (6): April 2025 payslip falls in prior leave year despite being in tax year 2025/26', () => {
        const apr15 = new Date(2025, 3, 15)
        expect(getLeaveYearKey(apr15, 6)).toBe('2024/25')
        expect(getTaxYearKey(apr15)).toBe('2025/26')
    })

    it('December start (12): December date starts new leave year', () => {
        expect(getLeaveYearKey(new Date(2024, 11, 15), 12)).toBe('2024/25')
    })

    it('December start (12): November date falls in prior leave year', () => {
        expect(getLeaveYearKey(new Date(2024, 10, 15), 12)).toBe('2023/24')
    })

    it('December start (12): January 2025 is in the leave year that started December 2024', () => {
        expect(getLeaveYearKey(new Date(2025, 0, 15), 12)).toBe('2024/25')
    })

    it('invalid startMonth (0): delegates to getTaxYearKey', () => {
        const date = new Date(2025, 4, 15)
        expect(getLeaveYearKey(date, 0)).toBe(getTaxYearKey(date))
    })

    it('invalid startMonth (13): delegates to getTaxYearKey', () => {
        const date = new Date(2025, 4, 15)
        expect(getLeaveYearKey(date, 13)).toBe(getTaxYearKey(date))
    })

    it('invalid startMonth (NaN): delegates to getTaxYearKey', () => {
        const date = new Date(2025, 4, 15)
        expect(getLeaveYearKey(date, NaN)).toBe(getTaxYearKey(date))
    })

    it('invalid startMonth (non-integer 2.5): delegates to getTaxYearKey', () => {
        const date = new Date(2025, 4, 15)
        expect(getLeaveYearKey(date, 2.5)).toBe(getTaxYearKey(date))
    })

    it('invalid startMonth (-1): delegates to getTaxYearKey', () => {
        const date = new Date(2025, 4, 15)
        expect(getLeaveYearKey(date, -1)).toBe(getTaxYearKey(date))
    })
})

describe('getLeaveYearSortKey', () => {
    it('"YYYY/YY" format returns the start year', () => {
        expect(getLeaveYearSortKey('2024/25')).toBe(2024)
    })

    it('"YYYY/YY" format with adjacent century boundary', () => {
        expect(getLeaveYearSortKey('2099/2100')).toBe(2099)
    })

    it('plain "YYYY" format returns the year', () => {
        expect(getLeaveYearSortKey('2025')).toBe(2025)
    })

    it('"Unknown" returns sentinel 9999', () => {
        expect(getLeaveYearSortKey('Unknown')).toBe(9999)
    })

    it('empty string returns sentinel 9999', () => {
        expect(getLeaveYearSortKey('')).toBe(9999)
    })

    it('null returns sentinel 9999', () => {
        expect(getLeaveYearSortKey(null)).toBe(9999)
    })

    it('garbled string returns sentinel 9999', () => {
        expect(getLeaveYearSortKey('not-a-year')).toBe(9999)
    })
})
