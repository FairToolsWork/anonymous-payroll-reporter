/**
 * UK tax and payroll thresholds used by report calculations and notices.
 *
 * Keep these values synchronized with each UK tax year update.
 */

/** Immutable rules snapshot identifier for audit traces. */
export const RULES_VERSION = '2026-04-04'

/** Version marker for the current threshold set. */
export const THRESHOLDS_VERSION = RULES_VERSION

/**
 * Year-variant statutory thresholds keyed by UK tax-year start year.
 *
 * @typedef {{
 *   personalAllowanceAnnual: number,
 *   personalAllowanceMonthly: number,
 *   niPrimaryThresholdMonthly: number,
 *   pensionAutoEnrolmentTriggerAnnual: number,
 *   pensionQualifyingEarningsLowerAnnual: number,
 *   pensionQualifyingEarningsUpperAnnual: number,
 *   incomeTaxBands: {
 *     england: { name: string, rate: number, lower: number, upper: number|null }[],
 *     wales:   { name: string, rate: number, lower: number, upper: number|null }[],
 *     scotland:{ name: string, rate: number, lower: number, upper: number|null }[],
 *   }
 * }} TaxYearThresholds
 */

export const TAX_YEAR_THRESHOLDS = Object.freeze({
    // ---------------------------------------------------------
    // 2026/27
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
    // ---------------------------------------------------------
    2026: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 1048,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 3967 },
                { name: 'Basic', rate: 20, lower: 3968, upper: 16956 },
                { name: 'Intermediate', rate: 21, lower: 16957, upper: 31092 },
                { name: 'Higher', rate: 42, lower: 31093, upper: 62430 },
                { name: 'Advanced', rate: 45, lower: 62431, upper: 125140 },
                { name: 'Top', rate: 48, lower: 125141, upper: null },
            ],
        },
    }),

    // ---------------------------------------------------------
    // 2025/26
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026
    // ---------------------------------------------------------
    2025: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 1048,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 2827 },
                { name: 'Basic', rate: 20, lower: 2828, upper: 14921 },
                { name: 'Intermediate', rate: 21, lower: 14922, upper: 31092 },
                { name: 'Higher', rate: 42, lower: 31093, upper: 62430 },
                { name: 'Advanced', rate: 45, lower: 62431, upper: 125140 },
                { name: 'Top', rate: 48, lower: 125141, upper: null },
            ],
        },
    }),

    // ---------------------------------------------------------
    // 2024/25
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2024-to-2025
    // ---------------------------------------------------------
    2024: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 1048,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 2306 },
                { name: 'Basic', rate: 20, lower: 2307, upper: 13991 },
                { name: 'Intermediate', rate: 21, lower: 13992, upper: 31092 },
                { name: 'Higher', rate: 42, lower: 31093, upper: 62430 },
                { name: 'Advanced', rate: 45, lower: 62431, upper: 125140 },
                { name: 'Top', rate: 48, lower: 125141, upper: null },
            ],
        },
    }),

    // ---------------------------------------------------------
    // 2023/24
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2023-to-2024
    // ---------------------------------------------------------
    2023: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 1048,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 125140 },
                { name: 'Additional', rate: 45, lower: 125141, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 2162 },
                { name: 'Basic', rate: 20, lower: 2163, upper: 13118 },
                { name: 'Intermediate', rate: 21, lower: 13119, upper: 31092 },
                { name: 'Higher', rate: 42, lower: 31093, upper: 125140 },
                { name: 'Top', rate: 47, lower: 125141, upper: null },
            ],
        },
    }),

    // ---------------------------------------------------------
    // 2022/23
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2022-to-2023
    // ---------------------------------------------------------
    2022: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 1048,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 150000 },
                { name: 'Additional', rate: 45, lower: 150001, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 150000 },
                { name: 'Additional', rate: 45, lower: 150001, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 2162 },
                { name: 'Basic', rate: 20, lower: 2163, upper: 13118 },
                { name: 'Intermediate', rate: 21, lower: 13119, upper: 31092 },
                { name: 'Higher', rate: 41, lower: 31093, upper: 150000 },
                { name: 'Top', rate: 46, lower: 150001, upper: null },
            ],
        },
    }),

    // ---------------------------------------------------------
    // 2021/22
    // Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2021-to-2022
    // ---------------------------------------------------------
    2021: Object.freeze({
        personalAllowanceAnnual: 12570,
        personalAllowanceMonthly: 1048,
        niPrimaryThresholdMonthly: 797,

        pensionAutoEnrolmentTriggerAnnual: 10000,
        pensionQualifyingEarningsLowerAnnual: 6240,
        pensionQualifyingEarningsUpperAnnual: 50270,

        incomeTaxBands: {
            england: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 150000 },
                { name: 'Additional', rate: 45, lower: 150001, upper: null },
            ],
            wales: [
                { name: 'Basic', rate: 20, lower: 0, upper: 37700 },
                { name: 'Higher', rate: 40, lower: 37701, upper: 150000 },
                { name: 'Additional', rate: 45, lower: 150001, upper: null },
            ],
            scotland: [
                { name: 'Starter', rate: 19, lower: 0, upper: 2097 },
                { name: 'Basic', rate: 20, lower: 2098, upper: 12726 },
                { name: 'Intermediate', rate: 21, lower: 12727, upper: 31092 },
                { name: 'Higher', rate: 41, lower: 31093, upper: 150000 },
                { name: 'Top', rate: 46, lower: 150001, upper: null },
            ],
        },
    }),
})

/** Default staleness threshold for contribution recency displays.
 * https://www.moneyhelper.org.uk/en/pensions-and-retirement/pension-problems/complaining-about-delays-to-your-pension#When-must-my-employer-make-my-pension-contributions-by--
 */
export const CONTRIBUTION_RECENCY_DAYS_THRESHOLD = 22

/** Tolerance (£) used for line/gross/net reconciliation checks. */
export const VALIDATION_TOLERANCE = 0.05

/** Tolerance (£) used for PAYE expected-vs-reported mismatch checks. */
export const PAYE_VALIDATION_TOLERANCE = 0.5

/** Holiday pay tolerance (£/hr) used for rate comparison warnings.
 * This is our own internal threshold to allow for minor discrepancies
 * in rate calculations and rounding, not an official HMRC figure.
 */
export const HOLIDAY_RATE_TOLERANCE = 0.05

/** Tax year starts on 6 April in the UK tax calendar. */
export const TAX_YEAR_START_MONTH_INDEX = 3
export const TAX_YEAR_START_DAY = 6

/** Leave years starting on/after this date use 12.07% accrual for variable work patterns.
 * https://www.gov.uk/holiday-entitlement-rights/holiday-entitlement-for-workers-with-variable-hours
 */
export const HOLIDAY_ACCRUAL_CUTOFF = new Date(2024, 3, 1)

/**
 * Apr-Jun 2022 sits inside tax year 2022/23 but uses the pre-6 July NI threshold.
 * The current threshold catalog is tax-year keyed, so we explicitly mark this slice
 * as only partially supported instead of pretending a single 2022/23 NI threshold is exact.
 *
 * @param {Date | null | undefined} date
 * @returns {boolean}
 */
function isPartialSupportThresholdPeriod(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return false
    }
    if (date.getFullYear() !== 2022) {
        return false
    }
    const monthIndex = date.getMonth()
    const day = date.getDate()
    const isOnOrAfterApr6 = monthIndex > 3 || (monthIndex === 3 && day >= 6)
    const isBeforeJul6 = monthIndex < 6 || (monthIndex === 6 && day < 6)
    return isOnOrAfterApr6 && isBeforeJul6
}

/**
 * @param {Date | null | undefined} date
 * @returns {number | null}
 */
export function getTaxYearStartYearFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null
    }
    const year = date.getFullYear()
    const monthIndex = date.getMonth()
    const day = date.getDate()
    const isAfterStart =
        monthIndex > TAX_YEAR_START_MONTH_INDEX ||
        (monthIndex === TAX_YEAR_START_MONTH_INDEX && day >= TAX_YEAR_START_DAY)
    return isAfterStart ? year : year - 1
}

/**
 * @param {string | number | null | undefined} yearKey
 * @returns {number | null}
 */
export function getTaxYearStartYearFromKey(yearKey) {
    if (!yearKey || yearKey === 'Unknown') {
        return null
    }
    const match = String(yearKey).match(/^(\d{4})\//)
    if (!match) {
        return null
    }
    const parsed = Number.parseInt(match[1], 10)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * @param {number | null | undefined} taxYearStart
 * @returns {TaxYearThresholds | null}
 */
export function getTaxYearThresholdsByStartYear(taxYearStart) {
    if (!Number.isFinite(taxYearStart)) {
        return null
    }
    const thresholdsByYear = /** @type {Record<number, TaxYearThresholds>} */ (
        TAX_YEAR_THRESHOLDS
    )
    return thresholdsByYear[Number(taxYearStart)] || null
}

/**
 * @param {Date | null | undefined} date
 * @returns {TaxYearThresholds | null}
 */
export function getTaxYearThresholdsForDate(date) {
    const startYear = getTaxYearStartYearFromDate(date)
    return getTaxYearThresholdsByStartYear(startYear)
}

/**
 * @param {string | number | null | undefined} yearKey
 * @returns {TaxYearThresholds | null}
 */
export function getTaxYearThresholdsForKey(yearKey) {
    const startYear = getTaxYearStartYearFromKey(yearKey)
    return getTaxYearThresholdsByStartYear(startYear)
}

/**
 * @param {number | null | undefined} startYear
 * @returns {string}
 */
export function formatTaxYearLabelFromStartYear(startYear) {
    if (!Number.isFinite(startYear)) {
        return 'Unknown'
    }
    const numericStartYear = Number(startYear)
    const endYear = numericStartYear + 1
    const endYearSuffix = String(endYear % 100).padStart(2, '0')
    const formattedEndYear =
        endYear % 100 === 0 ? String(endYear) : endYearSuffix
    return `${numericStartYear}/${formattedEndYear}`
}

/**
 * @typedef {'england' | 'wales' | 'scotland'} IncomeTaxRegion
 */

/**
 * @typedef {{
 *   normalizedCode: string,
 *   baseCode: string,
 *   region: IncomeTaxRegion | null,
 *   isEmergency: boolean,
 *   isStandardCode: boolean,
 *   hasKnownRegion: boolean,
 * }} ParsedPayeTaxCode
 */

/**
 * @param {string | null | undefined} taxCode
 * @returns {ParsedPayeTaxCode}
 */
export function parsePayeTaxCode(taxCode) {
    const normalizedCode = String(taxCode || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ')
    if (!normalizedCode) {
        return {
            normalizedCode: '',
            baseCode: '',
            region: null,
            isEmergency: false,
            isStandardCode: false,
            hasKnownRegion: false,
        }
    }

    const region = normalizedCode.startsWith('S')
        ? 'scotland'
        : normalizedCode.startsWith('C')
          ? 'wales'
          : 'england'
    const regionlessCode =
        region === 'england' ? normalizedCode : normalizedCode.slice(1).trim()
    const emergencyToken = '(?:W1\\/M1|M1\\/W1|W1|M1|X)'
    const isEmergency = new RegExp(
        `(?:^|\\s)${emergencyToken}(?:\\s|$)`
    ).test(regionlessCode)
    const baseCode = regionlessCode
        .replace(
            new RegExp(`(?:^|\\s)${emergencyToken}(?:\\s|$)`, 'g'),
            ' '
        )
        .replace(/\s+/g, '')
        .trim()

    return {
        normalizedCode,
        baseCode,
        region,
        isEmergency,
        isStandardCode: baseCode === '1257L',
        hasKnownRegion: region !== null,
    }
}

/**
 * @param {TaxYearThresholds | null | undefined} thresholds
 * @param {IncomeTaxRegion | null | undefined} region
 * @returns {{ region: IncomeTaxRegion, bands: TaxYearThresholds['incomeTaxBands'][IncomeTaxRegion] } | null}
 */
export function getIncomeTaxBandsForRegion(thresholds, region) {
    if (!thresholds || !region) {
        return null
    }
    const bands = thresholds.incomeTaxBands?.[region]
    if (!Array.isArray(bands) || bands.length === 0) {
        return null
    }
    return { region, bands }
}

/**
 * @param {string | null | undefined} payCycle
 * @returns {12 | 52 | null}
 */
export function getPayPeriodsPerYear(payCycle) {
    const normalizedCycle = String(payCycle || '')
        .trim()
        .toLowerCase()
    if (normalizedCycle === 'monthly') {
        return 12
    }
    if (normalizedCycle === 'weekly') {
        return 52
    }
    return null
}

/**
 * @param {number} annualAmount
 * @param {number} completedPeriods
 * @param {12 | 52} periodsPerYear
 * @returns {number}
 */
export function getPeriodizedAnnualAmount(
    annualAmount,
    completedPeriods,
    periodsPerYear
) {
    if (
        !Number.isFinite(annualAmount) ||
        !Number.isFinite(completedPeriods) ||
        !Number.isFinite(periodsPerYear) ||
        periodsPerYear <= 0
    ) {
        return 0
    }
    return Math.round((annualAmount * completedPeriods) / periodsPerYear)
}

/**
 * @param {Date | null | undefined} date
 * @param {12 | 52 | null | undefined} periodsPerYear
 * @returns {number | null}
 */
export function getPayPeriodIndexForDate(date, periodsPerYear) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null
    }
    if (periodsPerYear === 12) {
        const startYear = getTaxYearStartYearFromDate(date)
        if (startYear === null) {
            return null
        }
        return (
            (((date.getFullYear() - startYear) * 12 +
                date.getMonth() -
                3 +
                12) %
                12) +
            1
        )
    }
    if (periodsPerYear === 52) {
        const startYear = getTaxYearStartYearFromDate(date)
        if (startYear === null) {
            return null
        }
        const taxYearStartUtc = Date.UTC(
            startYear,
            TAX_YEAR_START_MONTH_INDEX,
            TAX_YEAR_START_DAY
        )
        const dateUtc = Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        )
        const diffDays = Math.floor(
            (dateUtc - taxYearStartUtc) / (24 * 60 * 60 * 1000)
        )
        return Math.max(1, Math.floor(diffDays / 7) + 1)
    }
    return null
}

/**
 * @typedef {{
 *   thresholds: TaxYearThresholds | null,
 *   taxYearStart: number | null,
 *   status: 'ok' | 'unknown-tax-year' | 'unsupported-tax-year' | 'partial-threshold-support' | 'fallback-to-previous-tax-year',
 *   fallbackTaxYearStart: number | null,
 * }} TaxYearThresholdResolution
 */

/**
 * @param {number} requestedTaxYearStart
 * @returns {number | null}
 */
function getPreviousAvailableTaxYearStart(requestedTaxYearStart) {
    if (!Number.isFinite(requestedTaxYearStart)) {
        return null
    }
    const availableYears = Object.keys(TAX_YEAR_THRESHOLDS)
        .map((year) => Number.parseInt(year, 10))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a)

    for (const year of availableYears) {
        if (year < requestedTaxYearStart) {
            return year
        }
    }
    return null
}

/**
 * Resolves thresholds for a report context and returns explicit status when unavailable.
 *
 * @param {Date | null | undefined} date
 * @param {string | number | null | undefined} [yearKey]
 * @returns {TaxYearThresholdResolution}
 */
export function resolveTaxYearThresholdsForContext(date, yearKey = null) {
    const dateStart = getTaxYearStartYearFromDate(date)
    if (dateStart !== null) {
        const thresholds = getTaxYearThresholdsByStartYear(dateStart)
        if (thresholds) {
            if (isPartialSupportThresholdPeriod(date)) {
                return {
                    thresholds,
                    taxYearStart: dateStart,
                    status: 'partial-threshold-support',
                    fallbackTaxYearStart: null,
                }
            }
            return {
                thresholds,
                taxYearStart: dateStart,
                status: 'ok',
                fallbackTaxYearStart: null,
            }
        }
        const fallbackStart = getPreviousAvailableTaxYearStart(dateStart)
        if (fallbackStart !== null) {
            const fallbackThresholds =
                getTaxYearThresholdsByStartYear(fallbackStart)
            if (fallbackThresholds) {
                return {
                    thresholds: fallbackThresholds,
                    taxYearStart: dateStart,
                    status: 'fallback-to-previous-tax-year',
                    fallbackTaxYearStart: fallbackStart,
                }
            }
        }
        return {
            thresholds: null,
            taxYearStart: dateStart,
            status: 'unsupported-tax-year',
            fallbackTaxYearStart: null,
        }
    }

    const keyStart = getTaxYearStartYearFromKey(yearKey)
    if (keyStart !== null) {
        const thresholds = getTaxYearThresholdsByStartYear(keyStart)
        if (thresholds) {
            return {
                thresholds,
                taxYearStart: keyStart,
                status: 'ok',
                fallbackTaxYearStart: null,
            }
        }
        const fallbackStart = getPreviousAvailableTaxYearStart(keyStart)
        if (fallbackStart !== null) {
            const fallbackThresholds =
                getTaxYearThresholdsByStartYear(fallbackStart)
            if (fallbackThresholds) {
                return {
                    thresholds: fallbackThresholds,
                    taxYearStart: keyStart,
                    status: 'fallback-to-previous-tax-year',
                    fallbackTaxYearStart: fallbackStart,
                }
            }
        }
        return {
            thresholds: null,
            taxYearStart: keyStart,
            status: 'unsupported-tax-year',
            fallbackTaxYearStart: null,
        }
    }

    return {
        thresholds: null,
        taxYearStart: null,
        status: 'unknown-tax-year',
        fallbackTaxYearStart: null,
    }
}

/**
 * @param {Date | null | undefined} date
 * @param {string | number | null | undefined} [yearKey]
 * @returns {TaxYearThresholds | null}
 */
export function getTaxYearThresholdsForContext(date, yearKey = null) {
    return resolveTaxYearThresholdsForContext(date, yearKey).thresholds
}
