import { create } from 'zustand'

export interface AppActivity {
    entrypoint: string
    classname: string
    intent_filters?: Array<{ action: string; category?: string }>
}

export interface AppInfo {
    /** Reverse-DNS id, also the folder name under /apps/. */
    fullname: string
    name: string
    version: string
    publisher?: string
    short_description?: string
    category?: string
    activities: AppActivity[]
    /** Folder path on device: /apps/<fullname> */
    path: string
    /** Manifest missing/corrupt — folder shown but not launchable. */
    broken?: boolean
}

interface AppsStore {
    apps: AppInfo[] | null
    scanning: boolean
    launching: string | null
    /** fullname of the app opened in the side-menu detail view. */
    selected: string | null
    setApps(apps: AppInfo[]): void
    setScanning(scanning: boolean): void
    setLaunching(fullname: string | null): void
    setSelected(fullname: string | null): void
    reset(): void
}

export const useAppsStore = create<AppsStore>((set) => ({
    apps: null,
    scanning: false,
    launching: null,
    selected: null,
    setApps: (apps) => set({ apps, scanning: false }),
    setScanning: (scanning) => set({ scanning }),
    setLaunching: (launching) => set({ launching }),
    setSelected: (selected) => set({ selected }),
    reset: () => set({ apps: null, scanning: false, launching: null, selected: null }),
}))

/** /apps/<fullname>/… → <fullname>, else null. */
export function appIdForPath(path: string): string | null {
    const m = path.match(/^\/apps\/([^/]+)\//)
    return m ? m[1] : null
}
