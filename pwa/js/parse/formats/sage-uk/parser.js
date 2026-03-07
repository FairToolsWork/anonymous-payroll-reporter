/**
 * @typedef {import("../../payroll.types").PayrollRecord} PayrollRecord
 * @typedef {import("../../payroll.types").PayrollPayments} PayrollPayments
 * @typedef {import("../../payroll.types").PayrollDeductions} PayrollDeductions
 * @typedef {import("../../payroll.types").PayrollPayItem} PayrollPayItem
 * @typedef {import("../../payroll.types").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("../../payroll.types").PayrollAddress} PayrollAddress
 */

import {
    bucketLinesByLineLeft,
    buildLinesFromLineItems,
    computeCentroidsFromValues,
    extractField,
    extractNetPayFromText,
    parseAmountValue,
    parseNumericValue,
    splitLineItemsIntoBands,
} from '../../payroll.js'

import { PATTERNS } from './patterns.js'

/**
 * @typedef {{ x: number, text: string }} LineItemText
 * @typedef {{ y: number, items: LineItemText[] }} LineItemRow
 * @typedef {LineItemRow & { pageNumber: number, pageWidth?: number, pageHeight?: number }} PageLineItemRow
 * @typedef {LineItemRow[]} LineBand
 * @typedef {{ label: string, units: number | null, rate: number | null, amount: number | null }} ParsedPaymentLine
 * @typedef {{ leftLines: string[], rightLines: string[] }} SplitLines
 */

/**
 * @param {string} line
 * @returns {boolean}
 */
function isPaymentsHeader(line) {
    return /^Payments$/i.test(line)
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isDeductionsHeader(line) {
    return /^Deductions$/i.test(line)
}

/**
 * @param {string} line
 * @returns {number}
 */
function countNumericTokens(line) {
    if (!line) {
        return 0
    }
    const matches = line.match(/\d[\d,]*\.\d{2}/g)
    return matches ? matches.length : 0
}

/**
 * @param {LineBand[]} bands
 * @returns {number}
 */
function selectPaymentsBand(bands) {
    const hints = [
        'Basic Hours',
        'PAYE Tax',
        'National Insurance',
        'NEST',
        'Other Net Deduction',
    ]
    const hintRegex = new RegExp(
        hints.map((term) => term.replace(/\s+/g, '\\s+')).join('|'),
        'i'
    )

    /** @type {number | null} */
    let bestByHint = null
    let bestByHintCount = -1
    /** @type {number | null} */
    let bestByNumeric = null
    let bestByNumericCount = -1

    bands.forEach((band, index) => {
        const lines = buildLinesFromLineItems(band)
        const hintCount = lines.filter((line) => hintRegex.test(line)).length
        const numericCount = lines.reduce(
            (total, line) => total + countNumericTokens(line),
            0
        )
        if (hintCount > bestByHintCount) {
            bestByHintCount = hintCount
            bestByHint = index
        }
        if (numericCount > bestByNumericCount) {
            bestByNumericCount = numericCount
            bestByNumeric = index
        }
    })

    if (bestByHint !== null && bestByHintCount > 0) {
        return bestByHint
    }
    return bestByNumeric !== null ? bestByNumeric : 1
}

/**
 * @param {LineBand[]} bands
 * @param {string[]} hints
 * @param {number} fallbackIndex
 * @returns {number}
 */
function selectBandByHints(bands, hints, fallbackIndex) {
    const hintRegex = new RegExp(
        hints.map((term) => term.replace(/\s+/g, '\\s+')).join('|'),
        'i'
    )
    /** @type {number | null} */
    let bestByHint = null
    let bestByHintCount = -1
    /** @type {number | null} */
    let bestByNumeric = null
    let bestByNumericCount = -1

    bands.forEach((band, index) => {
        const lines = buildLinesFromLineItems(band)
        const hintCount = lines.filter((line) => hintRegex.test(line)).length
        const numericCount = lines.reduce(
            (total, line) => total + countNumericTokens(line),
            0
        )
        if (hintCount > bestByHintCount) {
            bestByHintCount = hintCount
            bestByHint = index
        }
        if (numericCount > bestByNumericCount) {
            bestByNumericCount = numericCount
            bestByNumeric = index
        }
    })

    if (bestByHint !== null && bestByHintCount > 0) {
        return bestByHint
    }
    if (bestByNumeric !== null) {
        return bestByNumeric
    }
    return fallbackIndex
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function shouldSkipLine(line) {
    return (
        !line ||
        isPaymentsHeader(line) ||
        isDeductionsHeader(line) ||
        /Units\s+Rate\s+Amount/i.test(line) ||
        /Payments\s+Units/i.test(line) ||
        /Deductions\s+Amount/i.test(line)
    )
}

/**
 * @param {string} line
 * @returns {ParsedPaymentLine | null}
 */
function parsePaymentLine(line) {
    const threeNumber = line.match(
        /^(.*?)(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/
    )
    if (threeNumber) {
        return {
            label: threeNumber[1].trim(),
            units: parseAmountValue(threeNumber[2]),
            rate: parseAmountValue(threeNumber[3]),
            amount: parseAmountValue(threeNumber[4]),
        }
    }

    const flatRate = line.match(/^(.*?)(\d[\d,]*\.\d{2})$/)
    if (flatRate) {
        return {
            label: flatRate[1].trim(),
            units: null,
            rate: null,
            amount: parseAmountValue(flatRate[2]),
        }
    }

    return null
}

/**
 * @param {string[]} lines
 * @param {string | null} employeeName
 * @returns {PayrollAddress}
 */
function extractAddressFromLines(lines, employeeName) {
    const trimmed = lines.map((line) => line.trim()).filter((line) => line)
    const filtered = trimmed.filter(
        (line, index) =>
            !(index === 0 && employeeName && line.startsWith(employeeName))
    )
    return {
        street: filtered[0] || null,
        city: filtered[1] || null,
        administrativeArea: filtered[2] || null,
        postalCode: filtered[3] || null,
    }
}

/**
 * @param {string[]} lines
 * @returns {PayrollPayments}
 */
function parsePaymentsFromLines(lines) {
    const result = {
        hourly: {
            basic: {
                title: 'Basic Hours',
                units: /** @type {number|null} */ (null),
                rate: /** @type {number|null} */ (null),
                amount: /** @type {number|null} */ (null),
            },
            holiday: {
                title: 'Holiday Hours',
                units: /** @type {number|null} */ (null),
                rate: /** @type {number|null} */ (null),
                amount: /** @type {number|null} */ (null),
            },
        },
        salary: {
            basic: {
                title: 'Salary',
                amount: /** @type {number|null} */ (null),
            },
            holiday: {
                title: 'Holiday',
                units: /** @type {number|null} */ (null),
                rate: /** @type {number|null} */ (null),
                amount: /** @type {number|null} */ (null),
            },
        },
        misc: /** @type {PayrollPayItem[]} */ ([]),
    }

    lines.forEach((line) => {
        if (shouldSkipLine(line)) {
            return
        }
        const parsed = parsePaymentLine(line)
        if (!parsed || !parsed.label) {
            return
        }

        if (/^(Basic\s+Hours|Hours)$/i.test(parsed.label)) {
            const prev = result.hourly.basic
            const sameRate = prev.units === null || prev.rate === parsed.rate
            result.hourly.basic = {
                title: 'Basic Hours',
                units:
                    Math.round(
                        ((parsed.units ?? 0) + (prev.units ?? 0)) * 100
                    ) / 100,
                rate: sameRate ? parsed.rate : null,
                amount:
                    Math.round(
                        ((parsed.amount ?? 0) + (prev.amount ?? 0)) * 100
                    ) / 100,
            }
            return
        }
        if (/^(Holiday\s+Hours|Holidays?|Holiday)$/i.test(parsed.label)) {
            const prev = result.hourly.holiday
            const sameRate = prev.units === null || prev.rate === parsed.rate
            result.hourly.holiday = {
                title: 'Holiday Hours',
                units:
                    Math.round(
                        ((parsed.units ?? 0) + (prev.units ?? 0)) * 100
                    ) / 100,
                rate: sameRate ? parsed.rate : null,
                amount:
                    Math.round(
                        ((parsed.amount ?? 0) + (prev.amount ?? 0)) * 100
                    ) / 100,
            }
            return
        }
        if (/^Basic\s+Salary$/i.test(parsed.label)) {
            result.salary.basic = {
                title: 'Salary',
                amount: parsed.amount,
            }
            return
        }
        if (/^Holiday\s+Salary$/i.test(parsed.label)) {
            result.salary.holiday = {
                title: 'Holiday',
                units: parsed.units ?? null,
                rate: parsed.rate ?? null,
                amount: parsed.amount ?? null,
            }
            return
        }

        if (
            /^(Basic\s+Hours|Holiday\s+Hours|Holidays?)\s+\d[\d,]*\.\d{2}$/i.test(
                parsed.label
            )
        ) {
            return
        }
        result.misc.push({
            title: parsed.label,
            units: parsed.units,
            rate: parsed.rate,
            amount: parsed.amount,
        })
    })

    return result
}

/**
 * @param {LineItemRow[]} lineItems
 * @returns {number | null}
 */
function findDeductionSplitX(lineItems) {
    const deductionRegex = /(PAYE\s+Tax|National\s+Insurance|NEST\b|Deduction)/i
    /** @type {number | null} */
    let minX = null
    lineItems.forEach((line) => {
        line.items.forEach((item) => {
            if (deductionRegex.test(item.text)) {
                minX = minX === null ? item.x : Math.min(minX, item.x)
            }
        })
    })
    return minX
}

/**
 * @param {LineItemRow[]} lineItems
 * @returns {SplitLines}
 */
function splitLineItemsByGlobalSplit(lineItems) {
    /** @type {string[]} */
    const leftLines = []
    /** @type {string[]} */
    const rightLines = []
    /** @type {number[]} */
    const points = []
    lineItems.forEach((line) => {
        line.items.forEach((item) => {
            points.push(item.x)
        })
    })

    if (points.length < 2) {
        return { leftLines: buildLinesFromLineItems(lineItems), rightLines }
    }

    const deductionSplitX = findDeductionSplitX(lineItems)
    const centroids = computeCentroidsFromValues(points, 3)
    if (centroids.length < 3 && deductionSplitX === null) {
        return { leftLines: buildLinesFromLineItems(lineItems), rightLines }
    }

    const splitX =
        deductionSplitX !== null
            ? deductionSplitX - 2
            : (centroids[1] + centroids[2]) / 2

    lineItems.forEach((line) => {
        /** @type {LineItemText[]} */
        const leftItems = []
        /** @type {LineItemText[]} */
        const rightItems = []
        line.items.forEach((item) => {
            if (item.x <= splitX) {
                leftItems.push(item)
            } else {
                rightItems.push(item)
            }
        })

        const leftText = leftItems
            .slice()
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        const rightText = rightItems
            .slice()
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (leftText) {
            leftLines.push(leftText)
        }
        if (rightText) {
            rightLines.push(rightText)
        }
    })

    return { leftLines, rightLines }
}

/**
 * @param {string[]} lines
 * @returns {PayrollDeductions}
 */
function parseDeductionsFromLines(lines) {
    const result = {
        payeTax: { title: 'PAYE Tax', amount: 0 },
        natIns: { title: 'National Insurance', amount: 0 },
        pensionEE: { title: 'NEST Corporation - EE', amount: 0 },
        pensionER: { title: 'NEST Corporation - ER', amount: 0 },
        misc: /** @type {PayrollMiscDeduction[]} */ ([]),
    }

    lines.forEach((line) => {
        if (shouldSkipLine(line)) {
            return
        }

        const parsed = parsePaymentLine(line)
        if (!parsed || !parsed.label) {
            return
        }

        if (/^PAYE\s+Tax/i.test(parsed.label)) {
            result.payeTax.amount = parsed.amount || 0
            return
        }
        if (/^National\s+Insurance/i.test(parsed.label)) {
            result.natIns.amount = parsed.amount || 0
            return
        }
        if (/^NEST\s+Corporation\s*-\s*EE/i.test(parsed.label)) {
            result.pensionEE.amount = parsed.amount || 0
            return
        }
        if (/^NEST\s+Corporation\s*-\s*ER/i.test(parsed.label)) {
            result.pensionER.amount = parsed.amount || 0
            return
        }

        result.misc.push({
            title: parsed.label,
            units: parsed.units,
            rate: parsed.rate,
            amount: parsed.amount || 0,
        })
    })

    return result
}

/**
 * @param {string[]} lines
 * @returns {string | null}
 */
function findEmployerLine(lines) {
    const employerSuffixPattern =
        /\b(Limited|Ltd|Public\s+Limited\s+Company|PLC|Limited\s+Liability\s+Partnership|LLP|Community\s+Interest\s+Company|CIC|Cyfyngedig|Cyf|Cwmni\s+Cyfyngedig\s+Cyhoeddus|CCC|Partneriaeth\s+Atebolrwydd\s+Cyfyngedig|PAC|Cwmni\s+Buddiant\s+Cymunedol|CBC)\b/i
    const normalizedCandidates = lines.map((line) => {
        const normalized = line
            .replace(/\bL\s+imited\b/gi, 'Limited')
            .replace(/\bL\s+t\s+d\b/gi, 'Ltd')
        return { original: line, normalized }
    })
    const candidates = normalizedCandidates.filter(({ normalized }) =>
        employerSuffixPattern.test(normalized)
    )
    const filtered = candidates.find(
        ({ normalized }) =>
            !/[©®]/.test(normalized) && !/\bSage\b/i.test(normalized)
    )
    if (filtered) {
        return filtered.normalized
    }
    return candidates.length ? candidates[0].normalized : null
}

/**
 * @param {string[]} lines
 * @returns {string | null}
 */
function findNetPayFromLines(lines) {
    const payMethodIndex = lines.findIndex((line) =>
        /Pay\s+Method:/i.test(line)
    )
    const amountRegex = /^\d[\d,]*\.\d{2}$/
    if (payMethodIndex >= 0) {
        for (let i = payMethodIndex + 1; i < lines.length; i += 1) {
            if (amountRegex.test(lines[i])) {
                return lines[i]
            }
        }
        for (let i = payMethodIndex - 1; i >= 0; i -= 1) {
            if (amountRegex.test(lines[i])) {
                return lines[i]
            }
        }
    }

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (amountRegex.test(lines[i])) {
            return lines[i]
        }
    }
    return null
}

/**
 * @param {{ text: string, lines: string[], lineItems: PageLineItemRow[], imageData?: string | null }} args
 * @returns {Promise<PayrollRecord>}
 */
export async function buildPayrollDocument({ text, lines, lineItems }) {
    const lineItemsText = lines || []
    /** @type {PageLineItemRow[]} */
    const positionalLines = /** @type {PageLineItemRow[]} */ (
        Array.isArray(lineItems)
            ? lineItems.filter((line) => line.pageNumber === 1)
            : []
    )
    const leftColumnLines = positionalLines.length
        ? bucketLinesByLineLeft(positionalLines, 2)[0]
        : []
    const nameMatch = text.match(PATTERNS.nameDateId)
    const employeeName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : null
    const processDate =
        nameMatch && nameMatch[2]
            ? nameMatch[2].trim().replace(/\s+(?=\d{1,2}$)/, '')
            : null
    const natInsNumber =
        nameMatch && nameMatch[3]
            ? nameMatch[3].trim().replace(/\s+/g, '')
            : null
    const employeeId = extractField(text, PATTERNS.employeeNo)
    const employer =
        findEmployerLine(leftColumnLines) ||
        findEmployerLine(lineItemsText) ||
        extractField(text, PATTERNS.employerLine)

    let address = /** @type {PayrollAddress} */ ({
        street: null,
        city: null,
        administrativeArea: null,
        postalCode: null,
    })

    if (positionalLines.length) {
        const bands = splitLineItemsIntoBands(positionalLines, 4)
        const row3BandIndex = selectBandByHints(
            bands,
            [
                'Earnings for NI',
                'Gross for Tax',
                'Total Gross Pay',
                'Pay Cycle',
                'Total Gross Pay TD',
                'Tax Paid TD',
                'Earnings for NI TD',
                'National Insurance TD',
                'Ee Pension TD',
                'Employers Pension TD',
            ],
            2
        )
        const row3Band = bands[row3BandIndex] || []
        const columns = bucketLinesByLineLeft(row3Band, 3)
        if (columns[0] && columns[0].length) {
            address = extractAddressFromLines(columns[0], employeeName)
        }
    }

    let payments = /** @type {PayrollPayments} */ ({
        hourly: {
            basic: {
                title: 'Basic Hours',
                units: null,
                rate: null,
                amount: null,
            },
            holiday: {
                title: 'Holiday Hours',
                units: null,
                rate: null,
                amount: null,
            },
        },
        salary: {
            basic: { title: 'Basic Salary', amount: null },
            holiday: { title: 'Holiday Salary', units: 0, rate: 0, amount: 0 },
        },
        misc: [],
    })
    let deductions = /** @type {PayrollDeductions} */ ({
        payeTax: { title: 'PAYE Tax', amount: 0 },
        natIns: { title: 'National Insurance', amount: 0 },
        pensionEE: { title: 'NEST Corporation - EE', amount: 0 },
        pensionER: { title: 'NEST Corporation - ER', amount: 0 },
        misc: [],
    })

    if (positionalLines.length) {
        const bands = splitLineItemsIntoBands(positionalLines, 4)
        const paymentsBandIndex = selectPaymentsBand(bands)
        const paymentsBand = bands[paymentsBandIndex] || []
        const { leftLines, rightLines } =
            splitLineItemsByGlobalSplit(paymentsBand)
        payments = parsePaymentsFromLines(leftLines)
        deductions = parseDeductionsFromLines(rightLines)
    }

    if (!payments.hourly.basic.units) {
        const basicPattern =
            /^(?:Basic\s+Hours|Hours)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/gim
        for (const m of text.matchAll(basicPattern)) {
            const prev = payments.hourly.basic
            const units = parseNumericValue(m[1])
            const rate = parseNumericValue(m[2])
            const amount = parseNumericValue(m[3])
            const sameRate = prev.units === null || prev.rate === rate
            payments.hourly.basic = {
                title: 'Basic Hours',
                units:
                    Math.round(((units ?? 0) + (prev.units ?? 0)) * 100) / 100,
                rate: sameRate ? rate : null,
                amount:
                    Math.round(((amount ?? 0) + (prev.amount ?? 0)) * 100) /
                    100,
            }
        }
    }

    if (!payments.hourly.holiday.units) {
        const holidayPattern =
            /^(?:Holiday\s+Hours|Holidays?|Holiday)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/gim
        for (const m of text.matchAll(holidayPattern)) {
            const prev = payments.hourly.holiday
            const units = parseNumericValue(m[1])
            const rate = parseNumericValue(m[2])
            const amount = parseNumericValue(m[3])
            const sameRate = prev.units === null || prev.rate === rate
            payments.hourly.holiday = {
                title: 'Holiday Hours',
                units:
                    Math.round(((units ?? 0) + (prev.units ?? 0)) * 100) / 100,
                rate: sameRate ? rate : null,
                amount:
                    Math.round(((amount ?? 0) + (prev.amount ?? 0)) * 100) /
                    100,
            }
        }
    }

    const payeTax = parseNumericValue(extractField(text, PATTERNS.payeTax))
    const nationalInsurance = parseNumericValue(
        extractField(text, PATTERNS.natIns)
    )
    const nestEmployee = parseNumericValue(
        extractField(text, PATTERNS.pensionEe)
    )
    const nestEmployer = parseNumericValue(
        extractField(text, PATTERNS.pensionEr)
    )

    if (!deductions.payeTax.amount && payeTax) {
        deductions.payeTax.amount = payeTax
    }
    if (!deductions.natIns.amount && nationalInsurance) {
        deductions.natIns.amount = nationalInsurance
    }
    if (!deductions.pensionEE.amount && nestEmployee) {
        deductions.pensionEE.amount = nestEmployee
    }
    if (!deductions.pensionER.amount && nestEmployer) {
        deductions.pensionER.amount = nestEmployer
    }

    const earningsForNI = parseNumericValue(
        extractField(text, PATTERNS.earningsNi)
    )
    const grossForTax = parseNumericValue(extractField(text, PATTERNS.grossTax))
    const totalGrossPay = parseNumericValue(
        extractField(text, PATTERNS.totalGrossPay)
    )
    const payCycle = extractField(text, PATTERNS.payCycle)
    const totalGrossPayTD = parseNumericValue(
        extractField(text, PATTERNS.totalGrossPayTd)
    )
    const grossForTaxTD = parseNumericValue(
        extractField(text, PATTERNS.grossTaxTd)
    )
    const taxPaidTD = parseNumericValue(extractField(text, PATTERNS.taxPaidTd))
    const earningsForNITD = parseNumericValue(
        extractField(text, PATTERNS.earningsNiTd)
    )
    const nationalInsuranceTD = parseNumericValue(
        extractField(text, PATTERNS.niTd)
    )
    const employeePensionTD = parseNumericValue(
        extractField(text, PATTERNS.pensionEeTd)
    )
    const employerPensionTD = parseNumericValue(
        extractField(text, PATTERNS.pensionErTd)
    )

    let netPay = parseNumericValue(extractField(text, PATTERNS.netPay))
    if (!netPay) {
        const lineNetPay = findNetPayFromLines(lineItemsText)
        netPay = parseNumericValue(lineNetPay)
    }
    if (!netPay) {
        netPay = parseNumericValue(extractNetPayFromText(text))
    }

    return {
        employee: {
            id: employeeId || null,
            name: employeeName,
            natInsNumber: natInsNumber,
            address,
        },
        employer: employer,
        payrollDoc: {
            processDate: {
                title: 'Process Date',
                date: processDate,
            },
            taxCode: {
                title: 'Tax Code',
                code: extractField(text, PATTERNS.taxCode),
            },
            payMethod: {
                title: 'Pay Method',
                method: extractField(text, PATTERNS.payMethod),
            },
            payRun: {
                title: 'Pay Run',
                run: extractField(text, PATTERNS.payRun),
            },
            payments,
            deductions,
            thisPeriod: {
                earningsNI: {
                    title: 'Earnings for NI',
                    amount: earningsForNI,
                },
                grossForTax: {
                    title: 'Gross for Tax',
                    amount: grossForTax,
                },
                totalGrossPay: {
                    title: 'Total Gross Pay',
                    amount: totalGrossPay,
                },
                payCycle: {
                    title: 'Pay Cycle',
                    cycle: payCycle,
                },
            },
            yearToDate: {
                totalGrossPayTD,
                grossForTaxTD,
                taxPaidTD,
                earningsForNITD,
                nationalInsuranceTD,
                employeePensionTD_AVC: employeePensionTD,
                employerPensionTD,
            },
            netPay: {
                title: 'Net Pay',
                amount: netPay,
            },
        },
    }
}
