import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    ChevronRight,
    File,
    FilePlus2,
    FolderClosed,
    FolderOpen,
    FolderUp,
    Loader2,
    Trash2,
    UploadCloud,
} from 'lucide-react'
import { useFileStore, isFolder, type FsNode } from '../../stores/files'
import { loadFolder } from '../../services/files.service'
import { uploadEntriesToDirectory } from '../../services/device.service'
import { useConnectionStore } from '../../stores/connection'
import {
    canonicalizeUploadEntries,
    collectDroppedUploadEntries,
    normalizeRelativePath,
    singleTopLevelFolder,
    stripTopLevelFolder,
    uploadEntriesFromFiles,
    uploadEntrySummary,
    type LocalUploadEntry,
} from '../../domain/upload'
import { sizeFmt } from '../../domain/utils'
import { useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

export interface UploadPlan {
    entries: LocalUploadEntry[]
    destination: string
}

/* ------------------------------------------------------------------ */
/* Folder tree picker (folders only, lazy children)                    */
/* ------------------------------------------------------------------ */

function FolderPickRow({
    node,
    depth,
    selected,
    onSelect,
}: {
    node: Extract<FsNode, { content: FsNode[] }>
    depth: number
    selected: string
    onSelect: (path: string) => void
}) {
    const [open, setOpen] = useState(false)
    const loading = useFileStore((s) => s.loadingFolders.has(node.path))
    const isSelected = selected === node.path

    const toggle = () => {
        setOpen(!open)
        if (!open && node.loaded !== true) void loadFolder(node.path)
    }

    return (
        <>
            <div
                className={`flex items-center gap-1 px-1 py-0.5 text-sm ${
                    isSelected ? 'bg-tab-active text-tab-active-fg' : 'hover:bg-black/10 dark:hover:bg-white/10'
                }`}
                style={{ paddingInlineStart: `${depth * 14}px` }}
            >
                <button type="button" onClick={toggle} aria-expanded={open} className="shrink-0 p-0.5">
                    {loading ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                        <ChevronRight
                            size={12}
                            aria-hidden
                            className={`transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                    )}
                </button>
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => onSelect(node.path)}
                    aria-pressed={isSelected}
                >
                    {open ? (
                        <FolderOpen size={14} className="shrink-0 opacity-80" aria-hidden />
                    ) : (
                        <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />
                    )}
                    <span className="truncate">{node.name}</span>
                </button>
            </div>
            {open &&
                node.content
                    .filter(isFolder)
                    .map((child) => (
                        <FolderPickRow
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selected={selected}
                            onSelect={onSelect}
                        />
                    ))}
        </>
    )
}

function FolderPicker({ selected, onSelect }: { selected: string; onSelect: (path: string) => void }) {
    const { t } = useTranslation()
    const tree = useFileStore((s) => s.tree)
    const folders = useMemo(() => (tree ?? []).filter(isFolder), [tree])

    return (
        <div
            className="max-h-40 overflow-y-auto border-2 border-black bg-edit"
            role="listbox"
            aria-label={t('files.upload-destination', 'Destination folder')}
        >
            <div
                className={`flex items-center gap-1.5 px-2 py-0.5 text-sm ${
                    selected === '/'
                        ? 'bg-tab-active text-tab-active-fg'
                        : 'hover:bg-black/10 dark:hover:bg-white/10'
                }`}
            >
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => onSelect('/')}
                    aria-pressed={selected === '/'}
                >
                    <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />/
                </button>
            </div>
            {folders.map((folder) => (
                <FolderPickRow
                    key={folder.path}
                    node={folder}
                    depth={1}
                    selected={selected}
                    onSelect={onSelect}
                />
            ))}
        </div>
    )
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function pathIsValid(path: string): boolean {
    try {
        normalizeRelativePath(path)
        return true
    } catch {
        return false
    }
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

function UploadDialog({
    initialDirectory,
    close,
}: {
    initialDirectory: string
    close: (plan: UploadPlan | null) => void
}) {
    const { t } = useTranslation()
    const [entries, setEntries] = useState<LocalUploadEntry[]>([])
    const [directory, setDirectory] = useState(initialDirectory)
    const [includeRoot, setIncludeRoot] = useState(true)
    const [dragOver, setDragOver] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    const addEntries = (next: LocalUploadEntry[]) => {
        try {
            setEntries(canonicalizeUploadEntries([...entries, ...next]))
            setError(null)
        } catch (err) {
            setError(errorMessage(err))
        }
    }

    const addFiles = (list: FileList | null, preserveRelativePaths: boolean) => {
        if (!list?.length) return
        try {
            addEntries(uploadEntriesFromFiles(list, preserveRelativePaths))
        } catch (err) {
            setError(errorMessage(err))
        }
    }

    const collectDrop = async (dataTransfer: DataTransfer) => {
        setScanning(true)
        setError(null)
        try {
            const dropped = await collectDroppedUploadEntries(dataTransfer)
            if (!dropped.length) throw new Error(t('files.upload-empty', 'No readable files found'))
            addEntries(dropped)
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setScanning(false)
        }
    }

    const rootFolder = useMemo(() => singleTopLevelFolder(entries), [entries])
    const effectiveEntries = useMemo(() => {
        try {
            return includeRoot || !rootFolder ? canonicalizeUploadEntries(entries) : stripTopLevelFolder(entries)
        } catch {
            return []
        }
    }, [entries, includeRoot, rootFolder])
    const summary = useMemo(() => uploadEntrySummary(effectiveEntries), [effectiveEntries])
    const flatFilesOnly = entries.length > 0 && entries.every(
        (entry) => entry.kind === 'file' && !entry.relativePath.includes('/'),
    )

    let validationError: string | null = error
    if (!validationError && entries.length) {
        try {
            canonicalizeUploadEntries(entries)
        } catch (err) {
            validationError = errorMessage(err)
        }
    }
    const canUpload = effectiveEntries.length > 0 && !validationError && !scanning
    const visibleEntries = effectiveEntries.slice(0, 120)

    return (
        <form
            method="dialog"
            onSubmit={(event) => {
                event.preventDefault()
                if (!canUpload) return
                close({ entries: effectiveEntries, destination: directory })
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <UploadCloud size={19} aria-hidden />
                {t('files.upload-title-recursive', 'Upload files or folders')}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                    addFiles(event.currentTarget.files, false)
                    event.currentTarget.value = ''
                }}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                hidden
                {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                onChange={(event) => {
                    addFiles(event.currentTarget.files, true)
                    event.currentTarget.value = ''
                }}
            />

            <div
                role="group"
                aria-label={t('files.upload-drop-recursive', 'Drop files or folders here')}
                onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(false)
                    void collectDrop(event.dataTransfer)
                }}
                className={`grid place-items-center gap-2 border-2 border-dashed px-4 py-5 text-center transition-colors ${
                    dragOver ? 'border-accent bg-accent/10' : 'border-black/50'
                }`}
            >
                {scanning ? (
                    <Loader2 size={24} className="animate-spin" aria-hidden />
                ) : (
                    <FolderUp size={24} aria-hidden />
                )}
                <div className="text-sm font-semibold" aria-live="polite">
                    {scanning
                        ? t('files.upload-scanning', 'Scanning folder…')
                        : t('files.upload-drop-recursive', 'Drop files or folders here')}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()}>
                        <span className="flex items-center gap-1.5">
                            <FilePlus2 size={15} aria-hidden />
                            {t('files.upload-add-files', 'Add files')}
                        </span>
                    </SecondaryButton>
                    <SecondaryButton type="button" onClick={() => folderInputRef.current?.click()}>
                        <span className="flex items-center gap-1.5">
                            <FolderUp size={15} aria-hidden />
                            {t('files.upload-add-folder', 'Add folder')}
                        </span>
                    </SecondaryButton>
                </div>
            </div>

            {validationError && (
                <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 border-2 border-red-600 bg-red-500/10 p-2 text-sm font-semibold text-red-700 dark:text-red-300"
                >
                    <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
                    <span>{validationError}</span>
                </div>
            )}

            <div className="mb-1 mt-3 text-sm font-semibold">
                {t('files.upload-destination', 'Destination folder')}
            </div>
            <FolderPicker selected={directory} onSelect={setDirectory} />

            {rootFolder && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 border-2 border-black bg-black/5 p-2 text-sm dark:bg-white/5">
                    <input
                        type="checkbox"
                        checked={includeRoot}
                        onChange={(event) => setIncludeRoot(event.currentTarget.checked)}
                        className="mt-0.5"
                    />
                    <span>
                        <strong>{t('files.upload-include-root', 'Include top-level folder')}</strong>
                        <span className="block text-xs opacity-70">
                            {includeRoot
                                ? t('files.upload-root-result', '{{path}} will be created', {
                                      path: `${directory === '/' ? '' : directory}/${rootFolder}`,
                                  })
                                : t('files.upload-contents-result', 'Contents will be uploaded directly into {{dir}}', {
                                      dir: directory,
                                  })}
                        </span>
                    </span>
                </label>
            )}

            {entries.length > 0 && (
                <section className="mt-3" aria-labelledby="upload-preview-title">
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <div id="upload-preview-title" className="text-sm font-semibold">
                            {t('files.upload-preview', 'Upload preview')}
                        </div>
                        <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100"
                            onClick={() => {
                                setEntries([])
                                setError(null)
                            }}
                        >
                            <Trash2 size={13} aria-hidden />
                            {t('files.upload-clear', 'Clear selection')}
                        </button>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 border-2 border-black bg-black/5 px-2 py-1.5 text-xs dark:bg-white/5">
                        <span><strong>{summary.files}</strong> {t('files.files', 'files')}</span>
                        <span><strong>{summary.directories}</strong> {t('files.folders', 'folders')}</span>
                        <span><strong>{sizeFmt(summary.bytes)}</strong></span>
                    </div>

                    {flatFilesOnly ? (
                        <div className="max-h-56 space-y-1 overflow-y-auto">
                            {entries.map((entry, index) => {
                                if (entry.kind !== 'file') return null
                                return (
                                    <div key={`${entry.file.name}-${index}`} className="flex items-center gap-2 text-sm">
                                        <File size={14} className="shrink-0 opacity-70" aria-hidden />
                                        <input
                                            type="text"
                                            value={entry.relativePath}
                                            onChange={(event) =>
                                                setEntries((previous) =>
                                                    previous.map((item, itemIndex) =>
                                                        itemIndex === index
                                                            ? { ...entry, relativePath: event.target.value }
                                                            : item,
                                                    ),
                                                )
                                            }
                                            spellCheck={false}
                                            autoComplete="off"
                                            aria-label={t('files.upload-target-for', 'Target filename for {{name}}', {
                                                name: entry.file.name,
                                            })}
                                            className={`min-w-0 flex-1 border-2 bg-edit px-2 py-1 font-mono text-xs outline-none focus:border-accent ${
                                                pathIsValid(entry.relativePath) ? 'border-black' : 'border-red-600'
                                            }`}
                                        />
                                        <span className="w-16 shrink-0 text-end text-xs opacity-50">
                                            {sizeFmt(entry.file.size)}
                                        </span>
                                        <button
                                            type="button"
                                            title={t('files.remove', 'Remove')}
                                            aria-label={t('files.remove', 'Remove')}
                                            className="shrink-0 opacity-60 hover:opacity-100"
                                            onClick={() =>
                                                setEntries((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
                                            }
                                        >
                                            <Trash2 size={14} aria-hidden />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="max-h-60 overflow-y-auto border-2 border-black bg-edit p-1">
                            {visibleEntries.map((entry) => {
                                const depth = entry.relativePath.split('/').length - 1
                                return (
                                    <div
                                        key={`${entry.kind}:${entry.relativePath}`}
                                        className="flex items-center gap-1.5 py-0.5 text-xs"
                                        style={{ paddingInlineStart: `${depth * 12 + 4}px` }}
                                    >
                                        {entry.kind === 'directory' ? (
                                            <FolderClosed size={13} className="shrink-0 opacity-75" aria-hidden />
                                        ) : (
                                            <File size={13} className="shrink-0 opacity-75" aria-hidden />
                                        )}
                                        <span className="min-w-0 flex-1 truncate font-mono" title={entry.relativePath}>
                                            {entry.relativePath.split('/').at(-1)}
                                        </span>
                                        {entry.kind === 'file' && (
                                            <span className="shrink-0 opacity-50">{sizeFmt(entry.file.size)}</span>
                                        )}
                                    </div>
                                )
                            })}
                            {effectiveEntries.length > visibleEntries.length && (
                                <div className="px-1 py-1 text-xs font-semibold opacity-60">
                                    {t('files.upload-more-items', '…and {{count}} more items', {
                                        count: effectiveEntries.length - visibleEntries.length,
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {t(
                            'files.upload-overwrite-warning',
                            'Matching files will be overwritten. Other remote files will be kept.',
                        )}
                    </p>
                </section>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={!canUpload}>
                    {scanning ? (
                        <span className="flex items-center gap-1.5">
                            <Loader2 size={15} className="animate-spin" aria-hidden />
                            {t('files.upload-scanning', 'Scanning folder…')}
                        </span>
                    ) : (
                        `${t('files.upload', 'Upload')} (${summary.files})`
                    )}
                </CtaButton>
            </DialogActions>
        </form>
    )
}

/* ------------------------------------------------------------------ */
/* Flow hook                                                           */
/* ------------------------------------------------------------------ */

export function useUploadFlow(): (initialDirectory?: string) => Promise<boolean> {
    const openDialog = useOpenDialog()

    return async (initialDirectory = '/') => {
        if (!useConnectionStore.getState().port) return false
        const plan = await openDialog<UploadPlan>(
            (close) => <UploadDialog initialDirectory={initialDirectory} close={close} />,
            { wide: true },
        )
        if (!plan) return false
        return uploadEntriesToDirectory(plan.entries, plan.destination)
    }
}
