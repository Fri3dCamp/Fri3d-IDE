import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCode2, ImagePlus, Loader2, Rocket, Save } from 'lucide-react'
import type { AppInfo } from '../../stores/apps'
import { useAppsStore } from '../../stores/apps'
import {
    loadAppDetails,
    loadAppIconDataUrl,
    updateAppManifest,
    launchApp,
    type AppManifestFields,
} from '../../services/apps.service'
import { useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

const CATEGORIES = ['development', 'games', 'media', 'productivity', 'utilities', 'system', 'other']

const inputClass =
    'w-full border-2 border-black bg-edit px-2 py-1 text-sm text-fg outline-none focus:border-accent'

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const bin = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

async function resizeImageFileToPng64(file: File): Promise<{ dataUrl: string; bytes: Uint8Array }> {
    const fileUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result ?? ''))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(file)
    })

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('image-load-failed'))
        el.src = fileUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-unavailable')

    ctx.clearRect(0, 0, 64, 64)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, 64, 64)

    const srcRatio = img.width / Math.max(1, img.height)
    const dstRatio = 1
    let sx = 0
    let sy = 0
    let sw = img.width
    let sh = img.height

    if (srcRatio > dstRatio) {
        sw = Math.round(img.height * dstRatio)
        sx = Math.floor((img.width - sw) / 2)
    } else if (srcRatio < dstRatio) {
        sh = Math.round(img.width / dstRatio)
        sy = Math.floor((img.height - sh) / 2)
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64)

    const dataUrl = canvas.toDataURL('image/png')
    return { dataUrl, bytes: dataUrlToBytes(dataUrl) }
}

function AppEditorDialog({ app, close }: { app: AppInfo; close: (r: boolean | null) => void }) {
    const { t } = useTranslation()
    const launching = useAppsStore((s) => s.launching !== null)
    const [loading, setLoading] = useState(true)
    const [readProgress, setReadProgress] = useState(0)
    const [saving, setSaving] = useState(false)
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null)
    const [iconBytes, setIconBytes] = useState<Uint8Array | undefined>(undefined)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [fields, setFields] = useState<AppManifestFields>({
        name: app.name,
        version: app.version,
        publisher: app.publisher ?? '',
        short_description: app.short_description ?? '',
        long_description: '',
        category: app.category ?? 'other',
    })

    // Load full manifest + icon from device.
    useEffect(() => {
        let cancelled = false
        void (async () => {
            setReadProgress(0.05)
            const details = await loadAppDetails(app)
            if (!cancelled && details) {
                const m = details.manifest
                setFields((prev) => ({
                    name: typeof m.name === 'string' ? m.name : prev.name,
                    version: typeof m.version === 'string' ? m.version : prev.version,
                    publisher: typeof m.publisher === 'string' ? m.publisher : prev.publisher,
                    short_description:
                        typeof m.short_description === 'string' ? m.short_description : prev.short_description,
                    long_description:
                        typeof m.long_description === 'string' ? m.long_description : prev.long_description,
                    category: typeof m.category === 'string' ? m.category : prev.category,
                }))
                setReadProgress(0.7)
            }

            const icon = await loadAppIconDataUrl(app)
            if (!cancelled) {
                setIconDataUrl(icon ?? null)
                setReadProgress(1)
                setLoading(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [app])

    const set = <K extends keyof AppManifestFields>(key: K, value: string) =>
        setFields((f) => ({ ...f, [key]: value }))

    const pickIcon = async (file: File | undefined) => {
        if (!file) return
        const out = await resizeImageFileToPng64(file)
        setIconDataUrl(out.dataUrl)
        setIconBytes(out.bytes)
    }

    const save = async () => {
        setSaving(true)
        try {
            if (await updateAppManifest(app, fields, iconBytes)) close(true)
        } finally {
            setSaving(false)
        }
    }

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                void save()
            }}
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-heading text-lg font-bold">
                    <FileCode2 size={18} aria-hidden className="shrink-0" />
                    <span className="truncate">{app.name}</span>
                </span>
                {!app.broken && (
                    <button
                        type="button"
                        disabled={launching}
                        title={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                        onClick={() => void launchApp(app.fullname)}
                        className="flex shrink-0 items-center gap-1.5 border-2 border-black bg-transparent px-2 py-1 text-xs font-semibold text-icon-success transition-colors hover:bg-icon-success/15 disabled:opacity-50"
                    >
                        <Rocket size={13} aria-hidden />
                        {t('apps.launch-short', 'Launch')}
                    </button>
                )}
            </div>
            <div className="mb-3 truncate font-mono text-xs opacity-50">{app.fullname}</div>

            {loading ? (
                <div className="py-6 text-sm opacity-70">
                    <div className="mb-2 flex items-center gap-2">
                        <Loader2 size={15} className="animate-spin" aria-hidden />
                        {t('apps.loading-details', 'Reading app from device…')}
                        <span className="text-xs">{Math.round(readProgress * 100)}%</span>
                    </div>
                    <div className="h-1.5 border border-black/30 bg-black/10">
                        <div
                            className="h-full bg-accent transition-[width] duration-150"
                            style={{ width: `${Math.max(0, Math.min(100, readProgress * 100))}%` }}
                        />
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                        <span className="text-sm">{t('apps.field-icon', 'Icon')}</span>
                        <div className="flex items-center gap-2">
                            <div className="h-16 w-16 overflow-hidden border-2 border-black bg-edit">
                                {iconDataUrl ? (
                                    <div
                                        role="img"
                                        aria-label={t('apps.field-icon', 'Icon')}
                                        className="h-full w-full bg-cover bg-center"
                                        style={{ backgroundImage: `url(${iconDataUrl})` }}
                                    />
                                ) : (
                                    <div className="grid h-full w-full place-items-center">
                                        <span className="text-[10px] opacity-50">64×64</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 border-2 border-black bg-transparent px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <ImagePlus size={13} aria-hidden />
                                    {t('apps.upload-icon', 'Upload icon')}
                                </button>
                                <div className="mt-1 text-xs opacity-60">
                                    {t('apps.icon-upload-hint', 'Any image. Auto-converted to 64×64 PNG.')}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        void pickIcon(e.target.files?.[0])
                                        e.currentTarget.value = ''
                                    }}
                                />
                            </div>
                        </div>

                        <label htmlFor="ae-name" className="text-sm">{t('apps.field-name', 'Display name')}</label>
                        <input id="ae-name" className={inputClass} value={fields.name}
                            autoComplete="off" onChange={(e) => set('name', e.target.value)} />

                        <label htmlFor="ae-version" className="text-sm">{t('apps.field-version', 'Version')}</label>
                        <input id="ae-version" className={inputClass} value={fields.version}
                            autoComplete="off" onChange={(e) => set('version', e.target.value)} />

                        <label htmlFor="ae-publisher" className="text-sm">{t('apps.field-publisher', 'Publisher')}</label>
                        <input id="ae-publisher" className={inputClass} value={fields.publisher}
                            autoComplete="off" onChange={(e) => set('publisher', e.target.value)} />

                        <label htmlFor="ae-short" className="text-sm">{t('apps.field-short-desc', 'Short description')}</label>
                        <input id="ae-short" className={inputClass} value={fields.short_description}
                            autoComplete="off" onChange={(e) => set('short_description', e.target.value)} />

                        <label htmlFor="ae-long" className="text-sm">{t('apps.field-long-desc', 'Long description')}</label>
                        <textarea id="ae-long" rows={2} className={inputClass} value={fields.long_description}
                            onChange={(e) => set('long_description', e.target.value)} />

                        <label htmlFor="ae-category" className="text-sm">{t('apps.field-category', 'Category')}</label>
                        <select id="ae-category" className={inputClass} value={fields.category}
                            onChange={(e) => set('category', e.target.value)}>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {t(`apps.category-${c}`, c)}
                                </option>
                            ))}
                        </select>
                    </div>
                </>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)} disabled={saving}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={saving || loading}>
                    <span className="flex items-center gap-1.5">
                        {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
                        {t('apps.save', 'Save')}
                    </span>
                </CtaButton>
            </DialogActions>
        </form>
    )
}

export function useAppEditorDialog(): (app: AppInfo) => Promise<boolean> {
    const openDialog = useOpenDialog()
    return async (app) =>
        (await openDialog<boolean>((close) => <AppEditorDialog app={app} close={close} />)) === true
}
