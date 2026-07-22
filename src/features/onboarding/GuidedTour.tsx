import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfirm, usePrompt } from '../../components/dialogs'
import { connectDevice } from '../../services/device.service'
import { useAppsStore } from '../../stores/apps'
import { isConnectionReady, useConnectionStore } from '../../stores/connection'
import { useUiStore } from '../../stores/ui'
import { OnboardingWelcome, type OnboardingTask } from './OnboardingWelcome'
import { firstVisibleRect, tourCardPosition } from './tourLayout'
import { useTourSteps } from './useTourSteps'

const TOUR_STORAGE_KEY = 'fri3d.onboarding.tour.v4'
const TOUR_RESTART_EVENT = 'fri3d:onboarding:restart'

export function restartOnboardingTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY)
    window.dispatchEvent(new Event(TOUR_RESTART_EVENT))
}

type TourMode = null | 'choose' | 'connecting' | 'touring'

export function GuidedTour() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const prompt = usePrompt()
    const [mode, setMode] = useState<TourMode>(null)
    const [task, setTask] = useState<OnboardingTask | null>(null)
    const [step, setStep] = useState(0)
    const [rect, setRect] = useState<DOMRect | null>(null)
    const [cardHeight, setCardHeight] = useState(220)
    const cardRef = useRef<HTMLDivElement>(null)
    const appBaselineRef = useRef<Set<string> | null>(null)
    const status = useConnectionStore((state) => state.status)
    const connectionError = useConnectionStore((state) => state.error)
    const apps = useAppsStore((state) => state.apps)
    const steps = useTourSteps(task, t)

    useEffect(() => {
        if (localStorage.getItem(TOUR_STORAGE_KEY) !== 'done') setMode('choose')
        const restart = () => {
            setTask(null)
            setStep(0)
            setMode('choose')
        }
        window.addEventListener(TOUR_RESTART_EVENT, restart)
        return () => window.removeEventListener(TOUR_RESTART_EVENT, restart)
    }, [])

    useEffect(() => {
        if (mode !== 'connecting' || !isConnectionReady(status)) return
        setStep(0)
        setMode('touring')
    }, [mode, status])

    useEffect(() => {
        if (mode !== 'touring') return
        const current = steps[step]
        if (current?.menuTab) useUiStore.getState().setSideMenuTab(current.menuTab)

        const update = () => {
            setRect(firstVisibleRect(current?.selectors))
            if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
        }
        update()
        const animationFrame = requestAnimationFrame(update)
        const interval = window.setInterval(update, 250)
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        return () => {
            cancelAnimationFrame(animationFrame)
            window.clearInterval(interval)
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
        }
    }, [mode, step, steps])

    useEffect(() => {
        if (mode !== 'touring') return
        const key = steps[step]?.key
        if (key !== 'create-app' && key !== 'badgehub') {
            appBaselineRef.current = null
            return
        }
        if (!apps) return
        if (!appBaselineRef.current) {
            appBaselineRef.current = new Set(apps.map((app) => app.fullname))
            return
        }
        if (apps.some((app) => !appBaselineRef.current?.has(app.fullname))) {
            appBaselineRef.current = null
            setStep((current) => Math.min(steps.length - 1, current + 1))
        }
    }, [apps, mode, step, steps])

    const finish = () => {
        localStorage.setItem(TOUR_STORAGE_KEY, 'done')
        setMode(null)
    }

    const chooseTask = (selectedTask: OnboardingTask) => {
        setTask(selectedTask)
        setMode('connecting')
        const transport = selectedTask === 'connect' ? 'usb' : 'vm'
        void connectDevice(transport, { confirm, prompt }).then(() => {
            const currentStatus = useConnectionStore.getState().status
            if (currentStatus === 'disconnected') setMode('choose')
        })
    }

    if (mode === null) return null
    if (mode === 'choose') return <OnboardingWelcome onChoose={chooseTask} onSkip={finish} />

    if (mode === 'connecting') {
        return (
            <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4">
                <div className="w-[min(94vw,420px)] border-3 border-black bg-menu p-5 text-center text-fg shadow-brutal-lg">
                    <Loader2 size={28} className="mx-auto animate-spin" aria-hidden />
                    <div className="mt-3 font-heading text-lg font-black">
                        {task === 'connect'
                            ? t('onboarding.connecting-real', 'Connecting your badge…')
                            : t('onboarding.connecting-virtual', 'Starting the virtual badge…')}
                    </div>
                    <p className="mt-2 text-sm opacity-80">
                        {connectionError ?? t('onboarding.connecting-wait', 'Complete any browser permission prompt to continue.')}
                    </p>
                    {status === 'error' ? (
                        <button
                            type="button"
                            className="mt-4 border-2 border-black px-3 py-1.5 text-sm font-semibold"
                            onClick={() => setMode('choose')}
                        >
                            {t('onboarding.back', 'Back')}
                        </button>
                    ) : null}
                </div>
            </div>
        )
    }

    const current = steps[step]
    const last = step === steps.length - 1
    const position = tourCardPosition(rect, cardHeight)
    const highlight = rect
        ? {
              left: Math.max(4, rect.left - 6),
              top: Math.max(4, rect.top - 6),
              width: Math.min(window.innerWidth - 8, rect.width + 12),
              height: Math.min(window.innerHeight - 8, rect.height + 12),
          }
        : null

    return (
        <div className="pointer-events-none fixed inset-0 z-[120]">
            {highlight ? (
                <div className="tour-highlight fixed z-[121] rounded-lg" style={highlight} />
            ) : (
                <div className="fixed inset-0 z-[121] bg-black/55" />
            )}
            <div
                ref={cardRef}
                style={position}
                className="tour-card pointer-events-auto fixed z-[123] border-3 border-black bg-menu p-4 text-fg shadow-brutal-lg"
            >
                <div className="text-xs font-semibold uppercase opacity-70">
                    {t('onboarding.step', 'Step {{current}} of {{total}}', {
                        current: step + 1,
                        total: steps.length,
                    })}
                </div>
                <div className="font-heading text-lg font-black">{current.title}</div>
                <p className="mt-2 text-sm leading-relaxed">{current.text}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={finish}
                        className="border-2 border-black px-3 py-1.5 text-sm font-semibold opacity-80 hover:opacity-100"
                    >
                        {t('onboarding.skip', 'Skip guide')}
                    </button>
                    <div className="flex items-center gap-2">
                        {step > 0 ? (
                            <button
                                type="button"
                                onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
                                className="border-2 border-black px-3 py-1.5 text-sm font-semibold"
                            >
                                {t('onboarding.back', 'Back')}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                if (last) finish()
                                else setStep((currentStep) => Math.min(steps.length - 1, currentStep + 1))
                            }}
                            className="border-2 border-black bg-tab-active px-3 py-1.5 text-sm font-semibold text-tab-active-fg"
                        >
                            {last
                                ? t('onboarding.get-started', 'Continue to IDE')
                                : t('onboarding.next', 'Next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
