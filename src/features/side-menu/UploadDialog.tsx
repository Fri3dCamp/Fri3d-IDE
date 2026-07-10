import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, FilePlus2, FolderClosed, FolderOpen, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { useFileStore, isFolder, type FsNode } from '../../stores/files'
import { loadFolder } from '../../services/files.service'
import { uploadFilesToPaths } from '../../services/device.service'
import { useConnectionStore } from '../../stores/connection'
import {
    useOpenDialog,
    DialogActions,
    CtaButton,
    SecondaryButton,
} from '../../components/dialogs'

/*
 * Interactive upload flow:
 *   1. Toolbar button opens the dialog immediately.
 *   2. Dialog contains a drop zone (click to browse, or drag files in),
 *      a destination folder picker (live device tree, lazy-loaded), and a
 *      per-file target-path input (full device path, freely editable).
 *   3. Upload with per-file progress.
 */

interface UploadEntry {
    file: File
    /** Target filename within the selected destination folder. */
    name: string
}

export interface UploadPlan {
    files: File[]
    paths: string[]
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
                node.content.filter(isFolder).map((child) => (
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

function FolderPicker({ selected, onSelect }: { selected: string; onSelect: (p: string) => void }) {
    const { t } = useTranslation()
    const tree = useFileStore((s) => s.tree)
    const folders = useMemo(() => (tree ?? []).filter(isFolder), [tree])

    return (
        <div className="max-h-40 overflow-y-auto border-2 border-black bg-edit" role="listbox" aria-label={t('files.upload-destination', 'Destination folder')}>
            <div
                className={`flex items-center gap-1.5 px-2 py-0.5 text-sm ${
                    selected === '/' ? 'bg-tab-active text-tab-active-fg' : 'hover:bg-black/10 dark:hover:bg-white/10'
                }`}
            >
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onSelect('/')} aria-pressed={selected === '/'}>
                    <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />/
                </button>
            </div>
            {folders.map((f) => (
                <FolderPickRow key={f.path} node={f} depth={1} selected={selected} onSelect={onSelect} />
            ))}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Path helpers                                                        */
/* ------------------------------------------------------------------ */

/** Normalise a filename: no slashes, trimmed. */
function sanitizeName(name: string): string {
    return name.trim().replace(/[\\/]+/g, '')
}

function isValidName(name: string): boolean {
    return sanitizeName(name).length > 0
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

function UploadDialog({ close }: { close: (plan: UploadPlan | null) => void }) {
    const { t } = useTranslation()
    const [entries, setEntries] = useState<UploadEntry[]>([])
    const [dir, setDir] = useState('/')
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const base = (d: string) => (d === '/' ? '/' : d + '/')

    const addFiles = (list: FileList | File[] | null) => {
        if (!list) return
        const files = Array.from(list)
        if (!files.length) return
        setEntries((prev) => [...prev, ...files.map((file) => ({ file, name: file.name }))])
    }

    const allValid = entries.length > 0 && entries.every((e) => isValidName(e.name))

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                if (!allValid) return
                close({
                    files: entries.map((e) => e.file),
                    paths: entries.map((e) => base(dir) + sanitizeName(e.name)),
                })
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <UploadCloud size={18} aria-hidden />
                {t('files.upload-title-simple', 'Upload files')}
            </div>

            {/* Drop zone / click-to-browse */}
            <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = '' // allow re-picking the same file
                }}
            />
            <div
                role="button"
                tabIndex={0}
                aria-label={t('files.upload-drop', 'Drop files here or click to browse')}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        inputRef.current?.click()
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    addFiles(e.dataTransfer.files)
                }}
                className={`grid cursor-pointer place-items-center gap-1 border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
                    dragOver
                        ? 'border-accent bg-accent/10 text-fg'
                        : 'border-black/50 opacity-80 hover:border-accent hover:opacity-100'
                }`}
            >
                <FilePlus2 size={22} aria-hidden />
                {t('files.upload-drop', 'Drop files here or click to browse')}
            </div>

            {/* Destination folder picker */}
            <div className="mb-1 mt-3 text-sm font-semibold">
                {t('files.upload-destination', 'Destination folder')}
            </div>
            <FolderPicker selected={dir} onSelect={setDir} />

            {/* Per-file rows: destination path (left, static) + filename input (right) */}
            {entries.length > 0 && (
                <>
                    <div className="mb-1 mt-3 text-sm font-semibold">
                        {t('files.upload-targets', 'Target files')}
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                        {entries.map((entry, i) => (
                            <div key={`${entry.file.name}-${i}`} className="flex items-center gap-2 text-sm">
                                <span
                                    className="max-w-[45%] shrink-0 truncate font-mono text-xs opacity-60"
                                    title={base(dir)}
                                >
                                    {base(dir)}
                                </span>
                                <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(e) =>
                                        setEntries((prev) =>
                                            prev.map((en, j) => (j === i ? { ...en, name: e.target.value } : en)),
                                        )
                                    }
                                    spellCheck={false}
                                    autoComplete="off"
                                    aria-label={t('files.upload-target-for', 'Target filename for {{name}}', {
                                        name: entry.file.name,
                                    })}
                                    className={`min-w-0 flex-1 border-2 bg-edit px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent ${
                                        isValidName(entry.name) ? 'border-black' : 'border-icon-error'
                                    }`}
                                />
                                <span className="w-16 shrink-0 text-end text-xs opacity-50">
                                    {(entry.file.size / 1024).toFixed(1)} KiB
                                </span>
                                <button
                                    type="button"
                                    title={t('files.remove', 'Remove')}
                                    aria-label={t('files.remove', 'Remove')}
                                    className="shrink-0 opacity-60 hover:opacity-100"
                                    onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
                                >
                                    <Trash2 size={14} aria-hidden />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={!allValid}>
                    {t('files.upload', 'Upload')}
                    {entries.length > 0 ? ` (${entries.length})` : ''}
                </CtaButton>
            </DialogActions>
        </form>
    )
}

/* ------------------------------------------------------------------ */
/* Flow hook                                                           */
/* ------------------------------------------------------------------ */

export function useUploadFlow(): () => Promise<void> {
    const openDialog = useOpenDialog()

    return async () => {
        if (!useConnectionStore.getState().port) return
        const plan = await openDialog<UploadPlan>((close) => <UploadDialog close={close} />, {
            wide: true,
        })
        if (!plan) return
        await uploadFilesToPaths(plan.files, plan.paths)
    }
}
