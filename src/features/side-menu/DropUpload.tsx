import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { File as FileIcon, FolderClosed, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { sizeFmt } from '../../domain/utils'
import {
    collectDroppedUploadEntries,
    uploadEntrySummary,
    type LocalUploadEntry,
} from '../../domain/upload'
import { useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

/** Highlight applied to a folder row that is an active drop target. */
export const dropHighlightClass = 'bg-accent/20 outline-2 outline-dashed outline-accent -outline-offset-2'

/** True when the drag payload contains OS files or folders. */
export function dragHasFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files')
}

function ConfirmDropDialog({
    entries,
    dir,
    close,
}: {
    entries: LocalUploadEntry[]
    dir: string
    close: (ok: boolean | null) => void
}) {
    const { t } = useTranslation()
    const summary = uploadEntrySummary(entries)
    const visible = entries.slice(0, 100)

    return (
        <form
            method="dialog"
            onSubmit={(event) => {
                event.preventDefault()
                close(true)
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <UploadCloud size={18} aria-hidden />
                {t('files.drop-upload-title-recursive', 'Upload dropped files and folders?')}
            </div>

            <div className="mb-2 flex items-center gap-1.5 text-sm">
                <span className="opacity-70">{t('files.upload-destination', 'Destination folder')}:</span>
                <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />
                <code className="truncate font-mono text-xs font-bold">{dir}</code>
            </div>

            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 border-2 border-black bg-black/5 px-2 py-1.5 text-xs dark:bg-white/5">
                <span><strong>{summary.files}</strong> {t('files.files', 'files')}</span>
                <span><strong>{summary.directories}</strong> {t('files.folders', 'folders')}</span>
                <span><strong>{sizeFmt(summary.bytes)}</strong></span>
            </div>

            <div className="max-h-64 overflow-y-auto border-2 border-black bg-edit p-1">
                {visible.map((entry) => {
                    const depth = entry.relativePath.split('/').length - 1
                    return (
                        <div
                            key={`${entry.kind}:${entry.relativePath}`}
                            className="flex items-center gap-1.5 py-0.5 text-sm"
                            style={{ paddingInlineStart: `${depth * 12 + 4}px` }}
                        >
                            {entry.kind === 'directory' ? (
                                <FolderClosed size={13} className="shrink-0 opacity-70" aria-hidden />
                            ) : (
                                <FileIcon size={13} className="shrink-0 opacity-70" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.relativePath}>
                                {entry.relativePath.split('/').at(-1)}
                            </span>
                            {entry.kind === 'file' && (
                                <span className="shrink-0 text-xs opacity-50">{sizeFmt(entry.file.size)}</span>
                            )}
                        </div>
                    )
                })}
                {entries.length > visible.length && (
                    <div className="px-1 py-1 text-xs font-semibold opacity-60">
                        {t('files.upload-more-items', '…and {{count}} more items', {
                            count: entries.length - visible.length,
                        })}
                    </div>
                )}
            </div>

            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {t(
                    'files.upload-overwrite-warning',
                    'Matching files will be overwritten. Other remote files will be kept.',
                )}
            </p>

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">
                    {t('files.upload', 'Upload')} ({summary.files})
                </CtaButton>
            </DialogActions>
        </form>
    )
}

/** Show folder-aware drop confirmation. */
export function useDropUploadConfirm(): (
    entries: LocalUploadEntry[],
    dir: string,
) => Promise<boolean> {
    const openDialog = useOpenDialog()
    return useCallback(
        async (entries, dir) =>
            (await openDialog<boolean>((close) => (
                <ConfirmDropDialog entries={entries} dir={dir} close={close} />
            ))) === true,
        [openDialog],
    )
}

export interface DropTargetProps {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
}

/** Recursive file/folder drop target for a device directory. */
export function useFolderDropTarget(
    dir: string,
    onUpload: (entries: LocalUploadEntry[], dir: string) => Promise<void>,
): [boolean, DropTargetProps] {
    const { t } = useTranslation()
    const [over, setOver] = useState(0)
    const confirmDrop = useDropUploadConfirm()

    const props: DropTargetProps = {
        onDragOver: (event) => {
            if (!dragHasFiles(event)) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'copy'
        },
        onDragEnter: (event) => {
            if (!dragHasFiles(event)) return
            event.preventDefault()
            event.stopPropagation()
            setOver((count) => count + 1)
        },
        onDragLeave: (event) => {
            if (!dragHasFiles(event)) return
            event.stopPropagation()
            setOver((count) => Math.max(0, count - 1))
        },
        onDrop: (event) => {
            if (!dragHasFiles(event)) return
            event.preventDefault()
            event.stopPropagation()
            setOver(0)
            void collectDroppedUploadEntries(event.dataTransfer)
                .then(async (entries) => {
                    if (!entries.length) return
                    if (await confirmDrop(entries, dir)) await onUpload(entries, dir)
                })
                .catch((err: unknown) => {
                    toast.error(t('files.upload-scan-failed', 'Could not read dropped folder'), {
                        description: err instanceof Error ? err.message : String(err),
                    })
                })
        },
    }

    return [over > 0, props]
}
