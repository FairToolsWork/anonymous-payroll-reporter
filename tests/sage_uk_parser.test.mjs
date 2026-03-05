import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const parserPath = path.resolve(
    __dirname,
    '../pwa/js/parse/formats/sage-uk/parser.js'
)
const payrollPath = path.resolve(__dirname, '../pwa/js/parse/payroll.js')

const buildLine = (y, entries) => ({
    y,
    pageNumber: 1,
    items: entries.map(([x, text]) => ({ x, text })),
})

const baseTextLines = [
    'Jane Doe 1 Jan 2024 AB123456C',
    'Employee No: 123',
    'Tax Code: 1257L',
    'Pay Run: Monthly 1',
    'Pay Cycle Monthly',
]

async function loadParser() {
    return import(pathToFileURL(parserPath))
}

describe('sage-uk parser fallbacks', () => {
    it('fills deductions and net pay from text when positional data is missing', async () => {
        const { buildPayrollDocument } = await loadParser()
        const text = [
            ...baseTextLines,
            'Basic Hours 10.00 5.00 50.00',
            'Holidays 2.00 5.00 10.00',
            'PAYE Tax 12.34',
            'National Insurance 23.45',
            'NEST Corporation - EE 34.56',
            'NEST Corporation - ER 45.67',
            'Pay Method: BACS',
            'Net Pay £123.45',
        ].join('\n')

        const record = await buildPayrollDocument({
            text,
            lines: [],
            lineItems: [],
        })

        expect(record.payrollDoc.payments.hourly.basic).toEqual({
            title: 'Basic Hours',
            units: 10,
            rate: 5,
            amount: 50,
        })
        expect(record.payrollDoc.payments.hourly.holiday).toEqual({
            title: 'Holiday Hours',
            units: 2,
            rate: 5,
            amount: 10,
        })
        expect(record.payrollDoc.deductions).toMatchObject({
            payeTax: { amount: 12.34 },
            natIns: { amount: 23.45 },
            pensionEE: { amount: 34.56 },
            pensionER: { amount: 45.67 },
        })
        expect(record.payrollDoc.netPay.amount).toBe(123.45)
    })

    it('reads net pay from lines around the pay method label', async () => {
        const { buildPayrollDocument } = await loadParser()
        const text = baseTextLines.join('\n')

        const forward = await buildPayrollDocument({
            text,
            lines: ['Pay Method:', '987.00'],
            lineItems: [],
        })
        expect(forward.payrollDoc.netPay.amount).toBe(987)

        const backward = await buildPayrollDocument({
            text,
            lines: ['123.00', 'Pay Method: BACS'],
            lineItems: [],
        })
        expect(backward.payrollDoc.netPay.amount).toBe(123)

        const fallback = await buildPayrollDocument({
            text,
            lines: ['Not a number', '100.00', '200.00'],
            lineItems: [],
        })
        expect(fallback.payrollDoc.netPay.amount).toBe(200)
    })
})

describe('sage-uk parser line splitting', () => {
    it('keeps lines on the left when there are too few points', async () => {
        const { buildPayrollDocument } = await loadParser()
        const lineItems = [buildLine(100, [[10, 'Basic Hours 1.00 2.00 3.00']])]
        const record = await buildPayrollDocument({
            text: baseTextLines.join('\n'),
            lines: [],
            lineItems,
        })
        expect(record.payrollDoc.payments.hourly.basic.amount).toBe(3)
        expect(record.payrollDoc.deductions.misc).toEqual([])
    })

    it('parses deductions from split right-hand lines', async () => {
        const { buildPayrollDocument } = await loadParser()
        const lineItems = [
            buildLine(400, [[10, 'Header']]),
            buildLine(300, [[100, 'Deductions']]),
            buildLine(290, [
                [100, 'PAYE Tax'],
                [200, '12.34'],
            ]),
            buildLine(280, [
                [100, 'National Insurance'],
                [200, '23.45'],
            ]),
            buildLine(270, [
                [100, 'NEST Corporation - EE'],
                [200, '34.56'],
            ]),
            buildLine(260, [
                [100, 'NEST Corporation - ER'],
                [200, '45.67'],
            ]),
            buildLine(250, [
                [100, 'Other Deduction'],
                [200, '5.00'],
            ]),
            buildLine(100, [[10, 'Footer']]),
            buildLine(0, [[10, 'Trailer']]),
        ]

        const record = await buildPayrollDocument({
            text: baseTextLines.join('\n'),
            lines: [],
            lineItems,
        })

        expect(record.payrollDoc.deductions).toMatchObject({
            payeTax: { amount: 12.34 },
            natIns: { amount: 23.45 },
            pensionEE: { amount: 34.56 },
            pensionER: { amount: 45.67 },
        })
        expect(record.payrollDoc.deductions.misc).toEqual([
            {
                title: 'Other Deduction',
                units: null,
                rate: null,
                amount: 5,
            },
        ])
    })

    it('uses left lines when centroids are unavailable', async () => {
        vi.resetModules()
        const actualPayroll = await import(pathToFileURL(payrollPath))
        vi.doMock(pathToFileURL(payrollPath).href, () => ({
            ...actualPayroll,
            computeCentroidsFromValues: () => [],
        }))
        const { buildPayrollDocument } = await loadParser()

        const lineItems = [
            buildLine(100, [
                [10, 'Basic Hours'],
                [20, '1.00'],
                [30, '2.00'],
                [40, '3.00'],
            ]),
        ]
        const record = await buildPayrollDocument({
            text: baseTextLines.join('\n'),
            lines: [],
            lineItems,
        })
        expect(record.payrollDoc.payments.hourly.basic.amount).toBe(3)
    })
})
