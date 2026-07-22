export type OnboardingTask = 'connect' | 'virtual' | 'build' | 'badgehub'
export type OnboardingTarget = 'real' | 'virtual'

export function directTargetForTask(task: OnboardingTask): OnboardingTarget | null {
    if (task === 'connect') return 'real'
    if (task === 'virtual') return 'virtual'
    return null
}
