import { Cable, MonitorSmartphone, PackagePlus, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Fri3dLogo } from './Fri3dLogo'

export type OnboardingTask = 'connect' | 'virtual' | 'build' | 'badgehub'

export function OnboardingWelcome({
    onChoose,
    onSkip,
}: {
    onChoose: (task: OnboardingTask) => void
    onSkip: () => void
}) {
    const { t } = useTranslation()
    const options = [
        {
            task: 'connect' as const,
            icon: Cable,
            title: t('onboarding.task-connect', 'Connect my badge'),
            description: t('onboarding.task-connect-detail', 'Use USB to connect a physical Fri3d badge.'),
        },
        {
            task: 'virtual' as const,
            icon: MonitorSmartphone,
            title: t('onboarding.task-virtual', 'Try the virtual badge'),
            description: t('onboarding.task-virtual-detail', 'Explore MicroPythonOS without hardware.'),
        },
        {
            task: 'build' as const,
            icon: PackagePlus,
            title: t('onboarding.task-build', 'Build my first app'),
            description: t('onboarding.task-build-detail', 'Create, edit, save, and run a starter app.'),
        },
        {
            task: 'badgehub' as const,
            icon: Store,
            title: t('onboarding.task-badgehub', 'Install an app from BadgeHub'),
            description: t('onboarding.task-badgehub-detail', 'Browse and install a compatible badge app.'),
        },
    ]

    return (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4">
            <div className="w-[min(94vw,620px)] border-3 border-black bg-menu p-6 text-fg shadow-brutal-lg">
                <div className="flex justify-center">
                    <Fri3dLogo size={76} />
                </div>
                <div className="mt-2 text-center font-heading text-2xl font-black">
                    {t('onboarding.task-welcome-title', 'What do you want to do?')}
                </div>
                <p className="mt-2 text-center text-sm leading-relaxed">
                    {t('onboarding.task-welcome-text', 'Choose what you want to do.')}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {options.map(({ task, icon: Icon, title, description }, index) => (
                        <button
                            key={task}
                            type="button"
                            onClick={() => onChoose(task)}
                            className={`flex min-h-24 items-start gap-3 border-2 border-black p-3 text-left shadow-brutal transition-transform hover:brightness-110 active:translate-x-1 active:translate-y-1 active:shadow-none ${
                                index === 0
                                    ? 'bg-(--fri3d-purple) text-white'
                                    : 'bg-edit text-fg'
                            }`}
                        >
                            <Icon size={21} className="mt-0.5 shrink-0" aria-hidden />
                            <span>
                                <span className="block font-semibold">{title}</span>
                                <span className="mt-1 block text-xs opacity-80">{description}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onSkip}
                    className="mx-auto mt-5 block px-3 py-1 text-sm font-semibold opacity-70 hover:opacity-100"
                >
                    {t('onboarding.skip-to-editor', 'Skip to editor')}
                </button>
            </div>
        </div>
    )
}
