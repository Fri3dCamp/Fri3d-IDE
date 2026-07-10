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
}

interface EditorTabsStore {
    tabs: EditorTab[]
    activeId: string | null

    openTab(tab: Omit<EditorTab, 'id' | 'dirty'> & { dirty?: boolean }): string
    closeTab(id: string): void
    closeByPath(path: string, isDirPrefix?: boolean): void
    activate(id: string): void
    markDirty(id: string, dirty?: boolean): void
    setContent(id: string, content: string | Uint8Array): void
    setViewMode(id: string, mode: 'view' | 'edit'): void
    rename(id: string, fn: string): void
    activeTab(): EditorTab | null
}

let tabSeq = 0
const newId = () => `tab-${++tabSeq}`

function untitledTab(): EditorTab {
    return {
        id: newId(),
        fn: 'Untitled',
        kind: 'code',
        viewMode: 'edit',
        readOnly: false,
        dirty: true,
        content: '',
    }
}

export const useEditorTabsStore = create<EditorTabsStore>((set, get) => ({
    tabs: [],
    activeId: null,

    openTab: (partial) => {
        // Re-activate existing tab for the same file.
        const existing = get().tabs.find((t) => t.fn === partial.fn && partial.fn !== 'Untitled')
        if (existing) {
            set({ activeId: existing.id })
            return existing.id
        }
        const tab: EditorTab = { id: newId(), dirty: false, ...partial }
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

    setViewMode: (id, viewMode) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewMode } : t)) })),

    rename: (id, fn) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, fn } : t)) })),

    activeTab: () => get().tabs.find((t) => t.id === get().activeId) ?? null,
}))

export function createUntitledTab(): void {
    const store = useEditorTabsStore.getState()
    const scratch = untitledTab()
    useEditorTabsStore.setState((s) => ({ tabs: [...s.tabs, scratch], activeId: scratch.id }))
    void store
}
