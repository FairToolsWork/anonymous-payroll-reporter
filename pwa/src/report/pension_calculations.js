import {
    getFiscalMonthIndex,
    getTaxYearKey,
    getTaxYearSortKey,
} from './tax_year_utils.js'

/**
 * @typedef {{ date: Date | null, type: string, amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], sourceFiles: string[] }} ContributionData
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number, balance: number }} ContributionMonthSummary
 * @typedef {{ expectedEE: number, expectedER: number, actualEE: number, actualER: number, delta: number }} ContributionYearTotals
 * @typedef {{ months: Map<number, ContributionMonthSummary>, totals: ContributionYearTotals, yearEndBalance: number }} ContributionYearSummary
 * @typedef {{ years: Map<string, ContributionYearSummary>, balance: number, sourceFiles: string[] }} ContributionSummary
 * @typedef {{ record: any, parsedDate: Date | null, yearKey: string | null }} PensionReportEntry
 */

/**
 * @param {string | number} year
 * @param {number} monthIndex
 * @returns {string}
 */
function buildMonthKey(year, monthIndex) {
    return `${year}-${String(monthIndex).padStart(2, '0')}`
}

/**
 * @param {PensionReportEntry[]} entries
 * @param {ContributionData | null | undefined} contributionData
 * @param {string[]} yearKeys
 * @returns {ContributionSummary | null}
 */
export function buildContributionSummary(entries, contributionData, yearKeys) {
    if (
        !contributionData ||
        !contributionData.entries ||
        !contributionData.entries.length
    ) {
        return null
    }
    const expectedByMonth = new Map()
    entries.forEach((entry) => {
        if (!(entry.parsedDate instanceof Date)) {
            return
        }
        const yearKey = getTaxYearKey(entry.parsedDate)
        const fiscalMonthIndex = getFiscalMonthIndex(entry.parsedDate)
        if (!yearKey || yearKey === 'Unknown' || !fiscalMonthIndex) {
            return
        }
        const key = buildMonthKey(yearKey, fiscalMonthIndex)
        const expected = expectedByMonth.get(key) || { ee: 0, er: 0 }
        expected.ee +=
            entry.record.payrollDoc?.deductions?.pensionEE?.amount || 0
        expected.er +=
            entry.record.payrollDoc?.deductions?.pensionER?.amount || 0
        expectedByMonth.set(key, expected)
    })

    const actualByMonth = new Map()
    contributionData.entries.forEach((entry) => {
        if (!(entry.date instanceof Date)) {
            return
        }
        const yearKey = getTaxYearKey(entry.date)
        const fiscalMonthIndex = getFiscalMonthIndex(entry.date)
        if (!yearKey || yearKey === 'Unknown' || !fiscalMonthIndex) {
            return
        }
        const key = buildMonthKey(yearKey, fiscalMonthIndex)
        const actual = actualByMonth.get(key) || { ee: 0, er: 0 }
        if (entry.type === 'ee') {
            actual.ee += entry.amount || 0
        } else if (entry.type === 'er') {
            actual.er += entry.amount || 0
        }
        actualByMonth.set(key, actual)
    })

    const contributionYears = new Set()
    actualByMonth.forEach((_, key) => {
        const year = key.split('-')[0]
        if (year && year !== 'Unknown') {
            contributionYears.add(year)
        }
    })
    const allYearKeys = Array.from(
        new Set([
            ...yearKeys.filter((k) => k && k !== 'Unknown'),
            ...contributionYears,
        ])
    ).sort((a, b) => getTaxYearSortKey(a) - getTaxYearSortKey(b))

    const summaryByYear = new Map()
    let overallBalance = 0
    allYearKeys.forEach((yearKey) => {
        if (!yearKey || yearKey === 'Unknown') {
            return
        }
        const months = new Map()
        const totals = {
            expectedEE: 0,
            expectedER: 0,
            actualEE: 0,
            actualER: 0,
            delta: 0,
        }
        let runningBalance = 0
        for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
            const key = buildMonthKey(yearKey, monthIndex)
            const expected = expectedByMonth.get(key) || { ee: 0, er: 0 }
            const actual = actualByMonth.get(key) || { ee: 0, er: 0 }
            const expectedTotal = expected.ee + expected.er
            const actualTotal = actual.ee + actual.er
            const delta = actualTotal - expectedTotal
            runningBalance += delta
            months.set(monthIndex, {
                expectedEE: expected.ee,
                expectedER: expected.er,
                actualEE: actual.ee,
                actualER: actual.er,
                delta,
                balance: runningBalance,
            })
            totals.expectedEE += expected.ee
            totals.expectedER += expected.er
            totals.actualEE += actual.ee
            totals.actualER += actual.er
            totals.delta += delta
        }
        summaryByYear.set(yearKey, {
            months,
            totals,
            yearEndBalance: runningBalance,
        })
        overallBalance += totals.delta
    })

    return {
        years: summaryByYear,
        balance: overallBalance,
        sourceFiles: contributionData.sourceFiles || [],
    }
}
