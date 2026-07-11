import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Boxes,
    CircleArrowDown,
    ExternalLink,
    FolderTree,
    Gauge,
    Info,
    LayoutGrid,
    Package,
    RefreshCw,
    SlidersHorizontal,
    FoldVertical,
    Unplug,
    Upload,
    Usb,
    Bluetooth,
    Link as LinkIcon,
    Wrench,
} from 'lucide-react'
import { useUiStore, type SideMenuTab } from '../../stores/ui'
import { useFileStore } from '../../stores/files'
import { usePackagesStore } from '../../stores/packages'
import { sizeFmt } from '../../domain/utils'
import { refreshFileTree } from '../../services/files.service'
import { useUploadFlow } from './UploadDialog'
import { disconnectDevice } from '../../services/device.service'
import { useConnectionStore } from '../../stores/connection'
import { installPkg, installPkgFromUrl } from '../../services/packages.service'
import { prettifyCurrentFile } from '../../services/format.service'
import { useConfirm, usePrompt } from '../../components/dialogs'
import { FileTree } from './FileTree'
import { AppsPanel } from './AppsPanel'
import { SettingsPanel } from './SettingsPanel'
import { AboutPanel } from './AboutPanel'

const iconTabClass = (active: boolean) =>
    `grid h-9 w-9 place-items-center border-2 border-transparent transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${
        active ? 'bg-tab-active text-tab-active-fg' : ''
    }`

function MenuTabs() {
    const { t } = useTranslation()
    const tab = useUiStore((s) => s.sideMenuTab)
    const setTab = useUiStore((s) => s.setSideMenuTab)
    const loadPkgs = usePackagesStore((s) => s.load)

    const tabs: Array<{ id: SideMenuTab; icon: React.ReactNode; label: string; trailing?: boolean }> = [
        { id: 'apps', icon: <LayoutGrid size={17} aria-hidden />, label: t('apps.title', 'Apps') },
        { id: 'files', icon: <FolderTree size={17} aria-hidden />, label: t('menu.file-mgr', 'File Manager') },
        { id: 'packages', icon: <Boxes size={17} aria-hidden />, label: t('menu.package-mgr', 'Package Manager') },
        { id: 'tools', icon: <Wrench size={17} aria-hidden />, label: t('menu.tools', 'Tools') },
        { id: 'settings', icon: <SlidersHorizontal size={17} aria-hidden />, label: t('menu.settings', 'Settings'), trailing: true },
        { id: 'about', icon: <Info size={17} aria-hidden />, label: t('menu.about', 'About'), trailing: true },
    ]

    return (
        <div className="flex justify-between border-b-2 border-black bg-menu px-1 py-1" role="tablist">
            <div className="flex gap-1">
                {tabs.filter((x) => !x.trailing).map((x) => (
                    <button
                        key={x.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === x.id}
                        title={x.label}
                        aria-label={x.label}
                        data-tour-id={`tour-tab-${x.id}`}
                        className={iconTabClass(tab === x.id)}
                        onClick={() => {
                            setTab(x.id)
                            if (x.id === 'packages') void loadPkgs()
                        }}
                    >
                        {x.icon}
                    </button>
                ))}
            </div>
            <div className="flex gap-1">
                {tabs.filter((x) => x.trailing).map((x) => (
                    <button
                        key={x.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === x.id}
                        title={x.label}
                        aria-label={x.label}
                        className={iconTabClass(tab === x.id)}
                        onClick={() => setTab(x.id)}
                    >
                        {x.icon}
                    </button>
                ))}
            </div>
        </div>
    )
}

function FilesPanel() {
    const { t } = useTranslation()
    const stats = useFileStore((s) => s.stats)
    const collapseAll = useFileStore((s) => s.collapseAll)
    const uploadFlow = useUploadFlow()

    const headBtn = 'p-1 opacity-70 hover:opacity-100'

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-2 py-1.5">
                <span className="font-heading text-sm font-bold uppercase tracking-wide">
                    {t('menu.file-mgr', 'File Manager')}
                </span>
                <span className="flex items-center">
                    <button type="button" className={headBtn} title={t('files.refresh', 'Refresh')} aria-label={t('files.refresh', 'Refresh')} onClick={() => void refreshFileTree()}>
                        <RefreshCw size={14} aria-hidden />
                    </button>
                    <button type="button" className={headBtn} title={t('files.upload', 'Upload files')} aria-label={t('files.upload', 'Upload files')} onClick={() => void uploadFlow()}>
                        <Upload size={14} aria-hidden />
                    </button>
                    <button type="button" className={headBtn} title={t('files.collapse-all', 'Collapse All')} aria-label={t('files.collapse-all', 'Collapse All')} onClick={collapseAll}>
                        <FoldVertical size={14} aria-hidden />
                    </button>
                </span>
            </div>
            <FileTree />
            {stats.size != null && (
                <div className="border-t border-black/20 px-2 py-1 text-xs opacity-70">
                    {t('files.used', 'Used')} {sizeFmt(stats.used, 0)} / {sizeFmt(stats.size, 0)}
                </div>
            )}
        </div>
    )
}

/** Connection status + disconnect footer, shared by Apps and Files tabs. */
function ConnectionFooter() {
    const { t } = useTranslation()
    const connected = useConnectionStore((s) => s.status === 'connected')
    const transportType = useConnectionStore((s) => s.transportType)
    const devInfo = useConnectionStore((s) => s.devInfo)
    const activityTick = useConnectionStore((s) => s.activityTick)
    const [blink, setBlink] = useState(false)

    // Activity blink on the status dot.
    useEffect(() => {
        if (!connected || activityTick === 0) return
        setBlink(true)
        const id = setTimeout(() => setBlink(false), 120)
        return () => clearTimeout(id)
    }, [activityTick, connected])

    if (!connected) return null

    const TransportIcon = transportType === 'ble' ? Bluetooth : transportType === 'ws' ? LinkIcon : Usb

    return (
        <div data-tour-id="tour-connection" className="flex items-center gap-2 border-t border-black/20 p-2">
            {/* Status: dot + transport icon + machine name */}
            <span
                className="flex min-w-0 flex-1 items-center gap-1.5 text-xs"
                title={devInfo ? `${devInfo.machine}\n${devInfo.version}` : undefined}
            >
                <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                        blink ? 'bg-connected-active' : 'bg-connected'
                    }`}
                />
                <TransportIcon size={13} aria-hidden className="shrink-0 opacity-70" />
                <span className="truncate opacity-80">
                    {devInfo?.machine ?? t('app.device-connected', 'Device connected')}
                </span>
            </span>
            <button
                type="button"
                onClick={() => void disconnectDevice()}
                title={t('app.disconnect-device', 'Disconnect device')}
                aria-label={t('app.disconnect-device', 'Disconnect device')}
                className="flex shrink-0 items-center gap-1.5 border-2 border-black bg-transparent px-2 py-1 text-xs font-semibold text-fg transition-colors hover:bg-icon-danger/20 hover:text-icon-danger"
            >
                <Unplug size={13} aria-hidden />
                {t('app.disconnect', 'Disconnect')}
            </button>
        </div>
    )
}

function PackagesPanel() {
    const { t } = useTranslation()
    const indexes = usePackagesStore((s) => s.indexes)
    const loading = usePackagesStore((s) => s.loading)
    const error = usePackagesStore((s) => s.error)

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            <div className="mb-1 font-heading text-sm font-bold uppercase tracking-wide">
                {t('menu.package-mgr', 'Package Manager')}
            </div>
            {loading && <div className="text-sm opacity-70">{t('pkg.loading', 'Loading package index…')}</div>}
            {error && <div className="text-sm text-icon-error">{error}</div>}
            {indexes?.map((idx) => (
                <div key={idx.name}>
                    <div className="title-lines text-xs">{idx.name}</div>
                    {idx.packages.map((pkg) => (
                        <div key={pkg.name} className="group flex items-center justify-between py-0.5 text-sm">
                            <span className={`flex min-w-0 items-center gap-1.5 ${pkg.indented ? 'ps-4' : ''}`}>
                                <Package size={13} className="shrink-0 opacity-70" aria-hidden />
                                <span className="truncate">{pkg.name}</span>
                                {pkg.native && (
                                    <Gauge size={12} className="shrink-0 text-icon-info" aria-hidden>
                                        <title>{t('pkg.native', 'Efficient native module')}</title>
                                    </Gauge>
                                )}
                            </span>
                            <button
                                type="button"
                                className="flex shrink-0 items-center gap-1 opacity-60 hover:opacity-100"
                                title={t('pkg.install', 'Install {{pkg}}', { pkg: pkg.name })}
                                onClick={() => void installPkg(pkg.name)}
                            >
                                <span className="text-xs">{pkg.version}</span>
                                <CircleArrowDown size={13} aria-hidden />
                            </button>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}

function ToolsPanel() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()

    const linkClass = 'flex items-center gap-1.5 py-0.5 text-sm hover:text-fg-highlight'
    const docs: Array<[string, string]> = [
        ['https://docs.micropython.org/en/latest/', 'MicroPython docs'],
        ['https://docs.micropythonos.com/', 'MicroPythonOS docs'],
        ['https://fri3dcamp.github.io/badge_2026/', 'Fri3d Camp 2026 badge'],
    ]

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            <div className="mb-1 font-heading text-sm font-bold uppercase tracking-wide">
                {t('menu.tools', 'Tools')}
            </div>
            <div className="title-lines text-xs">{t('menu.package-mgr', 'package manager')}</div>
            <button type="button" className={linkClass} onClick={() => void installPkgFromUrl({ confirm, prompt })}>
                📦 {t('pkg.install-via-url', 'Install package via link')}
            </button>
            <div className="title-lines text-xs">{t('menu.docs', 'documentation')}</div>
            {docs.map(([href, label]) => (
                <a key={href} href={href} target="_blank" rel="noreferrer" className={linkClass}>
                    <ExternalLink size={13} aria-hidden /> {label}
                </a>
            ))}
            <div className="title-lines text-xs">Python</div>
            <button type="button" className={linkClass} onClick={() => void prettifyCurrentFile()}>
                🎀 {t('files.prettify', 'Prettify current file')}
            </button>
        </div>
    )
}

export function SideMenu() {
    const { t } = useTranslation()
    const tab = useUiStore((s) => s.sideMenuTab)
    const hidden = useUiStore((s) => s.sideMenuHidden)
    const drawerOpen = useUiStore((s) => s.drawerOpen)
    const autoHideDrawer = useUiStore((s) => s.autoHideDrawer)
    const width = 300 // desktop resize handled by SideMenuResizer via CSS var

    // Escape closes the mobile drawer.
    useEffect(() => {
        if (!drawerOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') autoHideDrawer()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [drawerOpen, autoHideDrawer])

    return (
        <>
            {/* Mobile backdrop */}
            <div
                aria-hidden
                onClick={autoHideDrawer}
                className={`fixed inset-0 z-40 bg-black/75 backdrop-blur-sm transition-opacity md:hidden ${
                    drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            />
            <aside
                aria-label={t('menu.side-menu', 'Side menu')}
                style={{ ['--side-w' as string]: `${width}px` }}
                className={`z-50 flex flex-col border-e-2 border-black bg-menu
                    max-md:fixed max-md:inset-y-0 max-md:inset-s-0 max-md:w-3/4 max-md:transition-transform
                    ${drawerOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full max-md:rtl:translate-x-full'}
                    md:w-(--side-menu-width,300px) ${hidden ? 'md:hidden' : ''}`}
            >
                <MenuTabs />
                {tab === 'apps' && <AppsPanel />}
                {tab === 'files' && <FilesPanel />}
                {tab === 'packages' && <PackagesPanel />}
                {tab === 'tools' && <ToolsPanel />}
                {tab === 'settings' && <SettingsPanel />}
                {tab === 'about' && <AboutPanel />}
                {(tab === 'apps' || tab === 'files') && <ConnectionFooter />}
            </aside>
        </>
    )
}
