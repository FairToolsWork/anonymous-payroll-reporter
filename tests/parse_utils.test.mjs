import { describe, expect, it } from 'vitest'
import {
    buildMissingMonthsHtml,
    buildMissingMonthsHtmlForYear,
    buildMissingMonthsLabel,
    formatMonthLabel,
    getMissingMonths,
} from '../pwa/src/parse/parser_config.js'
import {
    bucketLinesByColumn,
    bucketLinesByLineLeft,
    computeCentroidsFromValues,
    computeColumnCentroids,
    extractNetPayFromText,
    splitLineItemsIntoBands,
} from '../pwa/src/parse/payroll.js'

describe('parser config helpers', () => {
    it('returns empty missing months when no valid entries are present', () => {
        expect(getMissingMonths([])).toEqual([])
        expect(
            getMissingMonths([{ monthIndex: 0 }, { monthIndex: 13 }])
        ).toEqual([])
    })

    it('formats missing months within a range', () => {
        const missing = getMissingMonths([
            { monthIndex: 1 },
            { monthIndex: 3 },
            { monthIndex: 5 },
        ])
        expect(missing).toEqual([formatMonthLabel(2), formatMonthLabel(4)])
    })

    it('builds missing month labels and HTML', () => {
        expect(buildMissingMonthsLabel({})).toBe('None')
        expect(buildMissingMonthsLabel({ 2024: [] })).toBe('None')
        expect(
            buildMissingMonthsLabel({
                2024: ['January'],
                2025: ['March', 'April'],
            })
        ).toBe('2024: January | 2025: March, April')

        expect(buildMissingMonthsHtml({})).toBe(
            '<span class="missing-none">None</span>'
        )
        expect(
            buildMissingMonthsHtml({
                2024: ['January', 'March'],
            })
        ).toBe(
            '<span class="missing-group"><span class="missing-year">2024</span><span class="pill">January</span><span class="pill">March</span></span>'
        )
    })

    it('builds year-only missing month HTML', () => {
        expect(buildMissingMonthsHtmlForYear([])).toBe(
            '<span class="missing-none">None</span>'
        )
        expect(buildMissingMonthsHtmlForYear(['January', 'March'])).toBe(
            '<span class="pill">January</span><span class="pill">March</span>'
        )
    })
})

describe('payroll parsing helpers', () => {
    it('extracts net pay values from text', () => {
        expect(extractNetPayFromText('')).toBeNull()
        expect(extractNetPayFromText(null)).toBeNull()
        expect(extractNetPayFromText('Net Pay £1,234.56')).toBe('1,234.56')
        expect(extractNetPayFromText('Net Pay\n£987.00')).toBe('987.00')
        expect(extractNetPayFromText('No net pay listed')).toBeNull()
    })

    it('splits line items into bands with fallback splits', () => {
        expect(splitLineItemsIntoBands([], 2)).toEqual([[], []])

        const lineItems = [
            { y: 100, items: [{ x: 10, text: 'A' }] },
            { y: 90, items: [{ x: 20, text: 'B' }] },
            { y: 80, items: [{ x: 30, text: 'C' }] },
            { y: 70, items: [{ x: 40, text: 'D' }] },
        ]
        const bands = splitLineItemsIntoBands(lineItems, 3)
        expect(bands).toHaveLength(3)
        expect(bands[0].length).toBeGreaterThan(0)
        expect(bands[1].length).toBeGreaterThan(0)
        expect(bands[2].length).toBeGreaterThan(0)
    })

    it('returns empty centroids when no points exist', () => {
        expect(computeColumnCentroids([], 2)).toEqual([])
        expect(computeCentroidsFromValues([], 2)).toEqual([])
    })

    it('buckets lines by column and line left', () => {
        const lineItems = [
            {
                y: 100,
                items: [
                    { x: 10, text: 'Left' },
                    { x: 110, text: 'Right' },
                ],
            },
        ]
        const splitColumns = bucketLinesByColumn(lineItems, 2, 50)
        expect(splitColumns).toEqual([['Left'], ['Right']])

        const centroidColumns = bucketLinesByColumn(lineItems, 2)
        expect(centroidColumns[0]).toContain('Left')
        expect(centroidColumns[1]).toContain('Right')

        expect(bucketLinesByColumn([], 2)).toEqual([[], []])

        const lineLeft = bucketLinesByLineLeft(lineItems, 2)
        expect(lineLeft[0].length + lineLeft[1].length).toBe(1)
        expect(bucketLinesByLineLeft([], 2)).toEqual([[], []])
    })
})
