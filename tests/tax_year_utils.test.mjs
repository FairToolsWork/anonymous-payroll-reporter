import { describe, expect, it } from 'vitest'
import { getWeeksInPeriod } from '../pwa/src/report/tax_year_utils.js'

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
