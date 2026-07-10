import { useTranslation } from 'react-i18next'
import { useSettingsStore, type Settings } from '../../stores/settings'
import { LANGUAGES, i18next } from '../../i18n'

function Toggle({ id, label, extra }: { id: keyof Settings & string; label: string; extra?: React.ReactNode }) {
    const value = useSettingsStore((s) => s[id] as boolean)
    const set = useSettingsStore((s) => s.set)
    return (
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <input
                type="checkbox"
                checked={value}
                onChange={(e) => set(id, e.target.checked as never)}
                className="h-4 w-4 accent-(--raw-accent)"
            />
            <span>{label}</span>
            {extra}
        </label>
    )
}

function Select<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (v: T) => void
}) {
    return (
        <label className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                className="max-w-[55%] border-2 border-black bg-edit px-2 py-1 text-fg"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    )
}

export function SettingsPanel() {
    const { t, i18n } = useTranslation()
    const zoom = useSettingsStore((s) => s.zoom)
    const colorTheme = useSettingsStore((s) => s.colorTheme)
    const set = useSettingsStore((s) => s.set)

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            <div className="mb-1 font-heading text-sm font-bold uppercase tracking-wide">
                {t('menu.settings', 'Settings')}
            </div>

            <Toggle
                id="advancedMode"
                label={`🔬 ${t('settings.advanced-mode', 'Advanced mode')}`}
            />

            <div className="title-lines text-xs">{t('settings.conn', 'connection')}</div>
            <Toggle id="interruptDevice" label={t('settings.interrupt-device', 'Interrupt device')} />
            <Toggle id="forceSerialPolyfill" label={t('settings.force-serial-poly', 'Force WebSerial polyfill')} />

            <div className="title-lines text-xs">{t('settings.editor', 'editor')}</div>
            <Toggle id="expandMinifyJson" label={t('settings.expand-minify-json', 'Auto expand/minify JSON')} />
            <Toggle id="wordWrap" label={t('settings.use-word-wrap', 'Enable word wrap')} />
            <Toggle id="renderMarkdown" label={t('settings.render-markdown', 'Enable Markdown viewer')} />

            <div className="title-lines text-xs">{t('menu.package-mgr', 'package manager')}</div>
            <Toggle id="preferSource" label={t('settings.prefer-source', 'Prefer installing sources (.py)')} />

            <div className="title-lines text-xs">{t('settings.other', 'other')}</div>
            <Select
                label={t('settings.lang', 'Language:')}
                value={i18n.resolvedLanguage ?? 'en'}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                onChange={(code) => void i18next.changeLanguage(code)}
            />
            <Select
                label={t('settings.zoom', 'Zoom:')}
                value={zoom.toFixed(2)}
                options={[
                    { value: '0.80', label: '80%' },
                    { value: '1.00', label: '100%' },
                    { value: '1.10', label: '110%' },
                    { value: '1.25', label: '125%' },
                    { value: '1.50', label: '150%' },
                ]}
                onChange={(v) => set('zoom', parseFloat(v))}
            />
            <Select
                label={t('settings.color-theme', 'Theme:')}
                value={colorTheme}
                options={[
                    { value: 'system', label: t('settings.theme-system', 'System') },
                    { value: 'light', label: t('settings.theme-light', 'Light') },
                    { value: 'dark', label: t('settings.theme-dark', 'Dark') },
                ]}
                onChange={(v) => set('colorTheme', v)}
            />
            <Toggle id="naturalSort" label={t('settings.use-natural-sort', 'Use natural sorting')} />
        </div>
    )
}
