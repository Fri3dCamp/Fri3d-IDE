import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Settings {
    advancedMode: boolean
    interruptDevice: boolean
    forceSerialPolyfill: boolean
    vbadgePopOut: boolean
    expandMinifyJson: boolean
    wordWrap: boolean
    renderMarkdown: boolean
    preferSource: boolean
    zoom: number
    colorTheme: 'system' | 'light' | 'dark'
    naturalSort: boolean
    sideMenuWidth: number
}

interface SettingsStore extends Settings {
    set<K extends keyof Settings>(key: K, value: Settings[K]): void
}

const DEFAULTS: Settings = {
    advancedMode: false,
    interruptDevice: true,
    forceSerialPolyfill: false,
    vbadgePopOut: false,
    expandMinifyJson: true,
    wordWrap: false,
    renderMarkdown: true,
    preferSource: false,
    zoom: 1.0,
    colorTheme: 'system',
    naturalSort: true,
    sideMenuWidth: 300,
}

/** Storage key kept from the legacy app so existing users retain settings. */
const STORAGE_KEY = 'viper.settings.ui.v1'

/** Legacy → new key mapping for values persisted by the pre-React app. */
const LEGACY_KEYS: Record<string, keyof Settings> = {
    'advanced-mode': 'advancedMode',
    'interrupt-device': 'interruptDevice',
    'force-serial-poly': 'forceSerialPolyfill',
    'expand-minify-json': 'expandMinifyJson',
    'use-word-wrap': 'wordWrap',
    'render-markdown': 'renderMarkdown',
    'install-package-source': 'preferSource',
    'color-theme': 'colorTheme',
    'use-natural-sort': 'naturalSort',
    'side-menu-width': 'sideMenuWidth',
}

const SETTINGS_KEYS = new Set(Object.keys(DEFAULTS))

function migrateLegacy(raw: Record<string, unknown>): Partial<Settings> {
    const out: Record<string, unknown> = {}
    for (const [legacyKey, newKey] of Object.entries(LEGACY_KEYS)) {
        if (legacyKey in raw) out[newKey] = raw[legacyKey]
    }
    if ('zoom' in raw) out.zoom = parseFloat(String(raw.zoom)) || 1.0
    return out as Partial<Settings>
}

function hasAnyKey(raw: Record<string, unknown>, keys: Iterable<string>): boolean {
    for (const k of keys) {
        if (k in raw) return true
    }
    return false
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            ...DEFAULTS,
            set: (key, value) => set({ [key]: value }),
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            // Keep modern persisted state as-is. Only run legacy migration
            // when dashed legacy keys are present and no modern settings keys
            // exist in the persisted object.
            merge: (persisted, current) => {
                if (!persisted || typeof persisted !== 'object') return current

                const raw = persisted as Record<string, unknown>
                const hasModern = hasAnyKey(raw, SETTINGS_KEYS)
                const hasLegacy = hasAnyKey(raw, Object.keys(LEGACY_KEYS))

                if (hasModern) return { ...current, ...(persisted as Partial<Settings>) }
                if (hasLegacy) return { ...current, ...migrateLegacy(raw) }
                return { ...current, ...(persisted as Partial<Settings>) }
            },
            partialize: (s) => {
                const { set: _set, ...rest } = s
                return rest as unknown as SettingsStore
            },
        },
    ),
)
