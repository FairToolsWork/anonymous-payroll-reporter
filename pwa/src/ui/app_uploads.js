/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {File[]} rawFiles
 * @returns {void}
 */
export function stageFiles(rawFiles) {
    const files = rawFiles.filter(Boolean)
    if (!files.length) {
        return
    }
    /** @type {Array<{ id: string, name: string, type: 'pdf' | 'xlsx', file: File }>} */
    const staged = []
    /** @type {string[]} */
    const invalid = []
    const existingIds = new Set(
        this.stagedFiles.map((/** @type {{ id: string }} */ item) => item.id)
    )
    const duplicates = []
    files.forEach((file) => {
        const name = (file.name || '').toLowerCase()
        if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
            const id = `${file.name}-${file.size}-${file.lastModified}`
            if (existingIds.has(id)) {
                duplicates.push(file.name || 'Unknown')
                return
            }
            staged.push({
                id,
                name: file.name,
                type: 'pdf',
                file,
            })
            return
        }
        if (
            file.type ===
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.type === 'application/vnd.ms-excel' ||
            name.endsWith('.xlsx') ||
            name.endsWith('.xls')
        ) {
            const id = `${file.name}-${file.size}-${file.lastModified}`
            if (existingIds.has(id)) {
                duplicates.push(file.name || 'Unknown')
                return
            }
            staged.push({
                id,
                name: file.name,
                type: 'xlsx',
                file,
            })
            return
        }
        invalid.push(file.name || 'Unknown')
    })

    if (invalid.length) {
        this.error = 'Some files were not PDFs or Excel files and were skipped.'
    } else {
        this.error = ''
    }
    if (duplicates.length) {
        this.notice =
            'Warning: Duplicate files detected, these will be skipped automatically.'
    } else {
        this.notice = ''
    }
    this.stagedFiles = [...this.stagedFiles, ...staged]
    this.stagedPdfCount = this.stagedFiles.filter(
        (/** @type {{ type: string }} */ item) => item.type === 'pdf'
    ).length
    this.stagedExcelCount = this.stagedFiles.filter(
        (/** @type {{ type: string }} */ item) => item.type === 'xlsx'
    ).length
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {DragEvent} event
 * @returns {void}
 */
export function onDragOver(event) {
    event.preventDefault()
    if (this.status === 'processing') {
        return
    }
    this.dragActive = true
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {DragEvent} event
 * @returns {void}
 */
export function onDragLeave(event) {
    event.preventDefault()
    const currentTarget = /** @type {HTMLElement} */ (event.currentTarget)
    const relatedTarget = /** @type {Node | null} */ (event.relatedTarget)
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
        return
    }
    this.dragActive = false
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {DragEvent} event
 * @returns {Promise<void>}
 */
export async function onDrop(event) {
    event.preventDefault()
    event.stopPropagation()
    if (this.status === 'processing') {
        return
    }
    this.dragActive = false
    const items = Array.from(event.dataTransfer?.items || [])
    const itemFiles = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(/** @returns {f is File} */ (f) => f !== null)
    const rawFiles = itemFiles.length
        ? itemFiles
        : Array.from(event.dataTransfer?.files || [])
    this.stageFiles(rawFiles)
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function handleFiles(event) {
    const input = /** @type {HTMLInputElement} */ (event.target)
    const rawFiles = Array.from(input.files || [])
    if (!rawFiles.length) {
        return
    }
    this.stageFiles(rawFiles)
    input.value = ''
}
