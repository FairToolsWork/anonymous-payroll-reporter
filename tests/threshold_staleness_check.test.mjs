import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { THRESHOLDS_VERSION } from '../pwa/src/report/uk_thresholds.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptPath = path.resolve(
    __dirname,
    '../scripts/check-threshold-staleness.mjs'
)

/**
 * @param {string} dateValue
 */
function runCheck(dateValue) {
    return spawnSync(process.execPath, [scriptPath], {
        env: {
            ...process.env,
            THRESHOLD_CHECK_TODAY: dateValue,
        },
        encoding: 'utf8',
    })
}

const thresholdsVersionYear = Number.parseInt(
    String(THRESHOLDS_VERSION).slice(0, 4),
    10
)
const staleCycleYear = thresholdsVersionYear + 1
const staleCyclePreCutoffDate = `${staleCycleYear}-03-20`
const staleCycleCutoffDate = `${staleCycleYear}-04-01`

describe('check-threshold-staleness script', () => {
    it('warns (exit 0) before April 1 when THRESHOLDS_VERSION is stale for the cycle', () => {
        const result = runCheck(staleCyclePreCutoffDate)
        expect(result.status).toBe(0)
        expect(`${result.stdout}${result.stderr}`).toContain('WARNING')
    })

    it('fails (exit 1) on/after April 1 when THRESHOLDS_VERSION is stale for the cycle', () => {
        const result = runCheck(staleCycleCutoffDate)
        expect(result.status).toBe(1)
        expect(`${result.stdout}${result.stderr}`).toContain('ERROR')
    })

    it('fails when THRESHOLD_CHECK_TODAY is invalid', () => {
        const result = runCheck('not-a-date')
        expect(result.status).toBe(1)
        expect(`${result.stdout}${result.stderr}`).toContain(
            'Invalid THRESHOLD_CHECK_TODAY'
        )
    })
})
