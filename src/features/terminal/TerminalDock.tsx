import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Expand, Monitor, Power, RotateCcw, TerminalSquare, Trash2 } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useUiStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'
import { useConnectionStore } from '../../stores/connection'
import { useThemeIsDark } from '../../services/theme'
import {
    registerTerminalSink,
    clearTerminal,
    reboot,
    subscribeTerminalLog,
} from '../../services/device.service'
import { parseStackTrace } from '../../domain/python_utils'
import { openFileAtLine } from '../../services/files.service'

const XTERM_DARK = {
    foreground: '#F8F8F8', background: '#0a0a0e',
    selectionBackground: '#5DA5D5', selectionForeground: '#1E1E1D',
    selectionInactiveBackground: '#5DA5D580',
    black: '#1E1E1D', brightBlack: '#262625',
    red: '#CE5C5C', brightRed: '#FF7272',
    green: '#5BCC5B', brightGreen: '#72FF72',
    yellow: '#CCCC5B', brightYellow: '#FFFF72',
    blue: '#5D5DD3', brightBlue: '#7279FF',
    magenta: '#BC5ED1', brightMagenta: '#E572FF',
    cyan: '#5DA5D5', brightCyan: '#72F0FF',
    white: '#F8F8F8', brightWhite: '#FFFFFF',
}

const XTERM_LIGHT = {
    foreground: '#212121', background: '#FAFAFA',
    selectionBackground: '#80CBC4', selectionForeground: '#212121',
    selectionInactiveBackground: '#80CBC480', cursor: '#212121',
    black: '#212121', brightBlack: '#546E7A',
    red: '#B71C1C', brightRed: '#E53935',
    green: '#1B5E20', brightGreen: '#43A047',
    yellow: '#E65100', brightYellow: '#FB8C00',
    blue: '#0D47A1', brightBlue: '#1E88E5',
    magenta: '#880E4F', brightMagenta: '#D81B60',
    cyan: '#006064', brightCyan: '#00ACC1',
    white: '#90A4AE', brightWhite: '#ECEFF1',
}

function XtermPane() {
    const hostRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const dark = useThemeIsDark()
    const zoom = useSettingsStore((s) => s.zoom)

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const term = new Terminal({
            fontFamily: '"Hack", "Droid Sans Mono", monospace',
            fontSize: Math.round(14 * useSettingsStore.getState().zoom * 0.9),
            theme: dark ? XTERM_DARK : XTERM_LIGHT,
            cursorBlink: true,
            convertEol: true,
            allowProposedApi: true,
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())
        term.open(host)
        fit.fit()
        termRef.current = term

        // Keystrokes → device. Mutex unless a script is running (stdin injection).
        const dataSub = term.onData(async (data) => {
            const { port } = useConnectionStore.getState()
            if (!port) return
            if (useUiStore.getState().isRunning) {
                await port.write(data)
            } else {
                const release = await port.mutex.acquire()
                try {
                    await port.write(data)
                } finally {
                    release()
                }
            }
        })

        registerTerminalSink(
            (data) => term.write(data),
            () => term.clear(),
        )

        const ro = new ResizeObserver(() => fit.fit())
        ro.observe(host)
        const onResize = () => fit.fit()
        window.addEventListener('resize', onResize)

        return () => {
            registerTerminalSink(null)
            window.removeEventListener('resize', onResize)
            ro.disconnect()
            dataSub.dispose()
            term.dispose()
            termRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const term = termRef.current
        if (!term) return
        term.options.theme = dark ? XTERM_DARK : XTERM_LIGHT
        term.options.fontSize = Math.round(14 * zoom * 0.9)
    }, [dark, zoom])

    return <div ref={hostRef} className="xterm-host h-full w-full px-1" />
}

/** Drag handle: vertical resize with pointer capture. */
function useDockResize() {
    const setHeight = useUiStore((s) => s.setTerminalHeight)

    return (e: React.PointerEvent<HTMLDivElement>) => {
        // Only resize when grabbing the bar itself, not its buttons.
        if ((e.target as HTMLElement).closest('button')) return
        const startY = e.clientY
        const startHeight = useUiStore.getState().terminalHeight
        const el = e.currentTarget
        el.setPointerCapture(e.pointerId)

        const onMove = (ev: PointerEvent) => setHeight(startHeight - (ev.clientY - startY))
        const onUp = () => {
            el.removeEventListener('pointermove', onMove)
            el.removeEventListener('pointerup', onUp)
        }
        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onUp)
    }
}

export function TerminalDock() {
    const { t } = useTranslation()
    const height = useUiStore((s) => s.terminalHeight)
    const [traceback, setTraceback] = useState<ReturnType<typeof parseStackTrace>>()
    const activeTraceRef = useRef<HTMLButtonElement | null>(null)
    const terminalTab = useUiStore((s) => s.terminalTab)
    const setTerminalTab = useUiStore((s) => s.setTerminalTab)
    const displayTabVisible = useUiStore((s) => s.displayTabVisible)
    const dockRef = useRef<HTMLDivElement>(null)
    const onPointerDown = useDockResize()

    useEffect(() => {
        return subscribeTerminalLog((lines) => {
            const parsed = parseStackTrace(lines.join('\n'))
            setTraceback(parsed)
        })
    }, [])

    useEffect(() => {
        if (!traceback || terminalTab !== 'terminal') return
        activeTraceRef.current?.focus()
    }, [traceback, terminalTab])

    const tabClass = (active: boolean) =>
        `flex items-center gap-1.5 px-3 py-1 text-sm ${
            active ? 'bg-tab-active text-tab-active-fg' : 'hover:bg-black/10 dark:hover:bg-white/10'
        }`
    const btnClass = 'p-1.5 opacity-70 hover:opacity-100'

    return (
        <div ref={dockRef} style={{ height }} className="flex shrink-0 flex-col border-t-2 border-black">
            <div
                onPointerDown={onPointerDown}
                className="flex cursor-ns-resize touch-none items-center justify-between bg-menu"
                role="separator"
                aria-orientation="horizontal"
                aria-label={t('terminal.resize', 'Resize terminal')}
            >
                <div className="flex" role="tablist">
                    {displayTabVisible && (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={terminalTab === 'display'}
                            className={tabClass(terminalTab === 'display')}
                            onClick={() => setTerminalTab('display')}
                        >
                            <Monitor size={14} aria-hidden /> {t('tool.display', 'Display')}
                        </button>
                    )}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={terminalTab === 'terminal'}
                        className={tabClass(terminalTab === 'terminal')}
                        onClick={() => setTerminalTab('terminal')}
                    >
                        <TerminalSquare size={14} aria-hidden /> {t('tool.terminal', 'Terminal')}
                    </button>
                </div>
                <div className="flex items-center">
                    <button
                        type="button"
                        className={btnClass}
                        title={t('tool.clear', 'Clear')}
                        aria-label={t('tool.clear', 'Clear')}
                        onClick={clearTerminal}
                    >
                        <Trash2 size={14} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={btnClass}
                        title={t('tool.soft-reset', 'Soft Reset')}
                        aria-label={t('tool.soft-reset', 'Soft Reset')}
                        onClick={() => void reboot('soft')}
                    >
                        <RotateCcw size={14} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={btnClass}
                        title={t('tool.hard-reset', 'Hard Reset')}
                        aria-label={t('tool.hard-reset', 'Hard Reset')}
                        onClick={() => void reboot('hard')}
                    >
                        <Power size={14} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className={btnClass}
                        title={t('tool.fullscreen', 'Full Screen')}
                        aria-label={t('tool.fullscreen', 'Full Screen')}
                        onClick={() => {
                            const el = dockRef.current
                            if (!el) return
                            if (document.fullscreenElement) void document.exitFullscreen()
                            else void el.requestFullscreen().catch(() => undefined)
                        }}
                    >
                        <Expand size={14} aria-hidden />
                    </button>
                </div>
            </div>
            {traceback && terminalTab === 'terminal' && (
                <div className="border-y border-black/20 bg-icon-warning/15 px-2 py-1 text-xs">
                    <div className="font-semibold">{traceback.type}: {traceback.message}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {traceback.frames.slice().reverse().map((f, idx) => {
                            const isActive = idx === 0
                            return (
                                <button
                                    key={`${f.file}:${f.line}:${f.scope}`}
                                    ref={isActive ? activeTraceRef : undefined}
                                    type="button"
                                    className={`border px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-black/40 ${
                                        isActive
                                            ? 'border-black bg-icon-warning/30 font-semibold'
                                            : 'border-black/40 hover:bg-black/10 dark:hover:bg-white/10'
                                    }`}
                                    onClick={() => void openFileAtLine(f.file, f.line)}
                                    title={t('terminal.open-trace-line', 'Open {{file}}:{{line}}', { file: f.file, line: f.line })}
                                >
                                    {f.file}:{f.line}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
            <div className={`min-h-0 flex-1 ${terminalTab === 'terminal' ? '' : 'hidden'}`}>
                <XtermPane />
            </div>
            {displayTabVisible && (
                <div
                    id="mpos-screen"
                    className={`min-h-0 flex-1 bg-edit ${terminalTab === 'display' ? '' : 'hidden'}`}
                />
            )}
        </div>
    )
}
