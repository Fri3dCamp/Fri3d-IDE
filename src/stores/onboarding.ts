import { create } from 'zustand'

export const CREATE_APP_GUIDE_CANCELLED_EVENT = 'fri3d:onboarding:create-app-cancelled'
export const BADGEHUB_GUIDE_CANCELLED_EVENT = 'fri3d:onboarding:badgehub-cancelled'
export const BADGEHUB_GUIDE_INSTALLED_EVENT = 'fri3d:onboarding:badgehub-installed'

interface OnboardingStore {
    guidedCreateApp: boolean
    guidedBadgeHub: boolean
    setGuidedCreateApp(active: boolean): void
    setGuidedBadgeHub(active: boolean): void
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
    guidedCreateApp: false,
    guidedBadgeHub: false,
    setGuidedCreateApp: (guidedCreateApp) => set({ guidedCreateApp }),
    setGuidedBadgeHub: (guidedBadgeHub) => set({ guidedBadgeHub }),
}))

export function beginGuidedCreateApp(): void {
    useOnboardingStore.getState().setGuidedCreateApp(true)
}

export function endGuidedCreateApp(): void {
    useOnboardingStore.getState().setGuidedCreateApp(false)
}

export function cancelGuidedCreateApp(): void {
    endGuidedCreateApp()
    window.dispatchEvent(new Event(CREATE_APP_GUIDE_CANCELLED_EVENT))
}

export function beginGuidedBadgeHub(): void {
    useOnboardingStore.getState().setGuidedBadgeHub(true)
}

export function endGuidedBadgeHub(): void {
    useOnboardingStore.getState().setGuidedBadgeHub(false)
}

export function cancelGuidedBadgeHub(): void {
    endGuidedBadgeHub()
    window.dispatchEvent(new Event(BADGEHUB_GUIDE_CANCELLED_EVENT))
}

export function completeGuidedBadgeHubInstall(): void {
    endGuidedBadgeHub()
    window.dispatchEvent(new Event(BADGEHUB_GUIDE_INSTALLED_EVENT))
}
