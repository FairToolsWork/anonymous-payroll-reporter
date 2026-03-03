/**
 * Generic layout and parsing utilities shared across all format parsers.
 *
 * @typedef {{ x: number, text: string }} LineItemText
 * @typedef {{ y: number, items: LineItemText[] }} LineItemRow
 * @typedef {LineItemRow & { pageNumber: number, pageWidth?: number, pageHeight?: number }} PageLineItemRow
 * @typedef {LineItemRow[]} LineBand
 */

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string | null}
 */
export function extractField(text, pattern) {
    const match = text.match(pattern)
    return match && match[1] ? match[1].trim() : null
}

/**
 * @param {string | null} value
 * @returns {number}
 */
export function parseNumericValue(value) {
    if (!value) {
        return 0
    }
    const cleaned = value.replace(/[,£$]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * @param {string | null} value
 * @returns {number | null}
 */
export function parseAmountValue(value) {
    if (!value) {
        return null
    }
    const cleaned = value.replace(/[,£$]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractNetPayFromText(text) {
    if (!text) {
        return null
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim()
        const inlineMatch = line.match(/net\s+pay.*?(£?\d[\d,]*\.\d{2})/i)
        if (inlineMatch) {
            return inlineMatch[1].replace(/^£/, '')
        }
        if (/net\s+pay/i.test(line)) {
            const nextLine = lines[i + 1]?.trim() || ''
            const amountMatch = nextLine.match(/^£?\d[\d,]*\.\d{2}$/)
            if (amountMatch) {
                return amountMatch[0].replace(/^£/, '')
            }
        }
    }
    return null
}

/**
 * @param {LineItemRow[]} lineItems
 * @returns {string[]}
 */
export function buildLinesFromLineItems(lineItems) {
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
 * @param {LineItemRow[]} lineItems
 * @param {number} bandCount
 * @returns {LineBand[]}
 */
export function splitLineItemsIntoBands(lineItems, bandCount) {
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
export function computeColumnCentroids(lineItems, columnCount) {
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
export function computeCentroidsFromValues(values, columnCount) {
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
export function bucketLinesByColumn(lineItems, columnCount, splitX) {
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
export function bucketLinesByLineLeft(lineItems, columnCount) {
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
