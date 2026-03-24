/** @type {number} */
export const COLLAPSE_SHELL_COLLAPSED_HEIGHT = 75
/** @type {number} */
export const COLLAPSE_SHELL_TRANSITION_MS = 250
/** @type {number} */
export const DETAILS_CONTENT_TRANSITION_MS = 200
/** @type {WeakMap<HTMLElement, () => void>} */
const activeHeightAnimations = new WeakMap()

/** @param {HTMLElement} element */
export function clearHeightAnimation(element) {
    const cleanup = activeHeightAnimations.get(element)
    if (!cleanup) {
        return
    }
    cleanup()
    activeHeightAnimations.delete(element)
}

/**
 * @param {HTMLElement} element
 * @param {number} startHeight
 * @param {number} endHeight
 * @param {number} durationMs
 * @param {() => void} onComplete
 * @returns {void}
 */
export function animateElementHeight(
    element,
    startHeight,
    endHeight,
    durationMs,
    onComplete
) {
    clearHeightAnimation(element)
    let completed = false
    let timeoutId = 0
    const finish = () => {
        if (completed) {
            return
        }
        completed = true
        element.removeEventListener('transitionend', handleTransitionEnd)
        window.clearTimeout(timeoutId)
        activeHeightAnimations.delete(element)
        onComplete()
    }
    /** @param {TransitionEvent} event */
    const handleTransitionEnd = (event) => {
        if (event.target !== element || event.propertyName !== 'height') {
            return
        }
        finish()
    }
    element.style.height = `${startHeight}px`
    element.addEventListener('transitionend', handleTransitionEnd)
    timeoutId = window.setTimeout(finish, durationMs + 50)
    activeHeightAnimations.set(element, () => {
        if (completed) {
            return
        }
        completed = true
        element.removeEventListener('transitionend', handleTransitionEnd)
        window.clearTimeout(timeoutId)
    })
    window.requestAnimationFrame(() => {
        element.style.height = `${endHeight}px`
    })
}

/** @param {string} sectionKey @returns {HTMLElement | null} */
export function getCollapseShell(sectionKey) {
    const content = document.getElementById(`${sectionKey}-content`)
    return /** @type {HTMLElement | null} */ (
        content?.closest('.collapse-shell') || null
    )
}

/** @param {HTMLElement} shell @param {boolean} isCollapsed @returns {void} */
export function syncCollapseShell(shell, isCollapsed) {
    clearHeightAnimation(shell)
    shell.style.overflow = isCollapsed ? 'hidden' : ''
    shell.style.height = isCollapsed
        ? `${COLLAPSE_SHELL_COLLAPSED_HEIGHT}px`
        : 'auto'
}

/** @param {HTMLElement} details @returns {HTMLElement | null} */
export function getAnimatedDetailsContent(details) {
    for (const child of Array.from(details.children)) {
        if (
            child?.nodeType === 1 &&
            child.classList?.contains('details-content')
        ) {
            return /** @type {HTMLElement} */ (child)
        }
    }
    return null
}

/** @param {HTMLElement} root @returns {void} */
export function initializeAnimatedDetails(root) {
    root.querySelectorAll('.card details').forEach((element) => {
        const details = /** @type {HTMLDetailsElement} */ (element)
        if (details.dataset.animated === 'true') {
            return
        }
        const summary = /** @type {HTMLElement | null} */ (
            details.firstElementChild
        )
        if (!summary || summary.tagName !== 'SUMMARY') {
            return
        }
        const content = document.createElement('div')
        content.className = 'details-content'
        for (const child of Array.from(details.children)) {
            if (child !== summary) {
                content.appendChild(child)
            }
        }
        details.appendChild(content)
        content.style.height = details.open ? 'auto' : '0px'
        details.dataset.animated = 'true'
        details.dataset.animating = 'false'
    })
}
