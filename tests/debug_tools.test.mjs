import { URL } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const debugToolsUrl = new URL('../pwa/src/ui/debug_tools.js', import.meta.url)

const originalWindow = globalThis.window
const originalPerformance = globalThis.performance
const originalTiming = globalThis.__payrollTiming
const originalConsoleInfo = globalThis.console.info

async function importDebugTools(
    search,
    performanceOverride = originalPerformance
) {
    vi.resetModules()
    globalThis.window = {
        location: {
            search,
        },
    }
    globalThis.performance = performanceOverride
    delete globalThis.__payrollTiming
    return import(`${debugToolsUrl.href}?search=${encodeURIComponent(search)}`)
}

afterEach(() => {
    globalThis.window = originalWindow
    globalThis.performance = originalPerformance
    if (typeof originalTiming === 'undefined') {
        delete globalThis.__payrollTiming
    } else {
        globalThis.__payrollTiming = originalTiming
    }
    globalThis.console.info = originalConsoleInfo
    vi.restoreAllMocks()
})

describe('debug_tools query flags', () => {
    it('reads debug, memory, and timing flags from the URL search params', async () => {
        const debugTools = await importDebugTools('?debug=2&mem=1&time=1')

        expect(debugTools.DEBUG_LEVEL).toBe('2')
        expect(debugTools.DEBUG_ENABLED).toBe(true)
        expect(debugTools.MEMORY_LOG_ENABLED).toBe(true)
        expect(debugTools.timingApi.enabled).toBe(true)
        expect(globalThis.__payrollTiming).toBe(debugTools.timingApi)
    })

    it('keeps debug, memory, and timing disabled for unsupported or missing values', async () => {
        const debugTools = await importDebugTools('?debug=9&mem=0&time=0')

        expect(debugTools.DEBUG_LEVEL).toBe('9')
        expect(debugTools.DEBUG_ENABLED).toBe(false)
        expect(debugTools.MEMORY_LOG_ENABLED).toBe(false)
        expect(debugTools.timingApi.enabled).toBe(false)
    })

    it('flushes a timing summary when timing is enabled', async () => {
        const consoleInfo = vi.fn()
        globalThis.console.info = consoleInfo
        const now = vi.fn()
        now.mockReturnValueOnce(10)
        now.mockReturnValueOnce(25.26)

        const debugTools = await importDebugTools('?time=1', {
            now,
        })

        debugTools.timingApi.reset()
        debugTools.timingApi.start('phase.one', { runId: 'abc' })
        debugTools.timingApi.increment('phase.count')
        debugTools.timingApi.recordMax('phase.max', 7.89)
        debugTools.timingApi.end('phase.one')
        debugTools.timingApi.flush('run.total', { outcome: 'done' })

        expect(consoleInfo).toHaveBeenCalledWith('Payroll: timing summary', {
            label: 'run.total',
            totals: {
                'phase.one': {
                    totalMs: 15.3,
                    count: 1,
                    avgMs: 15.3,
                    maxMs: 15.3,
                },
            },
            counters: {
                'phase.count': 1,
            },
            maxima: {
                'phase.max': 7.9,
            },
            meta: {
                runId: 'abc',
                outcome: 'done',
            },
        })
    })
})
