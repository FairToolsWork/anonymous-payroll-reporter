/** @type {Promise<any> | null} */
let xlsxPromise = null
/** @type {any | null} */
let cachedXlsx = null

export function loadXlsx() {
    if (!xlsxPromise) {
        xlsxPromise = import('xlsx').then((module) => {
            cachedXlsx = module
            return module
        })
    }
    return xlsxPromise
}

export function getCachedXlsx() {
    return cachedXlsx
}
