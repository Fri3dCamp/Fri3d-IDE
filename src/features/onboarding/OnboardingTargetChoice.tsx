import { Cable, MonitorSmartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OnboardingTarget } from './onboardingFlow'

export function OnboardingTargetChoice({
    task,
    onChoose,
    onBack,
}: {
    task: 'build' | 'badgehub'
    onChoose: (target: OnboardingTarget) => void
    onBack: () => void
}) {
    const { t } = useTranslation()
    const title =
        task === 'build'
            ? t('onboarding.target-build-title', 'Where should the app run?')
            : t('onboarding.target-badgehub-title', 'Where should the app be installed?')
    const options: Array<{
        target: OnboardingTarget
        icon: typeof Cable
        title: string
        description: string
    }> = [
        {
            target: 'real',
            icon: Cable,
            title: t('onboarding.target-real', 'Real Fri3d badge'),
            description: t('onboarding.target-real-detail', 'Connect over USB and use the physical badge.'),
        },
        {
            target: 'virtual',
            icon: MonitorSmartphone,
            title: t('onboarding.target-virtual', 'Virtual badge'),
            description: t('onboarding.target-virtual-detail', 'Run it in the browser without hardware.'),
        },
    ]

    return (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4">
            <div className="w-[min(94vw,520px)] border-3 border-black bg-menu p-6 text-fg shadow-brutal-lg">
                <div className="text-center font-heading text-2xl font-black">{title}</div>
                <p className="mt-2 text-center text-sm leading-relaxed">
                    {t('onboarding.target-text', 'Choose a physical Fri3d badge or the virtual badge.')}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {options.map(({ target, icon: Icon, title: optionTitle, description }) => (
                        <button
                            key={target}
                            type="button"
                            onClick={() => onChoose(target)}
                            className="flex min-h-24 items-start gap-3 border-2 border-black bg-edit p-3 text-left text-fg shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none"
                        >
                            <Icon size={21} className="mt-0.5 shrink-0" aria-hidden />
                            <span>
                                <span className="block font-semibold">{optionTitle}</span>
                                <span className="mt-1 block text-xs opacity-80">{description}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onBack}
                    className="mx-auto mt-5 block border-2 border-black px-3 py-1.5 text-sm font-semibold"
                >
                    {t('onboarding.back', 'Back')}
                </button>
            </div>
        </div>
    )
}
