export interface GuideDocLink {
    key:
        | 'creating-apps'
        | 'app-lifecycle'
        | 'labels'
        | 'print'
        | 'buttons'
        | 'events'
        | 'bars'
        | 'indev'
        | 'random'
    url: string
    fallback: string
}

export interface FirstAppGuideStep {
    id: 'start' | 'greeting' | 'logging' | 'button' | 'counter' | 'progress' | 'joystick' | 'game'
    snippet?: string
    docs: GuideDocLink[]
}

const GREETING_SNIPPET = `        label.set_text("Hello, badge coder!")
        label.align(lv.ALIGN.CENTER, 0, -60)`

const LOGGING_SNIPPET = `        import logging
        logger = logging.getLogger(__name__)
        logger.info("App started")`

const BUTTON_SNIPPET = `        button = lv.button(screen)
        button.center()
        button_label = lv.label(button)
        button_label.set_text("Tap me")
        button_label.center()`

const COUNTER_SNIPPET = `        self.count = 0

        def on_click(event):
            self.count += 1
            label.set_text("Taps: {}".format(self.count))

        button.add_event_cb(on_click, lv.EVENT.CLICKED, None)`

const PROGRESS_SNIPPET = `        progress = lv.bar(screen)
        progress.set_width(180)
        progress.set_range(0, 10)
        progress.set_value(0, False)
        progress.align(lv.ALIGN.CENTER, 0, 70)

        def on_click(event):
            self.count = min(self.count + 1, 10)
            label.set_text("Taps: {}/10".format(self.count))
            progress.set_value(self.count, False)

        button.add_event_cb(on_click, lv.EVENT.CLICKED, None)`

const PLAYER_SNIPPET = `        self.px = 0
        self.py = 40
        player = lv.label(screen)
        player.set_text(lv.SYMBOL.PLAY)
        player.align(lv.ALIGN.CENTER, self.px, self.py)`

const JOYSTICK_ON_KEY_SNIPPET = `        async def read_joystick():
            while True:
                digital = mpos.io_expander.digital
                self.px += (int(digital[1]) - int(digital[2])) * 3
                self.py += (int(digital[3]) - int(digital[4])) * 3
                self.px = max(-130, min(130, self.px))
                self.py = max(-90, min(90, self.py))
                player.align(lv.ALIGN.CENTER, self.px, self.py)
                await TaskManager.sleep_ms(20)

        TaskManager.create_task(read_joystick())`

const JOYSTICK_SNIPPET = `${PLAYER_SNIPPET}

${JOYSTICK_ON_KEY_SNIPPET}`

const KEY_WIRING_SNIPPET = `        lv.group_get_default().add_obj(screen)
        lv.group_focus_obj(screen)
        screen.add_event_cb(on_key, lv.EVENT.KEY, None)`

const GAME_SNIPPET = `        import random

        button.add_flag(lv.obj.FLAG.HIDDEN)

        spark = lv.label(screen)
        spark.set_text(lv.SYMBOL.CHARGE)

        def move_spark():
            self.sx = random.randint(-130, 130)
            self.sy = random.randint(-90, 90)
            spark.align(lv.ALIGN.CENTER, self.sx, self.sy)

        move_spark()

        def catch():
            if abs(self.px - self.sx) < 25 and abs(self.py - self.sy) < 25:
                self.count = min(self.count + 1, 10)
                label.set_text("Sparks: {}/10".format(self.count))
                progress.set_value(self.count, False)
                if self.count == 10:
                    label.set_text("You win! " + lv.SYMBOL.OK)
                move_spark()

        def on_key(event):
            key = event.get_key()
            if key == lv.KEY.LEFT:
                self.px -= 10
            elif key == lv.KEY.RIGHT:
                self.px += 10
            elif key == lv.KEY.UP:
                self.py -= 10
            elif key == lv.KEY.DOWN:
                self.py += 10
            elif key == lv.KEY.ENTER:
                catch()
            self.px = max(-130, min(130, self.px))
            self.py = max(-90, min(90, self.py))
            player.align(lv.ALIGN.CENTER, self.px, self.py)

${KEY_WIRING_SNIPPET}`

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
                url: 'https://lvgl.io/docs/open/9.4/details/widgets/label.html',
                fallback: 'LVGL labels',
            },
        ],
        snippet: GREETING_SNIPPET,
    },
    {
        id: 'logging',
        docs: [
            {
                key: 'print',
                url: 'https://docs.micropython.org/en/latest/library/builtins.html#print',
                fallback: 'Python logging',
            },
        ],
        snippet: LOGGING_SNIPPET,
    },
    {
        id: 'button',
        docs: [
            {
                key: 'buttons',
                url: 'https://lvgl.io/docs/open/9.4/details/widgets/button.html',
                fallback: 'LVGL buttons',
            },
        ],
        snippet: BUTTON_SNIPPET,
    },
    {
        id: 'counter',
        docs: [
            {
                key: 'events',
                url: 'https://lvgl.io/docs/open/9.4/details/common-widget-features/events',
                fallback: 'LVGL events',
            },
        ],
        snippet: COUNTER_SNIPPET,
    },
    {
        id: 'progress',
        docs: [
            {
                key: 'bars',
                url: 'https://lvgl.io/docs/open/9.4/details/widgets/bar',
                fallback: 'LVGL bars',
            },
        ],
        snippet: PROGRESS_SNIPPET,
    },
    {
        id: 'joystick',
        docs: [
            {
                key: 'indev',
                url: 'https://lvgl.io/docs/open/9.4/details/main-modules/indev/overview',
                fallback: 'LVGL input devices',
            },
            {
                key: 'events',
                url: 'https://lvgl.io/docs/open/9.4/details/common-widget-features/events',
                fallback: 'LVGL events',
            },
        ],
        snippet: JOYSTICK_SNIPPET,
    },
    {
        id: 'game',
        docs: [
            {
                key: 'random',
                url: 'https://docs.micropython.org/en/latest/library/random.html',
                fallback: 'MicroPython random numbers',
            },
        ],
        snippet: GAME_SNIPPET,
    },
]

export type GuideCheckError =
    | 'wrong-file'
    | 'starter-missing'
    | 'greeting-unchanged'
    | 'logging-missing'
    | 'button-missing'
    | 'counter-missing'
    | 'progress-missing'
    | 'joystick-missing'
    | 'game-missing'

export function checkFirstAppStep(
    step: number,
    appId: string,
    filename: string | undefined,
    content: string | undefined,
): GuideCheckError | null {
    if (filename !== `/apps/${appId}/main.py` || content === undefined) return 'wrong-file'
    const stepId = FIRST_APP_GUIDE_STEPS[step]?.id
    if (stepId === 'start' && (!content.includes('class Main(Activity):') || !content.includes('lv.label(screen)'))) {
        return 'starter-missing'
    }
    if (
        stepId === 'greeting' &&
        (content.includes('Hello from ') ||
            !content.includes('label.set_text(') ||
            !content.includes('label.align(lv.ALIGN.CENTER'))
    ) {
        return 'greeting-unchanged'
    }
    if (
        stepId === 'logging' &&
        (!content.includes('import logging') ||
            !content.includes('logging.getLogger') ||
            !content.includes('logger.info('))
    ) {
        return 'logging-missing'
    }
    if (stepId === 'button' && (!content.includes('lv.button(screen)') || !content.includes('lv.label(button)'))) {
        return 'button-missing'
    }
    if (
        stepId === 'counter' &&
        (!content.includes('self.count') ||
            !content.includes('add_event_cb') ||
            !content.includes('lv.EVENT.CLICKED'))
    ) {
        return 'counter-missing'
    }
    if (
        stepId === 'progress' &&
        (!content.includes('lv.bar(screen)') ||
            !content.includes('progress.set_range(0, 10)') ||
            !content.includes('progress.set_value(self.count, False)') ||
            !content.includes('min(self.count + 1, 10)'))
    ) {
        return 'progress-missing'
    }
    if (
        stepId === 'joystick' &&
        (!content.includes('mpos.io_expander.digital') ||
            !content.includes('TaskManager.create_task') ||
            !content.includes('TaskManager.sleep_ms') ||
            !content.includes('digital[1]') ||
            !content.includes('digital[4]'))
    ) {
        return 'joystick-missing'
    }
    if (
        stepId === 'game' &&
        (!content.includes('lv.SYMBOL.CHARGE') ||
            !content.includes('random.randint') ||
            !content.includes('lv.KEY.ENTER'))
    ) {
        return 'game-missing'
    }
    return null
}

/** Full canonical main.py for a given step, used by the "stuck" escape hatch. */
export function firstAppStepSolution(step: number): string {
    const body: string[] = []
    if (step >= 2) body.push(LOGGING_SNIPPET)
    body.push('        screen = lv.obj()', '        label = lv.label(screen)')
    if (step >= 1) {
        body.push(GREETING_SNIPPET)
    } else {
        body.push('        label.set_text("Hello from my first app!")', '        label.center()')
    }
    if (step >= 3) body.push('', BUTTON_SNIPPET)
    if (step === 4) body.push('', COUNTER_SNIPPET)
    if (step >= 5) body.push('', '        self.count = 0', '', PROGRESS_SNIPPET)
    if (step >= 6) body.push('', PLAYER_SNIPPET)
    if (step === 6) body.push('', JOYSTICK_ON_KEY_SNIPPET)
    if (step >= 7) body.push('', GAME_SNIPPET)
    body.push('', '        self.setContentView(screen)')

    const imports = step >= 6 ? ['from mpos import Activity, TaskManager', 'import mpos', 'import lvgl as lv'] : ['from mpos import Activity', 'import lvgl as lv']
    return [...imports, '', '', 'class Main(Activity):', '    def onCreate(self):', ...body, ''].join(
        '\n',
    )
}
