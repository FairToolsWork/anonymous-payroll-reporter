import * as pdfjsBrowser from 'pdfjs-dist/build/pdf.mjs'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * @typedef {{ x: number, text: string }} LineItemText
 * @typedef {{ y: number, items: LineItemText[] }} LineItemRow
 * @typedef {{ y: number, items: LineItemText[], pageNumber: number, pageWidth: number, pageHeight: number }} PageLineItemRow
 * @typedef {{ text: string, imageData: string | null, lines: string[], lineItems: PageLineItemRow[] }} ExtractedPdfData
 */

async function getPdfjsLib() {
    const windowPdfjs =
        globalThis?.window && /** @type {any} */ (globalThis.window).pdfjsLib
    const pdfjsModule = windowPdfjs ? windowPdfjs : pdfjsBrowser
    if (!pdfjsModule.GlobalWorkerOptions?.workerSrc && pdfjsWorkerUrl) {
        pdfjsModule.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
    }
    return pdfjsModule
}

/**
 * @param {File} file
 * @param {string} password
 * @returns {Promise<ExtractedPdfData>}
 */
export async function extractPdfData(file, password) {
    const pdfjsLib = await getPdfjsLib()
    const data = await file.arrayBuffer()
    const noImages = Boolean(
        globalThis?.location &&
        new URLSearchParams(globalThis.location.search).get('noimg') === '1'
    )
    const isTestEnv = Boolean(
        globalThis?.window && /** @type {any} */ (globalThis.window).pdfjsDebug
    )
    const loadingTask = pdfjsLib.getDocument({
        data,
        password: password || undefined,
        disableFontFace: isTestEnv,
        useSystemFonts: true,
        verbosity: isTestEnv ? 0 : undefined,
    })
    let pdf
    let loadingError = null
    try {
        pdf = await loadingTask.promise
    } catch (error) {
        const e = /** @type {any} */ (error)
        if (e && e.name === 'PasswordException') {
            const reason =
                e.code === 2 ? 'INCORRECT_PASSWORD' : 'PASSWORD_REQUIRED'
            loadingError = new Error(reason)
            throw loadingError
        }
        loadingError = error
        throw error
    } finally {
        if (loadingError) {
            try {
                await loadingTask.destroy()
            } catch {
                // ignore cleanup errors
            }
        }
    }
    let text = ''
    const allLines = /** @type {string[]} */ ([])
    /** @type {PageLineItemRow[]} */
    const allLineItems = []
    let imageData = null

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent()
        const items =
            /** @type {Array<{ transform: number[], str: string }>} */ (
                textContent.items.filter(
                    (/** @type {any} */ item) => 'str' in item
                )
            )
        const pageLineItems = buildLineItemsFromTextItems(items).map(
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

        if (pageNum === 1 && !noImages) {
            imageData = await renderPageImage(
                /** @type {PDFPageProxy} */ (/** @type {any} */ (page))
            )
        }
        if (typeof page.cleanup === 'function') {
            page.cleanup()
        }
    }

    if (typeof pdf.cleanup === 'function') {
        pdf.cleanup()
    }
    if (typeof loadingTask.destroy === 'function') {
        await loadingTask.destroy()
    }

    return { text, imageData, lines: allLines, lineItems: allLineItems }
}

/**
 * @param {Array<{ transform: number[], str: string }>} items
 * @returns {LineItemRow[]}
 */
function buildLineItemsFromTextItems(items) {
    /** @type {LineItemRow[]} */
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
            items: line.items.sort(
                (
                    /** @type {LineItemText} */ a,
                    /** @type {LineItemText} */ b
                ) => a.x - b.x
            ),
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
    const context = /** @type {CanvasRenderingContext2D} */ (
        canvas.getContext('2d')
    )
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: context, viewport }).promise

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    const threshold = 245

    /** @param {number} x @param {number} y @returns {boolean} */
    function isNonWhite(x, y) {
        const i = (y * width + x) * 4
        return (
            data[i] < threshold ||
            data[i + 1] < threshold ||
            data[i + 2] < threshold
        )
    }

    let top = 0
    outer_top: for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 2) {
            if (isNonWhite(x, y)) {
                top = y
                break outer_top
            }
        }
    }

    let bottom = height - 1
    outer_bottom: for (let y = height - 1; y >= 0; y -= 1) {
        for (let x = 0; x < width; x += 2) {
            if (isNonWhite(x, y)) {
                bottom = y
                break outer_bottom
            }
        }
    }

    let left = 0
    outer_left: for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 2) {
            if (isNonWhite(x, y)) {
                left = x
                break outer_left
            }
        }
    }

    let right = width - 1
    outer_right: for (let x = width - 1; x >= 0; x -= 1) {
        for (let y = 0; y < height; y += 2) {
            if (isNonWhite(x, y)) {
                right = x
                break outer_right
            }
        }
    }

    const pad = Math.round(width * 0.02)
    const cropX = Math.max(0, left - pad)
    const cropY = Math.max(0, top - pad)
    const cropW = Math.min(width, right + pad + 1) - cropX
    const cropH = Math.min(height, bottom + pad + 1) - cropY

    if (cropW <= 0 || cropH <= 0) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        canvas.width = 0
        canvas.height = 0
        return dataUrl
    }

    const croppedCanvas = document.createElement('canvas')
    const croppedContext = /** @type {CanvasRenderingContext2D} */ (
        croppedCanvas.getContext('2d')
    )
    croppedCanvas.width = cropW
    croppedCanvas.height = cropH
    croppedContext.drawImage(
        canvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
    )
    const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.85)
    canvas.width = 0
    canvas.height = 0
    croppedCanvas.width = 0
    croppedCanvas.height = 0
    return dataUrl
}
