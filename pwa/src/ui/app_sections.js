import {
    animateElementHeight,
    clearHeightAnimation,
    COLLAPSE_SHELL_COLLAPSED_HEIGHT,
    COLLAPSE_SHELL_TRANSITION_MS,
    DETAILS_CONTENT_TRANSITION_MS,
    getAnimatedDetailsContent,
    getCollapseShell,
    syncCollapseShell,
} from './app_animations.js'

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {string} sectionKey
 * @param {boolean} isCollapsed
 * @returns {void}
 */
export function setSectionCollapsed(sectionKey, isCollapsed) {
    if (!this.collapsedSections) {
        this.collapsedSections = {
            prep: false,
            nextSteps: true,
        }
    }
    const shell = getCollapseShell(sectionKey)
    if (!shell) {
        this.collapsedSections[sectionKey] = isCollapsed
        return
    }
    const startHeight = shell.getBoundingClientRect().height
    shell.style.overflow = 'hidden'
    this.collapsedSections[sectionKey] = isCollapsed
    this.$nextTick(() => {
        const activeShell = getCollapseShell(sectionKey) || shell
        const targetHeight = isCollapsed
            ? COLLAPSE_SHELL_COLLAPSED_HEIGHT
            : activeShell.scrollHeight
        animateElementHeight(
            activeShell,
            startHeight,
            targetHeight,
            COLLAPSE_SHELL_TRANSITION_MS,
            () => {
                syncCollapseShell(activeShell, isCollapsed)
            }
        )
    })
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {string} sectionKey
 * @returns {void}
 */
export function toggleSection(sectionKey) {
    this.setSectionCollapsed(sectionKey, !this.collapsedSections?.[sectionKey])
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {string} sectionKey
 * @returns {void}
 */
export function expandSection(sectionKey) {
    if (this.collapsedSections?.[sectionKey]) {
        this.setSectionCollapsed(sectionKey, false)
    }
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {string} sectionKey
 * @returns {void}
 */
export function handleSectionFocus(sectionKey) {
    if (this.collapsedSections?.[sectionKey]) {
        this.setSectionCollapsed(sectionKey, false)
    }
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {string} sectionKey
 * @returns {void}
 */
export function syncCollapseShellState(sectionKey) {
    if (!this.collapsedSections) {
        return
    }
    const shell = getCollapseShell(sectionKey)
    if (!shell) {
        return
    }
    syncCollapseShell(shell, !!this.collapsedSections[sectionKey])
}

/**
 * @this {import('./app.js').PayrollAppInstance}
 * @param {MouseEvent} event
 * @returns {void}
 */
export function handleAnimatedDetailsClick(event) {
    const eventTarget = /** @type {EventTarget | null} */ (event.target)
    if (!eventTarget) {
        return
    }
    const targetCandidate = /** @type {{ closest?: unknown }} */ (eventTarget)
    if (typeof targetCandidate.closest !== 'function') {
        return
    }
    const target = /** @type {Element} */ (eventTarget)
    const summary = target.closest('summary')
    if (!summary || summary.tagName !== 'SUMMARY') {
        return
    }
    const details = /** @type {HTMLDetailsElement | null} */ (
        summary.parentElement
    )
    if (!details || details.tagName !== 'DETAILS') {
        return
    }
    if (!details.matches('.card details')) {
        return
    }
    const content = getAnimatedDetailsContent(details)
    if (!content) {
        return
    }
    event.preventDefault()
    if (details.dataset.animating === 'true') {
        return
    }
    if (details.open) {
        details.dataset.animating = 'true'
        animateElementHeight(
            content,
            content.getBoundingClientRect().height,
            0,
            DETAILS_CONTENT_TRANSITION_MS,
            () => {
                details.open = false
                details.dataset.animating = 'false'
                content.style.height = '0px'
            }
        )
        return
    }
    const groupName = details.getAttribute('name')
    if (groupName) {
        document.querySelectorAll('details[open]').forEach((node) => {
            const openDetails = /** @type {HTMLDetailsElement} */ (node)
            if (
                openDetails.tagName !== 'DETAILS' ||
                openDetails === details ||
                openDetails.getAttribute('name') !== groupName
            ) {
                return
            }
            const siblingContent = getAnimatedDetailsContent(openDetails)
            if (siblingContent) {
                clearHeightAnimation(siblingContent)
                siblingContent.style.height = '0px'
            }
            openDetails.open = false
            openDetails.dataset.animating = 'false'
        })
    }
    details.open = true
    details.dataset.animating = 'true'
    content.style.height = '0px'
    animateElementHeight(
        content,
        0,
        content.scrollHeight,
        DETAILS_CONTENT_TRANSITION_MS,
        () => {
            details.dataset.animating = 'false'
            content.style.height = 'auto'
        }
    )
}
