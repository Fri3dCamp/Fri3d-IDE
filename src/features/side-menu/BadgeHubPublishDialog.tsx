import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudUpload, Loader2, LogIn, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import type { AppInfo } from '../../stores/apps'
import { useBadgeHubStore } from '../../stores/badgehub'
import { login } from '../../services/badgehub/auth'
import {
    loadPublishDefaults,
    publishAppToBadgeHub,
    type PublishFields,
} from '../../services/badgehub/publish.service'
import { getCategories } from '../../services/badgehub/api'
import { BADGEHUB_SITE } from '../../services/badgehub/config'
import { useOpenDialog, DialogActions, CtaButton, SecondaryButton } from '../../components/dialogs'

const inputClass =
    'w-full border-2 border-black bg-edit px-2 py-1 text-sm text-fg outline-none focus:border-accent'

function PublishDialog({ app, close }: { app: AppInfo; close: (r: boolean | null) => void }) {
    const { t } = useTranslation()
    const authenticated = useBadgeHubStore((s) => s.authenticated)
    const username = useBadgeHubStore((s) => s.username)
    const [loading, setLoading] = useState(true)
    const [publishing, setPublishing] = useState(false)
    const [stepMsg, setStepMsg] = useState('')
    const [exists, setExists] = useState(false)
    const [owned, setOwned] = useState(false)
    const [categories, setCategories] = useState<string[]>([])
    const [fields, setFields] = useState<PublishFields | null>(null)

    useEffect(() => {
        if (!authenticated) {
            setLoading(false)
            return
        }
        let cancelled = false
        void (async () => {
            setLoading(true)
            try {
                const [defaults, cats] = await Promise.all([loadPublishDefaults(app), getCategories()])
                if (cancelled) return
                setFields(defaults.fields)
                setExists(defaults.exists)
                setOwned(defaults.owned)
                setCategories(cats)
            } catch (err) {
                toast.error(t('badgehub.load-failed', 'Could not load BadgeHub project info'), {
                    description: String(err),
                })
                close(null)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [app, authenticated, close, t])

    const set = <K extends keyof PublishFields>(key: K, value: PublishFields[K]) =>
        setFields((f) => (f ? { ...f, [key]: value } : f))

    const submit = async () => {
        if (!fields) return
        if (!fields.name.trim()) {
            toast.error(t('badgehub.name-required', 'Name is required'))
            return
        }
        setPublishing(true)
        try {
            const ok = await publishAppToBadgeHub(app, fields, !exists, setStepMsg)
            if (ok) close(true)
        } catch (err) {
            toast.error(t('badgehub.publish-failed', 'Publish failed'), { description: String(err) })
        } finally {
            setPublishing(false)
        }
    }

    if (authenticated !== true) {
        return (
            <div>
                <div className="mb-3 font-heading text-lg font-bold">
                    {t('badgehub.publish-title', 'Publish to BadgeHub')}
                </div>
                <p className="mb-4 text-sm opacity-80">
                    {t('badgehub.login-hint', 'Log in with your BadgeHub account to publish apps.')}
                </p>
                <DialogActions>
                    <SecondaryButton type="button" onClick={() => close(null)}>
                        {t('app.dialog.btn-cancel', 'Cancel')}
                    </SecondaryButton>
                    <CtaButton type="button" onClick={() => void login()}>
                        <span className="flex items-center gap-1.5">
                            <LogIn size={14} aria-hidden />
                            {t('badgehub.login', 'Login to BadgeHub')}
                        </span>
                    </CtaButton>
                </DialogActions>
            </div>
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
            <div className="mb-1 flex items-center gap-2 font-heading text-lg font-bold">
                <CloudUpload size={18} aria-hidden />
                {t('badgehub.publish-title', 'Publish to BadgeHub')}
            </div>
            <div className="mb-3 truncate font-mono text-xs opacity-50">
                {app.fullname}
                {username ? ` · ${username}` : ''}
            </div>

            {loading || !fields ? (
                <div className="flex items-center gap-2 py-6 text-sm opacity-70">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    {t('badgehub.loading', 'Checking BadgeHub…')}
                </div>
            ) : exists && !owned ? (
                <p className="py-4 text-sm text-icon-error">
                    {t(
                        'badgehub.slug-taken',
                        'A project with id {{slug}} already exists on BadgeHub and belongs to someone else.',
                        { slug: app.fullname },
                    )}
                </p>
            ) : (
                <>
                    {exists && (
                        <p className="mb-3 border-2 border-black bg-black/5 px-2 py-1.5 text-xs dark:bg-white/5">
                            {t('badgehub.update-mode', 'This will publish a new version of your existing project.')}{' '}
                            <a
                                href={`${BADGEHUB_SITE}/page/project/${app.fullname}`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                            >
                                {t('badgehub.view-on-site', 'View on BadgeHub')}
                            </a>
                        </p>
                    )}
                    <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                        <label htmlFor="bh-name" className="text-sm">{t('apps.field-name', 'Display name')}</label>
                        <input id="bh-name" className={inputClass} value={fields.name}
                            autoComplete="off" onChange={(e) => set('name', e.target.value)} />

                        <label htmlFor="bh-version" className="text-sm">{t('apps.field-version', 'Version')}</label>
                        <input id="bh-version" className={inputClass} value={fields.version}
                            autoComplete="off" onChange={(e) => set('version', e.target.value)} />

                        <label htmlFor="bh-author" className="text-sm">{t('badgehub.field-author', 'Author')}</label>
                        <input id="bh-author" className={inputClass} value={fields.author}
                            autoComplete="off" onChange={(e) => set('author', e.target.value)} />

                        <label htmlFor="bh-desc" className="text-sm">{t('apps.field-short-desc', 'Short description')}</label>
                        <input id="bh-desc" className={inputClass} value={fields.description}
                            autoComplete="off" onChange={(e) => set('description', e.target.value)} />

                        <label htmlFor="bh-long" className="text-sm">{t('apps.field-long-desc', 'Long description')}</label>
                        <textarea id="bh-long" rows={3} className={inputClass} value={fields.longDescription}
                            onChange={(e) => set('longDescription', e.target.value)} />

                        <label htmlFor="bh-cat" className="text-sm">{t('apps.field-category', 'Category')}</label>
                        <select
                            id="bh-cat"
                            className={inputClass}
                            value={fields.categories[0] ?? 'Uncategorised'}
                            onChange={(e) => set('categories', [e.target.value])}
                        >
                            {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        <label htmlFor="bh-license" className="text-sm">{t('badgehub.field-license', 'License')}</label>
                        <input id="bh-license" className={inputClass} value={fields.licenseType}
                            autoComplete="off" onChange={(e) => set('licenseType', e.target.value)} />

                        <label htmlFor="bh-git" className="text-sm">{t('badgehub.field-git', 'Git URL')}</label>
                        <input id="bh-git" className={inputClass} value={fields.gitUrl} placeholder="https://github.com/…"
                            autoComplete="off" onChange={(e) => set('gitUrl', e.target.value)} />

                        <span className="text-sm">{t('badgehub.field-hidden', 'Hidden')}</span>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={fields.hidden}
                                onChange={(e) => set('hidden', e.target.checked)}
                                className="h-4 w-4 accent-(--raw-accent)"
                            />
                            <span className="text-xs opacity-70">
                                {t('badgehub.hidden-hint', 'Hide from BadgeHub discovery')}
                            </span>
                        </label>
                    </div>
                    {publishing && stepMsg && (
                        <div className="mb-2 flex items-center gap-2 text-xs opacity-70">
                            <Loader2 size={13} className="animate-spin" aria-hidden />
                            {stepMsg}
                        </div>
                    )}
                </>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)} disabled={publishing}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit" disabled={loading || publishing || (exists && !owned)}>
                    <span className="flex items-center gap-1.5">
                        {publishing ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                            <UploadCloud size={14} aria-hidden />
                        )}
                        {exists
                            ? t('badgehub.publish-update', 'Publish new version')
                            : t('badgehub.publish', 'Publish')}
                    </span>
                </CtaButton>
            </DialogActions>
        </form>
    )
}

export function useBadgeHubPublishDialog(): (app: AppInfo) => Promise<boolean> {
    const openDialog = useOpenDialog()
    return async (app) =>
        (await openDialog<boolean>((close) => <PublishDialog app={app} close={close} />, { wide: true })) === true
}
