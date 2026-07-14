import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudUpload, ExternalLink, Loader2, LogIn, LogOut, User } from 'lucide-react'
import { toast } from 'sonner'
import { useBadgeHubStore } from '../../stores/badgehub'
import { login, logout } from '../../services/badgehub/auth'
import { getUserDrafts, type ProjectSummary } from '../../services/badgehub/api'
import { BADGEHUB_SITE } from '../../services/badgehub/config'
import { useOpenDialog, DialogActions, SecondaryButton } from '../../components/dialogs'

const btnClass =
    'mt-1 flex items-center gap-2 border-2 border-black bg-transparent px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-black/10 dark:hover:bg-white/10'

function MyProjectsDialog({ close }: { close: (r: null) => void }) {
    const { t } = useTranslation()
    const userId = useBadgeHubStore((s) => s.userId)
    const [projects, setProjects] = useState<ProjectSummary[] | null>(null)

    useEffect(() => {
        if (!userId) return
        void getUserDrafts(userId)
            .then(setProjects)
            .catch((err) => {
                toast.error(t('badgehub.load-failed', 'Could not load BadgeHub project info'), {
                    description: String(err),
                })
                close(null)
            })
    }, [userId, close, t])

    return (
        <div>
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <CloudUpload size={18} aria-hidden />
                {t('badgehub.my-projects', 'My BadgeHub projects')}
            </div>
            <div className="max-h-[50vh] min-h-24 overflow-y-auto border-2 border-black/20">
                {projects === null ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm opacity-70">
                        <Loader2 size={15} className="animate-spin" aria-hidden />
                        {t('badgehub.loading', 'Checking BadgeHub…')}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="px-3 py-6 text-sm opacity-60">
                        {t('badgehub.no-projects', 'No projects yet. Publish an app from the Apps tab.')}
                    </div>
                ) : (
                    projects.map((p) => (
                        <div key={p.slug} className="flex items-center gap-2 border-b border-black/10 px-3 py-2">
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
                                className="shrink-0 p-1 opacity-70 hover:opacity-100"
                                aria-label={t('badgehub.view-on-site', 'View on BadgeHub')}
                            >
                                <ExternalLink size={14} aria-hidden />
                            </a>
                        </div>
                    ))
                )}
            </div>
            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-close', 'Close')}
                </SecondaryButton>
            </DialogActions>
        </div>
    )
}

/** Settings section: BadgeHub login/logout + my projects. */
export function BadgeHubAccount() {
    const { t } = useTranslation()
    const authenticated = useBadgeHubStore((s) => s.authenticated)
    const username = useBadgeHubStore((s) => s.username)
    const openDialog = useOpenDialog()

    return (
        <>
            <div className="title-lines text-xs">{t('badgehub.section', 'badgehub')}</div>
            {authenticated === null ? (
                <div className="flex items-center gap-2 py-1 text-sm opacity-60">
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    {t('badgehub.loading', 'Checking BadgeHub…')}
                </div>
            ) : authenticated ? (
                <>
                    <div className="flex items-center gap-2 py-1 text-sm">
                        <User size={14} aria-hidden className="opacity-70" />
                        <span className="truncate">{username ?? t('badgehub.logged-in', 'Logged in')}</span>
                    </div>
                    <button
                        type="button"
                        className={btnClass}
                        onClick={() => void openDialog<null>((close) => <MyProjectsDialog close={close} />)}
                    >
                        <CloudUpload size={15} aria-hidden />
                        {t('badgehub.my-projects', 'My BadgeHub projects')}
                    </button>
                    <button type="button" className={btnClass} onClick={() => void logout()}>
                        <LogOut size={15} aria-hidden />
                        {t('badgehub.logout', 'Log out')}
                    </button>
                </>
            ) : (
                <button type="button" className={btnClass} onClick={() => void login()}>
                    <LogIn size={15} aria-hidden />
                    {t('badgehub.login', 'Login to BadgeHub')}
                </button>
            )}
        </>
    )
}
