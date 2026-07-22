import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    CirclePlay,
    FileCode2,
    Loader2,
    PackagePlus,
    RefreshCw,
    Search,
    Store,
    TriangleAlert,
    Upload,
} from 'lucide-react'
import { useAppsStore, type AppInfo } from '../../stores/apps'
import { launchApp, refreshApps } from '../../services/apps.service'
import { useCreateAppDialog } from './AppBrowser'
import { useInstallMpkDialog } from './MpkInstallerDialog'
import { useBadgeHubBrowserDialog } from './BadgeHubBrowserDialog'
import { appPanelHeadButton, appPanelIconHint } from './appPanelStyles'
import { searchApps } from './appSearch'

function AppRow({ app }: { app: AppInfo }) {
    const { t } = useTranslation()
    const launching = useAppsStore((state) => state.launching === app.fullname)
    const anyLaunching = useAppsStore((state) => state.launching !== null)
    const setSelected = useAppsStore((state) => state.setSelected)

    return (
        <div className="group flex items-center gap-1.5 px-2 py-0.5 text-sm hover:bg-black/10 dark:hover:bg-white/10">
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={`${app.fullname}${app.short_description ? `\n${app.short_description}` : ''}`}
                onClick={() => setSelected(app.fullname)}
            >
                {app.broken ? (
                    <TriangleAlert size={14} className="shrink-0 text-icon-warning" aria-hidden />
                ) : (
                    <FileCode2 size={14} className="shrink-0 opacity-80" aria-hidden />
                )}
                <span className="truncate">{app.name}</span>
                {app.version ? <span className="shrink-0 text-xs opacity-50">{app.version}</span> : null}
            </button>
            {!app.broken ? (
                <button
                    type="button"
                    disabled={anyLaunching}
                    aria-label={t('apps.launch', 'Launch {{app}}', { app: app.name })}
                    className="group/icon invisible relative shrink-0 p-0.5 text-icon-success opacity-80 hover:opacity-100 group-hover:visible disabled:opacity-40"
                    onClick={() => void launchApp(app.fullname)}
                >
                    {launching ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <CirclePlay size={14} aria-hidden />
                    )}
                    <span aria-hidden className={appPanelIconHint}>
                        {t('apps.launch', 'Launch {{app}}', { app: app.name })}
                    </span>
                </button>
            ) : null}
        </div>
    )
}

export function AppList() {
    const { t } = useTranslation()
    const apps = useAppsStore((state) => state.apps)
    const scanning = useAppsStore((state) => state.scanning)
    const [search, setSearch] = useState('')
    const createAppDialog = useCreateAppDialog()
    const installMpkDialog = useInstallMpkDialog()
    const badgeHubBrowser = useBadgeHubBrowserDialog()

    const filteredApps = useMemo(() => {
        if (!apps) return []
        return searchApps(apps, search)
    }, [apps, search])

    const hasSearch = search.trim().length > 0

    return (
        <>
            <div className="px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                    <span className="font-heading text-sm font-bold uppercase tracking-wide">
                        {t('apps.title', 'Apps')}
                    </span>
                    <button
                        type="button"
                        className={`${appPanelHeadButton} group/icon relative`}
                        aria-label={t('apps.refresh-list', 'Refresh app list')}
                        onClick={() => void refreshApps()}
                    >
                        {scanning ? (
                            <Loader2 size={15} className="animate-spin" aria-hidden />
                        ) : (
                            <RefreshCw size={15} aria-hidden />
                        )}
                        <span aria-hidden className={appPanelIconHint}>
                            {t('apps.refresh-list', 'Refresh app list')}
                        </span>
                    </button>
                </div>
                <div className="relative">
                    <Search
                        size={14}
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 opacity-60"
                        aria-hidden
                    />
                    <input
                        type="text"
                        className="w-full border-2 border-black bg-edit py-1 pl-7 pr-2 text-sm outline-none focus:border-accent"
                        placeholder={t('apps.search', 'Search apps…')}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>
            <div data-tour-id="tour-app-list" className="min-h-0 flex-1 overflow-y-auto pb-1">
                {filteredApps.map((app) => (
                    <AppRow key={app.fullname} app={app} />
                ))}
                {apps !== null && apps.length === 0 && !scanning ? (
                    <div className="px-3 pb-1 text-sm opacity-60">{t('apps.none', 'No apps installed')}</div>
                ) : null}
                {apps !== null && apps.length > 0 && filteredApps.length === 0 && hasSearch && !scanning ? (
                    <div className="px-3 pb-1 text-sm opacity-60">
                        {t('apps.no-match', 'No apps match your search')}
                    </div>
                ) : null}
                {apps === null && scanning ? (
                    <div className="flex items-center gap-2 px-3 py-1 text-sm opacity-70">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        {t('apps.scanning', 'Scanning apps…')}
                    </div>
                ) : null}
            </div>
            <div className="border-t border-black/20 px-2 py-2">
                <div className="grid grid-cols-1 gap-2">
                    <button
                        type="button"
                        data-tour-id="tour-create-app"
                        className="flex w-full items-center justify-center gap-2 border-2 border-black bg-(--fri3d-purple) px-3 py-2 font-semibold text-white shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        aria-label={t('apps.create-title', 'Create New App')}
                        onClick={() => void createAppDialog()}
                    >
                        <PackagePlus size={16} aria-hidden />
                        {t('apps.create-title', 'Create New App')}
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 border-2 border-black bg-tab-active px-3 py-2 font-semibold text-tab-active-fg shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        aria-label={t('apps.install-mpk-title', 'Install MPK App')}
                        onClick={() => void installMpkDialog()}
                    >
                        <Upload size={16} aria-hidden />
                        {t('apps.install-mpk', 'Install MPK')}
                    </button>
                    <button
                        type="button"
                        data-tour-id="tour-badgehub"
                        className="flex w-full items-center justify-center gap-2 border-2 border-black bg-edit px-3 py-2 font-semibold text-fg shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        aria-label={t('badgehub.browse-title', 'BadgeHub App Store')}
                        onClick={() => void badgeHubBrowser()}
                    >
                        <Store size={16} aria-hidden />
                        {t('badgehub.browse', 'Browse BadgeHub')}
                    </button>
                </div>
            </div>
        </>
    )
}
