import blankSource from './blank.py?raw'
import buttonSource from './button.py?raw'
import counterSource from './counter.py?raw'
import helloWorldSource from './hello-world.py?raw'
import progressBarSource from './progress-bar.py?raw'
import settingsDemoSource from './settings-demo.py?raw'
import sliderSource from './slider.py?raw'
import switchSource from './switch.py?raw'
import textInputSource from './text-input.py?raw'

/** Templates shown by Create New App. Order here controls dropdown order. */
export const APP_TEMPLATES = [
    { id: 'hello', labelKey: 'apps.template-hello', defaultLabel: 'Hello World', source: helloWorldSource },
    { id: 'button', labelKey: 'apps.template-button', defaultLabel: 'Button', source: buttonSource },
    { id: 'counter', labelKey: 'apps.template-counter', defaultLabel: 'Counter', source: counterSource },
    { id: 'slider', labelKey: 'apps.template-slider', defaultLabel: 'Slider', source: sliderSource },
    { id: 'switch', labelKey: 'apps.template-switch', defaultLabel: 'Switch', source: switchSource },
    { id: 'text-input', labelKey: 'apps.template-text-input', defaultLabel: 'Text input', source: textInputSource },
    { id: 'progress', labelKey: 'apps.template-progress', defaultLabel: 'Progress bar', source: progressBarSource },
    { id: 'settings', labelKey: 'apps.template-settings', defaultLabel: 'Settings demo', source: settingsDemoSource },
    { id: 'blank', labelKey: 'apps.template-blank', defaultLabel: 'Blank', source: blankSource },
] as const

export type AppTemplate = (typeof APP_TEMPLATES)[number]['id']

function escapePythonString(value: string): string {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\r', '\\r')
        .replaceAll('\n', '\\n')
        .replaceAll('\t', '\\t')
}

/** Render selected Python source, replacing supported template tokens. */
export function renderAppTemplate(template: AppTemplate, appName: string): string {
    const definition = APP_TEMPLATES.find((candidate) => candidate.id === template)
    if (!definition) throw new Error(`Unknown app template: ${template}`)
    return definition.source.replaceAll('{{APP_NAME}}', escapePythonString(appName))
}
