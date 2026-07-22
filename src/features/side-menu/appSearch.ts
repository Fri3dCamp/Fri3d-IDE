import type { AppInfo } from '../../stores/apps'

export function fuzzyScore(text: string, query: string): number | null {
    const normalizedText = text.toLowerCase()
    const normalizedQuery = query.toLowerCase()
    if (!normalizedQuery) return 0
    if (!normalizedText) return null

    const substringIndex = normalizedText.indexOf(normalizedQuery)
    if (substringIndex >= 0) {
        return 100 - Math.min(substringIndex, 40) + (normalizedQuery.length / normalizedText.length) * 20
    }

    let textIndex = 0
    let score = 0
    let streak = 0
    for (const character of normalizedQuery) {
        const found = normalizedText.indexOf(character, textIndex)
        if (found < 0) return null
        streak = found === textIndex ? streak + 1 : 1
        score += streak * 2 + (found === 0 || /[\s._\-/]/.test(normalizedText[found - 1]) ? 6 : 0)
        textIndex = found + 1
    }
    return score
}

function appFuzzyScore(app: AppInfo, query: string): number | null {
    const scores = [
        fuzzyScore(app.name, query),
        fuzzyScore(app.fullname, query),
        (() => {
            const score = fuzzyScore(app.short_description ?? '', query)
            return score === null ? null : score * 0.5
        })(),
    ].filter((score): score is number => score !== null)

    return scores.length ? Math.max(...scores) : null
}

export function searchApps(apps: AppInfo[], query: string): AppInfo[] {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return apps

    return apps
        .map((app, index) => ({ app, index, score: appFuzzyScore(app, normalizedQuery) }))
        .filter((item): item is { app: AppInfo; index: number; score: number } => item.score !== null)
        .sort(
            (left, right) =>
                right.score - left.score ||
                left.app.name.localeCompare(right.app.name) ||
                left.index - right.index,
        )
        .map((item) => item.app)
}
