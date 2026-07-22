import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, PackagePlus, RotateCcw } from 'lucide-react'
import { createApp, validateAppFullname } from '../../services/apps.service'
import { useOpenDialog, useConfirm, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

/* ------------------------------------------------------------------ */
/* Create-app dialog                                                   */
/* ------------------------------------------------------------------ */

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const bin = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

function initialsFor(name: string): string {
    const clean = name.trim()
    if (!clean) return 'A'
    const words = clean.split(/\s+/).filter(Boolean)
    if (words.length >= 2) return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
    return clean.slice(0, 2).toUpperCase()
}

type IconBg = {
    id: string
    label: string
    from: string
    to: string
}

const ICON_BACKGROUNDS: IconBg[] = [
    { id: 'violet', label: 'Violet', from: 'hsl(264, 70%, 60%)', to: 'hsl(224, 60%, 42%)' },
    { id: 'ocean', label: 'Ocean', from: 'hsl(197, 80%, 58%)', to: 'hsl(210, 70%, 38%)' },
    { id: 'mint', label: 'Mint', from: 'hsl(162, 62%, 58%)', to: 'hsl(170, 55%, 34%)' },
    { id: 'sunset', label: 'Sunset', from: 'hsl(20, 90%, 60%)', to: 'hsl(345, 72%, 48%)' },
    { id: 'mono', label: 'Mono', from: 'hsl(220, 8%, 52%)', to: 'hsl(220, 8%, 28%)' },
]

function makeDefaultIcon(name = 'A', bg: IconBg = ICON_BACKGROUNDS[0]): { dataUrl: string; bytes: Uint8Array } {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return { dataUrl: '', bytes: new Uint8Array() }

    ctx.clearRect(0, 0, 64, 64)
    const grad = ctx.createLinearGradient(0, 0, 64, 64)
    grad.addColorStop(0, bg.from)
    grad.addColorStop(1, bg.to)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)

    const glyph = initialsFor(name)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${glyph.length > 1 ? 26 : 32}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, 32, 34)

    const dataUrl = canvas.toDataURL('image/png')
    return { dataUrl, bytes: dataUrlToBytes(dataUrl) }
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

const inputClass =
    'w-full border-2 border-black bg-edit px-2 py-1 text-sm text-fg outline-none focus:border-accent'

function CreateAppDialog({ close }: { close: (created: boolean | null) => void }) {
    const { t } = useTranslation()
    const confirm = useConfirm()

    const [fullname, setFullname] = useState('')
    const [name, setName] = useState('My App')
    const [version, setVersion] = useState('0.1.0')
    const [publisher, setPublisher] = useState('')
    const [description, setDescription] = useState('')
    const [template, setTemplate] = useState<'hello' | 'blank'>('hello')

    const [iconDataUrl, setIconDataUrl] = useState('')
    const [iconPng, setIconPng] = useState<Uint8Array>(new Uint8Array())
    const [iconMode, setIconMode] = useState<'auto' | 'custom'>('auto')
    const [iconBgId, setIconBgId] = useState<string>(ICON_BACKGROUNDS[0].id)

    const [error, setError] = useState('')
    const iconInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const bg = ICON_BACKGROUNDS.find((x) => x.id === iconBgId) ?? ICON_BACKGROUNDS[0]
        const icon = makeDefaultIcon(name, bg)
        setIconDataUrl(icon.dataUrl)
        setIconPng(icon.bytes)
    }, [])

    useEffect(() => {
        if (iconMode !== 'auto') return
        const bg = ICON_BACKGROUNDS.find((x) => x.id === iconBgId) ?? ICON_BACKGROUNDS[0]
        const icon = makeDefaultIcon(name, bg)
        setIconDataUrl(icon.dataUrl)
        setIconPng(icon.bytes)
    }, [name, iconMode, iconBgId])

    const resetIcon = () => {
        const bg = ICON_BACKGROUNDS.find((x) => x.id === iconBgId) ?? ICON_BACKGROUNDS[0]
        const icon = makeDefaultIcon(name, bg)
        setIconDataUrl(icon.dataUrl)
        setIconPng(icon.bytes)
        setIconMode('auto')
    }

    const pickIcon = async (file: File | undefined) => {
        if (!file) return
        const out = await resizeImageFileToPng64(file)
        setIconDataUrl(out.dataUrl)
        setIconPng(out.bytes)
        setIconMode('custom')
    }

    const submit = async () => {
        try {
            validateAppFullname(fullname)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            return
        }

        setError('')
        close(true)
        void createApp(
            {
                fullname,
                name,
                version,
                publisher,
                description,
                template,
                iconPng,
            },
            confirm,
        )
    }

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                void submit()
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <PackagePlus size={18} aria-hidden />
                {t('apps.create-title', 'Create New App')}
            </div>

            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                <label htmlFor="app-id" className="text-sm">{t('apps.field-id', 'App ID')}</label>
                <input
                    id="app-id"
                    className={inputClass}
                    value={fullname}
                    placeholder="com.example.myapp"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setFullname(e.target.value)}
                />

                <label htmlFor="app-name" className="text-sm">{t('apps.field-name', 'Display name')}</label>
                <input
                    id="app-name"
                    className={inputClass}
                    value={name}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                />

                <label htmlFor="app-version" className="text-sm">{t('apps.field-version', 'Version')}</label>
                <input
                    id="app-version"
                    className={inputClass}
                    value={version}
                    autoComplete="off"
                    onChange={(e) => setVersion(e.target.value)}
                />

                <label htmlFor="app-publisher" className="text-sm">{t('apps.field-publisher', 'Publisher')}</label>
                <input
                    id="app-publisher"
                    className={inputClass}
                    value={publisher}
                    placeholder={t('apps.field-optional', 'optional')}
                    autoComplete="off"
                    onChange={(e) => setPublisher(e.target.value)}
                />

                <label htmlFor="app-desc" className="text-sm">{t('apps.field-description', 'Description')}</label>
                <input
                    id="app-desc"
                    className={inputClass}
                    value={description}
                    placeholder={t('apps.field-optional', 'optional')}
                    autoComplete="off"
                    onChange={(e) => setDescription(e.target.value)}
                />

                <label htmlFor="app-template" className="text-sm">{t('apps.field-template', 'Template')}</label>
                <select
                    id="app-template"
                    className={inputClass}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as 'hello' | 'blank')}
                >
                    <option value="hello">{t('apps.template-hello', 'Hello World')}</option>
                    <option value="blank">{t('apps.template-blank', 'Blank')}</option>
                </select>

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
                    <div className="flex max-w-md flex-col gap-1.5">
                         <button
                            type="button"
                            className="flex items-center gap-1.5 border-2 border-black bg-transparent px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                            onClick={() => iconInputRef.current?.click()}
                        >
                            <ImagePlus size={13} aria-hidden />
                            {t('apps.upload-icon', 'Upload icon')}
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-1.5 border-2 border-black bg-transparent px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/10 dark:hover:bg-white/10"
                            onClick={resetIcon}
                        >
                            <RotateCcw size={13} aria-hidden />
                            {t('apps.icon-reset', 'Reset')}
                        </button>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs opacity-70">{t('apps.icon-bg', 'Background')}</span>
                            <div className="flex flex-wrap gap-1">
                                {ICON_BACKGROUNDS.map((bg) => (
                                    <button
                                        key={bg.id}
                                        type="button"
                                        className={`h-5 w-5 border-2 border-black ${iconBgId === bg.id ? 'ring-2 ring-accent' : ''}`}
                                        style={{ background: `linear-gradient(135deg, ${bg.from}, ${bg.to})` }}
                                        onClick={() => setIconBgId(bg.id)}
                                        aria-label={t('apps.icon-bg-choice', 'Icon background {{name}}', { name: bg.label })}
                                    />
                                ))}
                            </div>
                        </div>
                        <input
                            ref={iconInputRef}
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
            </div>

            {error && <div className="mt-2 text-sm text-icon-error" role="alert">{error}</div>}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">{t('apps.create', 'Create')}</CtaButton>
            </DialogActions>
        </form>
    )
}

export function useCreateAppDialog(): () => Promise<boolean> {
    const openDialog = useOpenDialog()
    return async () => (await openDialog<boolean>((close) => <CreateAppDialog close={close} />)) === true
}
