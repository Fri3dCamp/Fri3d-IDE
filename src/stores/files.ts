import { create } from 'zustand'

export type FsNode =
    | { name: string; path: string; size: number }
    | { name: string; path: string; content: FsNode[]; loaded?: boolean }

export function isFolder(n: FsNode): n is Extract<FsNode, { content: FsNode[] }> {
    return 'content' in n
}

interface FileStore {
    tree: FsNode[] | null
    stats: { used: number | null; size: number | null }
    openFolders: Set<string>
    selectedPath: string | null
    /** Message for the inline tree loader; null = not loading. */
    loading: string | null
    changedPaths: Set<string>

    setTree(tree: FsNode[], stats?: [number | null, number | null, number | null]): void
    setFolderChildren(path: string, children: FsNode[]): void
    setFolderLoading(path: string, loading: boolean): void
    loadingFolders: Set<string>
    setLoading(message: string | null): void
    select(path: string | null): void
    toggleFolder(path: string): void
    openFolder(path: string): void
    collapseAll(): void
    markChanged(path: string): void
    clearChanged(path: string): void
    reset(): void
}

/** Immutably filter out '.' and '..' entries from nodes tree. */
export function sanitizeNodes(nodes: FsNode[]): FsNode[] {
    return nodes
        .filter((n) => n.name !== '.' && n.name !== '..')
        .map((n) => (isFolder(n) ? { ...n, content: sanitizeNodes(n.content) } : n))
}

/** Immutably replace the children of the folder at `path`; marks it loaded. */
function replaceChildren(nodes: FsNode[], path: string, children: FsNode[]): FsNode[] {
    return nodes.map((n) => {
        if (!isFolder(n)) return n
        if (n.path === path) return { ...n, content: children, loaded: true }
        if (path.startsWith(n.path + '/')) {
            return { ...n, content: replaceChildren(n.content, path, children) }
        }
        return n
    })
}

export const useFileStore = create<FileStore>((set, get) => ({
    tree: null,
    stats: { used: null, size: null },
    openFolders: new Set<string>(),
    selectedPath: null,
    loading: null,
    changedPaths: new Set<string>(),
    loadingFolders: new Set<string>(),

    setTree: (tree, stats) =>
        set({
            tree: sanitizeNodes(tree),
            stats: stats ? { used: stats[0], size: stats[2] } : get().stats,
            loading: null,
        }),

    setLoading: (loading) => set({ loading }),

    setFolderChildren: (path, children) => {
        const tree = get().tree
        if (!tree) return
        set({ tree: replaceChildren(tree, path, sanitizeNodes(children)) })
    },

    setFolderLoading: (path, loading) => {
        const next = new Set(get().loadingFolders)
        if (loading) next.add(path)
        else next.delete(path)
        set({ loadingFolders: next })
    },

    select: (path) => {
        if (!path) {
            set({ selectedPath: null })
            return
        }
        // Auto-expand ancestors so the selection is visible.
        const open = new Set(get().openFolders)
        const parts = path.split('/').filter(Boolean)
        let acc = ''
        for (const part of parts.slice(0, -1)) {
            acc += '/' + part
            open.add(acc)
        }
        set({ selectedPath: path, openFolders: open })
    },

    toggleFolder: (path) => {
        const open = new Set(get().openFolders)
        if (open.has(path)) open.delete(path)
        else open.add(path)
        set({ openFolders: open })
    },

    openFolder: (path) => {
        const open = new Set(get().openFolders)
        open.add(path)
        set({ openFolders: open })
    },

    collapseAll: () => set({ openFolders: new Set() }),

    markChanged: (path) => {
        const changed = new Set(get().changedPaths)
        changed.add(path)
        set({ changedPaths: changed })
    },

    clearChanged: (path) => {
        const changed = new Set(get().changedPaths)
        changed.delete(path)
        set({ changedPaths: changed })
    },

    reset: () =>
        set({
            tree: null,
            stats: { used: null, size: null },
            selectedPath: null,
            loading: null,
            changedPaths: new Set(),
        }),
}))
