import {
    buildContributionSummary,
    buildMissingMonthsWithRange,
    buildValidation,
} from '../pwa/js/report/report_calculations.js'
import { formatMonthLabel } from '../pwa/js/parse/parser_config.js'

function assertEqual(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        )
    }
}

function assertIncludes(collection, value, label) {
    if (!collection.includes(value)) {
        throw new Error(
            `${label} expected ${value}, got ${JSON.stringify(collection)}`
        )
    }
}

function buildRecord({
    nestEE,
    nestER,
    natInsNumber,
    taxCode,
    grossPay,
    netPay,
}) {
    return {
        employee: { natInsNumber: natInsNumber || null },
        payrollDoc: {
            deductions: {
                payeTax: { amount: 0 },
                natIns: { amount: 0 },
                nestEE: { amount: nestEE },
                nestER: { amount: nestER },
                misc: [],
            },
            payments: {
                hourly: {
                    basic: { amount: grossPay },
                    holiday: { amount: 0 },
                },
                salary: {
                    basic: { amount: 0 },
                    holiday: { amount: 0 },
                },
                misc: [],
            },
            taxCode: { code: taxCode || '' },
            thisPeriod: { totalGrossPay: { amount: grossPay } },
            netPay: { amount: netPay },
        },
    }
}

function runContributionSummaryTest() {
    const entries = [
        {
            record: buildRecord({
                nestEE: 50,
                nestER: 30,
                grossPay: 100,
                netPay: 100,
            }),
            parsedDate: new Date(2025, 0, 15),
            year: 2025,
            monthIndex: 1,
            monthLabel: 'January',
        },
        {
            record: buildRecord({
                nestEE: 60,
                nestER: 40,
                grossPay: 100,
                netPay: 100,
            }),
            parsedDate: new Date(2025, 1, 15),
            year: 2025,
            monthIndex: 2,
            monthLabel: 'February',
        },
    ]
    const contributionData = {
        entries: [
            { date: new Date(2025, 0, 20), type: 'ee', amount: 55 },
            { date: new Date(2025, 0, 20), type: 'er', amount: 25 },
            { date: new Date(2025, 1, 20), type: 'ee', amount: 65 },
            { date: new Date(2025, 1, 20), type: 'er', amount: 35 },
        ],
        sourceFiles: ['fixture.xlsx'],
    }
    const summary = buildContributionSummary(entries, contributionData, [2025])
    const totals = summary?.years.get(2025)?.totals
    assertEqual(
        totals,
        {
            expectedEE: 110,
            expectedER: 70,
            actualEE: 120,
            actualER: 60,
            delta: 0,
        },
        'Contribution totals'
    )
}

function runValidationTest() {
    const entry = {
        record: buildRecord({
            nestEE: 0,
            nestER: 0,
            grossPay: 100,
            netPay: 90,
        }),
        parsedDate: new Date(2025, 0, 1),
        year: 2025,
        monthIndex: 1,
        monthLabel: 'January',
    }
    const validation = buildValidation(entry)
    const flagIds = validation.flags.map((flag) => flag.id)
    assertIncludes(flagIds, 'missing_nat_ins', 'Validation flags')
    assertIncludes(flagIds, 'missing_tax_code', 'Validation flags')
    assertIncludes(flagIds, 'paye_zero', 'Validation flags')
    assertIncludes(flagIds, 'nat_ins_zero', 'Validation flags')
    assertIncludes(flagIds, 'net_mismatch', 'Validation flags')
}

function runMissingMonthsTest() {
    const missing = buildMissingMonthsWithRange([1, 3], 1, 3)
    assertEqual(missing, [formatMonthLabel(2)], 'Missing months')
}

function run() {
    const tests = [
        { label: 'Contribution summary', fn: runContributionSummaryTest },
        { label: 'Validation flags', fn: runValidationTest },
        { label: 'Missing months', fn: runMissingMonthsTest },
    ]
    const failures = []
    tests.forEach((test) => {
        try {
            test.fn()
            console.log(`✔ ${test.label}`)
        } catch (error) {
            failures.push({ label: test.label, error })
            console.error(`✘ ${test.label}: ${error?.message || error}`)
        }
    })

    if (failures.length) {
        console.error(`\nReport calculation tests failed (${failures.length}).`)
        process.exitCode = 1
        return
    }

    console.log('\nReport calculation tests passed.')
}

run()
