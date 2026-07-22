import { useTranslation } from 'react-i18next'
import { ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { createDiagnosticsReport } from '../../services/diagnostics'

function buildDate(): string {
    try {
        return new Date(Number(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T', ' ')
    } catch {
        return ''
    }
}

export function AboutPanel() {
    const { t } = useTranslation()
    const copyDiagnostics = async () => {
        try {
            await navigator.clipboard.writeText(createDiagnosticsReport())
            toast.success(t('about.diagnostics-copied', 'Diagnostics copied'))
        } catch (error) {
            toast.error(t('about.diagnostics-failed', 'Could not copy diagnostics'), {
                description: String(error),
            })
        }
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 text-center">
            <div className="mt-2 font-heading text-xl font-black">Fri3d-IDE</div>
            <div className="text-sm opacity-80">{VIPER_IDE_VERSION}</div>
            <div className="text-xs opacity-60">build {buildDate()}</div>
            <button
                type="button"
                className="mx-auto mt-3 flex items-center gap-2 border-2 border-black bg-cta px-3 py-1.5 text-sm font-semibold text-cta-fg shadow-brutal"
                onClick={() => void copyDiagnostics()}
            >
                <ClipboardCopy size={15} aria-hidden />
                {t('about.copy-diagnostics', 'Copy diagnostics')}
            </button>
            <p className="mt-4 text-sm">
                Original <a className="text-fg-highlight underline" href="https://github.com/vshymanskyy/ViperIDE" target="_blank" rel="noreferrer">ViperIDE project</a> made by
                <br />
                {t('about.by', 'by')}{' '}
                <a className="text-fg-highlight underline" href="https://x.com/vshymanskyy" target="_blank" rel="noreferrer">
                    Volodymyr Shymanskyy
                </a>.</p>

            <p>Adapted into Fri3d-IDE by{' '}
                <a className="text-fg-highlight underline" href="https://www.sebastiaanjansen.be/" target="_blank" rel="noreferrer">Sebastiaan Jansen</a>
            </p>
            <hr className="my-4 border-black/30" />
            <p className="text-sm">
                {t('about.cta-pre', 'If you like Fri3d-IDE, please')}{' '}
                <a
                    className="text-fg-highlight underline"
                    href="https://github.com/Fri3dCamp/Fri3d-IDE"
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
                    href="https://github.com/Fri3dCamp/Fri3d-IDE/issues"
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
