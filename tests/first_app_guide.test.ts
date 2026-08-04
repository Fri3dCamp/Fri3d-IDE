import { describe, expect, it } from 'vitest'
import { checkFirstAppStep, FIRST_APP_GUIDE_STEPS, firstAppStepSolution } from '../src/features/first-app-guide/guideSteps'

const appId = 'com.example.first'
const filename = `/apps/${appId}/main.py`

describe('first app guide checks', () => {
    it('links documentation for every introduced concept', () => {
        for (const step of FIRST_APP_GUIDE_STEPS) {
            expect(step.docs.length).toBeGreaterThan(0)
            for (const doc of step.docs) expect(doc.url).toMatch(/^https:\/\//)
        }
    })

    it('requires the guided app main file', () => {
        expect(checkFirstAppStep(0, appId, '/main.py', 'class Main(Activity):\nlv.label(screen)')).toBe('wrong-file')
    })

    it('checks each feature incrementally', () => {
        let source = 'class Main(Activity):\n    label = lv.label(screen)\n    label.set_text("Hello from My App!")'
        expect(checkFirstAppStep(0, appId, filename, source)).toBeNull()
        expect(checkFirstAppStep(1, appId, filename, source)).toBe('greeting-unchanged')

        source = source.replace('Hello from My App!', 'Hello, badge coder!') + '\nlabel.align(lv.ALIGN.CENTER, 0, -60)'
        expect(checkFirstAppStep(1, appId, filename, source)).toBeNull()
        expect(checkFirstAppStep(2, appId, filename, source)).toBe('logging-missing')

        source += '\nprint("App started")'
        expect(checkFirstAppStep(2, appId, filename, source)).toBeNull()

        source += '\nbutton = lv.button(screen)\nbutton_label = lv.label(button)'
        expect(checkFirstAppStep(3, appId, filename, source)).toBeNull()

        source += '\nself.count = 0\nbutton.add_event_cb(on_click, lv.EVENT.CLICKED, None)'
        expect(checkFirstAppStep(4, appId, filename, source)).toBeNull()

        source += '\nprogress = lv.bar(screen)\nprogress.set_value(70, False)'
        expect(checkFirstAppStep(5, appId, filename, source)).toBe('progress-missing')

        source += '\nprogress.set_range(0, 10)\nprogress.set_value(self.count, False)\nself.count = min(self.count + 1, 10)'
        expect(checkFirstAppStep(5, appId, filename, source)).toBeNull()

        expect(checkFirstAppStep(6, appId, filename, source)).toBe('joystick-missing')
        source += '\nscreen.add_event_cb(on_key, lv.EVENT.KEY, None)\nkey = event.get_key()\nif key == lv.KEY.LEFT:\nlv.group_get_default().add_obj(screen)'
        expect(checkFirstAppStep(6, appId, filename, source)).toBeNull()

        expect(checkFirstAppStep(7, appId, filename, source)).toBe('game-missing')
        source += '\nspark.set_text(lv.SYMBOL.CHARGE)\nself.sx = random.randint(-130, 130)\nif event.get_key() == lv.KEY.ENTER:'
        expect(checkFirstAppStep(7, appId, filename, source)).toBeNull()
    })

    it('provides a solution that passes the check for every step', () => {
        for (let step = 0; step < FIRST_APP_GUIDE_STEPS.length; step++) {
            expect(checkFirstAppStep(step, appId, filename, firstAppStepSolution(step))).toBeNull()
        }
    })
})
