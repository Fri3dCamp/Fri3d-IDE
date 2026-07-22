import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, RefreshCw, Search, Store, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAppsStore } from '../../stores/apps'
import { isConnectionReady, useConnectionStore } from '../../stores/connection'
import {
    fetchStoreApps,
    installFromBadgeHub,
    type StoreApp,
} from '../../services/badgehub/store.service'
import { getCategories, getUserDrafts, type ProjectSummary, fileUrl } from '../../services/badgehub/api'
import { BADGEHUB_SITE } from '../../services/badgehub/config'
import { useOpenDialog, useConfirm, DialogActions, SecondaryButton } from '../../components/dialogs'
import { ExternalLink } from 'lucide-react'
import { useBadgeHubStore } from '../../stores/badgehub'
import { login } from '../../services/badgehub/auth'

const inputClass =
    'w-full border-2 border-black bg-edit px-2 py-1 text-sm text-fg outline-none focus:border-accent'

/* ------------------------------------------------------------------ */
/* Fuzzy search                                                        */
/* ------------------------------------------------------------------ */

/** Subsequence fuzzy score: higher = better, null = no match.
 *  Bonuses for consecutive hits, word starts, and full substrings. */
function fuzzyScore(text: string, query: string): number | null {
    const t = text.toLowerCase()
    const q = query.toLowerCase()
    if (!q) return 0
    const sub = t.indexOf(q)
    if (sub >= 0) return 100 - Math.min(sub, 40) + (q.length / t.length) * 20
    let ti = 0
    let score = 0
    let streak = 0
    for (const ch of q) {
        const found = t.indexOf(ch, ti)
        if (found < 0) return null
        streak = found === ti ? streak + 1 : 1
        score += streak * 2 + (found === 0 || /[\s._\-/]/.test(t[found - 1]) ? 6 : 0)
        ti = found + 1
    }
    return score
}

/** Best fuzzy score across name/slug/description (description slightly discounted). */
function appFuzzyScore(a: StoreApp, q: string): number | null {
    const scores = [
        fuzzyScore(a.name, q),
        fuzzyScore(a.slug, q),
        (() => {
            const s = fuzzyScore(a.description, q)
            return s === null ? null : s * 0.5
        })(),
    ].filter((s): s is number => s !== null)
    return scores.length ? Math.max(...scores) : null
}

function AppIcon({ iconUrl }: { iconUrl: string }) {
    const [failed, setFailed] = useState(false)
    if (failed) {
        return (
            <div className="grid h-12 w-12 shrink-0 place-items-center border-2 border-black bg-edit">
                <Store size={18} className="opacity-40" aria-hidden />
            </div>
        )
    }
    return (
        <img
            src={iconUrl}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 border-2 border-black bg-edit object-cover"
            onError={() => setFailed(true)}
        />
    )
}

function StoreRow({
    app,
    installing,
    onInstall,
}: {
    app: StoreApp
    installing: boolean
    onInstall: (app: StoreApp) => void
}) {
    const { t } = useTranslation()
    const connected = useConnectionStore((s) => isConnectionReady(s.status))
    const installed = useAppsStore((s) => s.apps?.find((a) => a.fullname === app.slug))
    const isUpdate = installed && app.version && installed.version !== app.version
    const isSame = installed && (!app.version || installed.version === app.version)

    return (
        <div className="flex items-center gap-3 border-b border-black/10 px-2 py-2">
            <AppIcon iconUrl={app.iconUrl} />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <a
                        href={`${BADGEHUB_SITE}/page/project/${app.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-semibold hover:underline"
                        title={app.slug}
                    >
                        {app.name}
                    </a>
                    {app.version && <span className="shrink-0 font-mono text-[11px] opacity-50">v{app.version}</span>}
                </div>
                <div className="truncate text-xs opacity-70" title={app.description}>
                    {app.description || '—'}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] opacity-50">
                    {app.categories.slice(0, 2).map((c) => (
                        <span key={c}>{c}</span>
                    ))}
                    {app.installs > 0 && <span>· {t('badgehub.installs', '{{n}} installs', { n: app.installs })}</span>}
                </div>
            </div>
            {app.installable ? (
                <button
                    type="button"
                    disabled={!connected || installing || Boolean(isSame)}
                    title={
                        !connected
                            ? t('app.connect-first', 'Connect your board first')
                            : isSame
                              ? t('badgehub.installed', 'Installed')
                              : undefined
                    }
                    className="flex shrink-0 items-center gap-1.5 border-2 border-black bg-tab-active px-2.5 py-1.5 text-xs font-semibold text-tab-active-fg shadow-brutal transition-transform hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:shadow-none"
                    onClick={() => onInstall(app)}
                >
                    {installing ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                        <Download size={13} aria-hidden />
                    )}
                    {isSame
                        ? t('badgehub.installed', 'Installed')
                        : isUpdate
                          ? t('badgehub.update', 'Update')
                          : t('badgehub.install', 'Install')}
                </button>
            ) : (
                <span className="shrink-0 text-[11px] opacity-40">
                    {t('badgehub.incompatible', 'Not for this badge')}
                </span>
            )}
        </div>
    )
}

function BadgeHubBrowserDialog({ close, initialTab = 'store' }: { close: (r: null) => void, initialTab?: 'store' | 'my-apps' }) {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const [apps, setApps] = useState<StoreApp[] | null>(null)
    const [categories, setCategories] = useState<string[]>([])
    const [category, setCategory] = useState('')
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [installingSlug, setInstallingSlug] = useState<string | null>(null)
    const userId = useBadgeHubStore((s) => s.userId)
    const authenticated = useBadgeHubStore((s) => s.authenticated)
    const [tab, setTab] = useState<'store' | 'my-apps'>(initialTab)
    const [myApps, setMyApps] = useState<ProjectSummary[] | null>(null)

    useEffect(() => {
        if (tab === 'my-apps' && userId) {
            setLoading(true)
            getUserDrafts(userId)
                .then(setMyApps)
                .catch((err) => {
                    toast.error(t('badgehub.load-failed', 'Could not load BadgeHub project info'), {
                        description: String(err),
                    })
                })
                .finally(() => setLoading(false))
        }
    }, [tab, userId, t])

    const load = async (cat: string) => {
        setLoading(true)
        try {
            setApps(await fetchStoreApps(cat ? { category: cat } : {}))
        } catch (err) {
            toast.error(t('badgehub.store-load-failed', 'Could not load BadgeHub apps'), {
                description: String(err),
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load(category)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category])

    useEffect(() => {
        void getCategories().then(setCategories).catch(() => setCategories([]))
    }, [])

    const filtered = useMemo(() => {
        if (!apps) return null
        let storeApps = apps
        if (userId) storeApps = apps.filter(a => a.authorId !== userId)
        const q = search.trim()
        if (!q) {
            // Installable first, then by installs desc.
            return [...storeApps].sort(
                (a, b) => Number(b.installable) - Number(a.installable) || b.installs - a.installs,
            )
        }
        return storeApps
            .map((a) => ({ a, score: appFuzzyScore(a, q) }))
            .filter((x): x is { a: StoreApp; score: number } => x.score !== null)
            .sort(
                (x, y) =>
                    y.score - x.score ||
                    Number(y.a.installable) - Number(x.a.installable) ||
                    y.a.installs - x.a.installs,
            )
            .map((x) => x.a)
    }, [apps, search])

    const install = async (app: StoreApp) => {
        setInstallingSlug(app.slug)
        try {
            await installFromBadgeHub(app, confirm)
        } catch (err) {
            toast.error(t('badgehub.install-failed', 'Install failed'), { description: String(err) })
        } finally {
            setInstallingSlug(null)
        }
    }

    return (
        <div>
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <Store size={18} aria-hidden />
                {t('badgehub.browse-title', 'BadgeHub App Store')}
                
                <div className="ml-4 flex gap-1 rounded-sm border-2 border-black bg-edit p-0.5 text-sm font-normal">
                    <button
                        type="button"
                        className={`px-2 py-0.5 ${tab === 'store' ? 'bg-tab-active text-tab-active-fg shadow-brutal font-semibold' : 'opacity-70 hover:opacity-100'}`}
                        onClick={() => setTab('store')}
                    >
                        {t('badgehub.store-tab', 'Store')}
                    </button>
                    <button
                        type="button"
                        className={`px-2 py-0.5 ${tab === 'my-apps' ? 'bg-tab-active text-tab-active-fg shadow-brutal font-semibold' : 'opacity-70 hover:opacity-100'}`}
                        onClick={() => setTab('my-apps')}
                    >
                        {t('badgehub.my-apps-tab', 'My Apps')}
                    </button>
                </div>

                <button
                    type="button"
                    className="ml-auto p-1 opacity-70 hover:opacity-100"
                    aria-label={t('apps.refresh-list', 'Refresh app list')}
                    onClick={() => {
                        if (tab === 'store') void load(category)
                        else if (userId) {
                            setLoading(true)
                            getUserDrafts(userId).then(setMyApps).finally(() => setLoading(false))
                        }
                    }}
                >
                    <RefreshCw size={15} aria-hidden />
                </button>
            </div>

            {tab === 'store' && (
            <>
            <div className="mb-2 flex gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 opacity-50" aria-hidden />
                    <input
                        className={`${inputClass} pl-7`}
                        placeholder={t('badgehub.search', 'Search apps…')}
                        value={search}
                        autoComplete="off"
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="max-w-[40%] border-2 border-black bg-edit px-2 py-1 text-sm text-fg"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label={t('apps.field-category', 'Category')}
                >
                    <option value="">{t('badgehub.all-categories', 'All categories')}</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            <div className="max-h-[50vh] min-h-40 overflow-y-auto border-2 border-black/20">
                {loading || filtered === null ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm opacity-70">
                        <Loader2 size={15} className="animate-spin" aria-hidden />
                        {t('badgehub.loading-store', 'Loading apps from BadgeHub…')}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-3 py-6 text-sm opacity-60">{t('badgehub.no-results', 'No apps found')}</div>
                ) : (
                    filtered.map((app) => (
                        <StoreRow
                            key={app.slug}
                            app={app}
                            installing={installingSlug === app.slug}
                            onInstall={(a) => void install(a)}
                        />
                    ))
                )}
            </div>
            </>
            )}

            {tab === 'my-apps' && (
            <div className="max-h-[50vh] min-h-40 overflow-y-auto border-2 border-black/20 flex flex-col">
                {!authenticated ? (
                    <div className="m-auto flex flex-col items-center gap-4 p-6 text-center">
                        <div className="opacity-70">
                            {t('badgehub.login-prompt', 'Log in to BadgeHub to view and manage your drafts.')}
                        </div>
                        <button
                            type="button"
                            className="flex items-center gap-2 border-2 border-black bg-tab-active px-4 py-2 font-semibold text-tab-active-fg shadow-brutal hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                            onClick={() => void login()}
                        >
                            <LogIn size={16} aria-hidden />
                            {t('badgehub.login', 'Login to BadgeHub')}
                        </button>
                    </div>
                ) : myApps === null ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm opacity-70">
                        <Loader2 size={15} className="animate-spin" aria-hidden />
                        {t('badgehub.loading', 'Checking BadgeHub…')}
                    </div>
                ) : myApps.length === 0 ? (
                    <div className="px-3 py-6 text-sm opacity-60">
                        {t('badgehub.no-projects', 'No projects yet. Publish an app from the Apps tab.')}
                    </div>
                ) : (
                    myApps.map((p) => (
                        <div key={p.slug} className="flex items-center gap-3 border-b border-black/10 px-2 py-2">
                            <AppIcon iconUrl={fileUrl(p.slug, 'icon-64x64.png')} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{p.name || p.slug}</div>
                                <div className="truncate font-mono text-[11px] opacity-50">
                                    {p.slug}
                                    {p.version ? ` · v${p.version}` : ''}
                                    {p.published_at
                                        ? ''
                                        : ` · ${t('badgehub.unpublished', 'unpublished draft')}`}
                                </div>
                            </div>
                            <a
                                href={`${BADGEHUB_SITE}/page/project/${p.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex shrink-0 items-center gap-1.5 border-2 border-black bg-transparent px-2.5 py-1.5 text-xs font-semibold shadow-brutal transition-transform hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                                aria-label={t('badgehub.view-on-site', 'Open in BadgeHub')}
                            >
                                <ExternalLink size={13} aria-hidden />
                                {t('badgehub.view-on-site', 'Open in BadgeHub')}
                            </a>
                        </div>
                    ))
                )}
            </div>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-close', 'Close')}
                </SecondaryButton>
            </DialogActions>
        </div>
    )
}

export function useBadgeHubBrowserDialog(): (initialTab?: 'store' | 'my-apps') => Promise<null> {
    const openDialog = useOpenDialog()
    return async (initialTab = 'store') => openDialog<null>((close) => <BadgeHubBrowserDialog close={close} initialTab={initialTab} />, { wide: true })
}
