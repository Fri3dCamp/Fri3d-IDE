export interface GuideDocLink {
    key: 'creating-apps' | 'app-lifecycle' | 'labels' | 'buttons' | 'events' | 'bars'
    url: string
    fallback: string
}

export interface FirstAppGuideStep {
    id: 'start' | 'greeting' | 'button' | 'counter' | 'progress'
    snippet?: string
    docs: GuideDocLink[]
}

export const FIRST_APP_GUIDE_STEPS: FirstAppGuideStep[] = [
    {
        id: 'start',
        docs: [
            {
                key: 'creating-apps',
                url: 'https://docs.micropythonos.com/apps/creating-apps/',
                fallback: 'Creating MicroPythonOS apps',
            },
            {
                key: 'app-lifecycle',
                url: 'https://docs.micropythonos.com/apps/app-lifecycle/',
                fallback: 'MicroPythonOS app lifecycle',
            },
        ],
    },
    {
        id: 'greeting',
        docs: [
            {
                key: 'labels',
                url: 'https://docs.lvgl.io/9.2/widgets/label.html',
                fallback: 'LVGL labels',
            },
        ],
        snippet: `        label.set_text("Hello, badge coder!")
        label.align(lv.ALIGN.CENTER, 0, -60)`,
    },
    {
        id: 'button',
        docs: [
            {
                key: 'buttons',
                url: 'https://docs.lvgl.io/9.2/widgets/button.html',
                fallback: 'LVGL buttons',
            },
        ],
        snippet: `        button = lv.button(screen)
        button.center()
        button_label = lv.label(button)
        button_label.set_text("Tap me")
        button_label.center()`,
    },
    {
        id: 'counter',
        docs: [
            {
                key: 'events',
                url: 'https://docs.lvgl.io/9.2/overview/event.html',
                fallback: 'LVGL events',
            },
        ],
        snippet: `        self.count = 0

        def on_click(event):
            self.count += 1
            label.set_text("Taps: {}".format(self.count))

        button.add_event_cb(on_click, lv.EVENT.CLICKED, None)`,
    },
    {
        id: 'progress',
        docs: [
            {
                key: 'bars',
                url: 'https://docs.lvgl.io/9.2/widgets/bar.html',
                fallback: 'LVGL bars',
            },
        ],
        snippet: `        progress = lv.bar(screen)
        progress.set_width(180)
        progress.set_value(70, False)
        progress.align(lv.ALIGN.CENTER, 0, 70)`,
    },
]

export type GuideCheckError =
    | 'wrong-file'
    | 'starter-missing'
    | 'greeting-unchanged'
    | 'button-missing'
    | 'counter-missing'
    | 'progress-missing'

export function checkFirstAppStep(
    step: number,
    appId: string,
    filename: string | undefined,
    content: string | undefined,
): GuideCheckError | null {
    if (filename !== `/apps/${appId}/main.py` || content === undefined) return 'wrong-file'
    if (step === 0 && (!content.includes('class Main(Activity):') || !content.includes('lv.label(screen)'))) {
        return 'starter-missing'
    }
    if (
        step === 1 &&
        (content.includes('Hello from ') ||
            !content.includes('label.set_text(') ||
            !content.includes('label.align(lv.ALIGN.CENTER'))
    ) {
        return 'greeting-unchanged'
    }
    if (step === 2 && (!content.includes('lv.button(screen)') || !content.includes('lv.label(button)'))) {
        return 'button-missing'
    }
    if (
        step === 3 &&
        (!content.includes('self.count') ||
            !content.includes('add_event_cb') ||
            !content.includes('lv.EVENT.CLICKED'))
    ) {
        return 'counter-missing'
    }
    if (step === 4 && (!content.includes('lv.bar(screen)') || !content.includes('progress.set_value('))) {
        return 'progress-missing'
    }
    return null
}
