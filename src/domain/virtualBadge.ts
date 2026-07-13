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

/** Fixed BroadcastChannel name for the popped-out badge window. Single-IDE
 *  assumption: only one IDE tab + one badge window per origin, so a
 *  well-known name is enough — an IDE refresh just reopens the same channel
 *  and pings it to find a surviving badge window. */
const POPOUT_CHANNEL = 'fri3d-ide-vbadge'

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

/** True if a popped-out badge window from a previous page load is still
 *  alive (answers a ping on the well-known channel within `timeoutMs`). */
export async function hasOrphanBadgeWindow(timeoutMs = 1500): Promise<boolean> {
    const chan = new BroadcastChannel(POPOUT_CHANNEL)
    try {
        return await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), timeoutMs)
            chan.onmessage = (ev: MessageEvent) => {
                if (ev.data?.type === 'pong') {
                    clearTimeout(timer)
                    resolve(true)
                }
            }
            chan.postMessage({ type: 'ping' })
        })
    } finally {
        chan.close()
    }
}

export class VirtualBadgeTransport extends Transport {
    declare pageUrl: string
    declare container: HTMLElement | null
    declare iframe: HTMLIFrameElement | null
    declare decoder: TextDecoder
    declare lastWasCR: boolean
    declare channel: BroadcastChannel | null
    declare popWindow: Window | null
    declare popPong: { calledRun: boolean; inqLen: number } | null
    declare attach: boolean
    declare popOutDefault: boolean
    declare helloSeen: boolean

    /** `attach: true` (after hasOrphanBadgeWindow()) re-attaches to an
     *  already-running popped-out badge window. `popOut: true` skips the
     *  inline panel and opens the badge in its own window right away. */
    constructor(pageUrl: string = DEFAULT_PAGE_URL, opts: { attach?: boolean; popOut?: boolean } = {}) {
        super()
        this.pageUrl = pageUrl
        this.attach = opts.attach ?? false
        this.popOutDefault = opts.popOut ?? false
        this.helloSeen = false
        this.container = null
        this.iframe = null
        this.decoder = new TextDecoder()
        this.lastWasCR = false
        this.channel = null
        this.popWindow = null
        this.popPong = null
        this.info = { url: pageUrl, virtual: true }
    }

    private badgeWindow(): MposWindow | null {
        return (this.iframe?.contentWindow as MposWindow | null) ?? null
    }

    private bridge(): WebTermBridge | null {
        return this.badgeWindow()?.Module?.__webterm ?? null
    }

    /** Bind a BroadcastChannel to this transport: routes stdout to the IDE,
     *  tracks pong state, and treats window close as device unplug. */
    private openChannel(name: string): BroadcastChannel {
        const chan = new BroadcastChannel(name)
        chan.onmessage = (ev: MessageEvent) => {
            const m = ev.data ?? {}
            if (m.type === 'hello') {
                this.helloSeen = true
            } else if (m.type === 'popin') {
                // Dock button in the badge window: bring it back inline.
                void this.popIn().catch((err) => console.error('[vbadge] pop-in failed:', err))
            } else if (m.type === 'out') {
                const norm = this.normalizeEol(this.decoder.decode(m.data as Uint8Array, { stream: true }))
                dbg('rx', norm)
                this.receiveCallback(norm)
                this.activityCallback()
            } else if (m.type === 'pong') {
                this.popPong = { calledRun: !!m.calledRun, inqLen: m.inqLen as number }
            } else if (m.type === 'closed') {
                // Badge window gone -> behave like device unplug.
                this.channel?.close()
                this.channel = null
                this.popWindow = null
                this.disconnectCallback()
            }
        }
        this.channel = chan
        return chan
    }

    /** Wait until the popped-out badge VM has booted and its REPL drains
     *  input (ping/pong flavour of the connect() probe loop). */
    private async channelHandshake(timeoutMs: number): Promise<void> {
        const chan = this.channel
        if (!chan) throw new Error('No badge channel')
        let sawOutput = false
        const prev = chan.onmessage
        chan.onmessage = (ev: MessageEvent) => {
            if (ev.data?.type === 'out') sawOutput = true
            prev?.call(chan, ev)
        }
        try {
            const deadline = Date.now() + timeoutMs
            for (;;) {
                this.popPong = null
                chan.postMessage({ type: 'ping' })
                chan.postMessage({ type: 'in', data: [0x0d] })
                await new Promise((r) => setTimeout(r, 300))
                const pong = this.popPong as { calledRun: boolean; inqLen: number } | null
                if (sawOutput && pong?.calledRun && pong.inqLen === 0) break
                if (Date.now() > deadline) throw new Error('Badge window REPL did not start (timeout)')
            }
        } finally {
            chan.onmessage = prev
        }
    }

    async requestAccess(): Promise<void> {
        // Re-attach mode: badge window already exists, nothing to build.
        if (this.attach) return
        // Pop-out-by-default: open the window now, while still inside the
        // user-gesture task (popup blockers). Handshake happens in connect().
        if (this.popOutDefault) {
            this.openBadgeWindow()
            return
        }
        await this.buildPanel()
    }

    private async buildPanel(): Promise<void> {
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

        // Title bar: full-width drag surface with grip dots + hide/show
        // toggle. Neubrutalist styling to match the IDE (square corners,
        // black border, hard shadow, Fri3d purple).
        const barRow = document.createElement('div')
        Object.assign(barRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            height: '30px',
            width: '100px',
            margin: '0 0 8px auto',
            padding: '0 8px',
            marginBottom: '8px',
            background: 'var(--fri3d-purple, #8835c9)',
            border: '2px solid #000',
            boxShadow: '4px 4px 0 #000',
            cursor: 'grab',
            userSelect: 'none',
            touchAction: 'none',
        } as Partial<CSSStyleDeclaration>)
        barRow.title = 'Drag to move'

        // Grip dots (visual affordance, centered).
        const grip = document.createElement('div')
        grip.textContent = '⋮⋮⋮'
        Object.assign(grip.style, {
            flex: '1',
            textAlign: 'center',
            color: '#fff',
            font: 'bold 14px/1 system-ui',
            letterSpacing: '2px',
            pointerEvents: 'none',
            opacity: '.9',
        } as Partial<CSSStyleDeclaration>)
        barRow.appendChild(grip)

        // Hide/show toggle: collapses the badge to just the bar
        // (iframe kept alive — the VM keeps running while hidden).
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.textContent = '▾'
        toggle.title = 'Hide badge'
        toggle.setAttribute('aria-label', 'Hide badge')
        Object.assign(toggle.style, {
            width: '22px',
            height: '22px',
            padding: '0',
            lineHeight: '1',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#000',
            background: 'var(--fri3d-mint, #3ce8b3)',
            border: '2px solid #000',
            cursor: 'pointer',
            userSelect: 'none',
        } as Partial<CSSStyleDeclaration>)
        toggle.addEventListener('pointerdown', (e) => e.stopPropagation())

        // Pop-out: reopen the badge in its own window, talking to the IDE
        // over a BroadcastChannel (same origin). The inline iframe (and its
        // VM) is torn down; the pop-out boots a fresh VM on shared IDBFS.
        const popout = document.createElement('button')
        popout.type = 'button'
        popout.textContent = '⧉'
        popout.title = 'Open badge in separate window'
        popout.setAttribute('aria-label', popout.title)
        Object.assign(popout.style, {
            width: '22px',
            height: '22px',
            padding: '0',
            lineHeight: '1',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#000',
            background: 'var(--fri3d-yellow, #f9c74f)',
            border: '2px solid #000',
            cursor: 'pointer',
            userSelect: 'none',
        } as Partial<CSSStyleDeclaration>)
        popout.addEventListener('pointerdown', (e) => e.stopPropagation())
        popout.addEventListener('click', () => {
            this.popOut().catch((err) => console.error('[vbadge] pop-out failed:', err))
        })
        barRow.appendChild(popout)
        let badgeHidden = false
        toggle.addEventListener('click', () => {
            badgeHidden = !badgeHidden
            // Animate collapse/expand: iframe keeps rendering (VM stays
            // alive), wrapper height+opacity transition does the motion.
            iframeWrap.style.maxHeight = badgeHidden ? '0px' : `${iframe.offsetHeight}px`
            iframeWrap.style.opacity = badgeHidden ? '0' : '1'
            toggle.textContent = badgeHidden ? '▴' : '▾'
            toggle.title = badgeHidden ? 'Show badge' : 'Hide badge'
            toggle.setAttribute('aria-label', toggle.title)
        })
        barRow.appendChild(toggle)
        container.appendChild(barRow)

        // Drag: whole bar is the handle; capture follows outside the window,
        // position clamped so the bar can never leave the viewport.
        let drag: { x: number; y: number; r: number; b: number } | null = null
        const onMove = (e: PointerEvent) => {
            if (!drag) return
            const w = container.offsetWidth
            const r = Math.min(Math.max(drag.r - (e.clientX - drag.x), 8 - w + 40), window.innerWidth - 48)
            const b = Math.min(
                Math.max(drag.b - (e.clientY - drag.y), 8 - container.offsetHeight + 36),
                window.innerHeight - 36,
            )
            container.style.right = `${r}px`
            container.style.bottom = `${b}px`
        }
        const endDrag = () => {
            drag = null
            barRow.style.cursor = 'grab'
        }
        barRow.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return
            const rect = container.getBoundingClientRect()
            drag = {
                x: e.clientX,
                y: e.clientY,
                r: window.innerWidth - rect.right,
                b: window.innerHeight - rect.bottom,
            }
            barRow.style.cursor = 'grabbing'
            barRow.setPointerCapture(e.pointerId)
        })
        barRow.addEventListener('pointermove', onMove)
        barRow.addEventListener('pointerup', endDrag)
        barRow.addEventListener('pointercancel', endDrag)
        barRow.addEventListener('lostpointercapture', endDrag)

        const iframeWrap = document.createElement('div')
        Object.assign(iframeWrap.style, {
            overflow: 'hidden',
            maxHeight: '2000px',
            opacity: '1',
            transition: 'max-height .25s ease, opacity .2s ease',
        } as Partial<CSSStyleDeclaration>)

        const iframe = document.createElement('iframe')
        iframe.title = 'MicroPythonOS virtual badge'
        iframe.src = this.pageUrl
        iframe.setAttribute('allowtransparency', 'true')
        Object.assign(iframe.style, {
            // Matches badge size in vbadge/index.html (119x54mm @ --u:6.75px/mm
            // + 2px border) so the load-time shrink-wrap doesn't visibly jump.
            width: '808px',
            height: '369px',
            border: 'none',
            display: 'block',
            background: 'transparent',
            colorScheme: 'normal',
        } as Partial<CSSStyleDeclaration>)
        iframeWrap.appendChild(iframe)
        container.appendChild(iframeWrap)

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
        // Re-attach to a surviving popped-out badge window (IDE refreshed).
        if (this.attach) {
            this.openChannel(POPOUT_CHANNEL)
            // Previous session may have died mid raw-REPL: \x02 returns to
            // the friendly REPL; stray output is drained by the handshake.
            this.channel!.postMessage({ type: 'in', data: [0x02] })
            await this.channelHandshake(15000)
            return
        }
        // Pop-out-by-default: window already opened in requestAccess().
        if (this.channel) {
            await this.awaitBadgeWindow(120000)
            return
        }
        await this.connectPanel()
    }

    private async connectPanel(): Promise<void> {
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

    /** Move the badge to a standalone window; stdio flows back over a
     *  BroadcastChannel (see pop-out block in vbadge/index.html). */
    async popOut(): Promise<void> {
        if (this.channel) return
        this.openBadgeWindow()
        await this.awaitBadgeWindow(120000)
    }

    /** Synchronous half of popOut(): must run inside a user-gesture task so
     *  window.open isn't popup-blocked. */
    private openBadgeWindow(): void {
        this.helloSeen = false
        const chan = this.openChannel(POPOUT_CHANNEL)

        const badgeW = 830
        const badgeH = 400
        const win = window.open(
            `${this.pageUrl}?popout=1`,
            'fri3d-ide-vbadge',
            `popup=yes,width=${badgeW},height=${badgeH}`,
        )
        if (!win) {
            chan.close()
            this.channel = null
            throw new Error('Pop-up blocked: allow pop-ups for this site')
        }
        this.popWindow = win

        // Kill the inline iframe first so two VMs never race on IDBFS.
        this.teardownPanel()
    }

    /** Wait for page load ('hello'), wasm boot, and REPL readiness (same
     *  probe strategy as connectPanel(), but over ping/pong messages). */
    private async awaitBadgeWindow(timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs
        while (!this.helloSeen) {
            if (Date.now() > deadline) throw new Error('Badge window did not respond')
            await new Promise((r) => setTimeout(r, 100))
        }
        await this.channelHandshake(deadline - Date.now())
    }

    /** Bring a popped-out badge back inline: close the window (fresh VM
     *  boots in the panel iframe; files persist via shared IDBFS). */
    async popIn(): Promise<void> {
        if (!this.channel) return
        // Order matters: send 'close' then close the channel immediately so
        // the window's pagehide 'closed' message can't reach us (it would be
        // mistaken for a device unplug).
        this.channel.postMessage({ type: 'close' })
        this.channel.close()
        this.channel = null
        try {
            this.popWindow?.close()
        } catch {
            /* window closes itself via the 'close' message */
        }
        this.popWindow = null
        this.attach = false
        await this.buildPanel()
        await this.connectPanel()
    }

    private teardownPanel(): void {
        const bridge = this.bridge()
        if (bridge) bridge.onOutput = null
        this.container?.remove()
        this.container = null
        this.iframe = null
    }

    private teardown(): void {
        this.teardownPanel()
        if (this.channel) {
            this.channel.postMessage({ type: 'close' })
            this.channel.close()
            this.channel = null
        }
        try {
            this.popWindow?.close()
        } catch {
            /* cross-window close can throw; window closes itself via 'close' msg */
        }
        this.popWindow = null
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
        dbg('tx', new TextDecoder().decode(data))
        if (this.channel) {
            this.channel.postMessage({ type: 'in', data: Array.from(data) })
            return
        }
        const bridge = this.bridge()
        if (!bridge) throw new Error('Virtual badge is not running')
        bridge.push(data)
    }
}
