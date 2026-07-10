import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackagePlus } from 'lucide-react'
import { createApp, validateAppFullname } from '../../services/apps.service'
import { useOpenDialog, useConfirm, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

/* ------------------------------------------------------------------ */
/* Create-app dialog                                                   */
/* ------------------------------------------------------------------ */

/** Deterministic identicon: hash → hue gradient + initials (64×64 PNG). */
function renderAutoIcon(canvas: HTMLCanvasElement, appName: string, fullname: string): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let hash = 0
    for (const ch of fullname || appName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
    const hue = hash % 360
    ctx.clearRect(0, 0, 64, 64)
    const grad = ctx.createLinearGradient(0, 0, 64, 64)
    grad.addColorStop(0, `hsl(${hue}, 65%, 55%)`)
    grad.addColorStop(1, `hsl(${(hue + 45) % 360}, 65%, 38%)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(0, 0, 64, 64, 12)
    ctx.fill()
    const initials = (appName.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || 'A').toUpperCase()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${initials.length > 1 ? 26 : 32}px Montserrat, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, 32, 34)
}

function canvasPngBytes(canvas: HTMLCanvasElement): Uint8Array {
    const bin = atob(canvas.toDataURL('image/png').split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
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
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Icon follows name/id until submitted (simplified from legacy draw-editor).
    useEffect(() => {
        if (canvasRef.current) renderAutoIcon(canvasRef.current, name, fullname)
    }, [name, fullname])

    const submit = async () => {
        try {
            validateAppFullname(fullname)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            return
        }
        setError('')
        setBusy(true)
        try {
            const created = await createApp(
                {
                    fullname,
                    name,
                    version,
                    publisher,
                    description,
                    template,
                    iconPng: canvasRef.current ? canvasPngBytes(canvasRef.current) : new Uint8Array(),
                },
                confirm,
            )
            if (created) close(true)
        } finally {
            setBusy(false)
        }
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
                <input id="app-id" className={inputClass} value={fullname} placeholder="com.example.myapp"
                    autoComplete="off" spellCheck={false} onChange={(e) => setFullname(e.target.value)} />

                <label htmlFor="app-name" className="text-sm">{t('apps.field-name', 'Display name')}</label>
                <input id="app-name" className={inputClass} value={name} autoComplete="off"
                    onChange={(e) => setName(e.target.value)} />

                <label htmlFor="app-version" className="text-sm">{t('apps.field-version', 'Version')}</label>
                <input id="app-version" className={inputClass} value={version} autoComplete="off"
                    onChange={(e) => setVersion(e.target.value)} />

                <label htmlFor="app-publisher" className="text-sm">{t('apps.field-publisher', 'Publisher')}</label>
                <input id="app-publisher" className={inputClass} value={publisher}
                    placeholder={t('apps.field-optional', 'optional')} autoComplete="off"
                    onChange={(e) => setPublisher(e.target.value)} />

                <label htmlFor="app-desc" className="text-sm">{t('apps.field-description', 'Description')}</label>
                <input id="app-desc" className={inputClass} value={description}
                    placeholder={t('apps.field-optional', 'optional')} autoComplete="off"
                    onChange={(e) => setDescription(e.target.value)} />

                <label htmlFor="app-template" className="text-sm">{t('apps.field-template', 'Template')}</label>
                <select id="app-template" className={inputClass} value={template}
                    onChange={(e) => setTemplate(e.target.value as 'hello' | 'blank')}>
                    <option value="hello">{t('apps.template-hello', 'Hello World')}</option>
                    <option value="blank">{t('apps.template-blank', 'Blank')}</option>
                </select>

                <span className="text-sm">{t('apps.field-icon', 'Icon')}</span>
                <div className="flex items-center gap-2">
                    <canvas ref={canvasRef} width={64} height={64} className="border-2 border-black" />
                    <span className="text-xs opacity-60">{t('apps.icon-auto-hint', 'Auto-generated from the app name')}</span>
                </div>
            </div>

            {error && <div className="mt-2 text-sm text-icon-error" role="alert">{error}</div>}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)} disabled={busy}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={busy}>
                    {busy ? t('apps.creating-short', 'Creating…') : t('apps.create', 'Create')}
                </CtaButton>
            </DialogActions>
        </form>
    )
}

export function useCreateAppDialog(): () => Promise<boolean> {
    const openDialog = useOpenDialog()
    return async () => (await openDialog<boolean>((close) => <CreateAppDialog close={close} />)) === true
}

