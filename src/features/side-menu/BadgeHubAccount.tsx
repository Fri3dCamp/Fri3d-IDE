import { useTranslation } from 'react-i18next'
import { CloudUpload, Loader2, LogIn, LogOut, User } from 'lucide-react'
import { useBadgeHubStore } from '../../stores/badgehub'
import { login, logout } from '../../services/badgehub/auth'
import { useBadgeHubBrowserDialog } from './BadgeHubBrowserDialog'

const btnClass =
    'mt-1 flex items-center gap-2 border-2 border-black bg-transparent px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-black/10 dark:hover:bg-white/10'

/** Settings section: BadgeHub login/logout + my projects. */
export function BadgeHubAccount() {
    const { t } = useTranslation()
    const authenticated = useBadgeHubStore((s) => s.authenticated)
    const username = useBadgeHubStore((s) => s.username)
    const badgeHubBrowser = useBadgeHubBrowserDialog()

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
                        onClick={() => void badgeHubBrowser('my-apps')}
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
