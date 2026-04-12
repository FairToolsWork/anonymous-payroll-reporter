import { describe, expect, it } from 'vitest'
import {
    formatTaxYearLabelFromStartYear,
    getIncomeTaxBandsForRegion,
    getPayPeriodIndexForDate,
    getPayPeriodsPerYear,
    getPeriodizedAnnualAmount,
    getTaxYearStartYearFromDate,
    getTaxYearStartYearFromKey,
    getTaxYearThresholdsByStartYear,
    getTaxYearThresholdsForContext,
    parsePayeTaxCode,
    resolveTaxYearThresholdsForContext,
    TAX_YEAR_THRESHOLDS,
} from '../pwa/src/report/uk_thresholds.js'

describe('parsePayeTaxCode', () => {
    it('returns empty result for null or empty input', () => {
        expect(parsePayeTaxCode(null)).toMatchObject({
            normalizedCode: '',
            baseCode: '',
            region: null,
            isEmergency: false,
            isStandardCode: false,
            hasKnownRegion: false,
        })
        expect(parsePayeTaxCode('')).toMatchObject({
            normalizedCode: '',
            isStandardCode: false,
        })
        expect(parsePayeTaxCode(undefined)).toMatchObject({
            normalizedCode: '',
            isStandardCode: false,
        })
    })

    it('identifies standard 1257L code as England region', () => {
        const result = parsePayeTaxCode('1257L')
        expect(result.normalizedCode).toBe('1257L')
        expect(result.baseCode).toBe('1257L')
        expect(result.region).toBe('england')
        expect(result.isStandardCode).toBe(true)
        expect(result.isEmergency).toBe(false)
        expect(result.hasKnownRegion).toBe(true)
    })

    it('lowercases and normalises code before matching', () => {
        const result = parsePayeTaxCode('1257l')
        expect(result.normalizedCode).toBe('1257L')
        expect(result.isStandardCode).toBe(true)
    })

    it('identifies Scotland prefix S as scotland region', () => {
        const result = parsePayeTaxCode('S1257L')
        expect(result.normalizedCode).toBe('S1257L')
        expect(result.region).toBe('scotland')
        expect(result.isStandardCode).toBe(true)
        expect(result.hasKnownRegion).toBe(true)
    })

    it('identifies Wales prefix C as wales region', () => {
        const result = parsePayeTaxCode('C1257L')
        expect(result.normalizedCode).toBe('C1257L')
        expect(result.region).toBe('wales')
        expect(result.isStandardCode).toBe(true)
        expect(result.hasKnownRegion).toBe(true)
    })

    it('detects W1 emergency suffix', () => {
        const result = parsePayeTaxCode('1257L W1')
        expect(result.isEmergency).toBe(true)
        expect(result.baseCode).toBe('1257L')
        expect(result.region).toBe('england')
    })

    it('detects M1 emergency suffix', () => {
        const result = parsePayeTaxCode('1257L M1')
        expect(result.isEmergency).toBe(true)
        expect(result.baseCode).toBe('1257L')
    })

    it('detects X emergency suffix', () => {
        const result = parsePayeTaxCode('1257L X')
        expect(result.isEmergency).toBe(true)
        expect(result.baseCode).toBe('1257L')
    })

    it('identifies Scotland emergency code', () => {
        const result = parsePayeTaxCode('S1257L W1')
        expect(result.region).toBe('scotland')
        expect(result.isEmergency).toBe(true)
        expect(result.isStandardCode).toBe(true)
    })

    it('identifies non-standard code D0 as England and not a standard code', () => {
        const result = parsePayeTaxCode('D0')
        expect(result.region).toBe('england')
        expect(result.isStandardCode).toBe(false)
        expect(result.isFlatRateCode).toBe(false)
        expect(result.normalizedCode).toBe('D0')
    })

    it('identifies non-standard code NT (no tax) as England', () => {
        const result = parsePayeTaxCode('NT')
        expect(result.region).toBe('england')
        expect(result.isStandardCode).toBe(false)
        expect(result.isFlatRateCode).toBe(false)
    })

    it('identifies BR as a flat-rate second job code for England', () => {
        const result = parsePayeTaxCode('BR')
        expect(result.region).toBe('england')
        expect(result.isStandardCode).toBe(false)
        expect(result.isFlatRateCode).toBe(true)
        expect(result.baseCode).toBe('BR')
    })

    it('identifies SBR as a flat-rate second job code for Scotland', () => {
        const result = parsePayeTaxCode('SBR')
        expect(result.region).toBe('scotland')
        expect(result.isStandardCode).toBe(false)
        expect(result.isFlatRateCode).toBe(true)
        expect(result.baseCode).toBe('BR')
    })

    it('trims whitespace before processing', () => {
        const result = parsePayeTaxCode('  1257L  ')
        expect(result.normalizedCode).toBe('1257L')
        expect(result.isStandardCode).toBe(true)
    })
})

describe('getPayPeriodsPerYear', () => {
    it('returns 12 for Monthly (case-insensitive)', () => {
        expect(getPayPeriodsPerYear('Monthly')).toBe(12)
        expect(getPayPeriodsPerYear('monthly')).toBe(12)
        expect(getPayPeriodsPerYear('MONTHLY')).toBe(12)
    })

    it('returns 52 for Weekly (case-insensitive)', () => {
        expect(getPayPeriodsPerYear('Weekly')).toBe(52)
        expect(getPayPeriodsPerYear('weekly')).toBe(52)
        expect(getPayPeriodsPerYear('WEEKLY')).toBe(52)
    })

    it('returns null for unsupported pay cycles', () => {
        expect(getPayPeriodsPerYear('Fortnightly')).toBeNull()
        expect(getPayPeriodsPerYear('4-weekly')).toBeNull()
        expect(getPayPeriodsPerYear('Annual')).toBeNull()
    })

    it('returns null for null, empty, or undefined', () => {
        expect(getPayPeriodsPerYear(null)).toBeNull()
        expect(getPayPeriodsPerYear('')).toBeNull()
        expect(getPayPeriodsPerYear(undefined)).toBeNull()
    })
})

describe('getPeriodizedAnnualAmount', () => {
    it('calculates monthly personal allowance correctly', () => {
        // 12570 / 12 = 1047.5, rounded to 1048
        expect(getPeriodizedAnnualAmount(12570, 1, 12)).toBe(1048)
    })

    it('calculates proportional annual amounts', () => {
        // 12570 * 6 / 12 = 6285
        expect(getPeriodizedAnnualAmount(12570, 6, 12)).toBe(6285)
    })

    it('calculates weekly amounts', () => {
        // 52000 / 52 = 1000
        expect(getPeriodizedAnnualAmount(52000, 1, 52)).toBe(1000)
    })

    it('returns 0 for invalid inputs', () => {
        expect(getPeriodizedAnnualAmount(NaN, 1, 12)).toBe(0)
        expect(getPeriodizedAnnualAmount(12570, NaN, 12)).toBe(0)
        expect(getPeriodizedAnnualAmount(12570, 1, 0)).toBe(0)
        expect(getPeriodizedAnnualAmount(12570, 1, NaN)).toBe(0)
    })
})

describe('getPayPeriodIndexForDate', () => {
    it('returns period 1 for April 6 (tax year start) — monthly', () => {
        expect(getPayPeriodIndexForDate(new Date(2025, 3, 6), 12)).toBe(1)
    })

    it('returns period 2 on the second monthly period boundary', () => {
        // Monthly periods are anchored to the 6 April tax-year start day.
        expect(getPayPeriodIndexForDate(new Date(2025, 4, 6), 12)).toBe(2)
    })

    it('returns period 12 for March (final month of tax year) — monthly', () => {
        // March 31 2025 is still in 2024/25 tax year
        expect(getPayPeriodIndexForDate(new Date(2025, 2, 31), 12)).toBe(12)
    })

    it('returns period 1 for April 6 — weekly', () => {
        expect(getPayPeriodIndexForDate(new Date(2025, 3, 6), 52)).toBe(1)
    })

    it('returns period 2 for the second week', () => {
        // April 13 = 7 days after start → week 2
        expect(getPayPeriodIndexForDate(new Date(2025, 3, 13), 52)).toBe(2)
    })

    it('returns null for null date', () => {
        expect(getPayPeriodIndexForDate(null, 12)).toBeNull()
    })

    it('returns null for unsupported periodsPerYear', () => {
        expect(getPayPeriodIndexForDate(new Date(2025, 3, 6), null)).toBeNull()
        expect(
            getPayPeriodIndexForDate(new Date(2025, 3, 6), undefined)
        ).toBeNull()
    })

    it('returns null for invalid date', () => {
        expect(getPayPeriodIndexForDate(new Date('invalid'), 12)).toBeNull()
    })
})

describe('getTaxYearStartYearFromDate', () => {
    it('returns the correct tax year start for a date after April 6', () => {
        expect(getTaxYearStartYearFromDate(new Date(2025, 3, 6))).toBe(2025)
        expect(getTaxYearStartYearFromDate(new Date(2025, 4, 1))).toBe(2025)
    })

    it('returns the previous year for a date before April 6', () => {
        expect(getTaxYearStartYearFromDate(new Date(2025, 3, 5))).toBe(2024)
        expect(getTaxYearStartYearFromDate(new Date(2025, 2, 31))).toBe(2024)
    })

    it('returns null for invalid inputs', () => {
        expect(getTaxYearStartYearFromDate(null)).toBeNull()
        expect(getTaxYearStartYearFromDate(undefined)).toBeNull()
        expect(getTaxYearStartYearFromDate(new Date('invalid'))).toBeNull()
    })
})

describe('getTaxYearStartYearFromKey', () => {
    it('parses standard YYYY/YY format', () => {
        expect(getTaxYearStartYearFromKey('2025/26')).toBe(2025)
        expect(getTaxYearStartYearFromKey('2024/25')).toBe(2024)
    })

    it('parses century boundary YYYY/YYYY format', () => {
        expect(getTaxYearStartYearFromKey('2099/2100')).toBe(2099)
    })

    it('returns null for Unknown or missing key', () => {
        expect(getTaxYearStartYearFromKey('Unknown')).toBeNull()
        expect(getTaxYearStartYearFromKey(null)).toBeNull()
        expect(getTaxYearStartYearFromKey('')).toBeNull()
    })
})

describe('formatTaxYearLabelFromStartYear', () => {
    it('formats a standard tax year', () => {
        expect(formatTaxYearLabelFromStartYear(2025)).toBe('2025/26')
        expect(formatTaxYearLabelFromStartYear(2024)).toBe('2024/25')
    })

    it('handles century boundary correctly', () => {
        expect(formatTaxYearLabelFromStartYear(2099)).toBe('2099/2100')
    })

    it('returns Unknown for null or non-finite input', () => {
        expect(formatTaxYearLabelFromStartYear(null)).toBe('Unknown')
        expect(formatTaxYearLabelFromStartYear(undefined)).toBe('Unknown')
        expect(formatTaxYearLabelFromStartYear(NaN)).toBe('Unknown')
    })
})

describe('getTaxYearThresholdsByStartYear', () => {
    it('returns thresholds for a configured year', () => {
        const thresholds = getTaxYearThresholdsByStartYear(2025)
        expect(thresholds).not.toBeNull()
        expect(thresholds?.personalAllowanceAnnual).toBe(12570)
        expect(thresholds?.personalAllowanceMonthly).toBe(1048)
        expect(thresholds?.niPrimaryThresholdMonthly).toBe(1048)
    })

    it('returns thresholds for 2021 with different NI threshold', () => {
        const thresholds = getTaxYearThresholdsByStartYear(2021)
        expect(thresholds).not.toBeNull()
        expect(thresholds?.niPrimaryThresholdMonthly).toBe(797)
    })

    it('returns null for unconfigured years', () => {
        expect(getTaxYearThresholdsByStartYear(2015)).toBeNull()
        expect(getTaxYearThresholdsByStartYear(2030)).toBeNull()
    })

    it('returns null for invalid inputs', () => {
        expect(getTaxYearThresholdsByStartYear(null)).toBeNull()
        expect(getTaxYearThresholdsByStartYear(undefined)).toBeNull()
        expect(getTaxYearThresholdsByStartYear(NaN)).toBeNull()
    })
})

describe('getIncomeTaxBandsForRegion', () => {
    const thresholds2025 = TAX_YEAR_THRESHOLDS[2025]

    it('returns England bands for england region', () => {
        const result = getIncomeTaxBandsForRegion(thresholds2025, 'england')
        expect(result).not.toBeNull()
        expect(result?.region).toBe('england')
        expect(Array.isArray(result?.bands)).toBe(true)
        expect(result?.bands.length).toBeGreaterThan(0)
        expect(result?.bands[0].rate).toBe(20)
    })

    it('returns Scotland bands for scotland region', () => {
        const result = getIncomeTaxBandsForRegion(thresholds2025, 'scotland')
        expect(result).not.toBeNull()
        expect(result?.region).toBe('scotland')
        // Scotland has more bands than England
        expect(result?.bands.length).toBeGreaterThan(3)
        expect(result?.bands[0].rate).toBe(19)
    })

    it('returns Wales bands for wales region', () => {
        const result = getIncomeTaxBandsForRegion(thresholds2025, 'wales')
        expect(result).not.toBeNull()
        expect(result?.region).toBe('wales')
    })

    it('returns null for null thresholds', () => {
        expect(getIncomeTaxBandsForRegion(null, 'england')).toBeNull()
    })

    it('returns null for null region', () => {
        expect(getIncomeTaxBandsForRegion(thresholds2025, null)).toBeNull()
    })

    it('returns null for undefined region', () => {
        expect(getIncomeTaxBandsForRegion(thresholds2025, undefined)).toBeNull()
    })
})

describe('resolveTaxYearThresholdsForContext', () => {
    it('returns ok status for a date in a configured tax year', () => {
        const result = resolveTaxYearThresholdsForContext(new Date(2025, 4, 15))
        expect(result.status).toBe('ok')
        expect(result.taxYearStart).toBe(2025)
        expect(result.thresholds).not.toBeNull()
        expect(result.fallbackTaxYearStart).toBeNull()
    })

    it('returns ok for earliest configured year (2021)', () => {
        const result = resolveTaxYearThresholdsForContext(new Date(2021, 6, 1))
        expect(result.status).toBe('ok')
        expect(result.taxYearStart).toBe(2021)
    })

    it('returns fallback-to-previous-tax-year for a future year', () => {
        // 2028 is not configured; should fall back to 2026 (latest configured)
        const result = resolveTaxYearThresholdsForContext(new Date(2028, 4, 15))
        expect(result.status).toBe('fallback-to-previous-tax-year')
        expect(result.taxYearStart).toBe(2028)
        expect(result.fallbackTaxYearStart).toBe(2026)
        expect(result.thresholds).not.toBeNull()
    })

    it('returns unsupported-tax-year for a very old year with no earlier fallback', () => {
        // 2015 is not configured and has no earlier fallback
        const result = resolveTaxYearThresholdsForContext(new Date(2015, 4, 15))
        expect(result.status).toBe('unsupported-tax-year')
        expect(result.taxYearStart).toBe(2015)
        expect(result.thresholds).toBeNull()
    })

    it('returns partial-threshold-support for Apr-Jun 2022', () => {
        // April 2022 is inside the partial support window (Apr 6 - Jul 6 2022)
        const result = resolveTaxYearThresholdsForContext(new Date(2022, 3, 20))
        expect(result.status).toBe('partial-threshold-support')
        expect(result.taxYearStart).toBe(2022)
        expect(result.thresholds).not.toBeNull()
    })

    it('returns partial-threshold-support for June 2022', () => {
        const result = resolveTaxYearThresholdsForContext(new Date(2022, 5, 1))
        expect(result.status).toBe('partial-threshold-support')
    })

    it('returns ok for July 6 2022 (after partial-support window)', () => {
        const result = resolveTaxYearThresholdsForContext(new Date(2022, 6, 6))
        expect(result.status).toBe('ok')
    })

    it('returns unknown-tax-year when both date and yearKey are null', () => {
        const result = resolveTaxYearThresholdsForContext(null, null)
        expect(result.status).toBe('unknown-tax-year')
        expect(result.taxYearStart).toBeNull()
        expect(result.thresholds).toBeNull()
    })

    it('uses yearKey as fallback when date is null', () => {
        const result = resolveTaxYearThresholdsForContext(null, '2025/26')
        expect(result.status).toBe('ok')
        expect(result.taxYearStart).toBe(2025)
        expect(result.thresholds).not.toBeNull()
    })

    it('prefers date over yearKey when date is valid', () => {
        // Date says 2025/26, yearKey says 2024/25 — date wins
        const result = resolveTaxYearThresholdsForContext(
            new Date(2025, 4, 15),
            '2024/25'
        )
        expect(result.taxYearStart).toBe(2025)
    })

    it('uses yearKey fallback for future year when date is null', () => {
        const result = resolveTaxYearThresholdsForContext(null, '2028/29')
        expect(result.status).toBe('fallback-to-previous-tax-year')
        expect(result.taxYearStart).toBe(2028)
    })
})

describe('getTaxYearThresholdsForContext', () => {
    it('returns thresholds for a configured year', () => {
        const thresholds = getTaxYearThresholdsForContext(new Date(2025, 4, 15))
        expect(thresholds).not.toBeNull()
        expect(thresholds?.personalAllowanceAnnual).toBe(12570)
    })

    it('returns thresholds via yearKey when date is null', () => {
        const thresholds = getTaxYearThresholdsForContext(null, '2024/25')
        expect(thresholds).not.toBeNull()
        expect(thresholds?.personalAllowanceMonthly).toBe(1048)
    })

    it('returns null when neither date nor yearKey resolves to thresholds', () => {
        const thresholds = getTaxYearThresholdsForContext(null, null)
        expect(thresholds).toBeNull()
    })

    it('returns fallback thresholds for a future year not yet configured', () => {
        const thresholds = getTaxYearThresholdsForContext(new Date(2028, 4, 15))
        // Should return 2026 thresholds as fallback
        expect(thresholds).not.toBeNull()
    })
})
