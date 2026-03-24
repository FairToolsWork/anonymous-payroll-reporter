/** @type {string} */
export const UNKNOWN_APP_VERSION = 'Unknown'

/** @returns {string} */
export function getAppVersionFromDemoLink() {
    const metaVersion = document
        .querySelector('meta[name="app-version"]')
        ?.getAttribute('content')
    if (metaVersion) {
        return `v${metaVersion}`
    }
    return UNKNOWN_APP_VERSION
}
