import { describe, expect, it } from 'vitest'
import { FLAG_CATALOG } from '../pwa/src/report/flag_catalog.js'
import {
    formatTaxYearLabelFromStartYear,
    getIncomeTaxBandsForRegion,
    getPayPeriodIndexForDate,
    getPayPeriodsPerYear,
    getPeriodizedAnnualAmount,
    parsePayeTaxCode,
    getTaxYearStartYearFromDate,
    getTaxYearThresholdsByStartYear,
    getTaxYearThresholdsForDate,
    getTaxYearThresholdsForKey,
    HOLIDAY_RATE_TOLERANCE,
    PAYE_VALIDATION_TOLERANCE,
    resolveTaxYearThresholdsForContext,
    RULES_VERSION,
    TAX_YEAR_THRESHOLDS,
    TAX_YEAR_START_DAY,
    TAX_YEAR_START_MONTH_INDEX,
    THRESHOLDS_VERSION,
    VALIDATION_TOLERANCE,
} from '../pwa/src/report/uk_thresholds.js'

describe('uk rules catalog', () => {
    it('keeps personal allowance monthly derived from annual for each tax year entry', () => {
        Object.values(TAX_YEAR_THRESHOLDS).forEach((entry) => {
            expect(entry.personalAllowanceMonthly).toBe(
                Math.round(entry.personalAllowanceAnnual / 12)
            )
        })
    })

    it('resolves thresholds for known tax-year date and key', () => {
        const thresholdByDate = getTaxYearThresholdsForDate(
            new Date('2025-05-01T00:00:00.000Z')
        )
        const thresholdByKey = getTaxYearThresholdsForKey('2025/26')

        expect(thresholdByDate).toBeTruthy()
        expect(thresholdByDate).toEqual(thresholdByKey)
    })

    it('computes UK tax-year start year around April boundary', () => {
        const beforeBoundary = getTaxYearStartYearFromDate(
            new Date('2025-04-05T00:00:00.000Z')
        )
        const onBoundary = getTaxYearStartYearFromDate(
            new Date('2025-04-06T00:00:00.000Z')
        )

        expect(beforeBoundary).toBe(2024)
        expect(onBoundary).toBe(2025)
    })

    it('returns null for unknown tax-year start', () => {
        expect(getTaxYearThresholdsByStartYear(1999)).toBeNull()
    })

    it('formats tax-year labels consistently including century boundary years', () => {
        expect(formatTaxYearLabelFromStartYear(2025)).toBe('2025/26')
        expect(formatTaxYearLabelFromStartYear(2099)).toBe('2099/2100')
    })

    it('parses standard and emergency PAYE tax codes with regional routing', () => {
        expect(parsePayeTaxCode('1257L')).toMatchObject({
            baseCode: '1257L',
            region: 'england',
            isEmergency: false,
            isStandardCode: true,
        })
        expect(parsePayeTaxCode('S1257L M1')).toMatchObject({
            baseCode: '1257L',
            region: 'scotland',
            isEmergency: true,
            isStandardCode: true,
        })
        expect(parsePayeTaxCode('CBR')).toMatchObject({
            region: 'wales',
            isStandardCode: false,
        })
    })

    it('returns the requested regional band set for a supported tax year', () => {
        const thresholds = getTaxYearThresholdsByStartYear(2025)

        expect(
            getIncomeTaxBandsForRegion(thresholds, 'england')?.bands
        ).toHaveLength(3)
        expect(
            getIncomeTaxBandsForRegion(thresholds, 'wales')?.bands
        ).toHaveLength(3)
        expect(
            getIncomeTaxBandsForRegion(thresholds, 'scotland')?.bands
        ).toHaveLength(6)
    })

    it('supports monthly and weekly pay-period conversions', () => {
        expect(getPayPeriodsPerYear('Monthly')).toBe(12)
        expect(getPayPeriodsPerYear('Weekly')).toBe(52)
        expect(getPayPeriodsPerYear('Fortnightly')).toBeNull()

        expect(getPeriodizedAnnualAmount(12570, 1, 12)).toBe(1048)
        expect(getPeriodizedAnnualAmount(12570, 1, 52)).toBe(242)
        expect(
            getPayPeriodIndexForDate(new Date('2025-05-31T00:00:00.000Z'), 12)
        ).toBe(2)
        expect(
            getPayPeriodIndexForDate(new Date('2025-04-20T00:00:00.000Z'), 52)
        ).toBe(3)
        expect(
            getPayPeriodIndexForDate(new Date('2026-04-05T00:00:00.000Z'), 52)
        ).toBe(53)
    })

    it('keeps historical date lookups pinned to their own tax-year entry', () => {
        const historical = getTaxYearThresholdsForDate(
            new Date('2025-01-15T00:00:00.000Z')
        )
        const current = getTaxYearThresholdsForDate(
            new Date('2025-05-15T00:00:00.000Z')
        )

        expect(historical).toBe(TAX_YEAR_THRESHOLDS[2024])
        expect(current).toBe(TAX_YEAR_THRESHOLDS[2025])
        expect(historical).not.toBe(current)
    })

    it('defines expected UK tax-year start boundary constants', () => {
        expect(TAX_YEAR_START_MONTH_INDEX).toBe(3)
        expect(TAX_YEAR_START_DAY).toBe(6)
    })

    it('defines expected holiday rate tolerance', () => {
        expect(HOLIDAY_RATE_TOLERANCE).toBe(0.05)
    })

    it('defines expected validation tolerance', () => {
        expect(VALIDATION_TOLERANCE).toBe(0.05)
    })

    it('defines expected PAYE validation tolerance', () => {
        expect(PAYE_VALIDATION_TOLERANCE).toBe(0.5)
    })

    it('limits partial threshold support to 6 Apr 2022 through 5 Jul 2022', () => {
        const apr2022 = resolveTaxYearThresholdsForContext(
            new Date('2022-04-30T00:00:00.000Z')
        )
        const jul2022Boundary = resolveTaxYearThresholdsForContext(
            new Date('2022-07-06T00:00:00.000Z')
        )
        const jan2023 = resolveTaxYearThresholdsForContext(
            new Date('2023-01-28T00:00:00.000Z')
        )

        expect(apr2022.status).toBe('partial-threshold-support')
        expect(jul2022Boundary.status).toBe('ok')
        expect(jan2023.status).toBe('ok')
    })

    it('uses previous available thresholds for future unsupported tax years', () => {
        const resolution = resolveTaxYearThresholdsForContext(
            new Date('2027-04-30T00:00:00.000Z')
        )

        expect(resolution.status).toBe('fallback-to-previous-tax-year')
        expect(resolution.taxYearStart).toBe(2027)
        expect(resolution.fallbackTaxYearStart).toBe(2026)
        expect(resolution.thresholds).toBe(TAX_YEAR_THRESHOLDS[2026])
    })

    it('keeps rules and thresholds version markers aligned', () => {
        expect(typeof RULES_VERSION).toBe('string')
        expect(typeof THRESHOLDS_VERSION).toBe('string')
        expect(RULES_VERSION.length).toBeGreaterThan(0)
        expect(THRESHOLDS_VERSION).toBe(RULES_VERSION)
    })

    it('contains all currently emitted validation flag IDs', () => {
        const expectedIds = [
            'missing_nat_ins',
            'missing_tax_code',
            'paye_zero',
            'paye_tax_code_unsupported',
            'paye_pay_cycle_unsupported',
            'nat_ins_zero',
            'paye_basic_rate_code',
            'tax_year_thresholds_unavailable',
            'tax_year_thresholds_partial_support',
            'pension_auto_enrolment_missing_deductions',
            'pension_opt_in_possible',
            'pension_join_no_mandatory_employer_contrib',
            'unrecognised_deduction',
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
