import { toast } from 'sonner'
import { i18next } from '../i18n'
import {
    WebSerial,
    WebBluetooth,
    WebSocketREPL,
    WebRTCTransport,
    type Transport,
} from '../domain/transports'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { MpRawMode } from '../domain/rawmode'
import { ConnectionUID } from '../domain/connection_uid'
import { iOS, sleep, splitPath } from '../domain/utils'
import { rawInstallPkg } from '../domain/package_mgr'
import { parseStackTrace, validatePython } from '../domain/python_utils'
import { useConnectionStore, type DeviceInfo, type TransportType } from '../stores/connection'
import { useFileStore, type FsNode } from '../stores/files'
import { useAppsStore } from '../stores/apps'
import { useEditorTabsStore } from '../stores/editorTabs'
import { useSettingsStore } from '../stores/settings'
import { useUiStore, withLoader } from '../stores/ui'
import { openFileContent } from './files.service'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

/* Session-remembered WebREPL defaults (not persisted, like legacy). */
let defaultWsURL = 'ws://192.168.1.123:8266'
let defaultWsPass = ''

/** Set by ?install= URL param; consumed on next connect. */
let pendingInstallUrl: string | null = null
export function setPendingInstall(url: string): void {
    pendingInstallUrl = url
}

/** Preset connection URL from ?wss= / ?rtc= / ?vm= params. */
let presetUrl: string | null = null
export function setPresetUrl(url: string): void {
    presetUrl = url
}

export interface ConnectUi {
    confirm(message: string): Promise<boolean>
    prompt(message: string, options?: { value?: string; placeholder?: string; password?: boolean }): Promise<string | null>
}

async function prepareWsPort(ui: ConnectUi): Promise<Transport | null> {
    let url: string
    if (presetUrl) {
        url = presetUrl
        defaultWsURL = url
        presetUrl = null
    } else {
        const answer = await ui.prompt(
            t('app.prompt-webrepl-url', 'Enter WebREPL device address.\nSupported protocols: ws wss rtc'),
            { value: defaultWsURL },
        )
        if (!answer) return null
        url = answer
        defaultWsURL = url

        if (url.startsWith('http://')) url = url.slice(7)
        if (url.startsWith('https://')) url = url.slice(8)
        if (!url.includes('://')) url = 'ws://' + url

        if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
            // Mixed content is blocked; navigate to the device page instead.
            window.location.assign(url.replace('ws://', 'http://'))
            return null
        }
    }

    if (url.startsWith('ws://') || url.startsWith('wss://')) {
        // Blynk cloud terminal-stream URLs get rewritten to the msgforwarder.
        try {
            const info = new URL(url)
            if (info.host.includes('blynk') && info.pathname.startsWith('/stream/')) {
                const [, , token, ds] = info.pathname.split('/')
                if (/^[A-Za-z0-9\-_]{32}$/.test(token)) {
                    url = `wss://${info.host}:443/msgforwarder?deviceToken=${token}&dataStreamName=${ds}`
                }
            }
        } catch {
            /* keep url as-is */
        }
        const port = new WebSocketREPL(url)
        port.onPasswordRequest(async () => {
            const pass = await ui.prompt(t('app.prompt-webrepl-pass', 'WebREPL password:'), {
                value: defaultWsPass,
                password: true,
            })
            if (pass == null) return
            if (pass.length < 4) {
                toast.error(t('app.err-pwd-short', 'Password is too short'))
                return
            }
            defaultWsPass = pass
            return pass
        })
        return port
    }
    if (url.startsWith('rtc://')) {
        const id = ConnectionUID.parse(url.replace('rtc://', ''))
        return new WebRTCTransport(id.value())
    }
    toast.error(t('app.err-link-type', 'Unknown link type'))
    return null
}

function prepareBlePort(): Transport | null {
    if (iOS) {
        toast.error(t('app.err-ble-ios', 'WebBluetooth is not available on iOS'))
        return null
    }
    if (!window.isSecureContext) {
        toast.error(t('app.err-ble-insecure', 'WebBluetooth cannot be accessed with unsecure connection'))
        return null
    }
    if (typeof navigator.bluetooth === 'undefined') {
        toast.error(t('app.err-ble-unsupported', 'WebBluetooth is not supported'), {
            description: t('app.err-try-browsers', 'Try Chrome, Edge, Opera, Brave'),
        })
        return null
    }
    return new WebBluetooth()
}

function prepareUsbPort(): Transport | null {
    if (iOS) {
        toast.error(t('app.err-serial-ios', 'WebSerial is not available on iOS'))
        return null
    }
    if (!window.isSecureContext) {
        toast.error(t('app.err-serial-insecure', 'WebSerial cannot be accessed with unsecure connection'))
        return null
    }
    const nav = navigator as Navigator & { usb?: unknown }
    if (typeof navigator.serial === 'undefined' && typeof nav.usb === 'undefined') {
        toast.error(t('app.err-serial-unsupported', 'WebSerial and WebUSB are not supported'), {
            description: t('app.err-try-browsers', 'Try Chrome, Edge, Opera, Brave'),
        })
        return null
    }
    if (typeof navigator.serial === 'undefined' || useSettingsStore.getState().forceSerialPolyfill) {
        return new WebSerial(webSerialPolyfill)
    }
    return new WebSerial()
}

export async function connectDevice(type: TransportType, ui: ConnectUi): Promise<void> {
    const conn = useConnectionStore.getState()

    if (conn.port) {
        if (!(await ui.confirm(t('app.confirm-disconnect', 'Disconnect current device?')))) return
        await disconnectDevice()
        return
    }

    let port: Transport | null = null
    if (type === 'ws') port = await prepareWsPort(ui)
    else if (type === 'ble') port = prepareBlePort()
    else port = prepareUsbPort()
    if (!port) return

    try {
        await port.requestAccess()
    } catch {
        return // user cancelled the picker
    }

    conn.setConnecting(type)
    const ok = await withLoader(t('app.connecting', 'Connecting…'), async () => {
        try {
            await port.connect()
            return true
        } catch (err) {
            toast.error(t('app.cannot-connect', 'Cannot connect'), { description: String(err) })
            return false
        }
    })
    if (!ok) {
        useConnectionStore.getState().setDisconnected()
        return
    }

    port.onActivity(() => useConnectionStore.getState().bumpActivity())
    port.onReceive((data: string) => terminalWrite(data))
    port.onDisconnect(() => {
        toast.warning(t('app.device-disconnected', 'Device disconnected'))
        useConnectionStore.getState().setDisconnected()
        useFileStore.getState().reset()
        useAppsStore.getState().reset()
        useUiStore.getState().setRunning(false)
    })

    useConnectionStore.getState().setConnected(port, type)

    if (useSettingsStore.getState().interruptDevice) {
        await readDeviceOnConnect(port)
        await port.write('\x02') // print friendly REPL banner
    } else {
        toast.success(t('app.device-connected', 'Device connected'))
    }
}

async function readDeviceOnConnect(port: Transport): Promise<void> {
    const loader = useUiStore.getState().showLoader(t('app.reading-device', 'Reading device…'))
    useFileStore.getState().setLoading(t('files.loading', 'Loading files…'))
    let raw: MpRawMode | null = null
    try {
        raw = await MpRawMode.begin(port)
        const devInfo = (await raw.getDeviceInfo()) as DeviceInfo
        useConnectionStore.getState().setDevInfo(devInfo)
        toast.success(t('app.device-connected', 'Device connected'), {
            description: `${devInfo.machine}\n${devInfo.version}`,
        })

        if (pendingInstallUrl) {
            loader.update(t('pkg.installing', 'Installing {{pkg}}…', { pkg: pendingInstallUrl }))
            await rawInstallPkg(raw, pendingInstallUrl, {
                dev: devInfo,
                prefer_source: useSettingsStore.getState().preferSource,
            })
            pendingInstallUrl = null
        }

        await refreshTreeVia(raw)

        const tree = useFileStore.getState().tree ?? []
        const flat = flatten(tree)
        const boot = flat.find((n) => n.path === '/main.py') ?? flat.find((n) => n.path === '/code.py')
        if (boot) await openFileContent(raw, boot.path)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Timeout')) {
            toast.error(t('app.not-responding', 'Device is not responding'), {
                description:
                    "Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected",
            })
        } else {
            toast.error(t('app.err-read-board', 'Error reading board info'), { description: message })
        }
    } finally {
        if (raw) await raw.end().catch(() => undefined)
        loader.hide()
        useFileStore.getState().setLoading(null)
    }
}

function flatten(nodes: FsNode[], out: Array<{ path: string }> = []): Array<{ path: string }> {
    for (const n of nodes) {
        if ('content' in n) flatten(n.content, out)
        else out.push({ path: n.path })
    }
    return out
}

export async function disconnectDevice(): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.warn(err)
        }
    }
    useConnectionStore.getState().setDisconnected()
    useFileStore.getState().reset()
    useAppsStore.getState().reset()
    useUiStore.getState().setRunning(false)
}

/** Refresh top level of the file tree inside an existing raw-mode session.
 *  Children load lazily when folders are opened (see loadFolder). */
export async function refreshTreeVia(raw: MpRawMode): Promise<void> {
    let stats: [number | null, number | null, number | null] = [null, null, null]
    try {
        const rawStats = (await raw.getFsStats()) as Array<string | number>
        stats = [Number(rawStats[0]) || null, Number(rawStats[1]) || null, Number(rawStats[2]) || null]
    } catch (err) {
        console.warn(err)
    }
    const tree = (await raw.listDir('/')) as FsNode[]
    useFileStore.getState().setTree(tree, stats)
    // Re-hydrate children of folders the user had open, so a refresh doesn't
    // collapse their contents into unloaded stubs.
    const open = [...useFileStore.getState().openFolders].sort()
    for (const path of open) {
        try {
            useFileStore.getState().setFolderChildren(path, (await raw.listDir(path)) as FsNode[])
        } catch {
            /* folder may have been deleted */
        }
    }
}

/** Run a task inside a raw-REPL session on the current port. */
export async function withRawMode<T>(task: (raw: MpRawMode) => Promise<T>): Promise<T | undefined> {
    const { port } = useConnectionStore.getState()
    if (!port) return undefined
    const raw = await MpRawMode.begin(port)
    try {
        return await task(raw)
    } finally {
        await raw.end().catch(() => undefined)
    }
}

/* ------------------------------------------------------------------ */
/* Terminal wiring                                                     */
/* ------------------------------------------------------------------ */

type TerminalSink = (data: string) => void
let terminalSink: TerminalSink | null = null
let terminalClear: (() => void) | null = null
const terminalBacklog: string[] = []
const terminalLog: string[] = []

export function registerTerminalSink(sink: TerminalSink | null, clear?: () => void): void {
    terminalSink = sink
    terminalClear = clear ?? null
    if (sink) {
        for (const chunk of terminalBacklog) sink(chunk)
        terminalBacklog.length = 0
    }
}

export function terminalWrite(data: string): void {
    if (terminalSink) terminalSink(data)
    else terminalBacklog.push(data)

    for (const line of String(data).replace(/\r/g, '').split('\n')) {
        if (line === '' && terminalLog.length === 0) continue
        terminalLog.push(line)
    }
    while (terminalLog.length > 500) terminalLog.shift()
}

export function clearTerminal(): void {
    terminalClear?.()
    terminalLog.length = 0
}

/* ------------------------------------------------------------------ */
/* Run / reboot                                                        */
/* ------------------------------------------------------------------ */

export async function runCurrentFile(): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const ui = useUiStore.getState()

    if (ui.isRunning) {
        await port.write('\r\x03\x03') // double Ctrl-C: interrupt
        return
    }

    const tab = useEditorTabsStore.getState().activeTab()
    if (!tab) return
    if (!tab.fn.endsWith('.py')) {
        toast.error(t('files.not-executable', '{{fn}} file is not executable', { fn: tab.fn }))
        return
    }
    const code = typeof tab.content === 'string' ? tab.content : ''

    terminalWrite('\r\n')
    const raw = await MpRawMode.begin(port)
    try {
        ui.setRunning(true)
        await sleep(10)
        await raw.exec(code, -1 as unknown as number, true)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!message.includes('KeyboardInterrupt')) {
            const backtrace = parseStackTrace(message)
            if (backtrace) {
                toast.error(backtrace.type || 'Error', { description: backtrace.summary })
            } else {
                toast.error('Error', { description: message })
            }
        }
    } finally {
        ;(port as Transport & { emit?: boolean }).emit = false
        await raw.end().catch(() => undefined)
        useUiStore.getState().setRunning(false)
        terminalWrite('\r\n>>> ')
    }
}

export async function reboot(mode: 'soft' | 'hard'): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const release = await port.mutex.acquire()
    try {
        if (mode === 'soft') {
            await port.write('\r\x03\x03\x04')
        } else {
            await execReplNoFollow(port, 'import machine; machine.reset()')
        }
    } finally {
        release()
    }
}

async function execReplNoFollow(port: Transport, cmd: string): Promise<void> {
    await port.write('\r\x03\x03')
    await port.write(cmd + '\r\n')
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

export async function saveCurrentFile(ui: ConnectUi): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const tabsStore = useEditorTabsStore.getState()
    const tab = tabsStore.activeTab()
    if (!tab || typeof tab.content !== 'string') return
    if (tab.readOnly) {
        toast.warning(t('files.read-only', 'File is read only'))
        return
    }

    let fn = tab.fn
    if (fn === 'Untitled') {
        const name = await ui.prompt(t('files.prompt-new-name', 'Please enter the file name:'))
        if (!name) return
        fn = name.startsWith('/') ? name : '/' + name
        tabsStore.rename(tab.id, fn)
    }

    let content = tab.content
    const settings = useSettingsStore.getState()

    await withLoader(t('files.saving', 'Saving {{fn}}…', { fn }), async (loader) => {
        if (fn.endsWith('.json') && settings.expandMinifyJson) {
            try {
                content = JSON.stringify(JSON.parse(content))
            } catch {
                toast.error(t('files.json-malformed', 'JSON is malformed'))
                return
            }
        } else if (fn.endsWith('.py')) {
            loader.update(t('files.validating', 'Validating {{fn}}…', { fn }))
            const backtrace = await validatePython(fn, content)
            if (backtrace) toast.warning(backtrace.type, { description: backtrace.summary })
        }

        loader.update(t('files.saving', 'Saving {{fn}}…', { fn }))
        await withRawMode(async (raw) => {
            await raw.writeFile(fn, content)
            await refreshTreeVia(raw)
        })

        toast.success(t('files.saved', 'File Saved'))
        tabsStore.markDirty(tab.id, false)
        useFileStore.getState().clearChanged(fn)
    })
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

/** Upload files to their full target `paths` (parallel arrays).
 *  Called by the interactive upload dialog (UploadDialog.tsx). */
export async function uploadFilesToPaths(files: File[], paths: string[]): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port || !files.length) return

    await withLoader(
        t('files.uploading-many', 'Uploading {{n}} files…', { n: files.length }),
        async (loader) => {
            await withRawMode(async (raw) => {
                for (let i = 0; i < files.length; i++) {
                    const target = paths[i]
                    const [dirname] = splitPath(target)
                    if (dirname && dirname !== '/') await raw.makePath(dirname)
                    loader.update(
                        t('files.uploading-one', 'Uploading {{name}} ({{index}}/{{total}})…', {
                            name: target,
                            index: i + 1,
                            total: files.length,
                        }),
                    )
                    await raw.writeFile(target, new Uint8Array(await files[i].arrayBuffer()))
                }
                await refreshTreeVia(raw)
            })
        },
    )
    toast.success(t('files.upload-done', 'Uploaded {{n}} file(s)', { n: files.length }))
}
