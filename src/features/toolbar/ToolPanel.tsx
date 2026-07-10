import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Bluetooth,
    CirclePlay,
    CircleStop,
    Expand,
    Link,
    Menu,
    Save,
} from 'lucide-react'
import { useConnectionStore, type TransportType } from '../../stores/connection'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { connectDevice, runCurrentFile, saveCurrentFile } from '../../services/device.service'
import { launchApp } from '../../services/apps.service'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { useAppsStore, appIdForPath } from '../../stores/apps'
import { Rocket } from 'lucide-react'
import { useConfirm, usePrompt } from '../../components/dialogs'

const isMac = navigator.platform.startsWith('Mac')
const metaKey = isMac ? 'Cmd' : 'Ctrl'

function ToolbarButton({
    title,
    label,
    onClick,
    connected,
    active,
    children,
}: {
    title: string
    label?: string
    onClick: () => void
    connected?: boolean
    active?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={`${
                label
                    ? 'flex h-9 items-center gap-1.5 px-2.5'
                    : 'grid h-9 w-9 place-items-center'
            } border-2 border-black bg-transparent text-fg transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${
                connected
                    ? active
                        ? 'border-connected-active text-connected-active'
                        : 'border-connected text-connected'
                    : ''
            }`}
        >
            {children}
            {label && <span className="hidden text-sm font-semibold sm:inline">{label}</span>}
        </button>
    )
}

function ConnectButton({ type, title, children }: { type: TransportType; title: string; children: React.ReactNode }) {
    const confirm = useConfirm()
    const prompt = usePrompt()
    const status = useConnectionStore((s) => s.status)
    const transportType = useConnectionStore((s) => s.transportType)
    const activityTick = useConnectionStore((s) => s.activityTick)
    const [blink, setBlink] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isThis = transportType === type && status === 'connected'

    // Brief colour flash on TX/RX activity.
    useEffect(() => {
        if (!isThis || activityTick === 0) return
        setBlink(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setBlink(false), 120)
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [activityTick, isThis])

    return (
        <ToolbarButton
            title={title}
            connected={isThis}
            active={blink}
            onClick={() => void connectDevice(type, { confirm, prompt })}
        >
            {children}
        </ToolbarButton>
    )
}

/** Visible while app context active: selected app in Apps tab OR active /apps/<id>/ file. */
function LaunchAppButton() {
    const { t } = useTranslation()
    const activeAppId = useEditorTabsStore((s) => {
        const tab = s.tabs.find((x) => x.id === s.activeId)
        return tab ? appIdForPath(tab.fn) : null
    })
    const selectedAppId = useAppsStore((s) => s.selected)
    const launching = useAppsStore((s) => s.launching !== null)
    const connected = useConnectionStore((s) => s.status === 'connected')

    const targetAppId = selectedAppId ?? activeAppId
    if (!targetAppId || !connected) return null

    return (
        <ToolbarButton
            title={t('apps.launch', 'Launch {{app}}', { app: targetAppId })}
            label={t('apps.launch-app', 'Launch app')}
            onClick={() => {
                if (!launching) void launchApp(targetAppId)
            }}
        >
            <Rocket size={18} aria-hidden className={launching ? 'opacity-40' : 'text-icon-success'} />
        </ToolbarButton>
    )
}

export function ToolPanel() {
    const { t } = useTranslation()
    const prompt = usePrompt()
    const confirm = useConfirm()
    const toggleSideMenu = useUiStore((s) => s.toggleSideMenu)
    const isRunning = useUiStore((s) => s.isRunning)
    const advancedMode = useSettingsStore((s) => s.advancedMode)
    const [fullscreenOk] = useState(() => document.fullscreenEnabled)

    return (
        <header className="flex items-center justify-between gap-2 border-b-3 border-toolbar-border bg-toolbar px-2 py-1.5">
            <div className="flex items-center gap-2">
                <ToolbarButton title={t('menu.toggle', 'Toggle menu')} onClick={toggleSideMenu}>
                    <Menu size={18} aria-hidden />
                </ToolbarButton>
                <span className="mx-1 select-none font-heading text-lg font-black tracking-tight">
                    Fri3d-IDE
                </span>
                <ToolbarButton
                    title={`${t('tool.save', 'Save File')} [${metaKey}+S]`}
                    label={t('tool.save-short', 'Save')}
                    onClick={() => void saveCurrentFile({ confirm, prompt })}
                >
                    <Save size={18} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                    title={`${t('tool.run', 'Run File')} [F5]`}
                    label={isRunning ? t('tool.stop', 'Stop') : t('tool.run-short', 'Run')}
                    onClick={() => void runCurrentFile()}
                >
                    {isRunning ? (
                        <CircleStop size={18} aria-hidden className="text-icon-danger" />
                    ) : (
                        <CirclePlay size={18} aria-hidden />
                    )}
                </ToolbarButton>
                <LaunchAppButton />
            </div>

            <div className="flex items-center gap-2">
                {advancedMode && (
                    <>
                        <ConnectButton type="ws" title={t('tool.conn.ws', 'Connect WebREPL')}>
                            <Link size={18} aria-hidden />
                        </ConnectButton>
                        <ConnectButton type="ble" title={t('tool.conn.ble', 'Connect Bluetooth')}>
                            <Bluetooth size={18} aria-hidden />
                        </ConnectButton>
                    </>
                )}
                {fullscreenOk && (
                    <ToolbarButton
                        title={t('tool.fullscreen', 'Full Screen')}
                        onClick={() => {
                            if (document.fullscreenElement) void document.exitFullscreen()
                            else void document.documentElement.requestFullscreen().catch(() => undefined)
                        }}
                    >
                        <Expand size={18} aria-hidden />
                    </ToolbarButton>
                )}
            </div>
        </header>
    )
}
