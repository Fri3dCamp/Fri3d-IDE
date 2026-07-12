/*
 * Virtual badge transport: runs the vendored MicroPythonOS WebAssembly build
 * (public/vbadge/, from https://github.com/MicroPythonOS/MicroPythonOS)
 * inside a same-origin iframe and drives its `_webterm` stdio bridge like a
 * serial device.
 *
 * The web build mirrors all MicroPython stdout to `Module.__webterm.onOutput`
 * and drains input bytes from `Module.__webterm.inq`, speaking the standard
 * MicroPython raw REPL protocol (see scripts/web_port/ in the MPOS repo).
 */

import { Transport } from './transports'

const DEFAULT_PAGE_URL = `${import.meta.env.BASE_URL}vbadge/index.html`

const DEBUG = true
function dbg(dir: string, s: string): void {
    if (!DEBUG) return
    // Printable dump with control chars escaped, so REPL framing is visible.
    const vis = s.replace(/[\x00-\x1f\x7f]/g, (c) => {
        if (c === '\r') return '\\r'
        if (c === '\n') return '\\n\n'
        return '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')
    })
    console.log(`[vbadge ${dir}]`, vis)
}

interface WebTermBridge {
    inq: number[]
    onOutput: ((data: Uint8Array) => void) | null
    push: (data: Uint8Array | number[] | number) => void
}

interface MposWindow extends Window {
    Module?: { __webterm?: WebTermBridge; calledRun?: boolean }
}

/** IDBFS mountpoints double as IndexedDB database names (Emscripten IDBFS). */
const VBADGE_IDB_NAMES = ['/data', '/apps']

/** True while a virtual badge iframe is alive (its IDBFS would recreate /
 *  rewrite the databases we are trying to delete). */
export function isVirtualBadgeRunning(): boolean {
    return document.getElementById('virtual-badge-panel') !== null
}

/** Erase the virtual badge's persistent filesystem (IndexedDB-backed /data
 *  and /apps). Next boot re-seeds bundled apps from the wasm preload. */
export async function resetVirtualBadgeStorage(): Promise<void> {
    if (isVirtualBadgeRunning()) {
        throw new Error('Disconnect the virtual badge first')
    }
    await Promise.all(
        VBADGE_IDB_NAMES.map(
            (name) =>
                new Promise<void>((resolve, reject) => {
                    const req = indexedDB.deleteDatabase(name)
                    req.onsuccess = () => resolve()
                    req.onerror = () => reject(req.error ?? new Error(`Failed to delete ${name}`))
                    // Blocked means some other tab/context holds the DB open.
                    req.onblocked = () => reject(new Error(`${name} is in use (other tab?)`))
                }),
        ),
    )
}

export class VirtualBadgeTransport extends Transport {
    declare pageUrl: string
    declare container: HTMLElement | null
    declare iframe: HTMLIFrameElement | null
    declare decoder: TextDecoder
    declare lastWasCR: boolean

    constructor(pageUrl: string = DEFAULT_PAGE_URL) {
        super()
        this.pageUrl = pageUrl
        this.container = null
        this.iframe = null
        this.decoder = new TextDecoder()
        this.lastWasCR = false
        this.info = { url: pageUrl, virtual: true }
    }

    private badgeWindow(): MposWindow | null {
        return (this.iframe?.contentWindow as MposWindow | null) ?? null
    }

    private bridge(): WebTermBridge | null {
        return this.badgeWindow()?.Module?.__webterm ?? null
    }

    async requestAccess(): Promise<void> {
        // Floating panel hosting the badge screen. Plain DOM (outside React)
        // so the transport owns its lifecycle.
        const container = document.createElement('div')
        container.id = 'virtual-badge-panel'
        Object.assign(container.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: '50',
        } as Partial<CSSStyleDeclaration>)

        // Visible handlebar above the badge (iframe swallows pointer events,
        // so dragging needs an element outside it).
        const bar = document.createElement('div')
        bar.title = 'Drag to move'
        Object.assign(bar.style, {
            width: '120px',
            height: '12px',
            margin: '0 auto 6px',
            borderRadius: '6px',
            background: '#5a2d73',
            border: '2px solid #e8a6a0',
            boxShadow: '0 2px 8px rgba(0,0,0,.4)',
            cursor: 'move',
            userSelect: 'none',
        } as Partial<CSSStyleDeclaration>)
        container.appendChild(bar)

        // Simple drag support.
        let drag: { x: number; y: number; r: number; b: number } | null = null
        bar.addEventListener('pointerdown', (e) => {
            const rect = container.getBoundingClientRect()
            drag = {
                x: e.clientX,
                y: e.clientY,
                r: window.innerWidth - rect.right,
                b: window.innerHeight - rect.bottom,
            }
            bar.setPointerCapture(e.pointerId)
        })
        bar.addEventListener('pointermove', (e) => {
            if (!drag) return
            container.style.right = `${drag.r - (e.clientX - drag.x)}px`
            container.style.bottom = `${drag.b - (e.clientY - drag.y)}px`
        })
        bar.addEventListener('pointerup', () => (drag = null))

        const iframe = document.createElement('iframe')
        iframe.title = 'MicroPythonOS virtual badge'
        iframe.src = this.pageUrl
        iframe.setAttribute('allowtransparency', 'true')
        Object.assign(iframe.style, {
            width: '640px',
            height: '360px',
            border: 'none',
            display: 'block',
            background: 'transparent',
            colorScheme: 'normal',
        } as Partial<CSSStyleDeclaration>)
        container.appendChild(iframe)

        document.body.appendChild(container)
        this.container = container
        this.iframe = iframe

        await new Promise<void>((resolve, reject) => {
            iframe.addEventListener(
                'load',
                () => {
                    // Shrink-wrap the iframe to the badge element (same-origin)
                    // so no dead transparent area hangs below it.
                    const badge = iframe.contentDocument?.getElementById('badge')
                    if (badge) {
                        const fit = () => {
                            iframe.style.width = `${badge.offsetWidth + 4}px`
                            iframe.style.height = `${badge.offsetHeight + 4}px`
                        }
                        fit()
                        new ResizeObserver(fit).observe(badge)
                    }
                    resolve()
                },
                { once: true },
            )
            iframe.addEventListener('error', () => reject(new Error('Failed to load virtual badge')), {
                once: true,
            })
        })
    }

    async connect(): Promise<void> {
        // Wait for the page script to create Module.__webterm (synchronous in
        // the page, so this resolves as soon as the document is parsed), then
        // attach output forwarding. Input bytes queue in `inq` until the
        // MicroPython side (aiorepl) starts draining them.
        const deadline = Date.now() + 10000
        let bridge = this.bridge()
        while (!bridge) {
            if (Date.now() > deadline) {
                this.teardown()
                throw new Error('Virtual badge bridge not available')
            }
            await new Promise((r) => setTimeout(r, 50))
            bridge = this.bridge()
        }

        let sawOutput = false
        bridge.onOutput = (data: Uint8Array) => {
            sawOutput = true
            const norm = this.normalizeEol(this.decoder.decode(data, { stream: true }))
            dbg('rx', norm)
            this.receiveCallback(norm)
            this.activityCallback()
        }

        // Wait for the wasm runtime to come up so the first raw-REPL handshake
        // doesn't race the (slow) boot. calledRun flips once main() starts.
        const bootDeadline = Date.now() + 120000
        while (!this.badgeWindow()?.Module?.calledRun) {
            if (Date.now() > bootDeadline) {
                this.teardown()
                throw new Error('Virtual badge failed to boot (timeout)')
            }
            await new Promise((r) => setTimeout(r, 100))
        }

        // calledRun only means main() started; the MPOS asyncio REPL service
        // (AIOReplService -> aiorepl.task) starts near the end of boot. Probe
        // with CR bytes and wait until the REPL actually drains the input
        // queue AND we have seen stdout — only then is raw-REPL safe.
        for (;;) {
            bridge.push(0x0d)
            await new Promise((r) => setTimeout(r, 300))
            if (DEBUG) {
                console.log(
                    '[vbadge probe] sawOutput=', sawOutput,
                    'inq.length=', bridge.inq.length,
                    'calledRun=', this.badgeWindow()?.Module?.calledRun,
                )
            }
            if (sawOutput && bridge.inq.length === 0) break
            if (Date.now() > bootDeadline) {
                this.teardown()
                throw new Error('Virtual badge REPL did not start (timeout)')
            }
        }
        // Drop any stray probe CRs still queued and settle.
        bridge.inq.length = 0
        await new Promise((r) => setTimeout(r, 200))
    }

    private teardown(): void {
        const bridge = this.bridge()
        if (bridge) bridge.onOutput = null
        this.container?.remove()
        this.container = null
        this.iframe = null
    }

    async disconnect(): Promise<void> {
        this.teardown()
        this.disconnectCallback()
    }

    /** The unix/wasm port emits bare LF, but the raw-REPL client (MpRawMode)
     *  expects CRLF like a serial device (whose driver does LF->CRLF).
     *  Stateful so a CR/LF pair split across chunks isn't doubled. */
    private normalizeEol(s: string): string {
        let out = ''
        for (const ch of s) {
            if (ch === '\n' && !this.lastWasCR) out += '\r\n'
            else out += ch
            this.lastWasCR = ch === '\r'
        }
        return out
    }

    async writeBytes(data: Uint8Array): Promise<void> {
        const bridge = this.bridge()
        if (!bridge) throw new Error('Virtual badge is not running')
        dbg('tx', new TextDecoder().decode(data))
        bridge.push(data)
    }
}
