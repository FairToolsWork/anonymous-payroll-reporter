/**
 * @typedef {{ x: number, text: string }} LineItemText
 * @typedef {{ y: number, items: LineItemText[] }} LineItemRow
 * @typedef {{ y: number, items: LineItemText[], pageNumber: number, pageWidth: number, pageHeight: number }} PageLineItemRow
 * @typedef {{ text: string, imageData: string | null, lines: string[], lineItems: PageLineItemRow[] }} ExtractedPdfData
 */

/** @type {typeof window.pdfjsLib} */
const pdfjsLib =
    typeof window !== 'undefined'
        ? window.pdfjsLib
        : globalThis.window?.pdfjsLib

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

/**
 * @param {File} file
 * @param {string} password
 * @returns {Promise<ExtractedPdfData>}
 */
export async function extractPdfData(file, password) {
    const data = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({
        data,
        password: password || undefined,
    })
    let pdf
    try {
        pdf = await loadingTask.promise
    } catch (error) {
        if (error && error.name === 'PasswordException') {
            const reason =
                error.code === 2 ? 'INCORRECT_PASSWORD' : 'PASSWORD_REQUIRED'
            throw new Error(reason)
        }
        throw error
    }
    let text = ''
    const allLines = []
    const allLineItems = []
    let imageData = null

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        const pageLineItems = buildLineItemsFromTextItems(content.items).map(
            (line) => ({
                ...line,
                pageNumber: pageNum,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
            })
        )
        const pageLines = buildLinesFromLineItems(pageLineItems)
        allLineItems.push(...pageLineItems)
        allLines.push(...pageLines)
        text += `${pageLines.join('\n')}\n`

        if (pageNum === 1) {
            imageData = await renderPageImage(page)
        }
    }

    return { text, imageData, lines: allLines, lineItems: allLineItems }
}

/**
 * @param {Array<{ transform: number[], str: string }>} items
 * @returns {LineItemRow[]}
 */
function buildLineItemsFromTextItems(items) {
    const lines = []
    const lineTolerance = 2

    items.forEach((item) => {
        const transform = item.transform
        const x = transform[4]
        const y = transform[5]
        const text = item.str.trim()
        if (!text) {
            return
        }

        let line = lines.find((entry) => Math.abs(entry.y - y) <= lineTolerance)
        if (!line) {
            line = { y, items: [] }
            lines.push(line)
        }
        line.items.push({ x, text })
    })

    return lines
        .sort((a, b) => b.y - a.y)
        .map((line) => ({
            ...line,
            items: line.items.sort((a, b) => a.x - b.x),
        }))
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
 * @param {PDFPageProxy} page
 * @returns {Promise<string>}
 */
async function renderPageImage(page) {
    const viewport = page.getViewport({ scale: 1.1 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: context, viewport }).promise

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    const threshold = 245
    let contentBottom = -1

    for (let y = height - 1; y >= 0; y -= 1) {
        let hasContent = false
        const rowStart = y * width * 4
        for (let x = 0; x < width; x += 2) {
            const index = rowStart + x * 4
            const r = data[index]
            const g = data[index + 1]
            const b = data[index + 2]
            if (r < threshold || g < threshold || b < threshold) {
                hasContent = true
                break
            }
        }
        if (hasContent) {
            contentBottom = y
            break
        }
    }

    if (contentBottom >= 0) {
        const whitespaceRatio = (height - (contentBottom + 1)) / height
        if (whitespaceRatio > 0.4) {
            const pointsPerCm = 72 / 2.54
            const pageHeightPoints = Array.isArray(page.view)
                ? page.view[3]
                : height
            const pixelsPerPoint = height / pageHeightPoints
            const extraPixels = Math.round(pointsPerCm * 1.5 * pixelsPerPoint)
            const cropBottom = Math.min(height, contentBottom + 1 + extraPixels)

            const croppedCanvas = document.createElement('canvas')
            const croppedContext = croppedCanvas.getContext('2d')
            croppedCanvas.width = width
            croppedCanvas.height = cropBottom
            croppedContext.drawImage(
                canvas,
                0,
                0,
                width,
                cropBottom,
                0,
                0,
                width,
                cropBottom
            )
            return croppedCanvas.toDataURL('image/png')
        }
    }

    return canvas.toDataURL('image/png')
}
