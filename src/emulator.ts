/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { Transport } from './transports'
import { loadVFS, BASE_URL } from './python_utils'
import i18next from 'i18next'

const T = i18next.t.bind(i18next)

async function populateFS(vm: any)
{
    vm.FS.writeFile('/main.py', `
# Fri3d-IDE - MicroPython Web IDE
# Read more: https://github.com/DrSkunk/Fri3d-IDE

# 🚧 This is an experimental virtual device 🚧
# It runs the official MicroPython WASM port directly in your browser
# Most things work: you can edit and run files, use the Terminal, install packages, etc.
# WARNING: if your script takes a long time to run, the browser will busy-wait

def main():
    colors = [
        "\\033[31m", "\\033[32m", "\\033[33m", "\\033[34m",
        "\\033[35m", "\\033[36m", "\\033[37m",
    ]
    reset = "\\033[0m"

    text = "  ${T('example.hello', 'Привіт')} MicroPython! 𓆙"

    # ${T('example.comment-colors', 'Print each letter with a different color')}
    print("=" * 32)
    for i, char in enumerate(text):
        color = colors[i % len(colors)]
        print(color + char, end="")
    print(reset)
    print("=" * 32)

if __name__ == "__main__":
    main()
`);

    // ----------------------------------------------------------------------
    await loadVFS(vm, `${BASE_URL}/assets/vm_vfs.tar.gz`)

}

export class MicroPythonWASM extends Transport {
    mp: any
    reader: ReadableStreamDefaultReader<string> | null
    isConnected: boolean
    declare decoderStream: TextDecoderStream

    constructor() {
        super()
        this.mp = null
        this.reader = null
        this.isConnected = false
    }

    async requestAccess() {
        this.decoderStream = new TextDecoderStream()
        this.reader = this.decoderStream.readable.getReader()
        const writer = this.decoderStream.writable.getWriter()

        const processStream = async () => {
            while (this.isConnected) {
                const { value, done } = await this.reader!.read()
                if (done) break
                this.receiveCallback(value)
                this.activityCallback()
            }
        }

        this.mp = await loadMicroPython({
            url: `${BASE_URL}/assets/micropython.wasm`,
            stdout: (data) => {
                writer.write(data as any).catch(() => {})
            },
            linebuffer: false,
        });

        await populateFS(this.mp)

        this.isConnected = true
        processStream().catch((err) => {
            console.error('Emulator stream failed:', err)
            this.disconnectCallback()
        })
    }

    async connect() {
        this.mp.replInit()
    }

    async disconnect() {
        this.isConnected = false
        if (this.reader) {
            await this.reader.cancel()
            this.reader.releaseLock()
        }
        if (this.decoderStream) {
            await this.decoderStream.writable.abort()
        }
        // TODO: deinit emulator
    }

    async writeBytes(data: Uint8Array) {
        for (let i = 0; i < data.length; i++) {
            const ret = await this.mp.replProcessCharWithAsyncify(data[i])
            if (ret) {
                this.disconnectCallback()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// MicroPythonOS virtual device.
//
// Unlike MicroPythonWASM (the headless pyscript port driven via replProcessChar),
// this loads the full MicroPythonOS web build (LVGL GUI + asyncio + apps) and
// talks to it like a serial device: bytes are exchanged with the in-VM asyncio
// REPL through the `_webterm` bridge that the MicroPythonOS web build exposes
// (Module.__webterm). The GUI renders into an offscreen <canvas>; the IDE uses
// the standard raw-REPL protocol for file/run operations, exactly as for a real
// board.
//
// The MicroPythonOS web artifacts (micropython.js/.wasm/.data) are a separate,
// non-modularized Emscripten build hosted under /assets/mpos/. They are loaded
// on demand via a <script> tag using a global `Module`, matching that build's
// shell.html boot contract (global FS / run-dependency helpers).
// ---------------------------------------------------------------------------

// Served from build/assets/mpos/ (assets/ is copied verbatim by the build).
// Relative path works on both the localhost dev server and viper-ide.org.
const MPOS_ASSET_BASE = '/assets/mpos/'

export class MicroPythonOSWASM extends Transport {
    module: any
    canvas: HTMLCanvasElement | null
    isConnected: boolean
    isGraphical: boolean
    decoder: TextDecoder
    _outBuf: number[]
    _lastOutByte: number
    _flushScheduled: boolean
    declare webterm: any

    constructor() {
        super()
        this.module = null
        this.canvas = null
        this.isConnected = false
        this.isGraphical = true
        this.decoder = new TextDecoder()
        this._outBuf = []
        this._lastOutByte = 0
        this._flushScheduled = false
    }

    // Emscripten delivers stdout one byte per call (FS.createDevice write);
    // batch into a single decode/receiveCallback per microtask. Lone LF is
    // expanded to CRLF, matching what mp_hal_stdout does on a real board —
    // the IDE raw-REPL protocol (rawmode.js) matches on '\r\n' banners.
    _onStdoutByte(byte: number | null | undefined) {
        if (byte === null || byte === undefined) { return } // flush marker
        if (byte === 10 && this._lastOutByte !== 13) { this._outBuf.push(13) }
        this._lastOutByte = byte
        this._outBuf.push(byte)
        if (!this._flushScheduled) {
            this._flushScheduled = true
            queueMicrotask(() => this._flushStdout())
        }
    }

    _flushStdout() {
        this._flushScheduled = false
        if (!this._outBuf.length) { return }
        const bytes = new Uint8Array(this._outBuf)
        this._outBuf.length = 0
        this.receiveCallback(this.decoder.decode(bytes, { stream: true }))
        this.activityCallback()
    }

    _createCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas')
        // The MicroPythonOS SDL build registers mouse/touch input via
        // document.querySelector('#canvas'), so this exact id is required
        // for the display to receive clicks (rendering alone would work
        // without it, via Module.canvas).
        canvas.id = 'canvas'
        canvas.width = 320
        canvas.height = 240
        canvas.tabIndex = 0
        canvas.setAttribute('oncontextmenu', 'event.preventDefault()')
        // Render into the bottom-panel "Display" tab if present, else offscreen.
        const host = document.getElementById('mpos-screen')
        if (host) {
            host.appendChild(canvas)
            const link = document.getElementById('tab-screen-link')
            if (link) { link.style.display = '' }
        } else {
            canvas.style.position = 'fixed'
            canvas.style.left = '-10000px'
            canvas.style.top = '0'
            document.body.appendChild(canvas)
        }
        return canvas
    }

    async requestAccess() {
        if (window.__mpos_loaded) {
            throw new Error('MicroPythonOS VM is already running; reload the page to restart it')
        }

        this.canvas = this._createCanvas()

        // The SDL2 port registers keydown/keyup/keypress on window (bubble
        // phase) and preventDefaults keypress, which silently kills text input
        // in the CodeMirror editor everywhere on the page. This guard is
        // registered on the same target/phase BEFORE the runtime script loads,
        // so it runs first and can stop keys that aren't aimed at the VM
        // canvas from ever reaching SDL. Keys go to the VM only while the
        // canvas is focused (it has tabindex, clicking it focuses it).
        // Never removed: the Emscripten runtime cannot be torn down, so SDL's
        // listeners survive disconnect() and the guard must too.
        const canvas = this.canvas
        const keyGuard = (e: Event) => {
            if (e.target !== canvas && document.activeElement !== canvas) {
                e.stopImmediatePropagation()
            }
        }
        for (const type of ['keydown', 'keyup', 'keypress']) {
            window.addEventListener(type, keyGuard, false)
        }

        // Input side of the serial bridge: the IDE pushes bytes into inq and
        // the in-VM asyncio REPL drains them via the _webterm module.
        // Output deliberately does NOT use __webterm.onOutput: the released
        // web builds don't mirror stdout through the _webterm C hook (the
        // unix_mphal.c patch step is optional in build_mpos.sh), so output is
        // tapped at the Emscripten level via Module.stdout below. Leaving
        // onOutput unset also keeps builds that DO have the C mirror from
        // double-delivering (webterm_js_tx no-ops without a callback).
        const webterm = {
            inq: [] as number[],
            onOutput: null,
            push(data: any) {
                if (typeof data === 'number') { this.inq.push(data & 0xff); return }
                for (let i = 0; i < data.length; i++) { this.inq.push(data[i] & 0xff) }
            },
        }
        this.webterm = webterm

        await new Promise<void>((resolve, reject) => {
            const Module = {
                canvas: this.canvas,
                arguments: ['-X', 'heapsize=16M', '-m', 'main'],
                locateFile: (path: string) => MPOS_ASSET_BASE + path,
                // FS.init wires this as the per-byte /dev/stdout device, so the
                // IDE sees the exact byte stream of the in-VM REPL (raw-REPL
                // framing included). Module.print is then unused for stdout.
                stdout: (byte: number | null | undefined) => this._onStdoutByte(byte),
                print: (text: string) => { console.log(text) },
                printErr: (text: string) => { console.warn(text) },
                __webterm: webterm,
                preRun: [function () {
                    // Mount IndexedDB-backed persistence for /data and /apps, the
                    // two paths the MicroPythonOS preload deliberately excludes.
                    try {
                        const FS = (window as any).FS
                        const IDB = FS.filesystems.IDBFS
                        try { FS.mkdir('/data') } catch (_e) { /* exists */ }
                        try { FS.mkdir('/apps') } catch (_e) { /* exists */ }
                        FS.mount(IDB, {}, '/data')
                        FS.mount(IDB, {}, '/apps')
                        ;(window as any).addRunDependency('idbfs-load')
                        FS.syncfs(true, function () { (window as any).removeRunDependency('idbfs-load') })
                    } catch (err) {
                        console.error('MicroPythonOS IDBFS mount failed', err)
                    }
                }],
                onRuntimeInitialized: () => {
                    // Seed the bundled demo apps into /apps once (mirrors the
                    // MicroPythonOS shell.html first-run behaviour).
                    try {
                        const FS = (window as any).FS
                        let seeded = true
                        try { FS.stat('/apps/.seeded') } catch (_e) { seeded = false }
                        let hasBundle = true
                        try { FS.stat('/.bundled_apps') } catch (_e) { hasBundle = false }
                        if (!seeded && hasBundle) {
                            this._copyRecursive(FS, '/.bundled_apps', '/apps')
                            try { FS.writeFile('/apps/.seeded', '1') } catch (_e) { /* ignore */ }
                            FS.syncfs(false, () => {})
                        }
                    } catch (err) {
                        console.error('MicroPythonOS app seeding failed', err)
                    }
                    resolve()
                },
            }
            window.Module = Module
            window.__mpos_loaded = true
            this.module = Module

            const script = document.createElement('script')
            script.src = MPOS_ASSET_BASE + 'micropython.js'
            script.onerror = () => reject(new Error('Failed to load MicroPythonOS runtime'))
            document.body.appendChild(script)
        })

        this.isConnected = true
    }

    _copyRecursive(FS: any, src: string, dst: string) {
        for (const name of FS.readdir(src)) {
            if (name === '.' || name === '..') { continue }
            const s = src + '/' + name
            const d = dst + '/' + name
            let mode
            try { mode = FS.stat(s).mode } catch (_e) { continue }
            if (FS.isDir(mode)) {
                try { FS.mkdir(d) } catch (_e) { /* exists */ }
                this._copyRecursive(FS, s, d)
            } else {
                try { FS.writeFile(d, FS.readFile(s)) } catch (err) { console.error('seed copy failed', s, err) }
            }
        }
    }

    async connect() {
        // MicroPythonOS auto-boots into `main` and starts its asyncio REPL at
        // boot_completed; there is no explicit REPL init. Nudge it with Ctrl-C
        // so a fresh prompt is emitted once the IDE attaches.
        await this.writeBytes(new Uint8Array([0x03]))
    }

    async disconnect() {
        this.isConnected = false
        // The Emscripten runtime cannot be cleanly torn down and re-run in the
        // same page; a full restart requires a page reload.
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas)
        }
        const link = document.getElementById('tab-screen-link')
        if (link) { link.style.display = 'none' }
        document.querySelector<HTMLElement>('a[data-target="xterm"]')?.click()
        this.disconnectCallback()
    }

    async writeBytes(data: Uint8Array) {
        if (!this.webterm) { return }
        this.webterm.push(data)
    }
}

