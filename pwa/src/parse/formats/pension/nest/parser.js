/**
 * @typedef {{ date: Date, type: "ee" | "er", amount: number }} ContributionEntry
 * @typedef {{ entries: ContributionEntry[], debugRows?: unknown[], debugEntries?: ContributionEntry[] }} ContributionParseResult
 */

/**
 * @param {unknown} value
 * @param {any} xlsx
 * @returns {Date | null}
 */
function parseContributionDate(value, xlsx) {
    if (value instanceof Date) {
        return value
    }
    if (typeof value === 'number' && xlsx?.SSF?.parse_date_code) {
        const parsed = xlsx.SSF.parse_date_code(value)
        if (parsed) {
            return new Date(parsed.y, parsed.m - 1, parsed.d)
        }
    }
    if (typeof value === 'string') {
        const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
        if (match) {
            const day = parseInt(match[1], 10)
            const month = parseInt(match[2], 10) - 1
            let year = parseInt(match[3], 10)
            if (year < 100) {
                year += 2000
            }
            const parsed = new Date(year, month, day)
            if (!Number.isNaN(parsed.getTime())) {
                return parsed
            }
        }
    }
    return null
}

/**
 * @param {unknown} value
 * @returns {"ee" | "er" | null}
 */
function normalizeContributionType(value) {
    if (!value) {
        return null
    }
    const normalized = String(value).toLowerCase()
    if (normalized.includes('from your salary')) {
        return 'ee'
    }
    if (normalized.includes('from your employer')) {
        return 'er'
    }
    return null
}

/**
 * @param {any} workbook
 * @param {string} sourceName
 * @param {any} xlsx
 * @returns {ContributionParseResult}
 */
export function parseContributionWorkbook(workbook, sourceName, xlsx) {
    const sheet = workbook?.Sheets?.['Contribution Details']
    if (!sheet) {
        throw new Error('CONTRIBUTION_SHEET_MISSING')
    }
    const rows = /** @type {any[][]} */ (
        xlsx.utils.sheet_to_json(sheet, {
            header: 1,
            defval: null,
        })
    )
    const headerRow = /** @type {any[]} */ (rows[0] || [])
    const headerCells = headerRow.map((cell) =>
        String(cell || '')
            .trim()
            .toLowerCase()
    )
    const dateIndex = headerCells.findIndex((cell) => cell.includes('date'))
    const typeIndex = headerCells.findIndex((cell) => cell.includes('type'))
    const amountIndex = headerCells.findIndex(
        (cell) =>
            cell.includes('amount') &&
            !cell.includes('charge') &&
            !cell.includes('relief') &&
            !cell.includes('invested')
    )
    const resolvedAmountIndex =
        amountIndex >= 0
            ? amountIndex
            : headerCells.findIndex(
                  (cell) =>
                      cell.includes('contribution') && !cell.includes('date')
              )
    const employerIndex = headerCells.findIndex(
        (cell) => cell.includes('employer') || cell.includes('company')
    )
    const hasExpectedHeaders =
        dateIndex >= 0 && typeIndex >= 0 && resolvedAmountIndex >= 0
    if (!hasExpectedHeaders || employerIndex < 0) {
        throw new Error('CONTRIBUTION_HEADER_INVALID')
    }

    /** @type {ContributionEntry[]} */
    const entries = []
    /** @type {ContributionEntry[]} */
    const debugEntries = []
    const employerNames = new Set()
    const contributionTypes = new Set()

    for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i]
        if (!row) {
            continue
        }
        const dateValue = row[dateIndex]
        const typeValue = row[typeIndex]
        const amountValue = row[resolvedAmountIndex]
        const employerValue = row[employerIndex]
        if (
            !dateValue ||
            !typeValue ||
            amountValue === null ||
            amountValue === undefined
        ) {
            continue
        }
        const date = parseContributionDate(dateValue, xlsx)
        const type = normalizeContributionType(typeValue)
        const amount =
            typeof amountValue === 'number'
                ? amountValue
                : parseFloat(String(amountValue).replace(/[^0-9.-]/g, ''))
        if (!date || !type || !Number.isFinite(amount)) {
            continue
        }
        contributionTypes.add(type)
        if (employerValue) {
            employerNames.add(String(employerValue).trim())
        }
        const entry = { date, type, amount }
        entries.push(entry)
        if (debugEntries.length < 20) {
            debugEntries.push(entry)
        }
    }

    if (!entries.length) {
        throw new Error('CONTRIBUTION_NO_ROWS')
    }
    if (!employerNames.size) {
        throw new Error('CONTRIBUTION_HEADER_INVALID')
    }
    if (employerNames.size > 1) {
        const error = /** @type {Error & { employers?: string[] }} */ (
            new Error('CONTRIBUTION_EMPLOYER_MIXED')
        )
        error.employers = Array.from(employerNames)
        throw error
    }
    const hasEE = contributionTypes.has('ee')
    const hasER = contributionTypes.has('er')
    if (!hasEE || !hasER) {
        const error = /** @type {Error & { missingTypes?: string[] }} */ (
            new Error('CONTRIBUTION_MISSING_EE_ER')
        )
        error.missingTypes = /** @type {string[]} */ (
            [!hasEE ? 'Employee' : null, !hasER ? 'Employer' : null].filter(
                (entry) => entry !== null
            )
        )
        throw error
    }

    return {
        entries,
        debugRows: rows.slice(0, 20),
        debugEntries,
    }
}
