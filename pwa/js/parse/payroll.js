/**
 * @typedef {import("./payroll.types").PayrollRecord} PayrollRecord
 * @typedef {import("./payroll.types").PayrollPayments} PayrollPayments
 * @typedef {import("./payroll.types").PayrollDeductions} PayrollDeductions
 * @typedef {import("./payroll.types").PayrollPayItem} PayrollPayItem
 * @typedef {import("./payroll.types").PayrollMiscDeduction} PayrollMiscDeduction
 * @typedef {import("./payroll.types").PayrollAddress} PayrollAddress
 */

import { PATTERNS } from './parser_config.js'

/**
 * @typedef {{ x: number, text: string }} LineItemText
 * @typedef {{ y: number, items: LineItemText[] }} LineItemRow
 * @typedef {LineItemRow & { pageNumber: number, pageWidth?: number, pageHeight?: number }} PageLineItemRow
 * @typedef {LineItemRow[]} LineBand
 * @typedef {{ label: string, units: number | null, rate: number | null, amount: number | null }} ParsedPaymentLine
 * @typedef {{ leftLines: string[], rightLines: string[] }} SplitLines
 */

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string | null}
 */
function extractField(text, pattern) {
    const match = text.match(pattern)
    return match && match[1] ? match[1].trim() : null
}

/**
 * @param {string | null} value
 * @returns {number}
 */
function parseNumericValue(value) {
    if (!value) {
        return 0
    }
    const cleaned = value.replace(/[,£$]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function extractNetPayFromText(text) {
    if (!text) {
        return null
    }
    const candidates = []
    text.split('\n').forEach((line) => {
        const stripped = line.trim()
        if (/^£?\d[\d,]*\.\d{2}$/.test(stripped)) {
            candidates.push(stripped.replace(/^£/, ''))
        }
    })
    return candidates.length ? candidates[candidates.length - 1] : null
}

/**
 * @param {string[]} lines
 * @returns {string | null}
 */
function extractEmployerFromLines(lines) {
    for (const line of lines) {
        if (/\bLtd\b|\bLimited\b/.test(line)) {
            return line.trim()
        }
    }
    return null
}

/**
 * @param {string | null} value
 * @returns {number | null}
 */
function parseAmountValue(value) {
    if (!value) {
        return null
    }
    const cleaned = value.replace(/[,£$]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * @param {LineItemRow[]} lineItems
 * @returns {string[]}
 */
function buildLinesFromLineItems(lineItems) {
    return lineItems
        .map((line) =>
            line.items
                .map((item) => item.text)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
        )
        .filter((lineText) => lineText)
}

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
 * @param {LineItemRow[]} lineItems
 * @returns {number | null}
 */
function findHeaderSplitX(lineItems) {
    let paymentsX = null
    let deductionsX = null
    lineItems.forEach((line) => {
        line.items.forEach((item) => {
            if (paymentsX === null && isPaymentsHeader(item.text)) {
                paymentsX = item.x
            }
            if (deductionsX === null && isDeductionsHeader(item.text)) {
                deductionsX = item.x
            }
        })
    })

    if (paymentsX === null || deductionsX === null) {
        return null
    }

    const paymentsXValue = /** @type {number} */ (paymentsX)
    const deductionsXValue = /** @type {number} */ (deductionsX)

    return (paymentsXValue + deductionsXValue) / 2
}

/**
 * @param {LineItemRow[]} lineItems
 * @returns {number | null}
 */
function findLargestGapSplitX(lineItems) {
    const points = []
    lineItems.forEach((line) => {
        line.items.forEach((item) => {
            points.push(item.x)
        })
    })

    if (points.length < 2) {
        return null
    }

    const sorted = points.sort((a, b) => a - b)
    let maxGap = 0
    let splitX = null
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const gap = sorted[i + 1] - sorted[i]
        if (gap > maxGap) {
            maxGap = gap
            splitX = sorted[i] + gap / 2
        }
    }

    return splitX
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isSectionTerminator(line) {
    return /^(Earnings for NI|Gross for Tax|Total Gross Pay|Pay Cycle|Tax Code|Pay Run|Pay Method|Net Pay)$/i.test(
        line
    )
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

    let bestByHint = null
    let bestByHintCount = -1
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
    let bestByHint = null
    let bestByHintCount = -1
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
 * @param {LineItemRow[]} lineItems
 * @param {number} bandCount
 * @returns {LineBand[]}
 */
function splitLineItemsIntoBands(lineItems, bandCount) {
    const sorted = lineItems.slice().sort((a, b) => b.y - a.y)
    if (!sorted.length) {
        return Array.from({ length: bandCount }, () => [])
    }

    const gaps = []
    for (let i = 0; i < sorted.length - 1; i += 1) {
        gaps.push({ index: i, gap: sorted[i].y - sorted[i + 1].y })
    }

    const minGap = 6
    const splitCandidates = gaps
        .filter((entry) => entry.gap > minGap)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, Math.max(0, bandCount - 1))
        .map((entry) => entry.index)
        .sort((a, b) => a - b)

    let splitIndices = splitCandidates
    if (splitIndices.length < bandCount - 1) {
        const perBand = Math.ceil(sorted.length / bandCount)
        splitIndices = []
        for (let i = 1; i < bandCount; i += 1) {
            splitIndices.push(Math.min(sorted.length - 1, i * perBand - 1))
        }
    }

    const bands = []
    let start = 0
    splitIndices.forEach((splitIndex) => {
        bands.push(sorted.slice(start, splitIndex + 1))
        start = splitIndex + 1
    })
    bands.push(sorted.slice(start))

    while (bands.length < bandCount) {
        bands.push([])
    }

    return bands
}

/**
 * @param {LineItemRow[]} lineItems
 * @param {number} columnCount
 * @returns {number[]}
 */
function computeColumnCentroids(lineItems, columnCount) {
    const points = []
    lineItems.forEach((line) => {
        line.items.forEach((item) => {
            points.push(item.x)
        })
    })

    if (!points.length) {
        return []
    }

    const minX = Math.min(...points)
    const maxX = Math.max(...points)
    const step = columnCount > 1 ? (maxX - minX) / (columnCount - 1) : 0
    let centroids = Array.from(
        { length: columnCount },
        (_, index) => minX + step * index
    )

    for (let iteration = 0; iteration < 4; iteration += 1) {
        const buckets = Array.from({ length: columnCount }, () => [])
        points.forEach((x) => {
            let nearestIndex = 0
            let nearestDistance = Math.abs(x - centroids[0])
            for (let i = 1; i < centroids.length; i += 1) {
                const distance = Math.abs(x - centroids[i])
                if (distance < nearestDistance) {
                    nearestDistance = distance
                    nearestIndex = i
                }
            }
            buckets[nearestIndex].push(x)
        })
        centroids = centroids.map((centroid, index) => {
            if (!buckets[index].length) {
                return centroid
            }
            const sum = buckets[index].reduce(
                (total, value) => total + value,
                0
            )
            return sum / buckets[index].length
        })
    }

    return centroids.sort((a, b) => a - b)
}

/**
 * @param {number[]} values
 * @param {number} columnCount
 * @returns {number[]}
 */
function computeCentroidsFromValues(values, columnCount) {
    if (!values.length) {
        return []
    }
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const step = columnCount > 1 ? (maxValue - minValue) / (columnCount - 1) : 0
    let centroids = Array.from(
        { length: columnCount },
        (_, index) => minValue + step * index
    )

    for (let iteration = 0; iteration < 4; iteration += 1) {
        const buckets = Array.from({ length: columnCount }, () => [])
        values.forEach((value) => {
            let nearestIndex = 0
            let nearestDistance = Math.abs(value - centroids[0])
            for (let i = 1; i < centroids.length; i += 1) {
                const distance = Math.abs(value - centroids[i])
                if (distance < nearestDistance) {
                    nearestDistance = distance
                    nearestIndex = i
                }
            }
            buckets[nearestIndex].push(value)
        })
        centroids = centroids.map((centroid, index) => {
            if (!buckets[index].length) {
                return centroid
            }
            const sum = buckets[index].reduce(
                (total, value) => total + value,
                0
            )
            return sum / buckets[index].length
        })
    }

    return centroids.sort((a, b) => a - b)
}

/**
 * @param {LineItemRow[]} lineItems
 * @param {number} columnCount
 * @param {number | null} [splitX]
 * @returns {string[][]}
 */
function bucketLinesByColumn(lineItems, columnCount, splitX) {
    const centroids = computeColumnCentroids(lineItems, columnCount)
    const columns = Array.from({ length: columnCount }, () => [])
    if (!centroids.length) {
        return columns
    }

    const useSplit =
        columnCount === 2 &&
        typeof splitX === 'number' &&
        Number.isFinite(splitX)

    const nearestIndexForX = (xValue) => {
        let nearestIndex = 0
        let nearestDistance = Math.abs(xValue - centroids[0])
        for (let i = 1; i < centroids.length; i += 1) {
            const distance = Math.abs(xValue - centroids[i])
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestIndex = i
            }
        }
        return nearestIndex
    }

    lineItems.forEach((line) => {
        const itemsByColumn = Array.from({ length: columnCount }, () => [])
        line.items.forEach((item) => {
            const columnIndex = useSplit
                ? item.x <= splitX
                    ? 0
                    : 1
                : nearestIndexForX(item.x)
            itemsByColumn[columnIndex].push(item)
        })

        itemsByColumn.forEach((items, columnIndex) => {
            if (!items.length) {
                return
            }
            const text = items
                .sort((a, b) => a.x - b.x)
                .map((item) => item.text)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
            if (text) {
                columns[columnIndex].push(text)
            }
        })
    })

    return columns
}

/**
 * @param {LineItemRow[]} lineItems
 * @param {number} columnCount
 * @returns {string[][]}
 */
function bucketLinesByLineLeft(lineItems, columnCount) {
    const lineEntries = lineItems
        .map((line) => {
            if (!line.items.length) {
                return null
            }
            const leftX = Math.min(...line.items.map((item) => item.x))
            return { leftX, line }
        })
        .filter((entry) => entry)

    const columns = Array.from({ length: columnCount }, () => [])
    if (!lineEntries.length) {
        return columns
    }

    const centroids = computeCentroidsFromValues(
        lineEntries.map((entry) => entry.leftX),
        columnCount
    )
    if (!centroids.length) {
        return columns
    }

    const nearestIndexForValue = (value) => {
        let nearestIndex = 0
        let nearestDistance = Math.abs(value - centroids[0])
        for (let i = 1; i < centroids.length; i += 1) {
            const distance = Math.abs(value - centroids[i])
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestIndex = i
            }
        }
        return nearestIndex
    }

    lineEntries.forEach(({ leftX, line }) => {
        const columnIndex = nearestIndexForValue(leftX)
        const text = line.items
            .slice()
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        if (text) {
            columns[columnIndex].push(text)
        }
    })

    return columns
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
 * @param {string} label
 * @returns {boolean}
 */
function shouldSkipDeductionLabel(label) {
    return (
        /^PAYE\s+Tax/i.test(label) ||
        /^National\s+Insurance/i.test(label) ||
        /^NEST\b/i.test(label)
    )
}

/**
 * @param {string[]} lines
 * @param {"payments" | "deductions"} mode
 * @param {PayrollPayItem[]} miscPayments
 * @param {PayrollMiscDeduction[]} miscDeductions
 * @param {PayrollPayItem[]} basicOverrides
 * @returns {void}
 */
function parseMiscLines(
    lines,
    mode,
    miscPayments,
    miscDeductions,
    basicOverrides
) {
    lines.forEach((line) => {
        if (shouldSkipLine(line)) {
            return
        }

        const threeNumber = line.match(
            /^(.*?)(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/
        )
        if (threeNumber) {
            const label = threeNumber[1].trim()
            const units = parseAmountValue(threeNumber[2])
            const rate = parseAmountValue(threeNumber[3])
            const amount = parseAmountValue(threeNumber[4])
            if (!label) {
                return
            }
            if (/^Basic\s+Hours/i.test(label)) {
                basicOverrides.push({ title: label, units, rate, amount })
                return
            }
            if (mode === 'deductions' && shouldSkipDeductionLabel(label)) {
                return
            }
            ;(mode === 'payments' ? miscPayments : miscDeductions).push({
                title: label,
                units,
                rate,
                amount,
            })
            return
        }

        const flatRate = line.match(/^(.*?)(\d[\d,]*\.\d{2})$/)
        if (flatRate) {
            const label = flatRate[1].trim()
            const amount = parseAmountValue(flatRate[2])
            if (!label || amount === null) {
                return
            }
            if (mode === 'deductions' && shouldSkipDeductionLabel(label)) {
                return
            }
            ;(mode === 'payments' ? miscPayments : miscDeductions).push({
                title: label,
                units: null,
                rate: null,
                amount,
            })
        }
    })
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
 * @returns {PayrollPayments}
 */
function parsePaymentsFromLines(lines) {
    const result = {
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
            basic: { title: 'Salary', amount: null },
            holiday: {
                title: 'Holiday',
                units: null,
                rate: null,
                amount: null,
            },
        },
        misc: [],
    }

    lines.forEach((line) => {
        if (shouldSkipLine(line)) {
            return
        }
        const parsed = parsePaymentLine(line)
        if (!parsed || !parsed.label) {
            return
        }

        if (/^Basic\s+Hours$/i.test(parsed.label)) {
            result.hourly.basic = {
                title: 'Basic Hours',
                units: parsed.units,
                rate: parsed.rate,
                amount: parsed.amount,
            }
            return
        }
        if (/^(Holiday\s+Hours|Holidays?)$/i.test(parsed.label)) {
            result.hourly.holiday = {
                title: 'Holiday Hours',
                units: parsed.units,
                rate: parsed.rate,
                amount: parsed.amount,
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
    const leftLines = []
    const rightLines = []
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
        const leftItems = []
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
        nestEE: { title: 'NEST Corporation - EE', amount: 0 },
        nestER: { title: 'NEST Corporation - ER', amount: 0 },
        misc: [],
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
            result.nestEE.amount = parsed.amount || 0
            return
        }
        if (/^NEST\s+Corporation\s*-\s*ER/i.test(parsed.label)) {
            result.nestER.amount = parsed.amount || 0
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
 * @param {string[]} lines
 * @param {PageLineItemRow[] | null} positionalLineItems
 * @returns {{ miscPayments: PayrollPayItem[], miscDeductions: PayrollMiscDeduction[], basicOverrides: PayrollPayItem[] }}
 */
function extractMiscLineItems(lines, positionalLineItems) {
    const miscPayments = []
    const miscDeductions = []
    const basicOverrides = []
    /** @type {PageLineItemRow[]} */
    const positionalLines = /** @type {PageLineItemRow[]} */ (
        Array.isArray(positionalLineItems)
            ? positionalLineItems.filter((line) => line.pageNumber === 1)
            : []
    )

    if (positionalLines.length) {
        const bands = splitLineItemsIntoBands(positionalLines, 4)
        const paymentsBandIndex = selectPaymentsBand(bands)
        const paymentsBand = bands[paymentsBandIndex] || []
        const columns = bucketLinesByLineLeft(paymentsBand, 2)
        if (columns[0].length || columns[1].length) {
            parseMiscLines(
                columns[0],
                'payments',
                miscPayments,
                miscDeductions,
                basicOverrides
            )
            parseMiscLines(
                columns[1],
                'deductions',
                miscPayments,
                miscDeductions,
                basicOverrides
            )
            return { miscPayments, miscDeductions, basicOverrides }
        }
    }

    let mode = null

    lines.forEach((line) => {
        if (isPaymentsHeader(line)) {
            mode = 'payments'
            return
        }
        if (isDeductionsHeader(line)) {
            mode = 'deductions'
            return
        }
        if (isSectionTerminator(line)) {
            mode = null
            return
        }
        if (!mode) {
            return
        }
        parseMiscLines(
            [line],
            mode,
            miscPayments,
            miscDeductions,
            basicOverrides
        )
    })

    return { miscPayments, miscDeductions, basicOverrides }
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
 * @param {{ text: string, lines: string[], lineItems: PageLineItemRow[] }} args
 * @returns {PayrollRecord}
 */
export function buildPayrollDocument({ text, lines, lineItems }) {
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

    let address = {
        street: null,
        city: null,
        administrativeArea: null,
        postalCode: null,
    }

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

    let payments = {
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
    }
    let deductions = {
        payeTax: { title: 'PAYE Tax', amount: 0 },
        natIns: { title: 'National Insurance', amount: 0 },
        nestEE: { title: 'NEST Corporation - EE', amount: 0 },
        nestER: { title: 'NEST Corporation - ER', amount: 0 },
        misc: [],
    }

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
        const basicMatch = text.match(PATTERNS.basicLine)
        if (basicMatch) {
            payments.hourly.basic = {
                title: 'Basic Hours',
                units: parseNumericValue(basicMatch[1]),
                rate: parseNumericValue(basicMatch[2]),
                amount: parseNumericValue(basicMatch[3]),
            }
        }
    }

    if (!payments.hourly.holiday.units) {
        const holidayMatch = text.match(PATTERNS.holidayLine)
        if (holidayMatch) {
            payments.hourly.holiday = {
                title: 'Holiday Hours',
                units: parseNumericValue(holidayMatch[1]),
                rate: parseNumericValue(holidayMatch[2]),
                amount: parseNumericValue(holidayMatch[3]),
            }
        }
    }

    const payeTax = parseNumericValue(extractField(text, PATTERNS.payeTax))
    const nationalInsurance = parseNumericValue(
        extractField(text, PATTERNS.nationalInsurance)
    )
    const nestEmployee = parseNumericValue(
        extractField(text, PATTERNS.nestEmployee)
    )
    const nestEmployer = parseNumericValue(
        extractField(text, PATTERNS.nestEmployer)
    )

    if (!deductions.payeTax.amount && payeTax) {
        deductions.payeTax.amount = payeTax
    }
    if (!deductions.natIns.amount && nationalInsurance) {
        deductions.natIns.amount = nationalInsurance
    }
    if (!deductions.nestEE.amount && nestEmployee) {
        deductions.nestEE.amount = nestEmployee
    }
    if (!deductions.nestER.amount && nestEmployer) {
        deductions.nestER.amount = nestEmployer
    }

    const earningsForNI = parseNumericValue(
        extractField(text, PATTERNS.earningsForNI)
    )
    const grossForTax = parseNumericValue(
        extractField(text, PATTERNS.grossForTax)
    )
    const totalGrossPay = parseNumericValue(
        extractField(text, PATTERNS.totalGrossPay)
    )
    const payCycle = extractField(text, PATTERNS.payCycle)
    const totalGrossPayTD = parseNumericValue(
        extractField(text, PATTERNS.totalGrossPayTD)
    )
    const grossForTaxTD = parseNumericValue(
        extractField(text, PATTERNS.grossForTaxTD)
    )
    const taxPaidTD = parseNumericValue(extractField(text, PATTERNS.taxPaidTD))
    const earningsForNITD = parseNumericValue(
        extractField(text, PATTERNS.earningsForNITD)
    )
    const nationalInsuranceTD = parseNumericValue(
        extractField(text, PATTERNS.nationalInsuranceTD)
    )
    const employeePensionTD = parseNumericValue(
        extractField(text, PATTERNS.employeePensionTD)
    )
    const employerPensionTD = parseNumericValue(
        extractField(text, PATTERNS.employerPensionTD)
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
