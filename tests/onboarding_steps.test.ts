import { describe, expect, it } from 'vitest'
import { createTourSteps } from '../src/features/onboarding/useTourSteps'

const translate = (_key: string, fallback: string) => fallback

describe('task onboarding steps', () => {
    it.each([
        ['connect', ['connection', 'done']],
        ['virtual', ['connection', 'apps', 'done']],
        ['build', ['connection', 'create-app', 'save-run', 'done']],
        ['badgehub', ['connection', 'badgehub', 'done']],
    ] as const)('builds the %s journey', (task, expectedKeys) => {
        expect(createTourSteps(task, translate).map((step) => step.key)).toEqual(expectedKeys)
    })
})
