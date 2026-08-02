import { describe, expect, it } from 'vitest'
import { createTourSteps } from '../src/features/onboarding/useTourSteps'

const translate = (_key: string, fallback: string) => fallback

describe('task onboarding steps', () => {
    it.each([
        ['connect', ['connection', 'done']],
        ['virtual', ['connection', 'apps', 'done']],
        ['build', ['connection', 'create-app', 'configure-app']],
        ['badgehub', ['connection', 'badgehub', 'browse-badgehub', 'done']],
    ] as const)('builds the %s journey', (task, expectedKeys) => {
        expect(createTourSteps(task, translate).map((step) => step.key)).toEqual(expectedKeys)
    })

    it.each([
        ['build', 'create-app', 'configure-app'],
        ['badgehub', 'badgehub', 'browse-badgehub'],
    ] as const)('advances %s through real UI actions instead of Next', (task, openStep, dialogStep) => {
        const steps = createTourSteps(task, translate)
        expect(steps.find((step) => step.key === openStep)).toMatchObject({
            advanceOnClick: true,
            waitForAction: true,
        })
        expect(steps.find((step) => step.key === dialogStep)).toMatchObject({
            waitForAction: true,
        })
    })
})
