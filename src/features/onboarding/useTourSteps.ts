import { useMemo } from 'react'
import type { SideMenuTab } from '../../stores/ui'
import type { OnboardingTask } from './onboardingFlow'

export interface TourStep {
    key: string
    title: string
    text: string
    selectors?: string[]
    menuTab?: SideMenuTab
    /** Advance only after user clicks highlighted control. */
    advanceOnClick?: boolean
    /** Hide generic Next button while UI action completes this step. */
    waitForAction?: boolean
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
                        'Click Create New App. The guide continues as soon as the dialog opens.',
                    ),
                    selectors: ['[data-tour-id="tour-create-app"]'],
                    menuTab: 'apps',
                    advanceOnClick: true,
                    waitForAction: true,
                },
                {
                    key: 'configure-app',
                    title: t('onboarding.configure-app-title', 'Set up your starter app'),
                    text: t(
                        'onboarding.configure-app-text',
                        'Keep Hello World selected, enter an App ID and display name, then click Create. The coding guide opens automatically.',
                    ),
                    selectors: ['[data-tour-id="tour-create-app-dialog"]'],
                    waitForAction: true,
                },
            ]
        }
        if (task === 'badgehub') {
            return [
                connection,
                {
                    key: 'badgehub',
                    title: t('onboarding.badgehub-title', 'Open BadgeHub'),
                    text: t(
                        'onboarding.badgehub-text',
                        'Click Browse BadgeHub. The guide continues as soon as the store opens.',
                    ),
                    selectors: ['[data-tour-id="tour-badgehub"]'],
                    menuTab: 'apps',
                    advanceOnClick: true,
                    waitForAction: true,
                },
                {
                    key: 'browse-badgehub',
                    title: t('onboarding.browse-badgehub-title', 'Choose and install an app'),
                    text: t(
                        'onboarding.browse-badgehub-text',
                        'Search or browse for an app, then click Install. The tour continues after installation.',
                    ),
                    selectors: ['[data-tour-id="tour-badgehub-dialog"]'],
                    waitForAction: true,
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
