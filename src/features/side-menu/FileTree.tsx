import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Award,
    Bluetooth,
    Box,
    Cable,
    ChevronRight,
    Cog,
    File,
    FileWarning,
    FolderClosed,
    FolderOpen,
    Link,
    Loader2,
    MonitorSmartphone,
    Pencil,
    Plus,
    X,
} from 'lucide-react'
import { useFileStore, isFolder, type FsNode } from '../../stores/files'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { useSettingsStore } from '../../stores/settings'
import { sizeFmt } from '../../domain/utils'
import { openFile, createItem, removeItem, renameItem, loadFolder, refreshFileTree } from '../../services/files.service'
import { uploadFilesToPaths } from '../../services/device.service'
import { useFolderDropTarget, dropTargetPaths, dropHighlightClass } from './DropUpload'
import { connectDevice } from '../../services/device.service'
import {
    isConnectionActive,
    isConnectionPending,
    isConnectionReady,
    useConnectionStore,
    type TransportType,
} from '../../stores/connection'
import { useConfirm, usePrompt, useCreateItemDialog } from '../../components/dialogs'

const CERT_EXT = ['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12']

function FileIcon({ name, path }: { name: string; path: string }) {
    const upper = name.toUpperCase()
    const cls = 'shrink-0 opacity-80'
    if (path.startsWith('/proc/') || path.startsWith('/dev/')) return <Cog size={14} className={cls} aria-hidden />
    if (upper.endsWith('.MPY')) return <Box size={14} className={cls} aria-hidden />
    if (CERT_EXT.some((e) => upper.endsWith(e))) return <Award size={14} className={cls} aria-hidden />
    if (upper === '???') return <FileWarning size={14} className={`${cls} text-icon-warning`} aria-hidden />
    return <File size={14} className={cls} aria-hidden />
}

function sortNodes(nodes: FsNode[], natural: boolean): FsNode[] {
    const sorted = [...nodes]
    if (natural) {
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
        sorted.sort((a, b) => collator.compare(a.name, b.name))
    }
    // Stable: folders first.
    sorted.sort((a, b) => (isFolder(a) ? 0 : 1) - (isFolder(b) ? 0 : 1))
    return sorted
}

const rowClass =
    'group flex w-full items-center gap-1.5 px-1 py-0.5 text-left text-sm hover:bg-black/10 dark:hover:bg-white/10'
const actionClass =
    'invisible shrink-0 rounded-none p-0.5 opacity-70 hover:opacity-100 group-hover:visible'

/** Upload dropped files into `dir` on the device, then refresh that folder. */
async function uploadDroppedFiles(files: File[], dir: string): Promise<void> {
    if (!isConnectionReady(useConnectionStore.getState().status)) return
    await uploadFilesToPaths(files, dropTargetPaths(files, dir))
    if (dir === '/') await refreshFileTree()
    else await loadFolder(dir)
}

function FolderRow({ node, depth }: { node: Extract<FsNode, { content: FsNode[] }>; depth: number }) {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const createDialog = useCreateItemDialog()
    const open = useFileStore((s) => s.openFolders.has(node.path))
    const toggle = useFileStore((s) => s.toggleFolder)
    const childrenLoading = useFileStore((s) => s.loadingFolders.has(node.path))
    const [dropOver, dropProps] = useFolderDropTarget(node.path, uploadDroppedFiles)

    const onToggle = () => {
        toggle(node.path)
        // Lazy-load children on first expand.
        if (!open && node.loaded !== true) void loadFolder(node.path)
    }

    return (
        <>
            <div
                className={`${rowClass} ${dropOver ? dropHighlightClass : ''}`}
                style={{ paddingInlineStart: `${depth * 14}px` }}
                {...dropProps}
            >
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onClick={onToggle}
                    aria-expanded={open}
                >
                    {childrenLoading ? (
                        <Loader2 size={12} aria-hidden className="shrink-0 animate-spin" />
                    ) : (
                        <ChevronRight
                            size={12}
                            aria-hidden
                            className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                    )}
                    {open ? (
                        <FolderOpen size={14} className="shrink-0 opacity-80" aria-hidden />
                    ) : (
                        <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />
                    )}
                    <span className="truncate">{node.name}</span>
                </button>
                <button
                    type="button"
                    title={t('files.rename', 'Rename')}
                    aria-label={t('files.rename', 'Rename')}
                    className={actionClass}
                    onClick={() => void renameItem({ prompt }, node.path, true)}
                >
                    <Pencil size={13} aria-hidden />
                </button>
                <button
                    type="button"
                    title={t('files.remove', 'Remove')}
                    aria-label={t('files.remove', 'Remove')}
                    className={actionClass}
                    onClick={() => void removeItem({ confirm, prompt }, node.path, true)}
                >
                    <X size={13} aria-hidden />
                </button>
                <button
                    type="button"
                    title={t('files.create', 'Create')}
                    aria-label={t('files.create', 'Create')}
                    className={actionClass}
                    onClick={() =>
                        void createDialog(node.path + '/').then((r) => {
                            if (r) void createItem(node.path + '/', r.name, r.isFolder)
                        })
                    }
                >
                    <Plus size={13} aria-hidden />
                </button>
            </div>
            {open && <TreeLevel nodes={node.content} depth={depth + 1} />}
        </>
    )
}

function FileRow({ node, depth }: { node: Extract<FsNode, { size: number }>; depth: number }) {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const selected = useFileStore((s) => s.selectedPath === node.path)
    const changed = useFileStore((s) => s.changedPaths.has(node.path))
    const openInTab = useEditorTabsStore((s) => s.tabs.some((tab) => tab.fn === node.path))
    const virtual = node.path.startsWith('/proc/') || node.path.startsWith('/dev/')

    if (virtual) {
        return (
            <div className={rowClass} style={{ paddingInlineStart: `${depth * 14 + 12}px` }}>
                <FileIcon name={node.name} path={node.path} />
                <span className="truncate opacity-70">{node.name}</span>
            </div>
        )
    }

    return (
        <div className={rowClass} style={{ paddingInlineStart: `${depth * 14 + 12}px` }}>
            <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 ${
                    selected ? 'text-fg-highlight' : ''
                } ${openInTab ? 'font-semibold' : ''}`}
                onClick={() => void openFile(node.path)}
            >
                <FileIcon name={node.name} path={node.path} />
                <span className="truncate">
                    {node.name}
                    {changed && <span aria-label={t('files.modified', 'modified')}> •</span>}
                </span>
            </button>
            <button
                type="button"
                title={t('files.rename', 'Rename')}
                aria-label={t('files.rename', 'Rename')}
                className={actionClass}
                onClick={() => void renameItem({ prompt }, node.path, false)}
            >
                <Pencil size={13} aria-hidden />
            </button>
            <button
                type="button"
                title={t('files.remove', 'Remove')}
                aria-label={t('files.remove', 'Remove')}
                className={actionClass}
                onClick={() => void removeItem({ confirm, prompt }, node.path, false)}
            >
                <X size={13} aria-hidden />
            </button>
            <span className="shrink-0 text-xs opacity-50">{sizeFmt(node.size)}</span>
        </div>
    )
}

function TreeLevel({ nodes, depth }: { nodes: FsNode[]; depth: number }) {
    const natural = useSettingsStore((s) => s.naturalSort)
    const sorted = useMemo(() => sortNodes(nodes, natural), [nodes, natural])
    return (
        <>
            {sorted.map((n) =>
                isFolder(n) ? (
                    <FolderRow key={n.path} node={n} depth={depth} />
                ) : (
                    <FileRow key={n.path} node={n} depth={depth} />
                ),
            )}
        </>
    )
}

/** Connect CTA block. Advanced mode adds BLE + WebREPL below the USB button. */
export function ConnectDeviceButton() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const status = useConnectionStore((s) => s.status)
    const advancedMode = useSettingsStore((s) => s.advancedMode)
    const connecting = isConnectionPending(status)

    const connect = (type: TransportType) => void connectDevice(type, { confirm, prompt })

    const secondaryClass =
        'flex w-full items-center justify-center gap-2 border-2 border-black bg-transparent px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-black/10 disabled:opacity-60 dark:hover:bg-white/10'

    return (
        <div className="space-y-2 px-2 py-2" data-tour-id="tour-connect">
            <button
                type="button"
                disabled={connecting}
                onClick={() => connect('usb')}
                className="flex w-full items-center justify-center gap-2 border-2 border-black bg-(--fri3d-purple) px-3 py-2 font-semibold text-white shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-60"
            >
                {connecting ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                    <Cable size={16} aria-hidden />
                )}
                {connecting
                    ? t('app.connecting', 'Connecting…')
                    : t('app.connect-device', 'Connect device')}
            </button>
            <button type="button" disabled={connecting} onClick={() => connect('vm')} className={secondaryClass}>
                <MonitorSmartphone size={15} aria-hidden />
                {t('tool.conn.vm', 'Connect to virtual badge')}
            </button>
            {advancedMode && (
                <>
                    <button type="button" disabled={connecting} onClick={() => connect('ble')} className={secondaryClass}>
                        <Bluetooth size={15} aria-hidden />
                        {t('tool.conn.ble', 'Connect Bluetooth')}
                    </button>
                    <button type="button" disabled={connecting} onClick={() => connect('ws')} className={secondaryClass}>
                        <Link size={15} aria-hidden />
                        {t('tool.conn.ws', 'Connect WebREPL')}
                    </button>
                </>
            )}
        </div>
    )
}

export function FileTree() {
    const { t } = useTranslation()
    const createDialog = useCreateItemDialog()
    const tree = useFileStore((s) => s.tree)
    const loading = useFileStore((s) => s.loading)
    const connected = useConnectionStore((s) => isConnectionActive(s.status))
    const ready = useConnectionStore((s) => isConnectionReady(s.status))
    const [rootDropOver, rootDropProps] = useFolderDropTarget('/', uploadDroppedFiles)

    if (!connected) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto">
                <ConnectDeviceButton />
            </div>
        )
    }

    return (
        <div
            className="min-h-0 flex-1 overflow-y-auto"
            role="tree"
            aria-label={t('menu.file-mgr', 'File Manager')}
            {...rootDropProps}
        >
            <fieldset disabled={!ready} className="contents">
                {loading && (
                    <div className="flex items-center gap-2 px-2 py-1 text-sm opacity-80">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        {loading}
                    </div>
                )}
                <div className={`${rowClass} ${rootDropOver ? dropHighlightClass : ''}`}>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />
                        <span>/</span>
                    </span>
                    <button
                        type="button"
                        title={t('files.create', 'Create')}
                        aria-label={t('files.create', 'Create')}
                        className={actionClass}
                        onClick={() =>
                            void createDialog('/').then((r) => {
                                if (r) void createItem('/', r.name, r.isFolder)
                            })
                        }
                    >
                        <Plus size={13} aria-hidden />
                    </button>
                </div>
                {tree ? <TreeLevel nodes={tree} depth={1} /> : null}
            </fieldset>
        </div>
    )
}
