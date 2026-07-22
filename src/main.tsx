import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { initI18n } from './i18n'
import { initTheme } from './services/theme'
import { setReportHandler } from './domain/utils'
import { setPendingInstall, setPresetUrl, connectDevice } from './services/device.service'
import { ConnectionUID } from './domain/connection_uid'
import { sleep } from './domain/utils'
import { hasOrphanBadgeWindow } from './domain/virtualBadge'
import { useEditorTabsStore } from './stores/editorTabs'
import { useFileStore } from './stores/files'

async function bootstrap(): Promise<void> {
    await initI18n()
    initTheme()
    initPwa()

    // Domain errors → toasts.
    setReportHandler((title, err) => {
        console.error(title, err)
        toast.error(title, { description: err.message })
    })

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <App />
        </StrictMode>,
    )

    handleUrlParams()

    // Warn before leaving the page (close/reload/redirect) with unsaved edits.
    window.addEventListener('beforeunload', (e) => {
        const dirtyTabs = useEditorTabsStore
            .getState()
            .tabs.some((t) => t.dirty && !(t.fn === 'Untitled' && !t.content))
        const changedFiles = useFileStore.getState().changedPaths.size > 0
        if (dirtyTabs || changedFiles) {
            // preventDefault() is the standard trigger; modern Chrome/Firefox/Safari
            // all honor it (legacy returnValue assignment is deprecated).
            e.preventDefault()
        }
    })
}

function initPwa(): void {
    const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
            toast.info('Update available', {
                description: 'A new version is ready. Reload to update now.',
                duration: 12000,
                action: {
                    label: 'Reload',
                    onClick: () => {
                        void updateSW(true)
                    },
                },
            })
        },
        onOfflineReady() {
            toast.success('Offline ready', {
                description: 'This app now works with cached assets while offline.',
            })
        },
        onRegisterError(error) {
            console.error('Service worker registration failed', error)
        },
    })

    window.addEventListener('offline', () => {
        toast.warning('You are offline', {
            description: 'Some network-dependent actions may be unavailable.',
        })
    })

    window.addEventListener('online', () => {
        toast.success('Back online')
    })
}

function handleUrlParams(): void {
    const params = new URLSearchParams(window.location.search)

    const install = params.get('install')
    if (install) setPendingInstall(install)

    let preset: string | null = null
    const wss = params.get('wss')
    const rtc = params.get('rtc')
    if (wss) {
        try {
            preset = 'wss://hub.viper-ide.org/relay/' + ConnectionUID.parse(wss).value()
        } catch (err) {
            toast.error('Cannot connect', { description: String(err) })
        }
    } else if (rtc) {
        try {
            preset = 'rtc://' + ConnectionUID.parse(rtc).value()
        } catch (err) {
            toast.error('Cannot connect', { description: String(err) })
        }
    }

    const vm = params.get('vm')
    if (vm !== null) {
        void sleep(100).then(() =>
            connectDevice('vm', {
                confirm: () => Promise.resolve(true),
                prompt: () => Promise.resolve(null),
            }),
        )
        return
    }

    // Popped-out badge window survived an IDE refresh -> reconnect to it
    // automatically (connectDevice re-attaches via BroadcastChannel).
    void hasOrphanBadgeWindow().then((alive) => {
        if (!alive) return
        void connectDevice('vm', {
            confirm: () => Promise.resolve(true),
            prompt: () => Promise.resolve(null),
        })
    })

    if (preset) {
        setPresetUrl(preset)
        void sleep(100).then(() =>
            connectDevice('ws', {
                // Auto-connect path never needs interactive prompts; provide
                // non-interactive fallbacks.
                confirm: () => Promise.resolve(true),
                prompt: () => Promise.resolve(null),
            }),
        )
    }
}

void bootstrap()
