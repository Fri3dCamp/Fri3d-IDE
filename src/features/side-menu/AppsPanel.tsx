import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ChevronRight,
    CloudUpload,
    Download,
    FileCode2,
    FolderClosed,
    FolderOpen,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Rocket,
    Trash2,
    Upload,
    X,
} from 'lucide-react'
import { useAppsStore, type AppInfo } from '../../stores/apps'
import { isConnectionActive, isConnectionReady, useConnectionStore } from '../../stores/connection'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { sizeFmt } from '../../domain/utils'
import { refreshApps, launchApp, openAppFile, listDirectory, deleteApp, exportMpk } from '../../services/apps.service'
import { createItem, removeItem, renameItem } from '../../services/files.service'
import { uploadFilesToPaths } from '../../services/device.service'
import { useConfirm, usePrompt } from '../../components/dialogs'
import { useFolderDropTarget, dropTargetPaths, dropHighlightClass } from './DropUpload'
import { useAppEditorDialog } from './AppEditorDialog'
import { useBadgeHubPublishDialog } from './BadgeHubPublishDialog'
import { ConnectDeviceButton } from './FileTree'

import { AppList } from './AppList'
import { appPanelHeadButton as headBtn, appPanelIconHint as iconHintClass } from './appPanelStyles'
import { parentFolder, useCreateInAppDialog } from './CreateInAppDialog'

type DeviceEntry =
    | { name: string; path: string; size: number; isDir: false }
    | { name: string; path: string; isDir: true }


/* ------------------------------------------------------------------ */
/* Drop-target wrapper for app folder rows                             */
/* ------------------------------------------------------------------ */

function AppDropRow({
    dir,
    onUpload,
    className,
    style,
    children,
}: {
    dir: string
    onUpload: (files: File[], dir: string) => Promise<void>
    className: string
    style?: React.CSSProperties
    children: React.ReactNode
}) {
    const [over, dropProps] = useFolderDropTarget(dir, onUpload)
    return (
        <div className={`${className} ${over ? dropHighlightClass : ''}`} style={style} {...dropProps}>
            {children}
        </div>
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
    const publishDialog = useBadgeHubPublishDialog()

    const uploadInputRef = useRef<HTMLInputElement>(null)
    const [rootEntries, setRootEntries] = useState<DeviceEntry[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
    const [folderChildren, setFolderChildren] = useState<Record<string, DeviceEntry[]>>({})
    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set())
    const [selectedFolderPath, setSelectedFolderPath] = useState(app.path)

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
            setSelectedFolderPath(app.path)
        } finally {
            setLoading(false)
        }
    }, [app.path])

    useEffect(() => {
        void reload()
    }, [reload])

    const addFile = async () => {
        const r = await createInAppDialog(selectedFolderPath)
        if (!r) return
        await createItem(r.parentPath, r.name, r.isFolder)
        await reload()
    }

    const removeEntry = async (e: DeviceEntry) => {
        await removeItem({ confirm, prompt }, e.path, e.isDir)
        await reload()
    }

    const renameEntry = async (e: DeviceEntry) => {
        await renameItem({ prompt }, e.path, e.isDir)
        await reload()
    }

    const uploadToSelectedFolder = async (list: FileList | null) => {
        if (!list || list.length === 0) return
        const files = Array.from(list)
        await uploadFilesToPaths(files, dropTargetPaths(files, selectedFolderPath))
        await reload()
    }

    const uploadDropped = useCallback(
        async (files: File[], dir: string) => {
            if (!isConnectionReady(useConnectionStore.getState().status)) return
            await uploadFilesToPaths(files, dropTargetPaths(files, dir))
            await reload()
        },
        [reload],
    )

    const removeApp = async () => {
        setDeleting(true)
        try {
            await deleteApp(app, prompt)
        } finally {
            setDeleting(false)
        }
    }

    const toggleFolder = (path: string) => {
        setSelectedFolderPath(path)
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
                        <AppDropRow
                            dir={e.path}
                            onUpload={uploadDropped}
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
                                aria-label={t('files.rename', 'Rename')}
                                className="group/icon invisible relative shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                                onClick={() => void renameEntry(e)}
                            >
                                <Pencil size={13} aria-hidden />
                                <span aria-hidden className={iconHintClass}>{t('files.rename', 'Rename')}</span>
                            </button>
                            <button
                                type="button"
                                aria-label={t('files.remove', 'Remove')}
                                className="group/icon invisible relative shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                                onClick={() => void removeEntry(e)}
                            >
                                <X size={13} aria-hidden />
                                <span aria-hidden className={iconHintClass}>{t('files.remove', 'Remove')}</span>
                            </button>
                        </AppDropRow>
                        {isOpen &&
                            (children ? (
                                children.length > 0 ? (
                                    renderLevel(children, depth + 1)
                                ) : (
                                    <div
                                        className="px-2 py-0.5 text-xs opacity-60"
                                        style={{ paddingInlineStart: `${(depth + 1) * 14}px` }}
                                    >
                                        {t('files.folder-empty', 'Folder is empty')}
                                    </div>
                                )
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
                        onClick={() => {
                            setSelectedFolderPath(parentFolder(e.path, app.path) ?? app.path)
                            void openAppFile(e.path)
                        }}
                    >
                        <FileCode2 size={13} className="shrink-0 opacity-70" aria-hidden />
                        <span className="truncate">{e.name}</span>
                    </button>
                    <button
                        type="button"
                        aria-label={t('files.rename', 'Rename')}
                        className="group/icon invisible relative shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                        onClick={() => void renameEntry(e)}
                    >
                        <Pencil size={13} aria-hidden />
                        <span aria-hidden className={iconHintClass}>{t('files.rename', 'Rename')}</span>
                    </button>
                    <button
                        type="button"
                        aria-label={t('files.remove', 'Remove')}
                        className="group/icon invisible relative shrink-0 p-0.5 opacity-70 hover:opacity-100 group-hover:visible"
                        onClick={() => void removeEntry(e)}
                    >
                        <X size={13} aria-hidden />
                        <span aria-hidden className={iconHintClass}>{t('files.remove', 'Remove')}</span>
                    </button>
                    <span className="shrink-0 text-xs opacity-50">{sizeFmt(e.size)}</span>
                </div>
            )
        })

    const relativeTarget = selectedFolderPath.startsWith(app.path)
        ? selectedFolderPath.slice(app.path.length)
        : ''
    const targetSegments = relativeTarget.split('/').filter(Boolean)

    return (
        <>
            {/* Header: back + name + launch */}
            <div className="flex items-center gap-1 border-b border-black/20 px-1 py-1.5">
                <button
                    type="button"
                    className={`${headBtn} group/icon relative`}
                    aria-label={t('apps.back', 'Back to apps')}
                    onClick={() => setSelected(null)}
                >
                    <ArrowLeft size={15} aria-hidden />
                    <span aria-hidden className={iconHintClass}>{t('apps.back', 'Back to apps')}</span>
                </button>
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-sm font-bold">{app.name}</span>
                    <span className="block truncate font-mono text-[11px] leading-tight opacity-50">
                        {app.fullname}
                        {app.version ? ` · ${app.version}` : ''}
                    </span>
                </span>
                <button
                    type="button"
                    disabled={deleting || launching}
                    aria-label={t('badgehub.publish-title', 'Publish to BadgeHub')}
                    className="group/icon relative shrink-0 p-1 opacity-80 hover:opacity-100 disabled:opacity-40"
                    onClick={() => void publishDialog(app)}
                >
                    <CloudUpload size={16} aria-hidden />
                    <span aria-hidden className={iconHintClass}>{t('badgehub.publish-title', 'Publish to BadgeHub')}</span>
                </button>
                <button
                    type="button"
                    disabled={deleting || launching}
                    aria-label={t('apps.export-mpk', 'Export as MPK')}
                    className="group/icon relative shrink-0 p-1 opacity-80 hover:opacity-100 disabled:opacity-40"
                    onClick={() => void exportMpk(app)}
                >
                    <Download size={16} aria-hidden />
                    <span aria-hidden className={iconHintClass}>{t('apps.export-mpk', 'Export as MPK')}</span>
                </button>
                <button
                    type="button"
                    disabled={deleting || launching}
                    aria-label={t('apps.delete-app', 'Delete app')}
                    className="group/icon relative shrink-0 p-1 text-icon-error opacity-80 hover:opacity-100 disabled:opacity-40"
                    onClick={() => void removeApp()}
                >
                    {deleting ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                        <Trash2 size={16} aria-hidden />
                    )}
                    <span aria-hidden className={iconHintClass}>{t('apps.delete-app', 'Delete app')}</span>
                </button>
                {!app.broken && (
                    <button
                        type="button"
                        data-tour-id="tour-launch-app"
                        disabled={launching || deleting}
                        aria-label={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                        className="group/icon relative shrink-0 p-1 text-icon-success opacity-80 hover:opacity-100 disabled:opacity-40"
                        onClick={() => void launchApp(app.fullname)}
                    >
                        {launching ? (
                            <Loader2 size={16} className="animate-spin" aria-hidden />
                        ) : (
                            <Rocket size={16} aria-hidden />
                        )}
                        <span aria-hidden className={iconHintClass}>{t('apps.launch', 'Launch {{app}}', { app: app.name })}</span>
                    </button>
                )}
            </div>

            {/* Toolbar: edit details, add file/folder, upload, refresh */}
            <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {t('apps.files', 'Files')}
                </span>
                <span className="flex items-center">
                    <button
                        type="button"
                        className={`${headBtn} group/icon relative`}
                        aria-label={t('apps.edit-details', 'Edit app details')}
                        onClick={() => void editDetails(app)}
                    >
                        <Pencil size={14} aria-hidden />
                        <span aria-hidden className={iconHintClass}>{t('apps.edit-details', 'Edit app details')}</span>
                    </button>
                    <button
                        type="button"
                        className={`${headBtn} group/icon relative`}
                        aria-label={t('files.create', 'Create')}
                        onClick={() => void addFile()}
                    >
                        <Plus size={14} aria-hidden />
                        <span aria-hidden className={iconHintClass}>{t('files.create', 'Create')}</span>
                    </button>
                    <button
                        type="button"
                        className={`${headBtn} group/icon relative`}
                        aria-label={t('files.upload', 'Upload')}
                        onClick={() => uploadInputRef.current?.click()}
                    >
                        <Upload size={14} aria-hidden />
                        <span aria-hidden className={iconHintClass}>{t('files.upload', 'Upload')}</span>
                    </button>
                    <button
                        type="button"
                        className={`${headBtn} group/icon relative`}
                        aria-label={t('files.refresh', 'Refresh')}
                        onClick={() => void reload()}
                    >
                        {loading ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw size={14} aria-hidden />
                        )}
                        <span aria-hidden className={iconHintClass}>{t('files.refresh', 'Refresh')}</span>
                    </button>
                    <input
                        ref={uploadInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            void uploadToSelectedFolder(e.currentTarget.files)
                            e.currentTarget.value = ''
                        }}
                    />
                </span>
            </div>

            <div className="border-y border-black/20 px-2 py-1 text-xs">
                <span className="opacity-65">{t('files.target-folder', 'Create target')}:</span>{' '}
                <button
                    type="button"
                    className="underline underline-offset-2 hover:text-fg-highlight"
                    onClick={() => setSelectedFolderPath(app.path)}
                >
                    /
                </button>
                {targetSegments.map((seg, idx) => {
                    const path = `${app.path}/${targetSegments.slice(0, idx + 1).join('/')}`
                    return (
                        <span key={path}>
                            {' / '}
                            <button
                                type="button"
                                className="underline underline-offset-2 hover:text-fg-highlight"
                                onClick={() => setSelectedFolderPath(path)}
                            >
                                {seg}
                            </button>
                        </span>
                    )
                })}
            </div>

            {/* Recursive file browser */}
            <AppDropRow
                dir={app.path}
                onUpload={uploadDropped}
                className="min-h-0 flex-1 overflow-y-auto pb-1"
            >
                <div data-tour-id="tour-app-detail" role="tree" aria-label={t('apps.files', 'Files')}>
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
            </AppDropRow>
        </>
    )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function AppsPanel() {
    const { t } = useTranslation()
    const connected = useConnectionStore((s) => isConnectionActive(s.status))
    const ready = useConnectionStore((s) => isConnectionReady(s.status))
    const apps = useAppsStore((s) => s.apps)
    const selected = useAppsStore((s) => s.selected)

    // Initial scan once connected.
    useEffect(() => {
        if (ready && apps === null) void refreshApps()
    }, [ready, apps])

    if (!connected) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-2 py-1.5">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="font-heading text-sm font-bold uppercase tracking-wide">
                            {t('apps.title', 'Apps')}
                        </span>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <ConnectDeviceButton />
                </div>
            </div>
        )
    }

    const selectedApp = selected ? apps?.find((a) => a.fullname === selected) : undefined

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <fieldset disabled={!ready} className="contents">
                {selectedApp ? <AppDetail app={selectedApp} /> : <AppList />}
            </fieldset>
        </div>
    )
}
