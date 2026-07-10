import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import './index.css'
import { App } from './App'
import { initI18n } from './i18n'
import { initTheme } from './services/theme'
import { setReportHandler } from './domain/utils'
import { setPendingInstall, setPresetUrl, connectDevice } from './services/device.service'
import { ConnectionUID } from './domain/connection_uid'
import { sleep } from './domain/utils'

async function bootstrap(): Promise<void> {
    await initI18n()
    initTheme()

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
