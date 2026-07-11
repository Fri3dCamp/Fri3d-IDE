import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, FileArchive, Loader2, PackageCheck } from 'lucide-react'
import { sizeFmt } from '../../domain/utils'
import { installMpk, parseMpk, type MpkInstallPreview } from '../../services/apps.service'
import { useConfirm, useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

function PreviewGrid({ mpk }: { mpk: MpkInstallPreview }) {
    const { t } = useTranslation()
    return (
        <div className="mt-3 border-2 border-black bg-edit p-2 text-sm">
            <div className="mb-2 flex items-center gap-2">
                {mpk.iconDataUrl ? (
                    <img src={mpk.iconDataUrl} alt="" className="h-12 w-12 border-2 border-black object-cover" />
                ) : (
                    <div className="grid h-12 w-12 place-items-center border-2 border-black opacity-60">
                        <PackageCheck size={18} aria-hidden />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="truncate font-heading font-bold">{mpk.appName}</div>
                    <div className="truncate font-mono text-xs opacity-60">{mpk.appId}</div>
                </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="opacity-70">{t('apps.field-version', 'Version')}</span>
                <span className="truncate">{mpk.version || '—'}</span>

                <span className="opacity-70">{t('apps.field-publisher', 'Publisher')}</span>
                <span className="truncate">{mpk.publisher || '—'}</span>

                <span className="opacity-70">{t('apps.install-location', 'Install location')}</span>
                <code className="truncate">{mpk.location}</code>

                <span className="opacity-70">{t('apps.install-files', 'Files')}</span>
                <span>{mpk.files.length}</span>

                <span className="opacity-70">{t('apps.install-size', 'Package size')}</span>
                <span>{sizeFmt(mpk.totalBytes)}</span>
            </div>

            {mpk.description && <div className="mt-2 text-xs opacity-70">{mpk.description}</div>}

            <div className="mt-2 border-t border-black/20 pt-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                    {t('apps.install-plan', 'Install plan')}
                </div>
                <div className="max-h-28 space-y-0.5 overflow-y-auto font-mono text-[11px]">
                    {mpk.files.slice(0, 24).map((f) => (
                        <div key={f.devicePath} className="truncate" title={`${f.archivePath} → ${f.devicePath}`}>
                            {f.archivePath} → {f.devicePath}
                        </div>
                    ))}
                    {mpk.files.length > 24 && (
                        <div className="opacity-60">+{mpk.files.length - 24} more…</div>
                    )}
                </div>
            </div>
        </div>
    )
}

function MpkInstallerDialog({ close }: { close: (installed: boolean | null) => void }) {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const inputRef = useRef<HTMLInputElement>(null)

    const [mpk, setMpk] = useState<MpkInstallPreview | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const pickFile = async (file: File | null | undefined) => {
        if (!file) return
        setBusy(true)
        setError('')
        try {
            setMpk(await parseMpk(file))
        } catch (err) {
            setMpk(null)
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                if (!mpk || busy) return
                void (async () => {
                    setBusy(true)
                    try {
                        const ok = await installMpk(mpk, confirm)
                        if (ok) close(true)
                    } finally {
                        setBusy(false)
                    }
                })()
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <Archive size={18} aria-hidden />
                {t('apps.install-mpk-title', 'Install MPK App')}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept=".mpk,.zip"
                hidden
                onChange={(e) => {
                    void pickFile(e.target.files?.[0])
                    e.target.value = ''
                }}
            />

            <button
                type="button"
                className="flex w-full items-center justify-center gap-2 border-2 border-black bg-tab-active px-3 py-2 text-sm font-semibold text-tab-active-fg hover:brightness-110"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
            >
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileArchive size={15} aria-hidden />}
                {t('apps.install-mpk-pick', 'Select .mpk file')}
            </button>

            {mpk && <PreviewGrid mpk={mpk} />}
            {error && <div className="mt-2 text-sm text-icon-error" role="alert">{error}</div>}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)} disabled={busy}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={!mpk || busy}>
                    {busy ? t('apps.installing-short', 'Installing…') : t('apps.install-mpk', 'Install MPK')}
                </CtaButton>
            </DialogActions>
        </form>
    )
}

export function useInstallMpkDialog(): () => Promise<boolean> {
    const openDialog = useOpenDialog()
    return async () => (await openDialog<boolean>((close) => <MpkInstallerDialog close={close} />, { wide: true })) === true
}
