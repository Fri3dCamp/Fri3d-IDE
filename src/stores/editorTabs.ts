import { create } from 'zustand'

export type TabKind = 'code' | 'markdown' | 'svg' | 'image' | 'hex'

export interface EditorTab {
    id: string
    /** Device path, or 'Untitled'. */
    fn: string
    kind: TabKind
    /** markdown/svg tabs toggle between rendered view and raw editor. */
    viewMode: 'view' | 'edit'
    readOnly: boolean
    dirty: boolean
    /** Content snapshot. The live CodeMirror doc is source of truth while a
     *  code editor is mounted; it syncs back here on unmount/toggle/save. */
    content: string | Uint8Array
    /** Last content read from or written to the device. Null for new files. */
    savedContent: string | Uint8Array | null
}

interface EditorTabsStore {
    tabs: EditorTab[]
    activeId: string | null

    openTab(
        tab: Omit<EditorTab, 'id' | 'dirty' | 'savedContent'> & {
            dirty?: boolean
            savedContent?: string | Uint8Array | null
        },
    ): string
    closeTab(id: string): void
    closeByPath(path: string, isDirPrefix?: boolean): void
    activate(id: string): void
    markDirty(id: string, dirty?: boolean): void
    setContent(id: string, content: string | Uint8Array): void
    setSavedContent(id: string, content: string | Uint8Array | null): void
    setViewMode(id: string, mode: 'view' | 'edit'): void
    rename(id: string, fn: string): void
    activeTab(): EditorTab | null
}

let tabSeq = 0
const newId = () => `tab-${++tabSeq}`

const RECOVERY_KEY = 'fri3d-ide-editor-recovery-v1'
const RECOVERY_MAX_BYTES = 2 * 1024 * 1024

interface RecoveredSession {
    tabs: EditorTab[]
    activeId: string | null
}

function loadRecoveredSession(): RecoveredSession {
    try {
        const raw = localStorage.getItem(RECOVERY_KEY)
        if (!raw) return { tabs: [], activeId: null }
        const parsed = JSON.parse(raw) as { tabs?: Array<Partial<EditorTab>>; activeId?: string | null }
        const tabs: EditorTab[] = Array.isArray(parsed.tabs)
            ? parsed.tabs.flatMap((tab) => {
                  if (
                      !tab ||
                      typeof tab.id !== 'string' ||
                      typeof tab.fn !== 'string' ||
                      typeof tab.content !== 'string' ||
                      tab.dirty !== true
                  ) {
                      return []
                  }
                  return [{
                      id: tab.id,
                      fn: tab.fn,
                      kind: tab.kind ?? 'code',
                      viewMode: tab.viewMode ?? 'edit',
                      readOnly: false,
                      dirty: true,
                      content: tab.content,
                      savedContent: typeof tab.savedContent === 'string' ? tab.savedContent : null,
                  }]
              })
            : []
        for (const tab of tabs) {
            const seq = Number(tab.id.match(/^tab-(\d+)$/)?.[1] ?? 0)
            tabSeq = Math.max(tabSeq, seq)
        }
        const activeId = tabs.some((tab) => tab.id === parsed.activeId)
            ? (parsed.activeId ?? null)
            : (tabs.at(-1)?.id ?? null)
        return { tabs, activeId }
    } catch {
        return { tabs: [], activeId: null }
    }
}

const recovered = loadRecoveredSession()

function untitledTab(): EditorTab {
    return {
        id: newId(),
        fn: 'Untitled',
        kind: 'code',
        viewMode: 'edit',
        readOnly: false,
        dirty: true,
        content: '',
        savedContent: null,
    }
}

export const useEditorTabsStore = create<EditorTabsStore>((set, get) => ({
    tabs: recovered.tabs,
    activeId: recovered.activeId,

    openTab: (partial) => {
        // Re-activate existing tab for the same file.
        const existing = get().tabs.find((t) => t.fn === partial.fn && partial.fn !== 'Untitled')
        if (existing) {
            set({ activeId: existing.id })
            return existing.id
        }
        const tab: EditorTab = {
            id: newId(),
            dirty: false,
            ...partial,
            savedContent: partial.savedContent ?? null,
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
        return tab.id
    },

    closeTab: (id) => {
        const { tabs, activeId } = get()
        const idx = tabs.findIndex((t) => t.id === id)
        if (idx < 0) return
        let next = tabs.filter((t) => t.id !== id)
        let nextActive = activeId
        if (next.length === 0) {
            // Never leave the editor empty: recreate an Untitled scratch tab.
            const scratch = untitledTab()
            next = [scratch]
            nextActive = scratch.id
        } else if (activeId === id) {
            nextActive = next[Math.max(0, idx - 1)].id
        }
        set({ tabs: next, activeId: nextActive })
    },

    closeByPath: (path, isDirPrefix = false) => {
        const doomed = get().tabs.filter((t) =>
            isDirPrefix ? t.fn.startsWith(path + '/') : t.fn === path,
        )
        for (const t of doomed) get().closeTab(t.id)
    },

    activate: (id) => set({ activeId: id }),

    markDirty: (id, dirty = true) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) })),

    setContent: (id, content) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)) })),

    setSavedContent: (id, savedContent) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, savedContent } : t)) })),

    setViewMode: (id, viewMode) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewMode } : t)) })),

    rename: (id, fn) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, fn } : t)) })),

    activeTab: () => get().tabs.find((t) => t.id === get().activeId) ?? null,
}))

let recoveryTimer: ReturnType<typeof setTimeout> | null = null
useEditorTabsStore.subscribe((state) => {
    if (recoveryTimer) clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(() => {
        try {
            const tabs = state.tabs.filter(
                (tab) => tab.dirty && !tab.readOnly && typeof tab.content === 'string',
            )
            if (tabs.length === 0) {
                localStorage.removeItem(RECOVERY_KEY)
                return
            }
            const activeId = tabs.some((tab) => tab.id === state.activeId)
                ? state.activeId
                : (tabs.at(-1)?.id ?? null)
            const serialized = JSON.stringify({
                tabs: tabs.map((tab) => ({
                    ...tab,
                    savedContent: typeof tab.savedContent === 'string' ? tab.savedContent : null,
                })),
                activeId,
            } satisfies RecoveredSession)
            if (new Blob([serialized]).size <= RECOVERY_MAX_BYTES) {
                localStorage.setItem(RECOVERY_KEY, serialized)
            }
        } catch {
            // Recovery is best-effort when storage is unavailable or full.
        }
    }, 250)
})

export function createUntitledTab(): void {
    const store = useEditorTabsStore.getState()
    const scratch = untitledTab()
    useEditorTabsStore.setState((s) => ({ tabs: [...s.tabs, scratch], activeId: scratch.id }))
    void store
}
