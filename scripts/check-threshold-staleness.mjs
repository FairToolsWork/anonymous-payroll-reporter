#!/usr/bin/env node

import {
    THRESHOLDS_VERSION,
    getLatestConfiguredThresholdTaxYearStart,
    getThresholdStalenessStatus,
    parseThresholdsVersionDate,
} from '../pwa/src/report/uk_thresholds.js'

/**
 * @param {string | undefined} value
 * @returns {Date | null}
 */
function parseOverrideDate(value) {
    if (!value) {
        return null
    }
    const parsed = parseThresholdsVersionDate(value)
    return parsed
}

const overrideDate = parseOverrideDate(process.env.THRESHOLD_CHECK_TODAY)
if (process.env.THRESHOLD_CHECK_TODAY && !overrideDate) {
    console.error(
        '[threshold-check] Invalid THRESHOLD_CHECK_TODAY. Use YYYY-MM-DD.'
    )
    process.exit(1)
}

const today = overrideDate || new Date()
const status = getThresholdStalenessStatus(today, THRESHOLDS_VERSION)
const latestConfiguredTaxYearStart = getLatestConfiguredThresholdTaxYearStart()
const expectedTaxYearStart =
    today.getMonth() < 3 ||
    (today.getMonth() === 3 && today.getDate() < 6)
        ? today.getFullYear() - 1
        : today.getFullYear()
const latestConfiguredLabel =
    latestConfiguredTaxYearStart === null
        ? 'none configured'
        : `${latestConfiguredTaxYearStart}/${String((latestConfiguredTaxYearStart + 1) % 100).padStart(2, '0')}`
const expectedLabel = `${expectedTaxYearStart}/${String((expectedTaxYearStart + 1) % 100).padStart(2, '0')}`

/**
 * @param {Date} date
 * @returns {string}
 */
function formatDateLabel(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const versionDateLabel =
    status.thresholdsVersionDate instanceof Date
        ? formatDateLabel(status.thresholdsVersionDate)
        : 'invalid'
const cutoffLabel =
    status.cutoffDate instanceof Date
        ? formatDateLabel(status.cutoffDate)
        : 'unknown'

const summary = [
    `[threshold-check] THRESHOLDS_VERSION=${THRESHOLDS_VERSION} (${versionDateLabel})`,
    `[threshold-check] current date=${formatDateLabel(today)} cutoff=${cutoffLabel}`,
    `[threshold-check] latest configured tax year=${latestConfiguredLabel} expected current cycle=${expectedLabel}`,
].join('\n')

if (status.status === 'invalid-thresholds-version') {
    console.error(summary)
    console.error(
        '[threshold-check] ERROR: THRESHOLDS_VERSION must be a valid YYYY-MM-DD date.'
    )
    process.exit(1)
}

if (status.status === 'invalid-reference-date') {
    console.error(summary)
    console.error(
        '[threshold-check] ERROR: Invalid reference date for staleness check.'
    )
    process.exit(1)
}

if (status.status === 'warning') {
    console.warn(summary)
    console.warn(
        '[threshold-check] WARNING: Threshold review for this cycle is due before April 1. Update and review pwa/src/report/uk_thresholds.js before cutoff.'
    )
    process.exit(0)
}

if (status.status === 'expired') {
    console.error(summary)
    console.error(
        '[threshold-check] ERROR: Threshold review is overdue for this cycle (past April 1). Update and review pwa/src/report/uk_thresholds.js before building.'
    )
    process.exit(1)
}

console.log(summary)
console.log(
    '[threshold-check] OK: Threshold review version is current for this cycle.'
)
