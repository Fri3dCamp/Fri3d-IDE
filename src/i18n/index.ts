import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import ar from './locales/ar.json'
import de from './locales/de.json'
import el from './locales/el.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import he from './locales/he.json'
import hi from './locales/hi.json'
import id from './locales/id.json'
import it from './locales/it.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import nl from './locales/nl.json'
import pl from './locales/pl.json'
import pt from './locales/pt.json'
import ro from './locales/ro.json'
import ru from './locales/ru.json'
import sv from './locales/sv.json'
import uk from './locales/uk.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

export const LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'en', label: '🇺🇸 English' },
    { code: 'es', label: '🇪🇸 Español' },
    { code: 'hi', label: '🇮🇳 हिंदी' },
    { code: 'fr', label: '🇫🇷 Français' },
    { code: 'pt', label: '🇵🇹 Português' },
    { code: 'de', label: '🇩🇪 Deutsch' },
    { code: 'pl', label: '🇵🇱 Polski' },
    { code: 'it', label: '🇮🇹 Italiano' },
    { code: 'uk', label: '🇺🇦 Українська' },
    { code: 'ro', label: '🇷🇴 Română' },
    { code: 'nl', label: '🇳🇱 Nederlands' },
    { code: 'sv', label: '🇸🇪 Svenska' },
    { code: 'el', label: '🇬🇷 Ελληνικά' },
    { code: 'ru', label: '🇷🇺 Русский' },
    { code: 'zh-CN', label: '🇨🇳 简体中文' },
    { code: 'zh-TW', label: '🇹🇼 繁體中文' },
    { code: 'ar', label: '🇸🇦 العربية' },
    { code: 'he', label: '🇮🇱 עברית' },
    { code: 'ja', label: '🇯🇵 日本語' },
    { code: 'ko', label: '🇰🇷 한국어' },
    { code: 'id', label: '🇮🇩 Bahasa Indonesia' },
]

export async function initI18n(): Promise<void> {
    await i18next
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
            fallbackLng: 'en',
            interpolation: { escapeValue: false }, // React escapes
            resources: {
                ar, de, el, en, es, fr, he, hi, id, it, ja, ko, nl, pl, pt, ro, ru, sv, uk,
                'zh-CN': zhCN,
                'zh-TW': zhTW,
            },
        })
    syncDir()
    i18next.on('languageChanged', syncDir)
}

function syncDir(): void {
    document.body.dir = i18next.dir()
}

export { i18next }
