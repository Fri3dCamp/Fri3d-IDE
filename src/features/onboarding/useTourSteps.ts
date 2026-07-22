import { useMemo } from 'react'
import type { SideMenuTab } from '../../stores/ui'
import type { OnboardingTask } from './OnboardingWelcome'

export interface TourStep {
    key: string
    title: string
    text: string
    selectors?: string[]
    menuTab?: SideMenuTab
}

type Translate = (key: string, fallback: string) => string

export function createTourSteps(task: OnboardingTask | null, t: Translate): TourStep[] {
        const connection: TourStep = {
            key: 'connection',
            title: t('onboarding.steps.connection.title', 'Badge ready'),
            text: t(
                'onboarding.steps.connection.text',
                'Your badge is connected and synchronized. The status footer shows its transport and activity.',
            ),
            selectors: ['[data-tour-id="tour-connection"]'],
            menuTab: 'apps',
        }
        const saveRun: TourStep = {
            key: 'save-run',
            title: t('onboarding.steps.save-run.title', 'Save & Run'),
            text: t(
                'onboarding.steps.save-run.text',
                'Change the open Python file, then use Save & Run to store and execute it.',
            ),
            selectors: ['[data-tour-id="tour-save-run"]'],
        }

        if (task === 'connect') {
            return [
                connection,
                {
                    key: 'done',
                    title: t('onboarding.success-connect-title', 'Badge connected!'),
                    text: t('onboarding.success-connect', 'Your physical badge is ready for files, apps, and the terminal.'),
                },
            ]
        }
        if (task === 'build') {
            return [
                connection,
                {
                    key: 'create-app',
                    title: t('onboarding.create-first-title', 'Create your starter app'),
                    text: t(
                        'onboarding.create-first-text',
                        'Select Create New App, keep the Hello World template, give it an ID, and create it.',
                    ),
                    selectors: ['[data-tour-id="tour-create-app"]'],
                    menuTab: 'apps',
                },
                saveRun,
                {
                    key: 'done',
                    title: t('onboarding.success-build-title', 'Your first app is ready!'),
                    text: t('onboarding.success-build', 'You created an app and opened its code. Keep experimenting, then launch it from Apps.'),
                },
            ]
        }
        if (task === 'badgehub') {
            return [
                connection,
                {
                    key: 'badgehub',
                    title: t('onboarding.badgehub-title', 'Choose an app'),
                    text: t(
                        'onboarding.badgehub-text',
                        'Open BadgeHub, choose a compatible app, and install it on the badge.',
                    ),
                    selectors: ['[data-tour-id="tour-badgehub"]'],
                    menuTab: 'apps',
                },
                {
                    key: 'done',
                    title: t('onboarding.success-badgehub-title', 'BadgeHub is ready!'),
                    text: t('onboarding.success-badgehub', 'Installed apps appear in the Apps list and can be launched from there.'),
                },
            ]
        }
        return [
            connection,
            {
                key: 'apps',
                title: t('onboarding.steps.apps.title', 'Explore the virtual badge'),
                text: t('onboarding.steps.apps.text', 'Open an installed app or use the terminal and file browser to explore.'),
                selectors: ['[data-tour-id="tour-app-list"]'],
                menuTab: 'apps',
            },
            {
                key: 'done',
                title: t('onboarding.success-virtual-title', 'Virtual badge running!'),
                text: t('onboarding.success-virtual', 'You can now experiment without changing a physical badge.'),
            },
        ]
}

export function useTourSteps(task: OnboardingTask | null, t: Translate): TourStep[] {
    return useMemo(() => createTourSteps(task, t), [task, t])
}
