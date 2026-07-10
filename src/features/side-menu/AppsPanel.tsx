import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ArrowUp,
    ChevronRight,
    CirclePlay,
    FileCode2,
    Folder,
    FolderClosed,
    FolderOpen,
    Loader2,
    PackagePlus,
    Pencil,
    Plus,
    RefreshCw,
    Rocket,
    TriangleAlert,
    X,
} from 'lucide-react'
import { useAppsStore, type AppInfo } from '../../stores/apps'
import { useConnectionStore } from '../../stores/connection'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { sizeFmt } from '../../domain/utils'
import { refreshApps, launchApp, openAppFile, listDirectory } from '../../services/apps.service'
import { createItem, removeItem } from '../../services/files.service'
import { useConfirm, usePrompt, useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'
import { useCreateAppDialog } from './AppBrowser'
import { useAppEditorDialog } from './AppEditorDialog'
import { ConnectDeviceButton } from './FileTree'

const headBtn = 'p-1 opacity-70 hover:opacity-100'

type DeviceEntry =
    | { name: string; path: string; size: number; isDir: false }
    | { name: string; path: string; isDir: true }

/* ------------------------------------------------------------------ */
/* App list                                                            */
/* ------------------------------------------------------------------ */

function AppRow({ app }: { app: AppInfo }) {
    const { t } = useTranslation()
    const launching = useAppsStore((s) => s.launching === app.fullname)
    const anyLaunching = useAppsStore((s) => s.launching !== null)
    const setSelected = useAppsStore((s) => s.setSelected)

    return (
        <div className="group flex items-center gap-1.5 px-2 py-0.5 text-sm hover:bg-black/10 dark:hover:bg-white/10">
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={`${app.fullname}${app.short_description ? `\n${app.short_description}` : ''}`}
                onClick={() => setSelected(app.fullname)}
            >
                {app.broken ? (
                    <TriangleAlert size={14} className="shrink-0 text-icon-warning" aria-hidden />
                ) : (
                    <FileCode2 size={14} className="shrink-0 opacity-80" aria-hidden />
                )}
                <span className="truncate">{app.name}</span>
                {app.version && <span className="shrink-0 text-xs opacity-50">{app.version}</span>}
            </button>
            {!app.broken && (
                <button
                    type="button"
                    disabled={anyLaunching}
                    title={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                    aria-label={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                    className="invisible shrink-0 p-0.5 text-icon-success opacity-80 hover:opacity-100 group-hover:visible disabled:opacity-40"
                    onClick={() => void launchApp(app.fullname)}
                >
                    {launching ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <CirclePlay size={14} aria-hidden />
                    )}
                </button>
            )}
        </div>
    )
}

function AppList() {
    const { t } = useTranslation()
    const apps = useAppsStore((s) => s.apps)
    const scanning = useAppsStore((s) => s.scanning)
    const createAppDialog = useCreateAppDialog()

    return (
        <>
            <div className="px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                    <span className="font-heading text-sm font-bold uppercase tracking-wide">
                        {t('apps.title', 'Apps')}
                    </span>
                    <button
                        type="button"
                        className={headBtn}
                        title={t('files.refresh', 'Refresh')}
                        aria-label={t('files.refresh', 'Refresh')}
                        onClick={() => void refreshApps()}
                    >
                        {scanning ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw size={14} aria-hidden />
                        )}
                    </button>
                </div>
                <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 border-2 border-black bg-(--fri3d-purple) px-3 py-2 font-semibold text-white shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                    title={t('apps.create-title', 'Create New App')}
                    aria-label={t('apps.create-title', 'Create New App')}
                    onClick={() => void createAppDialog()}
                >
                    <PackagePlus size={16} aria-hidden />
                    {t('apps.create-title', 'Create New App')}
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
                {apps?.map((app) => <AppRow key={app.fullname} app={app} />)}
                {apps !== null && apps.length === 0 && !scanning && (
                    <div className="px-3 pb-1 text-sm opacity-60">{t('apps.none', 'No apps installed')}</div>
                )}
                {apps === null && scanning && (
                    <div className="flex items-center gap-2 px-3 py-1 text-sm opacity-70">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        {t('apps.scanning', 'Scanning apps…')}
                    </div>
                )}
            </div>
        </>
    )
}

/* ------------------------------------------------------------------ */
/* Create item in app: includes folder explorer picker                 */
/* ------------------------------------------------------------------ */

interface CreateInAppResult {
    parentPath: string
    name: string
    isFolder: boolean
}

function parentFolder(path: string, root: string): string | null {
    const clean = path.replace(/\/+$/, '')
    const rootClean = root.replace(/\/+$/, '')
    if (clean === rootClean) return null
    const idx = clean.lastIndexOf('/')
    const up = idx > 0 ? clean.slice(0, idx) : '/'
    return up.length < rootClean.length ? rootClean : up
}

function CreateInAppDialog({
    appPath,
    close,
}: {
    appPath: string
    close: (r: CreateInAppResult | null) => void
}) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)
    const [isFolder, setIsFolder] = useState(false)
    const [currentPath, setCurrentPath] = useState(appPath)
    const [loading, setLoading] = useState(false)
    const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([])

    useEffect(() => inputRef.current?.focus(), [])

    const loadFolders = useCallback(async () => {
        setLoading(true)
        try {
            const entries = await listDirectory(currentPath)
            setFolders((entries ?? []).filter((e): e is { name: string; path: string; isDir: true } => e.isDir))
        } finally {
            setLoading(false)
        }
    }, [currentPath])

    useEffect(() => {
        void loadFolders()
    }, [loadFolders])

    const toggleClass = (active: boolean) =>
        `flex items-center gap-1.5 border-2 border-black px-3 py-1 text-sm transition-colors ${
            active ? 'bg-tab-active text-tab-active-fg' : 'bg-transparent hover:bg-black/10 dark:hover:bg-white/10'
        }`

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                const name = inputRef.current?.value.trim()
                if (!name) return
                close({
                    parentPath: currentPath.endsWith('/') ? currentPath : `${currentPath}/`,
                    name,
                    isFolder,
                })
            }}
        >
            <div className="mb-2 flex items-center gap-2 font-heading text-lg font-bold">
                <Plus size={18} aria-hidden />
                {t('files.create-title', 'New in {{path}}', { path: currentPath })}
            </div>

            <div className="mb-3 flex gap-2" role="radiogroup" aria-label={t('files.type', 'Type')}>
                <button type="button" className={toggleClass(!isFolder)} onClick={() => setIsFolder(false)}>
                    <FileCode2 size={14} aria-hidden /> {t('files.type-file', 'File')}
                </button>
                <button type="button" className={toggleClass(isFolder)} onClick={() => setIsFolder(true)}>
                    <Folder size={14} aria-hidden /> {t('files.type-folder', 'Folder')}
                </button>
            </div>

            <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                {t('files.select-folder', 'Select folder')}
            </div>
            <div className="mb-3 border-2 border-black bg-edit">
                <div className="flex items-center justify-between border-b border-black/20 px-2 py-1">
                    <code className="truncate text-xs">{currentPath}</code>
                    <button
                        type="button"
                        className="p-1 opacity-70 hover:opacity-100 disabled:opacity-40"
                        disabled={parentFolder(currentPath, appPath) === null}
                        onClick={() => {
                            const up = parentFolder(currentPath, appPath)
                            if (up) setCurrentPath(up)
                        }}
                        title={t('files.up-folder', 'Up folder')}
                        aria-label={t('files.up-folder', 'Up folder')}
                    >
                        <ArrowUp size={14} aria-hidden />
                    </button>
                </div>
                <div className="max-h-40 overflow-y-auto p-1">
                    {loading && (
                        <div className="flex items-center gap-2 px-2 py-1 text-sm opacity-70">
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                            {t('files.loading', 'Loading…')}
                        </div>
                    )}
                    {!loading && folders.length === 0 && (
                        <div className="px-2 py-1 text-sm opacity-60">{t('files.no-folders', 'No subfolders')}</div>
                    )}
                    {!loading &&
                        folders.map((f) => (
                            <button
                                key={f.path}
                                type="button"
                                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-black/10 dark:hover:bg-white/10"
                                onClick={() => setCurrentPath(f.path)}
                            >
                                <FolderClosed size={13} className="shrink-0 opacity-70" aria-hidden />
                                <span className="truncate">{f.name}</span>
                            </button>
                        ))}
                </div>
            </div>

            <input
                ref={inputRef}
                type="text"
                placeholder={isFolder ? 'lib' : 'main.py'}
                autoComplete="off"
                spellCheck={false}
                className="w-full border-2 border-black bg-edit px-3 py-2 text-fg outline-none focus:border-accent"
            />

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">{t('files.create', 'Create')}</CtaButton>
            </DialogActions>
        </form>
    )
}

function useCreateInAppDialog(): (appPath: string) => Promise<CreateInAppResult | null> {
    const openDialog = useOpenDialog()
    return useCallback(
        (appPath) => openDialog<CreateInAppResult>((close) => <CreateInAppDialog appPath={appPath} close={close} />),
        [openDialog],
    )
}

/* ------------------------------------------------------------------ */
/* App detail (inline view: files + tools)                             */
/* ------------------------------------------------------------------ */

function AppDetail({ app }: { app: AppInfo }) {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const createInAppDialog = useCreateInAppDialog()
    const setSelected = useAppsStore((s) => s.setSelected)
    const launching = useAppsStore((s) => s.launching !== null)
    const openTabs = useEditorTabsStore((s) => s.tabs)
    const editDetails = useAppEditorDialog()

    const [rootEntries, setRootEntries] = useState<DeviceEntry[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
    const [folderChildren, setFolderChildren] = useState<Record<string, DeviceEntry[]>>({})
    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set())

    const loadFolderChildren = useCallback(async (path: string) => {
        setLoadingFolders((prev) => {
            const next = new Set(prev)
            next.add(path)
            return next
        })
        try {
            const children = (await listDirectory(path)) as DeviceEntry[] | undefined
            setFolderChildren((prev) => ({ ...prev, [path]: children ?? [] }))
        } finally {
            setLoadingFolders((prev) => {
                const next = new Set(prev)
                next.delete(path)
                return next
            })
        }
    }, [])

    const reload = useCallback(async () => {
        setLoading(true)
        try {
            const entries = (await listDirectory(app.path)) as DeviceEntry[] | undefined
            setRootEntries(entries ?? [])
            setOpenFolders(new Set())
            setFolderChildren({})
            setLoadingFolders(new Set())
        } finally {
            setLoading(false)
        }
    }, [app.path])

    useEffect(() => {
        void reload()
    }, [reload])

    const addFile = async () => {
        const r = await createInAppDialog(app.path)
        if (!r) return
        await createItem(r.parentPath, r.name, r.isFolder)
        await reload()
    }

    const removeEntry = async (e: DeviceEntry) => {
        await removeItem({ confirm, prompt }, e.path, e.isDir)
        await reload()
    }

    const toggleFolder = (path: string) => {
        const isOpen = openFolders.has(path)
        setOpenFolders((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
        if (!isOpen && folderChildren[path] === undefined) {
            void loadFolderChildren(path)
        }
    }

    const renderLevel = (entries: DeviceEntry[], depth: number) =>
        entries.map((e) => {
            if (e.isDir) {
                const isOpen = openFolders.has(e.path)
                const children = folderChildren[e.path]
                const childLoading = loadingFolders.has(e.path)
                return (
                    <div key={e.path}>
                        <div
                            className="group flex items-center gap-1.5 px-2 py-0.5 text-sm hover:bg-black/10 dark:hover:bg-white/10"
                            style={{ paddingInlineStart: `${depth * 14}px` }}
                        >
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left opacity-85"
                                title={e.path}
                                aria-expanded={isOpen}
                                onClick={() => toggleFolder(e.path)}
                            >
                                {childLoading ? (
                                    <Loader2 size={12} className="shrink-0 animate-spin opacity-80" aria-hidden />
                                ) : (
                                    <ChevronRight
                                        size={12}
                                        className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                        aria-hidden
                                    />
                                )}
                                {isOpen ? (
                                    <FolderOpen size={13} className="shrink-0 opacity-70" aria-hidden />
                                ) : (
                                    <FolderClosed size={13} className="shrink-0 opacity-70" aria-hidden />
                                )}
                                <span className="truncate">{e.name}</span>
                            </button>
                            <button
                                type="button"
                                title={t('files.remove', 'Remove')}
                                aria-label={t('files.remove', 'Remove')}
                                className="invisible shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                                onClick={() => void removeEntry(e)}
                            >
                                <X size={13} aria-hidden />
                            </button>
                        </div>
                        {isOpen &&
                            (children ? (
                                renderLevel(children, depth + 1)
                            ) : childLoading ? (
                                <div
                                    className="flex items-center gap-1.5 px-2 py-0.5 text-sm opacity-70"
                                    style={{ paddingInlineStart: `${(depth + 1) * 14}px` }}
                                >
                                    <Loader2 size={12} className="animate-spin" aria-hidden />
                                    {t('files.loading', 'Loading…')}
                                </div>
                            ) : null)}
                    </div>
                )
            }

            const openInTab = openTabs.some((tab) => tab.fn === e.path)
            return (
                <div
                    key={e.path}
                    className="group flex items-center gap-1.5 px-2 py-0.5 text-sm hover:bg-black/10 dark:hover:bg-white/10"
                    style={{ paddingInlineStart: `${depth * 14}px` }}
                >
                    <button
                        type="button"
                        className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${openInTab ? 'font-semibold' : ''}`}
                        title={e.path}
                        onClick={() => void openAppFile(e.path)}
                    >
                        <FileCode2 size={13} className="shrink-0 opacity-70" aria-hidden />
                        <span className="truncate">{e.name}</span>
                    </button>
                    <button
                        type="button"
                        title={t('files.remove', 'Remove')}
                        aria-label={t('files.remove', 'Remove')}
                        className="invisible shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                        onClick={() => void removeEntry(e)}
                    >
                        <X size={13} aria-hidden />
                    </button>
                    <span className="shrink-0 text-xs opacity-50">{sizeFmt(e.size)}</span>
                </div>
            )
        })

    return (
        <>
            {/* Header: back + name + launch */}
            <div className="flex items-center gap-1 border-b border-black/20 px-1 py-1.5">
                <button
                    type="button"
                    className={headBtn}
                    title={t('apps.back', 'Back to apps')}
                    aria-label={t('apps.back', 'Back to apps')}
                    onClick={() => setSelected(null)}
                >
                    <ArrowLeft size={15} aria-hidden />
                </button>
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-sm font-bold">{app.name}</span>
                    <span className="block truncate font-mono text-[11px] leading-tight opacity-50">
                        {app.fullname}
                        {app.version ? ` · ${app.version}` : ''}
                    </span>
                </span>
                {!app.broken && (
                    <button
                        type="button"
                        disabled={launching}
                        title={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                        aria-label={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                        className="shrink-0 p-1 text-icon-success opacity-80 hover:opacity-100 disabled:opacity-40"
                        onClick={() => void launchApp(app.fullname)}
                    >
                        {launching ? (
                            <Loader2 size={16} className="animate-spin" aria-hidden />
                        ) : (
                            <Rocket size={16} aria-hidden />
                        )}
                    </button>
                )}
            </div>

            {/* Toolbar: edit details, add file, refresh */}
            <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {t('apps.files', 'Files')}
                </span>
                <span className="flex items-center">
                    <button
                        type="button"
                        className={headBtn}
                        title={t('apps.edit-details', 'Edit app details')}
                        aria-label={t('apps.edit-details', 'Edit app details')}
                        onClick={() => void editDetails(app)}
                    >
                        <Pencil size={14} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={headBtn}
                        title={t('files.create', 'Create')}
                        aria-label={t('files.create', 'Create')}
                        onClick={() => void addFile()}
                    >
                        <Plus size={14} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={headBtn}
                        title={t('files.refresh', 'Refresh')}
                        aria-label={t('files.refresh', 'Refresh')}
                        onClick={() => void reload()}
                    >
                        {loading ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw size={14} aria-hidden />
                        )}
                    </button>
                </span>
            </div>

            {/* Recursive file browser */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-1" role="tree" aria-label={t('apps.files', 'Files')}>
                {rootEntries ? renderLevel(rootEntries, 1) : null}
                {rootEntries !== null && rootEntries.length === 0 && !loading && (
                    <div className="px-3 py-1 text-sm opacity-60">{t('apps.no-files', 'No files')}</div>
                )}
                {rootEntries === null && (
                    <div className="flex items-center gap-2 px-3 py-1 text-sm opacity-70">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        {t('apps.loading-details', 'Reading app from device…')}
                    </div>
                )}
            </div>
        </>
    )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function AppsPanel() {
    const connected = useConnectionStore((s) => s.status === 'connected')
    const apps = useAppsStore((s) => s.apps)
    const selected = useAppsStore((s) => s.selected)

    // Initial scan once connected.
    useEffect(() => {
        if (connected && apps === null) void refreshApps()
    }, [connected, apps])

    if (!connected) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto">
                <ConnectDeviceButton />
            </div>
        )
    }

    const selectedApp = selected ? apps?.find((a) => a.fullname === selected) : undefined

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {selectedApp ? <AppDetail app={selectedApp} /> : <AppList />}
        </div>
    )
}
