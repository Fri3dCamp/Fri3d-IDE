import { create } from 'zustand'

interface BadgeHubStore {
    /** null while silent SSO check still running. */
    authenticated: boolean | null
    userId: string | null
    username: string | null
}

export const useBadgeHubStore = create<BadgeHubStore>(() => ({
    authenticated: null,
    userId: null,
    username: null,
}))
