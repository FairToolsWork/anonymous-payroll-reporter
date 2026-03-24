import { ACTIVE_PENSION_FORMAT } from '../parse/active_format.js'
import { getCachedXlsx, loadXlsx } from './app_xlsx.js'

/** @typedef {import('./app.js').ContributionEntry} ContributionEntry */
/** @typedef {import('./app.js').ContributionFailure} ContributionFailure */

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseContributionDate(value) {
    if (value instanceof Date) {
        return value
    }
    const XLSX = getCachedXlsx()
    if (
        typeof value === 'number' &&
        /** @type {any} */ (XLSX).SSF?.parse_date_code
    ) {
        const parsed = /** @type {any} */ (XLSX).SSF.parse_date_code(value)
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
 * @this {import('./app.js').PayrollAppInstance}
 * @param {unknown} value
 * @returns {"ee" | "er" | null}
 */
export function normalizeContributionType(value) {
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
 * @this {import('./app.js').PayrollAppInstance}
 * @param {File[]} files
 * @returns {Promise<{ entries: ContributionEntry[], sourceFiles: string[] } | null>}
 */
export async function parseContributionFiles(files) {
    if (!files || !files.length) {
        return null
    }
    const XLSX = await loadXlsx()
    if (!XLSX) {
        throw new Error('XLSX_NOT_AVAILABLE')
    }
    const parseContributionWorkbook = await ACTIVE_PENSION_FORMAT.parser()
    const XLSXReader = /** @type {any} */ (XLSX)
    /** @type {ContributionEntry[]} */
    const entries = []
    /** @type {ContributionFailure[]} */
    const failures = []
    for (const file of files) {
        try {
            const buffer = await file.arrayBuffer()
            const workbook = XLSXReader.read(buffer, {
                type: 'array',
            })
            const parsed = parseContributionWorkbook(
                workbook,
                file.name || 'Unknown',
                XLSX
            )
            entries.push(...parsed.entries)
            if (this.debugEnabled && !this.debugInfo.excelRows) {
                this.debugInfo.excelSource = file.name || 'Unknown'
                this.debugInfo.excelRows = JSON.stringify(
                    parsed.debugRows || [],
                    null,
                    2
                )
            }
            if (this.debugEnabled && !this.debugInfo.excelParsed) {
                this.debugInfo.excelParsed = JSON.stringify(
                    parsed.debugEntries || [],
                    null,
                    2
                )
            }
        } catch (err) {
            const e = /** @type {any} */ (err)
            failures.push({
                name: file.name || 'Unknown',
                code: e?.message || 'UNKNOWN',
                employers: e?.employers || [],
                missingTypes: e?.missingTypes || [],
            })
        }
    }
    if (failures.length) {
        const error =
            /** @type {Error & { failures: ContributionFailure[] }} */ (
                new Error('CONTRIBUTION_FILE_FAILURES')
            )
        error.failures = failures
        throw error
    }
    return {
        entries,
        sourceFiles: files.map((file) => file.name || 'Unknown'),
    }
}
