import { create } from 'zustand'
import { FIRST_APP_GUIDE_STEPS } from '../features/first-app-guide/guideSteps'

interface FirstAppGuideStore {
    open: boolean
    appId: string | null
    step: number
    start(appId: string): void
    close(): void
    setStep(step: number): void
}

export const useFirstAppGuideStore = create<FirstAppGuideStore>((set) => ({
    open: false,
    appId: null,
    step: 0,
    start: (appId) => set({ open: true, appId, step: 0 }),
    close: () => set({ open: false }),
    setStep: (step) => set({ step: Math.max(0, Math.min(FIRST_APP_GUIDE_STEPS.length - 1, step)) }),
}))

export function startFirstAppGuide(appId: string): void {
    useFirstAppGuideStore.getState().start(appId)
}
