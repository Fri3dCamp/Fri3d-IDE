import { describe, expect, it } from 'vitest'
import { APP_TEMPLATES, renderAppTemplate } from '../src/app-templates'

describe('app templates', () => {
    it('keeps each template in a complete Python source file', () => {
        expect(APP_TEMPLATES).toHaveLength(9)
        for (const template of APP_TEMPLATES) {
            expect(template.source).toContain('class Main(Activity):')
            expect(template.source).not.toContain('lv.ANIM')
            expect(template.source).toContain('self.setContentView(screen)')
        }
    })

    it('renders and escapes the app name token', () => {
        const source = renderAppTemplate('hello', 'Kid\'s "App"')
        expect(source).toContain('Hello from Kid\'s \\"App\\"!')
        expect(source).not.toContain('{{APP_NAME}}')
    })
})
