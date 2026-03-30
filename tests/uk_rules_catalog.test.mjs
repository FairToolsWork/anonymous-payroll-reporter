import { describe, expect, it } from 'vitest'
import { FLAG_CATALOG } from '../pwa/src/report/flag_catalog.js'
import {
    HOLIDAY_RATE_TOLERANCE,
    PERSONAL_ALLOWANCE_ANNUAL,
    PERSONAL_ALLOWANCE_MONTHLY,
    TAX_YEAR_START_DAY,
    TAX_YEAR_START_MONTH_INDEX,
} from '../pwa/src/report/uk_thresholds.js'

describe('uk rules catalog', () => {
    it('keeps personal allowance monthly derived from annual', () => {
        expect(PERSONAL_ALLOWANCE_MONTHLY).toBe(
            Math.round(PERSONAL_ALLOWANCE_ANNUAL / 12)
        )
    })

    it('defines expected UK tax-year start boundary constants', () => {
        expect(TAX_YEAR_START_MONTH_INDEX).toBe(3)
        expect(TAX_YEAR_START_DAY).toBe(6)
    })

    it('defines expected holiday rate tolerance', () => {
        expect(HOLIDAY_RATE_TOLERANCE).toBe(0.05)
    })

    it('contains all currently emitted validation flag IDs', () => {
        const expectedIds = [
            'missing_nat_ins',
            'missing_tax_code',
            'paye_zero',
            'nat_ins_zero',
            'payment_line_mismatch',
            'gross_mismatch',
            'net_mismatch',
            'holiday_rate_below_basic',
            'holiday_rate_below_rolling_avg',
        ]

        expectedIds.forEach((id) => {
            expect(FLAG_CATALOG[id]).toBeTruthy()
            expect(FLAG_CATALOG[id].id).toBe(id)
            expect(typeof FLAG_CATALOG[id].label).toBe('string')
            expect(FLAG_CATALOG[id].label.length).toBeGreaterThan(0)
        })
    })
})
