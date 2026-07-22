import { useAppsStore } from '../stores/apps'
import { useConnectionStore } from '../stores/connection'

function displayMode(): string {
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
    return 'browser'
}

function browserSummary(): string {
    const nav = navigator as Navigator & {
        userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string }
    }
    if (nav.userAgentData) {
        const brands = nav.userAgentData.brands?.map(({ brand, version }) => `${brand} ${version}`).join(', ')
        return `${brands || 'unknown'} on ${nav.userAgentData.platform || 'unknown'}`
    }
    const browser = navigator.userAgent.match(/(Firefox|Edg|Chrome|Version)\/([\d.]+)/)
    return `${browser ? `${browser[1]} ${browser[2]}` : 'unknown'} on ${navigator.platform || 'unknown'}`
}

function apiAvailability(): string {
    const nav = navigator as Navigator & { serial?: unknown; bluetooth?: unknown; usb?: unknown }
    return [
        `Web Serial=${typeof nav.serial !== 'undefined'}`,
        `Web Bluetooth=${typeof nav.bluetooth !== 'undefined'}`,
        `WebUSB=${typeof nav.usb !== 'undefined'}`,
        `WebSocket=${typeof WebSocket !== 'undefined'}`,
        `WebRTC=${typeof RTCPeerConnection !== 'undefined'}`,
        `Service Worker=${'serviceWorker' in navigator}`,
    ].join(', ')
}

/** Build a support report without URLs, source, terminal output, or credentials. */
export function createDiagnosticsReport(): string {
    const connection = useConnectionStore.getState()
    const selectedApp = useAppsStore.getState().selected
    const device = connection.devInfo
    const worker = navigator.serviceWorker?.controller?.state ?? 'not controlling'

    return [
        'Fri3d-IDE diagnostics',
        `Version: ${VIPER_IDE_VERSION}`,
        `Commit: ${VIPER_IDE_COMMIT.slice(0, 12)}`,
        `Build: ${new Date(Number(VIPER_IDE_BUILD)).toISOString()}`,
        `Browser: ${browserSummary()}`,
        `Secure context: ${window.isSecureContext}`,
        `Online: ${navigator.onLine}`,
        `PWA mode: ${displayMode()}`,
        `Service worker: ${worker}`,
        `Connection: ${connection.status}`,
        `Transport: ${connection.transportType ?? 'none'}`,
        `Badge model: ${device?.machine ?? 'not detected'}`,
        `Firmware: ${device?.version ?? 'not detected'}`,
        `MicroPython: ${device?.mpy_ver ?? 'not detected'}`,
        `Selected app: ${selectedApp ?? 'none'}`,
        `Browser APIs: ${apiAvailability()}`,
        '',
        'Excluded: source files, terminal output, URLs, tokens, passwords, and account data.',
    ].join('\n')
}
