import { useTranslation } from 'react-i18next'

declare const VIPER_IDE_VERSION: string
declare const VIPER_IDE_BUILD: string

function buildDate(): string {
    try {
        return new Date(Number(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T', ' ')
    } catch {
        return ''
    }
}

export function AboutPanel() {
    const { t } = useTranslation()
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 text-center">
            <div className="mt-2 font-heading text-xl font-black">Fri3d-IDE</div>
            <div className="text-sm opacity-80">{VIPER_IDE_VERSION}</div>
            <div className="text-xs opacity-60">build {buildDate()}</div>
            <p className="mt-4 text-sm">
                MicroPython Web IDE
                <br />
                {t('about.by', 'by')}{' '}
                <a className="text-fg-highlight underline" href="https://x.com/vshymanskyy" target="_blank" rel="noreferrer">
                    Volodymyr Shymanskyy
                </a>
            </p>
            <hr className="my-4 border-black/30" />
            <p className="text-sm">
                {t('about.cta-pre', 'If you like Fri3d-IDE, please')}{' '}
                <a
                    className="text-fg-highlight underline"
                    href="https://github.com/DrSkunk/Fri3d-IDE"
                    target="_blank"
                    rel="noreferrer"
                >
                    {t('about.cta-star', 'give it a GitHub star')}
                </a>{' '}
                ⭐
            </p>
            <p className="mt-2 text-sm">
                <a
                    className="text-fg-highlight underline"
                    href="https://github.com/DrSkunk/Fri3d-IDE/issues"
                    target="_blank"
                    rel="noreferrer"
                >
                    {t('about.report-bug', 'report a bug')}
                </a>{' '}
                🐞
            </p>
            <hr className="my-4 border-black/30" />
            <p className="text-sm">
                With 💙💛 from{' '}
                <a className="text-fg-highlight underline" href="https://stand-with-ukraine.pp.ua" target="_blank" rel="noreferrer">
                    Ukraine
                </a> and Belgium.
            </p>
        </div>
    )
}
