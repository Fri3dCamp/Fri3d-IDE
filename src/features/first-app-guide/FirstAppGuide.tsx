import { useEffect, useState } from 'react'
import { CheckCircle2, Clipboard, ExternalLink, LifeBuoy, Rocket, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfirm, usePrompt } from '../../components/dialogs'
import { launchApp } from '../../services/apps.service'
import { saveCurrentFile } from '../../services/device.service'
import { useConnectionStore } from '../../stores/connection'
import { useEditorTabsStore } from '../../stores/editorTabs'
import { useFirstAppGuideStore } from '../../stores/firstAppGuide'
import { useUiStore } from '../../stores/ui'
import { getLiveView } from '../editor/CodeEditor'
import { checkFirstAppStep, FIRST_APP_GUIDE_STEPS, firstAppStepSolution, type GuideCheckError } from './guideSteps'
import { PythonSnippet } from './PythonSnippet'

type CheckState = 'idle' | 'running' | 'success' | GuideCheckError | 'save-failed'

const buttonClass =
    'border-2 border-black px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'

export function FirstAppGuide() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const open = useFirstAppGuideStore((state) => state.open)
    const appId = useFirstAppGuideStore((state) => state.appId)
    const stepIndex = useFirstAppGuideStore((state) => state.step)
    const close = useFirstAppGuideStore((state) => state.close)
    const setStep = useFirstAppGuideStore((state) => state.setStep)
    const setTerminalTab = useUiStore((state) => state.setTerminalTab)
    const isVirtualBadge = useConnectionStore((state) => state.transportType === 'vm')
    const activeTab = useEditorTabsStore((state) => state.tabs.find((tab) => tab.id === state.activeId))
    const [checkState, setCheckState] = useState<CheckState>('idle')
    const [copied, setCopied] = useState(false)

    const step = FIRST_APP_GUIDE_STEPS[stepIndex]

    useEffect(() => {
        setCheckState('idle')
        setCopied(false)
    }, [stepIndex, activeTab?.id])

    useEffect(() => {
        if (open && step?.id === 'logging') setTerminalTab('terminal')
    }, [open, setTerminalTab, step?.id])

    if (!open || !appId || !step) return null

    const checkAndLaunch = async () => {
        const content = typeof activeTab?.content === 'string' ? activeTab.content : undefined
        const error = checkFirstAppStep(stepIndex, appId, activeTab?.fn, content)
        if (error) {
            setCheckState(error)
            return
        }

        setCheckState('running')
        const saved = await saveCurrentFile({ confirm, prompt })
        if (!saved) {
            setCheckState('save-failed')
            return
        }
        await launchApp(appId)
        setCheckState('success')
    }

    const insertSolution = async () => {
        if (!activeTab || activeTab.fn !== `/apps/${appId}/main.py`) {
            setCheckState('wrong-file')
            return
        }
        const ok = await confirm(
            t(
                'first-app-guide.stuck-confirm',
                'Replace everything in main.py with the working code for this step? Your own changes will be lost.',
            ),
        )
        if (!ok) return
        const solution = firstAppStepSolution(stepIndex)
        const view = getLiveView(activeTab.id)
        if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: solution } })
        const tabs = useEditorTabsStore.getState()
        tabs.setContent(activeTab.id, solution)
        tabs.markDirty(activeTab.id)
        setCheckState('idle')
    }

    const copySnippet = async () => {
        if (!step.snippet) return
        await navigator.clipboard.writeText(step.snippet)
        setCopied(true)
    }

    const messageForState = (state: CheckState): string | null => {
        if (state === 'idle' || state === 'running') return null
        if (state === 'success') {
            return t(
                'first-app-guide.check-success',
                'Code looks good. App was saved and launched—check it on your badge.',
            )
        }
        const messages: Record<Exclude<CheckState, 'idle' | 'running' | 'success'>, [string, string]> = {
            'wrong-file': [
                'first-app-guide.errors.wrong-file',
                'Open main.py from the app you created before checking this step.',
            ],
            'starter-missing': [
                'first-app-guide.errors.starter-missing',
                'Starter label is missing. Restore the Hello World template code first.',
            ],
            'greeting-unchanged': [
                'first-app-guide.errors.greeting-unchanged',
                'Change the greeting and move the label upward with label.align(...).',
            ],
            'logging-missing': [
                'first-app-guide.errors.logging-missing',
                'Add a print(...) call so the app writes a message to the terminal.',
            ],
            'button-missing': [
                'first-app-guide.errors.button-missing',
                'No complete button found yet. Add both lv.button and its label.',
            ],
            'counter-missing': [
                'first-app-guide.errors.counter-missing',
                'Connect the button click to a counter using add_event_cb.',
            ],
            'progress-missing': [
                'first-app-guide.errors.progress-missing',
                'Connect the progress bar to self.count and fill it in 10 taps.',
            ],
            'joystick-missing': [
                'first-app-guide.errors.joystick-missing',
                'No joystick handling found yet. Add on_key, register it with lv.EVENT.KEY, and add the screen to the input group.',
            ],
            'game-missing': [
                'first-app-guide.errors.game-missing',
                'The game is not finished yet. Add the spark (lv.SYMBOL.CHARGE), move it with random.randint, and catch it with the A button (lv.KEY.ENTER).',
            ],
            'save-failed': [
                'first-app-guide.errors.save-failed',
                'Code passed the check, but saving failed. Check the connection and try again.',
            ],
        }
        const [key, fallback] = messages[state]
        return t(key, fallback)
    }

    const statusMessage = messageForState(checkState)
    const last = stepIndex === FIRST_APP_GUIDE_STEPS.length - 1

    return (
        <aside className="flex min-h-0 w-[min(36vw,390px)] min-w-[300px] shrink-0 flex-col border-l-3 border-black bg-menu text-fg max-lg:max-h-[48%] max-lg:w-full max-lg:min-w-0 max-lg:border-l-0 max-lg:border-t-3">
            <div className="flex items-start justify-between gap-3 border-b-2 border-black p-3">
                <div className="min-w-0">
                    <div className="font-heading text-lg font-black">
                        {t('first-app-guide.title', 'Build your first app')}
                    </div>
                    <div className="truncate font-mono text-[11px] opacity-65">{appId}</div>
                </div>
                <button
                    type="button"
                    onClick={close}
                    className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black"
                    aria-label={t('first-app-guide.close', 'Close guide')}
                >
                    <X size={16} aria-hidden />
                </button>
            </div>

            <div className="flex gap-1 border-b-2 border-black px-3 py-2" aria-label={t('first-app-guide.progress', 'Guide progress')}>
                {FIRST_APP_GUIDE_STEPS.map((item, index) => (
                    <div
                        key={item.id}
                        className={`h-2 flex-1 border border-black ${index <= stepIndex ? 'bg-accent' : 'bg-edit'}`}
                    />
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="text-xs font-bold uppercase tracking-wide opacity-60">
                    {t('first-app-guide.step', 'Step {{current}} of {{total}}', {
                        current: stepIndex + 1,
                        total: FIRST_APP_GUIDE_STEPS.length,
                    })}
                </div>
                <h2 className="mt-1 font-heading text-xl font-black">
                    {t(`first-app-guide.steps.${step.id}.title`, step.id)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed">
                    {t(`first-app-guide.steps.${step.id}.instruction`, '')}
                </p>
                <div className="mt-3 border-l-4 border-accent bg-edit p-3 text-sm">
                    <strong>{t('first-app-guide.goal', 'Goal:')}</strong>{' '}
                    {t(`first-app-guide.steps.${step.id}.goal`, '')}
                </div>

                {isVirtualBadge && stepIndex === 0 ? (
                    <div className="mt-4 border-2 border-black bg-edit p-3 text-sm">
                        <div className="font-heading font-black">
                            {t('first-app-guide.virtual-controls.title', 'Keep the virtual badge out of your way')}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                            <li>{t('first-app-guide.virtual-controls.move', 'Move it by dragging the purple handle.')}</li>
                            <li>{t('first-app-guide.virtual-controls.popout', 'Click ⧉ to open it in a separate window.')}</li>
                            <li>{t('first-app-guide.virtual-controls.minimize', 'Click ▾ to minimize it to the handle. Running a checkpoint restores it automatically.')}</li>
                        </ul>
                    </div>
                ) : null}

                <div className="mt-4">
                    <div className="text-xs font-bold uppercase opacity-65">
                        {t('first-app-guide.docs-title', 'Learn more')}
                    </div>
                    <div className="mt-1 flex flex-col items-start gap-1">
                        {step.docs.map((doc) => (
                            <a
                                key={doc.key}
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-highlight hover:underline"
                            >
                                <ExternalLink size={13} aria-hidden />
                                {t(`first-app-guide.docs.${doc.key}`, doc.fallback)}
                            </a>
                        ))}
                    </div>
                </div>

                {step.snippet ? (
                    <div className="mt-4">
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase opacity-65">
                                {t('first-app-guide.code-to-add', 'Code to add')}
                            </span>
                            <button
                                type="button"
                                onClick={() => void copySnippet()}
                                className="flex items-center gap-1 px-1 text-xs font-semibold hover:underline"
                            >
                                <Clipboard size={13} aria-hidden />
                                {copied
                                    ? t('first-app-guide.copied', 'Copied')
                                    : t('first-app-guide.copy', 'Copy')}
                            </button>
                        </div>
                        <PythonSnippet code={step.snippet} />
                    </div>
                ) : null}

                <button
                    type="button"
                    onClick={() => void checkAndLaunch()}
                    disabled={checkState === 'running'}
                    className={`${buttonClass} mt-4 flex w-full items-center justify-center gap-2 bg-tab-active text-tab-active-fg`}
                >
                    {checkState === 'success' ? <CheckCircle2 size={17} aria-hidden /> : <Rocket size={17} aria-hidden />}
                    {checkState === 'running'
                        ? t('first-app-guide.checking', 'Checking and launching…')
                        : t('first-app-guide.check-launch', 'Check, save & launch')}
                </button>

                {statusMessage ? (
                    <div
                        role="status"
                        className={`mt-3 border-2 border-black bg-edit p-3 text-sm ${checkState === 'success' ? 'text-icon-success' : 'text-icon-error'}`}
                    >
                        {statusMessage}
                    </div>
                ) : null}

                <button
                    type="button"
                    onClick={() => void insertSolution()}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold opacity-70 hover:underline hover:opacity-100"
                >
                    <LifeBuoy size={13} aria-hidden />
                    {t('first-app-guide.stuck', 'Stuck? Replace my code with the answer')}
                </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t-2 border-black p-3">
                <button
                    type="button"
                    className={buttonClass}
                    disabled={stepIndex === 0}
                    onClick={() => setStep(stepIndex - 1)}
                >
                    {t('first-app-guide.back', 'Previous')}
                </button>
                <button
                    type="button"
                    className={`${buttonClass} bg-accent`}
                    disabled={checkState !== 'success'}
                    onClick={() => {
                        if (last) close()
                        else setStep(stepIndex + 1)
                    }}
                >
                    {last
                        ? t('first-app-guide.finish', 'Finish')
                        : t('first-app-guide.next', 'Next feature')}
                </button>
            </div>
        </aside>
    )
}
