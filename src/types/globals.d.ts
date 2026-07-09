// Build-time constants injected by Vite `define` (see vite.config.ts)
declare const VIPER_IDE_VERSION: string
declare const VIPER_IDE_BUILD: string

// Provided by /micropython.mjs, loaded via a <script> tag on every page
declare function loadMicroPython(options?: {
    url?: string
    pystack?: number
    heapsize?: number
    stdout?: (data: string) => void
    linebuffer?: boolean
}): Promise<any>

interface Window {
    // Public API of the legacy IDE controller (src/app.js)
    app?: any
    // Bare connect function exposed by the bridge/benchmark pages
    connectDevice?: (type: 'ws' | 'ble' | 'usb') => void
    // Ad-hoc cross-page globals
    webrepl_url?: string
    pkg_install_url?: string | null
    // Emscripten boot contract used by the MicroPythonOS emulator
    Module?: any
    __mpos_loaded?: boolean
}
