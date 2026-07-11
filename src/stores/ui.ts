import { create } from 'zustand'

export interface LoaderUpdate {
    message?: string
    /** 0..1 */
    progress?: number
}

export interface LoaderHandle {
    id: number
    update(input: string | LoaderUpdate): void
    hide(): void
}

export type SideMenuTab = 'apps' | 'files' | 'packages' | 'tools' | 'settings' | 'about'

interface UiStore {
    sideMenuTab: SideMenuTab
    /** Desktop: collapsed toggle. Mobile: drawer visibility. */
    sideMenuHidden: boolean
    drawerOpen: boolean
    terminalTab: 'terminal' | 'display'
    displayTabVisible: boolean
    terminalHeight: number
    loaders: Array<{ id: number; message: string; progress?: number }>
    isRunning: boolean
    offline: boolean

    setSideMenuTab(tab: SideMenuTab): void
    toggleSideMenu(): void
    autoHideDrawer(): void
    setTerminalTab(tab: 'terminal' | 'display'): void
    setDisplayTabVisible(visible: boolean): void
    setTerminalHeight(px: number): void
    setRunning(running: boolean): void
    setOffline(offline: boolean): void
    showLoader(message: string): LoaderHandle
}

const isMobile = () => window.innerWidth <= 768
let loaderSeq = 0

export const useUiStore = create<UiStore>((set, get) => ({
    sideMenuTab: 'apps',
    sideMenuHidden: false,
    drawerOpen: false,
    terminalTab: 'terminal',
    displayTabVisible: false,
    terminalHeight: 200,
    loaders: [],
    isRunning: false,
    offline: !navigator.onLine,

    setSideMenuTab: (tab) => set({ sideMenuTab: tab }),

    toggleSideMenu: () => {
        if (isMobile()) set({ drawerOpen: !get().drawerOpen })
        else set({ sideMenuHidden: !get().sideMenuHidden })
    },

    autoHideDrawer: () => {
        if (isMobile()) set({ drawerOpen: false })
    },

    setTerminalTab: (tab) => set({ terminalTab: tab }),
    setDisplayTabVisible: (visible) => set({ displayTabVisible: visible }),
    setTerminalHeight: (px) => set({ terminalHeight: Math.max(50, px) }),
    setRunning: (running) => set({ isRunning: running }),
    setOffline: (offline) => set({ offline }),

    showLoader: (message) => {
        const id = ++loaderSeq
        set((s) => ({ loaders: [...s.loaders, { id, message }] }))
        return {
            id,
            update: (input) =>
                set((s) => ({
                    loaders: s.loaders.map((l) => {
                        if (l.id !== id) return l
                        if (typeof input === 'string') return { ...l, message: input }
                        const next = { ...l }
                        if (input.message !== undefined) next.message = input.message
                        if (input.progress !== undefined) next.progress = Math.max(0, Math.min(1, input.progress))
                        return next
                    }),
                })),
            hide: () => set((s) => ({ loaders: s.loaders.filter((l) => l.id !== id) })),
        }
    },
}))

/** Run a task under a visible loader; loader is removed when the task settles. */
export async function withLoader<T>(
    message: string,
    task: (loader: LoaderHandle) => T | Promise<T>,
): Promise<T> {
    const loader = useUiStore.getState().showLoader(message)
    try {
        return await task(loader)
    } finally {
        loader.hide()
    }
}
