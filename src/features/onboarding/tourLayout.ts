export function firstVisibleRect(selectors?: string[]): DOMRect | null {
    if (!selectors?.length) return null
    for (const selector of selectors) {
        const element = document.querySelector(selector)
        if (!element) continue
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) return rect
    }
    return null
}

const CARD_WIDTH = 380
const CARD_GAP = 14

export function tourCardPosition(rect: DOMRect | null, cardHeight: number): React.CSSProperties {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(CARD_WIDTH, viewportWidth - 16)

    if (!rect) {
        return {
            left: (viewportWidth - width) / 2,
            top: Math.max(16, (viewportHeight - cardHeight) / 2),
            width,
        }
    }

    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const spaceRight = viewportWidth - rect.right
    const spaceLeft = rect.left
    let left: number
    let top: number

    if (spaceRight >= width + CARD_GAP) {
        left = rect.right + CARD_GAP
        top = rect.top + rect.height / 2 - cardHeight / 2
    } else if (spaceLeft >= width + CARD_GAP) {
        left = rect.left - width - CARD_GAP
        top = rect.top + rect.height / 2 - cardHeight / 2
    } else if (spaceBelow >= cardHeight + CARD_GAP) {
        left = rect.left + rect.width / 2 - width / 2
        top = rect.bottom + CARD_GAP
    } else if (spaceAbove >= cardHeight + CARD_GAP) {
        left = rect.left + rect.width / 2 - width / 2
        top = rect.top - cardHeight - CARD_GAP
    } else {
        left = rect.left + rect.width / 2 - width / 2
        top = rect.bottom + CARD_GAP
    }

    return {
        left: Math.min(Math.max(8, left), viewportWidth - width - 8),
        top: Math.min(Math.max(8, top), viewportHeight - cardHeight - 8),
        width,
    }
}
