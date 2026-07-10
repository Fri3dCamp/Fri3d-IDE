import { toast } from 'sonner'
import { i18next } from '../i18n'
import type { MpRawMode } from '../domain/rawmode'
import { splitPath } from '../domain/utils'
import { useConnectionStore } from '../stores/connection'
import { useEditorTabsStore, type TabKind } from '../stores/editorTabs'
import { useFileStore } from '../stores/files'
import { useSettingsStore } from '../stores/settings'
import { useUiStore, withLoader } from '../stores/ui'
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

    if (typeof content === 'string' && fn.endsWith('.json') && useSettingsStore.getState().expandMinifyJson) {
        try {
            content = JSON.stringify(JSON.parse(content), null, 2)
        } catch {
            toast.warning(t('files.json-malformed', 'JSON is malformed'))
        }
    }

    const { kind, viewMode } = decideKind(fn, content)
    useEditorTabsStore.getState().openTab({ fn, kind, viewMode, readOnly: false, content })
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
    if (!(await ui.confirm(t('files.confirm-remove', 'Remove {{path}}?', { path })))) return

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
