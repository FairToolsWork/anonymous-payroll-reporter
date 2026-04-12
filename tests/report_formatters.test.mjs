import { describe, expect, it } from 'vitest'
import {
    APRIL_BOUNDARY_NOTE,
    buildMiscReviewLine,
    buildZeroTaxAllowanceNote,
    ZERO_TAX_ALLOWANCE_NOTE,
} from '../pwa/src/report/report_formatters.js'

describe('buildZeroTaxAllowanceNote', () => {
    it('returns a non-empty string when called with no arguments (uses latest configured year)', () => {
        const note = buildZeroTaxAllowanceNote()
        expect(typeof note).toBe('string')
        expect(note.length).toBeGreaterThan(0)
    })

    it('mentions monthly and annual personal allowance amounts', () => {
        const note = buildZeroTaxAllowanceNote()
        // Should mention £1,048 (monthly) and £12,570 (annual)
        expect(note).toContain('£1,048')
        expect(note).toContain('£12,570')
    })

    it('mentions PAYE Tax / National Insurance and configured rate context', () => {
        const note = buildZeroTaxAllowanceNote()
        expect(note).toContain('PAYE Tax / National Insurance')
        expect(note).toContain('current configured UK rate')
    })

    it('returns the same text as ZERO_TAX_ALLOWANCE_NOTE when called with no arguments', () => {
        const note = buildZeroTaxAllowanceNote()
        expect(note).toBe(ZERO_TAX_ALLOWANCE_NOTE)
    })

    it('uses explicitly provided thresholds when given', () => {
        const customThresholds = {
            personalAllowanceAnnual: 13000,
            personalAllowanceMonthly: 1083,
        }
        const note = buildZeroTaxAllowanceNote(customThresholds)
        expect(note).toContain('£1,083')
        expect(note).toContain('£13,000')
    })

    it('differs from default when custom thresholds differ from latest configured year', () => {
        const customThresholds = {
            personalAllowanceAnnual: 11000,
            personalAllowanceMonthly: 916,
        }
        const defaultNote = buildZeroTaxAllowanceNote()
        const customNote = buildZeroTaxAllowanceNote(customThresholds)
        expect(customNote).not.toBe(defaultNote)
        expect(customNote).toContain('£916')
        expect(customNote).toContain('£11,000')
    })

    it('returns unavailable message when null is passed and default thresholds are missing', () => {
        // This tests the fallback path: buildZeroTaxAllowanceNote(null) should still use defaults
        // (DEFAULT_NOTE_THRESHOLDS is set at module level from TAX_YEAR_THRESHOLDS)
        const note = buildZeroTaxAllowanceNote(null)
        // Should not return unavailable message since we have configured thresholds
        expect(note).not.toBe(
            'PAYE Tax / National Insurance context note unavailable.'
        )
        expect(note).toContain('PAYE Tax / National Insurance')
    })
})

describe('APRIL_BOUNDARY_NOTE', () => {
    it('mentions April payslips and tax year boundary', () => {
        expect(APRIL_BOUNDARY_NOTE).toContain('April payslips')
        expect(APRIL_BOUNDARY_NOTE).toContain('6 April tax year boundary')
    })

    it('mentions discrepancies in year-end figures', () => {
        expect(APRIL_BOUNDARY_NOTE).toContain(
            'discrepancies in year-end figures'
        )
    })
})

describe('buildMiscReviewLine', () => {
    it('normalizes missing space before ordinals and does not duplicate existing units/rate detail', () => {
        const line = buildMiscReviewLine({
            dateLabel: '29 Dec 2021',
            type: 'payment',
            label: 'Basic Hours from1st dec (80.00 @ £10.00)',
            amount: 800,
            units: 80,
            rate: 10,
        })

        expect(line).toBe(
            '29 Dec 2021: Payment: Basic Hours from 1st dec (80.00 @ £10.00): £800.00'
        )
    })

    it('adds units/rate detail when it is not present in label', () => {
        const line = buildMiscReviewLine({
            dateLabel: '29 Dec 2021',
            type: 'payment',
            label: 'Basic Hours from 1st dec',
            amount: 800,
            units: 80,
            rate: 10,
        })

        expect(line).toBe(
            '29 Dec 2021: Payment: Basic Hours from 1st dec (80.00 @ £10.00): £800.00'
        )
    })
})
