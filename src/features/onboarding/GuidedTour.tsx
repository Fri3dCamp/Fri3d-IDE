import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cable, PlayCircle } from 'lucide-react'
import { Transport } from '../../domain/transports'
import { useConnectionStore } from '../../stores/connection'
import { useFileStore, type FsNode } from '../../stores/files'
import { useAppsStore, type AppInfo } from '../../stores/apps'
import { useUiStore, type SideMenuTab } from '../../stores/ui'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { connectDevice } from '../../services/device.service'
import { useConfirm, usePrompt } from '../../components/dialogs'
import { setDemoListDir, type DemoDirEntry } from '../../services/demoDevice'
import { Fri3dLogo } from './Fri3dLogo'

const TOUR_STORAGE_KEY = 'fri3d.onboarding.tour.v3'
const TOUR_RESTART_EVENT = 'fri3d:onboarding:restart'

export function restartOnboardingTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY)
    window.dispatchEvent(new Event(TOUR_RESTART_EVENT))
}

/* ------------------------------------------------------------------ */
/* Demo device                                                         */
/* ------------------------------------------------------------------ */

class DemoTransport extends Transport {
    async requestAccess() {}
    async connect() {}
    async disconnect() {
        this.disconnectCallback()
    }
    async writeBytes(_data: Uint8Array) {}
}

const DEMO_TREE: FsNode[] = [
    {
        name: 'apps',
        path: '/apps',
        loaded: true,
        content: [
            {
                name: 'be.fri3d.hello',
                path: '/apps/be.fri3d.hello',
                loaded: true,
                content: [
                    { name: '__init__.py', path: '/apps/be.fri3d.hello/__init__.py', size: 412 },
                    { name: 'manifest.json', path: '/apps/be.fri3d.hello/manifest.json', size: 180 },
                ],
            },
        ],
    },
    {
        name: 'lib',
        path: '/lib',
        loaded: false,
        content: [],
    },
    { name: 'boot.py', path: '/boot.py', size: 120 },
    { name: 'main.py', path: '/main.py', size: 340 },
    { name: 'blink.py', path: '/blink.py', size: 210 },
]

const DEMO_APP_FILE = '/apps/be.fri3d.hello/__init__.py'
const DEMO_APP_CODE = [
    'from mpos.apps import Activity',
    '',
    '',
    'class HelloWorld(Activity):',
    '    def on_start(self):',
    '        print("Hello from your Fri3d badge!")',
    '',
].join('\n')

const DEMO_APPS: AppInfo[] = [
    {
        fullname: 'be.fri3d.hello',
        name: 'Hello World',
        version: '1.0.0',
        publisher: 'Fri3d Camp',
        short_description: 'Demo app for the guided tour',
        activities: [],
        path: '/apps/be.fri3d.hello',
    },
]

/** Fake per-folder listings for the demo app file browser. */
const DEMO_DIRS: Record<string, DemoDirEntry[]> = {
    '/apps/be.fri3d.hello': [
        { name: 'assets', path: '/apps/be.fri3d.hello/assets', isDir: true },
        { name: '__init__.py', path: DEMO_APP_FILE, size: 412, isDir: false },
        { name: 'manifest.json', path: '/apps/be.fri3d.hello/manifest.json', size: 180, isDir: false },
    ],
    '/apps/be.fri3d.hello/assets': [
        { name: 'icon.png', path: '/apps/be.fri3d.hello/assets/icon.png', size: 2048, isDir: false },
    ],
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

type TourStep = {
    key: string
    title: string
    text: string
    selectors?: string[]
    menuTab?: SideMenuTab
    /** Side effect when the step becomes active (demo mode only). */
    onEnterDemo?: () => void
}

function firstRect(selectors?: string[]): DOMRect | null {
    if (!selectors?.length) return null
    for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
            const r = el.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) return r
        }
    }
    return null
}

/* ------------------------------------------------------------------ */
/* Positioning: place the card next to the highlight like a tooltip.   */
/* ------------------------------------------------------------------ */

const CARD_W = 380
const CARD_GAP = 14

function cardPosition(rect: DOMRect | null, cardH: number): React.CSSProperties {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(CARD_W, vw - 16)

    if (!rect) {
        // Centered (welcome / done steps).
        return { left: (vw - w) / 2, top: Math.max(16, (vh - cardH) / 2), width: w }
    }

    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top
    const spaceRight = vw - rect.right
    const spaceLeft = rect.left

    let left: number
    let top: number

    if (spaceRight >= w + CARD_GAP) {
        // Right of target, vertically centered on it.
        left = rect.right + CARD_GAP
        top = rect.top + rect.height / 2 - cardH / 2
    } else if (spaceLeft >= w + CARD_GAP) {
        left = rect.left - w - CARD_GAP
        top = rect.top + rect.height / 2 - cardH / 2
    } else if (spaceBelow >= cardH + CARD_GAP) {
        left = rect.left + rect.width / 2 - w / 2
        top = rect.bottom + CARD_GAP
    } else if (spaceAbove >= cardH + CARD_GAP) {
        left = rect.left + rect.width / 2 - w / 2
        top = rect.top - cardH - CARD_GAP
    } else {
        // Fallback: below, clamped.
        left = rect.left + rect.width / 2 - w / 2
        top = rect.bottom + CARD_GAP
    }

    left = Math.min(Math.max(8, left), vw - w - 8)
    top = Math.min(Math.max(8, top), vh - cardH - 8)
    return { left, top, width: w }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type TourMode = null | 'choose' | 'real-connect' | 'touring'

export function GuidedTour() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const [mode, setMode] = useState<TourMode>(null)
    const [step, setStep] = useState(0)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const [usingDemo, setUsingDemo] = useState(false)
    const demoPortRef = useRef<Transport | null>(null)
    const cardRef = useRef<HTMLDivElement>(null)
    const [cardH, setCardH] = useState(220)
    const connected = useConnectionStore((s) => s.status === 'connected')

    const steps = useMemo<TourStep[]>(
        () => [
            {
                key: 'connection',
                title: t('onboarding.steps.connection.title', 'You are connected'),
                text: t(
                    'onboarding.steps.connection.text',
                    'This shows your connection status: the badge name and a blinking activity dot. Disconnect here; reconnect any time with the Connect button that appears in its place.',
                ),
                selectors: ['[data-tour-id="tour-connection"]'],
                menuTab: 'apps',
            },
            {
                key: 'apps',
                title: t('onboarding.steps.apps.title', 'Your apps'),
                text: t(
                    'onboarding.steps.apps.text',
                    'The Apps tab lists every app installed on the badge. Click an app to open its details — and “Create New App” scaffolds a fresh one from a template.',
                ),
                selectors: ['[data-tour-id="tour-app-list"]', '[data-tour-id="tour-tab-apps"]'],
                menuTab: 'apps',
            },
            {
                key: 'open-app',
                title: t('onboarding.steps.open-app.title', 'Inside an app'),
                text: t(
                    'onboarding.steps.open-app.text',
                    'Opening an app shows its files. Click any file to open it in the editor — that\u2019s all it takes to start editing.',
                ),
                selectors: ['[data-tour-id="tour-app-detail"]', '[data-tour-id="tour-app-list"]'],
                menuTab: 'apps',
                onEnterDemo: () => {
                    useAppsStore.getState().setSelected(DEMO_APPS[0].fullname)
                    const tabs = useEditorTabsStore.getState()
                    const existing = tabs.tabs.find((x) => x.fn === DEMO_APP_FILE)
                    if (existing) tabs.activate(existing.id)
                    else
                        tabs.openTab({
                            fn: DEMO_APP_FILE,
                            kind: 'code',
                            viewMode: 'edit',
                            readOnly: false,
                            content: DEMO_APP_CODE,
                        })
                },
            },
            {
                key: 'launch',
                title: t('onboarding.steps.launch.title', 'Launch the app'),
                text: t(
                    'onboarding.steps.launch.text',
                    'The \ud83d\ude80 Launch app button starts the app on the badge, exactly like picking it from the badge menu.',
                ),
                selectors: ['[data-tour-id="tour-launch-app"]', '[data-tour-id="tour-app-detail"]'],
                menuTab: 'apps',
            },
            {
                key: 'launch-toolbar',
                title: t('onboarding.steps.launch-toolbar.title', 'Launch while editing'),
                text: t(
                    'onboarding.steps.launch-toolbar.text',
                    'When you are editing a file that belongs to an app, this Launch app button appears in the toolbar — so you can start the app right from the editor.',
                ),
                selectors: ['[data-tour-id="tour-launch-toolbar"]', '[data-tour-id="toolbar"]'],
            },
            {
                key: 'terminal',
                title: t('onboarding.steps.terminal.title', 'Terminal'),
                text: t(
                    'onboarding.steps.terminal.text',
                    'All output from your badge appears here. It is also a live MicroPython REPL: click it and type Python directly on the device.',
                ),
                selectors: ['[data-tour-id="tour-terminal"]'],
            },
            {
                key: 'files',
                title: t('onboarding.steps.files.title', 'File browser — plain MicroPython'),
                text: t(
                    'onboarding.steps.files.text',
                    'Prefer working without the app structure? The File Manager shows every file on the badge. Open any .py file and run it directly — regular MicroPython, no packaging needed.',
                ),
                selectors: ['[data-tour-id="tour-tab-files"]'],
                menuTab: 'files',
            },
            {
                key: 'save-run',
                title: t('onboarding.steps.save-run.title', 'Save vs Run'),
                text: t(
                    'onboarding.steps.save-run.text',
                    'Whether you edit an app or a plain .py file: Save (Ctrl/Cmd+S) writes it to badge storage so it survives a reboot, and Run (F5) executes the open file immediately. Run does not save automatically — save first to keep your changes!',
                ),
                selectors: ['[data-tour-id="tour-save-run"]'],
            },
            {
                key: 'done',
                title: t('onboarding.steps.done.title', "You're all set! 🚀"),
                text: usingDemo
                    ? t(
                          'onboarding.steps.done.text-demo',
                          'That was the tour! The demo device will now disconnect — plug in your Fri3d badge with a USB-C cable and start building. Happy coding!',
                      )
                    : t(
                          'onboarding.steps.done.text',
                          'That was the tour! Your badge is connected and ready. Start building amazing things. Happy coding!',
                      ),
            },
        ],
        [t, usingDemo],
    )

    /* ------------------------------ lifecycle ------------------------------ */

    useEffect(() => {
        if (localStorage.getItem(TOUR_STORAGE_KEY) !== 'done') setMode('choose')
        const onRestart = () => {
            setStep(0)
            setMode('choose')
        }
        window.addEventListener(TOUR_RESTART_EVENT, onRestart)
        return () => window.removeEventListener(TOUR_RESTART_EVENT, onRestart)
    }, [])

    // Real-device path: auto-advance once connected.
    useEffect(() => {
        if (mode === 'real-connect' && connected) {
            setStep(0)
            setMode('touring')
        }
    }, [mode, connected])

    /* --------------------------- demo device ------------------------------ */

    const startDemo = () => {
        const conn = useConnectionStore.getState()
        if (conn.status === 'disconnected') {
            if (!demoPortRef.current) demoPortRef.current = new DemoTransport()
            conn.setConnected(demoPortRef.current, 'usb')
            conn.setDevInfo({
                machine: t('onboarding.demo-device', 'Fri3d Badge (demo)'),
                version: 'MicroPython (demo)',
                mpy_ver: 'demo',
                sys_path: '/lib',
                connection: 'demo',
            })
            useFileStore.getState().setTree(DEMO_TREE, [1024 * 1024, 512 * 1024, 512 * 1024])
            useAppsStore.getState().setApps(DEMO_APPS)
            setDemoListDir((path) => DEMO_DIRS[path] ?? [])
            setUsingDemo(true)
        }
        setStep(0)
        setMode('touring')
    }

    const teardownDemo = () => {
        if (!usingDemo) return
        useConnectionStore.getState().setDisconnected()
        useFileStore.getState().reset()
        useAppsStore.getState().reset()
        useUiStore.getState().setRunning(false)
        const tabs = useEditorTabsStore.getState()
        const demoTab = tabs.tabs.find((x) => x.fn === DEMO_APP_FILE)
        if (demoTab) tabs.closeTab(demoTab.id)
        setDemoListDir(null)
        setUsingDemo(false)
    }

    /* ----------------------------- tracking -------------------------------- */

    useEffect(() => {
        if (mode !== 'touring' && mode !== 'real-connect') return
        const selectors =
            mode === 'real-connect'
                ? ['[data-tour-id="tour-connect"]']
                : steps[step]?.selectors
        const menuTab = mode === 'real-connect' ? 'files' : steps[step]?.menuTab
        if (menuTab) useUiStore.getState().setSideMenuTab(menuTab)
        if (mode === 'touring' && usingDemo) steps[step]?.onEnterDemo?.()

        const update = () => {
            setRect(firstRect(selectors))
            if (cardRef.current) setCardH(cardRef.current.offsetHeight)
        }
        update()
        const raf = requestAnimationFrame(update)
        const id = window.setInterval(update, 250)
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        return () => {
            cancelAnimationFrame(raf)
            window.clearInterval(id)
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
        }
    }, [mode, step, steps])

    const finish = () => {
        localStorage.setItem(TOUR_STORAGE_KEY, 'done')
        setMode(null)
        teardownDemo()
    }

    if (mode === null) return null

    /* --------------------------- choice screen ----------------------------- */

    if (mode === 'choose') {
        return (
            <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4">
                <div className="w-[min(94vw,480px)] border-3 border-black bg-menu p-6 text-fg shadow-brutal-lg">
                    <div className="flex justify-center">
                        <Fri3dLogo size={88} />
                    </div>
                    <div className="mt-3 text-center font-heading text-2xl font-black">
                        {t('onboarding.welcome-title', 'Welcome to Fri3d-IDE! 👋')}
                    </div>
                    <p className="mt-2 text-center text-sm leading-relaxed">
                        {t(
                            'onboarding.welcome-text',
                            'Let me show you around! You can follow the tour with your real Fri3d badge, or explore safely with a demo device first.',
                        )}
                    </p>
                    <div className="mt-6 grid gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setMode('real-connect')
                                void connectDevice('usb', { confirm, prompt })
                            }}
                            className="flex items-center justify-center gap-2 border-2 border-black bg-(--fri3d-purple) px-4 py-2.5 font-semibold text-white shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        >
                            <Cable size={17} aria-hidden />
                            {t('onboarding.choose-real', 'Connect my badge (USB)')}
                        </button>
                        <button
                            type="button"
                            onClick={startDemo}
                            className="flex items-center justify-center gap-2 border-2 border-black bg-tab-active px-4 py-2.5 font-semibold text-tab-active-fg shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        >
                            <PlayCircle size={17} aria-hidden />
                            {t('onboarding.choose-demo', 'Try with a demo device')}
                        </button>
                        <button
                            type="button"
                            onClick={finish}
                            className="mt-1 justify-self-center px-3 py-1 text-sm font-semibold opacity-70 hover:opacity-100"
                        >
                            {t('onboarding.skip', 'Skip tour')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    /* --------------------------- connect helper ---------------------------- */

    if (mode === 'real-connect') {
        const pos = cardPosition(rect, cardH)
        return (
            <div className="pointer-events-none fixed inset-0 z-[120]">
                {rect ? (
                    <div
                        className="tour-highlight fixed z-[121] rounded-lg"
                        style={{
                            left: rect.left - 6,
                            top: rect.top - 6,
                            width: rect.width + 12,
                            height: rect.height + 12,
                        }}
                    />
                ) : (
                    <div className="fixed inset-0 z-[121] bg-black/55" />
                )}
                <div
                    ref={cardRef}
                    style={pos}
                    className="tour-card pointer-events-auto fixed z-[123] border-3 border-black bg-menu p-4 text-fg shadow-brutal-lg"
                >
                    <div className="flex items-center gap-3">
                        <div className="font-heading text-lg font-black">
                            {t('onboarding.connect-title', 'Connect your badge')}
                        </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">
                        {t(
                            'onboarding.connect-text',
                            'Plug your Fri3d badge into this computer with a USB-C cable, then click the highlighted “Connect device” button and pick the serial port from the browser popup. The tour continues automatically once connected.',
                        )}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={finish}
                            className="border-2 border-black px-3 py-1.5 text-sm font-semibold opacity-80 hover:opacity-100"
                        >
                            {t('onboarding.skip', 'Skip tour')}
                        </button>
                        <button
                            type="button"
                            onClick={startDemo}
                            className="border-2 border-black px-3 py-1.5 text-sm font-semibold"
                        >
                            {t('onboarding.fallback-demo', 'Use demo device instead')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    /* ------------------------------ tour steps ------------------------------ */

    const isLast = step === steps.length - 1
    const current = steps[step]
    const pos = cardPosition(rect, cardH)

    const highlight = rect
        ? {
              left: Math.max(4, rect.left - 6),
              top: Math.max(4, rect.top - 6),
              width: Math.min(window.innerWidth - 8, rect.width + 12),
              height: Math.min(window.innerHeight - 8, rect.height + 12),
          }
        : null

    return (
        <div className="pointer-events-none fixed inset-0 z-[120]">
            {highlight ? (
                <div className="tour-highlight fixed z-[121] rounded-lg" style={highlight} />
            ) : (
                <div className="fixed inset-0 z-[121] bg-black/55" />
            )}

            <div
                ref={cardRef}
                style={pos}
                className="tour-card pointer-events-auto fixed z-[123] border-3 border-black bg-menu p-4 text-fg shadow-brutal-lg"
            >
                <div className="flex items-start gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase opacity-70">
                            {t('onboarding.step', 'Step {{current}} of {{total}}', {
                                current: step + 1,
                                total: steps.length,
                            })}
                        </div>
                        <div className="font-heading text-lg font-black">{current.title}</div>
                    </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{current.text}</p>

                <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={finish}
                        className="border-2 border-black px-3 py-1.5 text-sm font-semibold opacity-80 hover:opacity-100"
                    >
                        {t('onboarding.skip', 'Skip tour')}
                    </button>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                className="border-2 border-black px-3 py-1.5 text-sm font-semibold"
                            >
                                {t('onboarding.back', 'Back')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (isLast) finish()
                                else setStep((s) => Math.min(steps.length - 1, s + 1))
                            }}
                            className="border-2 border-black bg-tab-active px-3 py-1.5 text-sm font-semibold text-tab-active-fg"
                        >
                            {isLast
                                ? t('onboarding.get-started', 'Get started! 🚀')
                                : t('onboarding.next', 'Next →')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
