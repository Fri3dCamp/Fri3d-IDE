import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { File as FileIcon, FolderClosed, UploadCloud } from 'lucide-react'
import { sizeFmt } from '../../domain/utils'
import { useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

/*
 * Shared drag & drop upload helpers for the device file browser and the
 * app file browser:
 *   - dropHighlightClass: visual highlight for the folder row being hovered
 *   - useDropUploadConfirm(): dialog confirming target folder before upload
 */

/** Highlight applied to a folder row that is an active drop target. */
export const dropHighlightClass = 'bg-accent/20 outline-2 outline-dashed outline-accent -outline-offset-2'

/** True when the drag payload contains OS files. */
export function dragHasFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files')
}

function ConfirmDropDialog({
    files,
    dir,
    close,
}: {
    files: File[]
    dir: string
    close: (ok: boolean | null) => void
}) {
    const { t } = useTranslation()
    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                close(true)
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <UploadCloud size={18} aria-hidden />
                {t('files.drop-upload-title', 'Upload dropped files?')}
            </div>

            <div className="mb-2 flex items-center gap-1.5 text-sm">
                <span className="opacity-70">{t('files.upload-destination', 'Destination folder')}:</span>
                <FolderClosed size={14} className="shrink-0 opacity-80" aria-hidden />
                <code className="truncate font-mono text-xs">{dir}</code>
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto border-2 border-black bg-edit p-1">
                {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-1.5 px-1 text-sm">
                        <FileIcon size={13} className="shrink-0 opacity-70" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="shrink-0 text-xs opacity-50">{sizeFmt(f.size)}</span>
                    </div>
                ))}
            </div>

            <p className="mt-2 text-sm opacity-70">
                {t('files.drop-upload-confirm', 'Upload {{n}} file(s) to {{dir}}?', {
                    n: files.length,
                    dir,
                })}
            </p>

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">
                    {t('files.upload', 'Upload')} ({files.length})
                </CtaButton>
            </DialogActions>
        </form>
    )
}

/** Returns a fn that shows the drop-confirmation dialog. Resolves true when confirmed. */
export function useDropUploadConfirm(): (files: File[], dir: string) => Promise<boolean> {
    const openDialog = useOpenDialog()
    return useCallback(
        async (files, dir) =>
            (await openDialog<boolean>((close) => (
                <ConfirmDropDialog files={files} dir={dir} close={close} />
            ))) === true,
        [openDialog],
    )
}

/** Build full target paths for files dropped into `dir`. */
export function dropTargetPaths(files: File[], dir: string): string[] {
    const base = dir === '/' ? '/' : `${dir.replace(/\/+$/, '')}/`
    return files.map((f) => `${base}${f.name.replace(/[\\/]+/g, '')}`)
}

export interface DropTargetProps {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
}

/**
 * Drop-target behaviour for a folder row/region.
 * Returns [isDragOver, props]. On drop: confirm dialog → onUpload(files, dir).
 */
export function useFolderDropTarget(
    dir: string,
    onUpload: (files: File[], dir: string) => Promise<void>,
): [boolean, DropTargetProps] {
    const [over, setOver] = useState(0)
    const confirmDrop = useDropUploadConfirm()

    const props: DropTargetProps = {
        onDragOver: (e) => {
            if (!dragHasFiles(e)) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'copy'
        },
        onDragEnter: (e) => {
            if (!dragHasFiles(e)) return
            e.preventDefault()
            e.stopPropagation()
            setOver((n) => n + 1)
        },
        onDragLeave: (e) => {
            if (!dragHasFiles(e)) return
            e.stopPropagation()
            setOver((n) => Math.max(0, n - 1))
        },
        onDrop: (e) => {
            if (!dragHasFiles(e)) return
            e.preventDefault()
            e.stopPropagation()
            setOver(0)
            const files = Array.from(e.dataTransfer.files)
            if (!files.length) return
            void confirmDrop(files, dir).then((ok) => {
                if (ok) return onUpload(files, dir)
            })
        },
    }

    return [over > 0, props]
}
