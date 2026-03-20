/** @type {string | null} */
export const DEBUG_LEVEL = new URLSearchParams(window.location.search).get(
    'debug'
)
/** @type {string | null} */
const MEMORY_LEVEL = new URLSearchParams(window.location.search).get('mem')
/** @type {string | null} */
const TIME_LEVEL = new URLSearchParams(window.location.search).get('time')
/** @type {boolean} */
export const DEBUG_ENABLED = DEBUG_LEVEL === '1' || DEBUG_LEVEL === '2'
/** @type {boolean} */
export const MEMORY_LOG_ENABLED = MEMORY_LEVEL === '1'
/** @type {boolean} */
const TIMING_LOG_ENABLED = TIME_LEVEL === '1'
/** @type {number} */
export const MEMORY_LOG_EVERY = 5
/** @type {boolean} */
let memoryAttributionUnavailableLogged = false

/**
 * @typedef {{ [key: string]: any }} TimingMeta
 * @typedef {{ startedAt: number }} TimingActiveEntry
 * @typedef {{ totalMs: number, count: number, maxMs: number }} TimingTotalEntry
 */

/** @param {string} label */
export function logMemoryUsage(label) {
    if (!MEMORY_LOG_ENABLED) {
        return
    }
    const memory = /** @type {any} */ (globalThis).performance?.memory
    if (!memory) {
        console.info('Payroll: memory metrics unavailable', { label })
        return
    }
    const toMb = (/** @type {number} */ value) =>
        Math.round((value / (1024 * 1024)) * 10) / 10
    console.info('Payroll: memory usage', {
        label,
        usedMb: toMb(memory.usedJSHeapSize),
        totalMb: toMb(memory.totalJSHeapSize),
        limitMb: toMb(memory.jsHeapSizeLimit),
    })
    void logUserAgentMemory(label)
}

/** @param {string} label */
async function logUserAgentMemory(label) {
    if (!MEMORY_LOG_ENABLED) {
        return
    }
    const perf = /** @type {any} */ (globalThis).performance
    if (typeof perf?.measureUserAgentSpecificMemory !== 'function') {
        if (!memoryAttributionUnavailableLogged) {
            console.info('Payroll: memory attribution unavailable', { label })
            memoryAttributionUnavailableLogged = true
        }
        return
    }
    try {
        const result = await perf.measureUserAgentSpecificMemory()
        const toMb = (/** @type {number} */ value) =>
            Math.round((value / (1024 * 1024)) * 10) / 10
        console.info('Payroll: memory attribution', {
            label,
            totalMb: toMb(result.bytes),
            breakdownCount: Array.isArray(result.breakdown)
                ? result.breakdown.length
                : 0,
        })
    } catch {
        // ignore measurement errors
    }
}

const timingState = {
    enabled: TIMING_LOG_ENABLED,
    /** @type {Map<string, TimingActiveEntry>} */
    active: new Map(),
    /** @type {Map<string, TimingTotalEntry>} */
    totals: new Map(),
    /** @type {Map<string, number>} */
    counters: new Map(),
    /** @type {Map<string, number>} */
    maxima: new Map(),
    /** @type {Map<string, any>} */
    meta: new Map(),
}

/** @param {number} value */
function roundTimingMs(value) {
    return Math.round(value * 10) / 10
}

/** @param {string} key @param {any} value */
function setTimingMeta(key, value) {
    if (!timingState.enabled) {
        return
    }
    timingState.meta.set(key, value)
}

/** @param {string} label @param {TimingMeta | null} [meta=null] */
function startTiming(label, meta = null) {
    if (!timingState.enabled) {
        return
    }
    timingState.active.set(label, {
        startedAt: globalThis.performance.now(),
    })
    if (meta && typeof meta === 'object') {
        Object.entries(meta).forEach(([key, value]) => {
            setTimingMeta(key, value)
        })
    }
}

/**
 * @param {string} label
 * @param {number} durationMs
 * @param {TimingMeta | null} [meta=null]
 * @returns {number}
 */
function recordTiming(label, durationMs, meta = null) {
    if (!timingState.enabled) {
        return 0
    }
    /** @type {TimingTotalEntry} */
    const current = timingState.totals.get(label) || {
        totalMs: 0,
        count: 0,
        maxMs: 0,
    }
    current.totalMs += durationMs
    current.count += 1
    current.maxMs = Math.max(current.maxMs, durationMs)
    timingState.totals.set(label, current)
    if (meta && typeof meta === 'object') {
        Object.entries(meta).forEach(([key, value]) => {
            setTimingMeta(key, value)
        })
    }
    return roundTimingMs(durationMs)
}

/**
 * @param {string} label
 * @param {TimingMeta | null} [meta=null]
 * @returns {number}
 */
function endTiming(label, meta = null) {
    if (!timingState.enabled) {
        return 0
    }
    const active = timingState.active.get(label)
    if (!active) {
        return 0
    }
    timingState.active.delete(label)
    return recordTiming(
        label,
        globalThis.performance.now() - active.startedAt,
        meta
    )
}

/** @param {string} label @param {number} [value=1] */
function incrementTimingCounter(label, value = 1) {
    if (!timingState.enabled) {
        return
    }
    timingState.counters.set(
        label,
        (timingState.counters.get(label) || 0) + value
    )
}

/** @param {string} label @param {number} value */
function recordTimingMax(label, value) {
    if (!timingState.enabled) {
        return
    }
    timingState.maxima.set(
        label,
        Math.max(timingState.maxima.get(label) || 0, value)
    )
}

function resetTimingSummary() {
    if (!timingState.enabled) {
        return
    }
    timingState.active.clear()
    timingState.totals.clear()
    timingState.counters.clear()
    timingState.maxima.clear()
    timingState.meta.clear()
}

/** @param {string} label @param {TimingMeta | null} [meta=null] */
function flushTimingSummary(label, meta = null) {
    if (!timingState.enabled) {
        return
    }
    if (meta && typeof meta === 'object') {
        Object.entries(meta).forEach(([key, value]) => {
            setTimingMeta(key, value)
        })
    }
    /** @type {Record<string, { totalMs: number, count: number, avgMs: number, maxMs: number }>} */
    const totals = {}
    timingState.totals.forEach((value, key) => {
        totals[key] = {
            totalMs: roundTimingMs(value.totalMs),
            count: value.count,
            avgMs: value.count ? roundTimingMs(value.totalMs / value.count) : 0,
            maxMs: roundTimingMs(value.maxMs),
        }
    })
    /** @type {Record<string, number>} */
    const counters = {}
    timingState.counters.forEach((value, key) => {
        counters[key] = value
    })
    /** @type {Record<string, number>} */
    const maxima = {}
    timingState.maxima.forEach((value, key) => {
        maxima[key] = roundTimingMs(value)
    })
    /** @type {TimingMeta} */
    const summaryMeta = {}
    timingState.meta.forEach((value, key) => {
        summaryMeta[key] = value
    })
    console.info('Payroll: timing summary', {
        label,
        totals,
        counters,
        maxima,
        meta: summaryMeta,
    })
}

/**
 * @type {{
 *   enabled: boolean,
 *   start: (label: string, meta?: TimingMeta | null) => void,
 *   end: (label: string, meta?: TimingMeta | null) => number,
 *   record: (label: string, durationMs: number, meta?: TimingMeta | null) => number,
 *   increment: (label: string, value?: number) => void,
 *   recordMax: (label: string, value: number) => void,
 *   setMeta: (key: string, value: any) => void,
 *   reset: () => void,
 *   flush: (label: string, meta?: TimingMeta | null) => void,
 * }}
 */
export const timingApi = {
    enabled: TIMING_LOG_ENABLED,
    start: startTiming,
    end: endTiming,
    record: recordTiming,
    increment: incrementTimingCounter,
    recordMax: recordTimingMax,
    setMeta: setTimingMeta,
    reset: resetTimingSummary,
    flush: flushTimingSummary,
}

/** @type {any} */
globalThis.__payrollTiming = timingApi
