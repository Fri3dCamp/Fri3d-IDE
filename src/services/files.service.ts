import { toast } from 'sonner'
import { i18next } from '../i18n'
import type { MpRawMode } from '../domain/rawmode'
import { splitPath } from '../domain/utils'
import { useConnectionStore } from '../stores/connection'
import { useEditorTabsStore, type TabKind } from '../stores/editorTabs'
import { useFileStore } from '../stores/files'
import { useSettingsStore } from '../stores/settings'
import { useUiStore, withLoader } from '../stores/ui'
import { getLiveView } from '../features/editor/CodeEditor'
import { refreshTreeVia, withRawMode, type ConnectUi } from './device.service'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

const IMAGE_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
}

export function imageMimeFor(fn: string): string | null {
    const lower = fn.toLowerCase()
    for (const [ext, mime] of Object.entries(IMAGE_MIME)) {
        if (lower.endsWith(ext)) return mime
    }
    return null
}

function decideKind(fn: string, content: string | Uint8Array): { kind: TabKind; viewMode: 'view' | 'edit' } {
    const settings = useSettingsStore.getState()
    if (content instanceof Uint8Array) {
        if (imageMimeFor(fn)) return { kind: 'image', viewMode: 'view' }
        return { kind: 'hex', viewMode: 'view' }
    }
    if (fn.toLowerCase().endsWith('.svg')) return { kind: 'svg', viewMode: 'view' }
    if (fn.endsWith('.md') && settings.renderMarkdown) return { kind: 'markdown', viewMode: 'view' }
    return { kind: 'code', viewMode: 'edit' }
}

/** Read + open a file inside an existing raw session (used on connect). */
export async function openFileContent(raw: MpRawMode, fn: string): Promise<void> {
    let content: string | Uint8Array = await raw.readFile(fn)
    if (!imageMimeFor(fn)) {
        try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(content as Uint8Array)
        } catch {
            /* keep bytes for hex/image viewer */
        }
    }

    const savedContent = content
    if (typeof content === 'string' && fn.endsWith('.json') && useSettingsStore.getState().expandMinifyJson) {
        try {
            content = JSON.stringify(JSON.parse(content), null, 2)
        } catch {
            toast.warning(t('files.json-malformed', 'JSON is malformed'))
        }
    }

    const { kind, viewMode } = decideKind(fn, content)
    useEditorTabsStore.getState().openTab({
        fn,
        kind,
        viewMode,
        readOnly: false,
        content,
        savedContent,
    })
    useFileStore.getState().select(fn)
    useUiStore.getState().autoHideDrawer()
}

/** Open from tree click: manages its own raw session + loader. */
export async function openFile(fn: string): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return

    // Already open → just activate.
    const tabs = useEditorTabsStore.getState()
    const existing = tabs.tabs.find((tab) => tab.fn === fn)
    if (existing) {
        tabs.activate(existing.id)
        useFileStore.getState().select(fn)
        useUiStore.getState().autoHideDrawer()
        return
    }

    await withLoader(t('files.opening', 'Opening {{fn}}…', { fn }), () =>
        withRawMode((raw) => openFileContent(raw, fn)),
    )
}

async function revealInFileTree(path: string): Promise<void> {
    useUiStore.getState().setSideMenuTab('files')

    const treeStore = useFileStore.getState()
    if (!treeStore.tree) {
        await refreshFileTree()
    }

    const parts = path.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts.slice(0, -1)) {
        acc += '/' + part
        useFileStore.getState().openFolder(acc)
        try {
            await loadFolder(acc)
        } catch {
            // best-effort reveal; opening file still proceeds
        }
    }
    useFileStore.getState().select(path)
}

/** Open a file and move caret to given 1-based line; used by traceback quick-jump. */
export async function openFileAtLine(path: string, line: number): Promise<void> {
    const fn = path.startsWith('/') ? path : `/${path}`

    await revealInFileTree(fn)
    await openFile(fn)

    const tabs = useEditorTabsStore.getState()
    const tab = tabs.tabs.find((t) => t.fn === fn)
    if (!tab) return
    const view = getLiveView(tab.id)
    if (!view) return

    const safeLine = Math.max(1, Math.min(line || 1, view.state.doc.lines))
    const target = view.state.doc.line(safeLine).from
    view.dispatch({
        selection: { anchor: target },
        scrollIntoView: true,
    })
    view.focus()
}

export async function refreshFileTree(): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    useFileStore.getState().setLoading(t('files.loading', 'Loading files…'))
    try {
        await withRawMode(refreshTreeVia)
    } finally {
        useFileStore.getState().setLoading(null)
    }
}

/** Lazy-load a folder's children on first expand. */
export async function loadFolder(path: string): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const store = useFileStore.getState()
    if (store.loadingFolders.has(path)) return
    store.setFolderLoading(path, true)
    try {
        await withRawMode(async (raw) => {
            const children = await raw.listDir(path)
            useFileStore.getState().setFolderChildren(path, children)
        })
    } finally {
        useFileStore.getState().setFolderLoading(path, false)
    }
}

export async function createItem(parentPath: string, name: string, isFolder: boolean): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return

    name = name.trim().replace(/^\/+/, '')
    if (isFolder) name = name.replace(/\/+$/, '')
    if (!name) return

    if (parentPath !== '/') useFileStore.getState().openFolder(parentPath.replace(/\/$/, ''))

    await withLoader(t('files.creating', 'Creating {{name}}…', { name }), () =>
        withRawMode(async (raw) => {
            const full = parentPath + name
            if (isFolder) {
                await raw.makePath(full)
            } else {
                if (name.includes('/')) {
                    const [dirname] = splitPath(full)
                    await raw.makePath(dirname)
                }
                await raw.touchFile(full)
                await openFileContent(raw, full)
            }
            await refreshTreeVia(raw)
        }),
    )
}

export async function removeItem(ui: ConnectUi, path: string, isDir: boolean): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return

    if (isDir && /^\/apps\/[^/]+$/.test(path)) {
        const appId = path.split('/').at(-1) ?? path
        const typed = await ui.prompt(
            t('files.confirm-remove-app-root', 'Type {{id}} to delete app folder {{path}}', { id: appId, path }),
            { value: '' },
        )
        if ((typed ?? '').trim() !== appId) return
    } else if (!(await ui.confirm(t('files.confirm-remove', 'Remove {{path}}?', { path })))) {
        return
    }

    await withLoader(t('files.removing', 'Removing {{path}}…', { path }), () =>
        withRawMode(async (raw) => {
            if (isDir) await raw.removeDir(path)
            else await raw.removeFile(path)
            await refreshTreeVia(raw)
        }),
    )
    useEditorTabsStore.getState().closeByPath(path, isDir)
    if (!isDir) useEditorTabsStore.getState().closeByPath(path)
}

/** Rename file or folder within its parent directory. Prompts for new name. */
export async function renameItem(
    ui: { prompt: (msg: string, options?: { value?: string }) => Promise<string | null> },
    path: string,
    isDir: boolean,
): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return

    const oldName = path.split('/').at(-1) ?? path
    const parent = path.slice(0, path.length - oldName.length)

    const input = await ui.prompt(t('files.rename-prompt', 'New name for {{name}}:', { name: oldName }), {
        value: oldName,
    })
    const newName = (input ?? '').trim().replace(/^\/+|\/+$/g, '')
    if (!newName || newName === oldName) return
    if (newName.includes('/')) {
        toast.error(t('files.rename-no-slash', 'Name cannot contain /'))
        return
    }
    const newPath = parent + newName

    await withLoader(t('files.renaming', 'Renaming {{name}}…', { name: oldName }), () =>
        withRawMode(async (raw) => {
            await raw.rename(path, newPath)
            await refreshTreeVia(raw)
        }),
    )

    // Update open editor tabs pointing at the old path.
    const tabs = useEditorTabsStore.getState()
    for (const tab of tabs.tabs) {
        if (tab.fn === path) tabs.rename(tab.id, newPath)
        else if (isDir && tab.fn.startsWith(path + '/')) tabs.rename(tab.id, newPath + tab.fn.slice(path.length))
    }
    const fileStore = useFileStore.getState()
    if (!isDir && fileStore.selectedPath === path) fileStore.select(newPath)
}
