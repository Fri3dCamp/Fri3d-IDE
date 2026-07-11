import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plane } from 'lucide-react'
import { Toaster } from 'sonner'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useThemeIsDark } from '../services/theme'

/** Sonner toaster themed to the app. */
export function AppToaster() {
    const dark = useThemeIsDark()
    return (
        <Toaster
            position="top-right"
            theme={dark ? 'dark' : 'light'}
            toastOptions={{
                classNames: {
                    toast: 'rounded-none! border-2! border-black! shadow-brutal! bg-menu! text-fg!',
                },
            }}
        />
    )
}

/** Stacked global loaders (non-blocking progress messages). */
export function LoaderStack() {
    const loaders = useUiStore((s) => s.loaders)
    if (!loaders.length) return null
    return (
        <div className="pointer-events-none fixed inset-e-3 top-14 z-50 flex flex-col gap-2" aria-live="polite">
            {loaders.map((l) => (
                <div
                    key={l.id}
                    className="min-w-64 border-2 border-black bg-menu px-3 py-2 text-sm shadow-brutal"
                >
                    <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{l.message}</span>
                        {l.progress !== undefined && (
                            <span className="shrink-0 text-xs opacity-70">{Math.round(l.progress * 100)}%</span>
                        )}
                    </div>
                    {l.progress !== undefined && (
                        <div className="mt-1 h-1.5 border border-black/30 bg-black/10">
                            <div
                                className="h-full bg-accent transition-[width] duration-150"
                                style={{ width: `${Math.max(0, Math.min(100, l.progress * 100))}%` }}
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

export function OfflineBadge() {
    const { t } = useTranslation()
    const offline = useUiStore((s) => s.offline)
    const setOffline = useUiStore((s) => s.setOffline)

    useEffect(() => {
        const sync = () => setOffline(!navigator.onLine)
        window.addEventListener('online', sync)
        window.addEventListener('offline', sync)
        return () => {
            window.removeEventListener('online', sync)
            window.removeEventListener('offline', sync)
        }
    }, [setOffline])

    if (!offline) return null
    return (
        <div className="fixed inset-e-3 top-3 z-50 flex items-center gap-1.5 border-2 border-black bg-icon-warning px-2 py-1 text-xs font-semibold text-black shadow-brutal">
            <Plane size={13} aria-hidden />
            {t('app.offline', 'Offline')}
        </div>
    )
}

/** Desktop-only sidebar width drag handle. */
export function SideMenuResizer() {
    const { t } = useTranslation()
    const width = useSettingsStore((s) => s.sideMenuWidth)
    const set = useSettingsStore((s) => s.set)
    const hidden = useUiStore((s) => s.sideMenuHidden)

    // Publish as CSS var for the aside.
    useEffect(() => {
        document.documentElement.style.setProperty('--side-menu-width', `${width}px`)
    }, [width])

    if (hidden) return null

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('menu.resize-sidebar', 'Resize sidebar')}
            className="w-1 shrink-0 cursor-ew-resize touch-none bg-black/40 transition-colors hover:bg-accent max-md:hidden"
            onPointerDown={(e) => {
                const startX = e.clientX
                const startWidth = useSettingsStore.getState().sideMenuWidth
                const el = e.currentTarget
                el.setPointerCapture(e.pointerId)
                const onMove = (ev: PointerEvent) => {
                    const dx = document.body.dir === 'rtl' ? startX - ev.clientX : ev.clientX - startX
                    set('sideMenuWidth', Math.min(600, Math.max(150, Math.round(startWidth + dx))))
                }
                const onUp = () => {
                    el.removeEventListener('pointermove', onMove)
                    el.removeEventListener('pointerup', onUp)
                }
                el.addEventListener('pointermove', onMove)
                el.addEventListener('pointerup', onUp)
            }}
        />
    )
}
