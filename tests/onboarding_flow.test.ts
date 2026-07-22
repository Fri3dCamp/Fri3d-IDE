import { describe, expect, it } from 'vitest'
import { directTargetForTask } from '../src/features/onboarding/onboardingFlow'

describe('onboarding target selection', () => {
    it('opens direct connection tasks without another choice', () => {
        expect(directTargetForTask('connect')).toBe('real')
        expect(directTargetForTask('virtual')).toBe('virtual')
    })

    it('asks where app workflows should run', () => {
        expect(directTargetForTask('build')).toBeNull()
        expect(directTargetForTask('badgehub')).toBeNull()
    })
})
