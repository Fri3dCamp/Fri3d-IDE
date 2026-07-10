import { create } from 'zustand'
import { useSettingsStore } from '../stores/settings'

/*
 * Theme resolution: settings.colorTheme (system|light|dark) + OS preference
 * → single boolean, mirrored to <html data-theme> for Tailwind/CSS tokens.
 */

interface ThemeStore {
    dark: boolean
}

const darkMQ = window.matchMedia('(prefers-color-scheme: dark)')

function resolveDark(pref: 'system' | 'light' | 'dark'): boolean {
    return pref === 'dark' || (pref === 'system' && darkMQ.matches)
}

export const useThemeStore = create<ThemeStore>(() => ({
    dark: resolveDark(useSettingsStore.getState().colorTheme),
}))

function apply(dark: boolean): void {
    useThemeStore.setState({ dark })
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

/** Call once at bootstrap. */
export function initTheme(): void {
    apply(resolveDark(useSettingsStore.getState().colorTheme))

    useSettingsStore.subscribe((state, prev) => {
        if (state.colorTheme !== prev.colorTheme) apply(resolveDark(state.colorTheme))
    })
    darkMQ.addEventListener('change', () => {
        if (useSettingsStore.getState().colorTheme === 'system') apply(darkMQ.matches)
    })
}

export function useThemeIsDark(): boolean {
    return useThemeStore((s) => s.dark)
}
