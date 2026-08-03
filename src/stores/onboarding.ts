import { create } from 'zustand'

export const CREATE_APP_GUIDE_CANCELLED_EVENT = 'fri3d:onboarding:create-app-cancelled'
export const CREATE_APP_GUIDE_COMPLETED_EVENT = 'fri3d:onboarding:create-app-completed'
export const BADGEHUB_GUIDE_CANCELLED_EVENT = 'fri3d:onboarding:badgehub-cancelled'
export const BADGEHUB_GUIDE_INSTALLED_EVENT = 'fri3d:onboarding:badgehub-installed'

interface OnboardingStore {
    guidedCreateApp: boolean
    guidedCreateAppSubmitting: boolean
    guidedBadgeHub: boolean
    setGuidedCreateApp(active: boolean): void
    setGuidedCreateAppSubmitting(submitting: boolean): void
    setGuidedBadgeHub(active: boolean): void
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
    guidedCreateApp: false,
    guidedCreateAppSubmitting: false,
    guidedBadgeHub: false,
    setGuidedCreateApp: (guidedCreateApp) => set({ guidedCreateApp }),
    setGuidedCreateAppSubmitting: (guidedCreateAppSubmitting) => set({ guidedCreateAppSubmitting }),
    setGuidedBadgeHub: (guidedBadgeHub) => set({ guidedBadgeHub }),
}))

export function beginGuidedCreateApp(): void {
    useOnboardingStore.setState({ guidedCreateApp: true, guidedCreateAppSubmitting: false })
}

export function submitGuidedCreateApp(): void {
    useOnboardingStore.getState().setGuidedCreateAppSubmitting(true)
}

export function endGuidedCreateApp(): void {
    useOnboardingStore.setState({ guidedCreateApp: false, guidedCreateAppSubmitting: false })
}

export function cancelGuidedCreateApp(): void {
    endGuidedCreateApp()
    window.dispatchEvent(new Event(CREATE_APP_GUIDE_CANCELLED_EVENT))
}

export function completeGuidedCreateApp(appId: string): void {
    endGuidedCreateApp()
    window.dispatchEvent(new CustomEvent(CREATE_APP_GUIDE_COMPLETED_EVENT, { detail: { appId } }))
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
