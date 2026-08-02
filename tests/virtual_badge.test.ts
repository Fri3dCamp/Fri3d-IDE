import { describe, expect, it, vi } from 'vitest'
import { VirtualBadgeTransport } from '../src/domain/virtualBadge'

describe('VirtualBadgeTransport display controls', () => {
    it('requests an inline badge to expand', () => {
        const transport = new VirtualBadgeTransport('/vbadge/')
        const container = document.createElement('div')
        const shown = vi.fn()
        container.addEventListener('fri3d:vbadge:show', shown)
        transport.container = container

        transport.showBadge()

        expect(shown).toHaveBeenCalledOnce()
    })

    it('focuses a popped-out badge', () => {
        const transport = new VirtualBadgeTransport('/vbadge/')
        const focus = vi.fn()
        transport.popWindow = { focus } as unknown as Window

        transport.showBadge()

        expect(focus).toHaveBeenCalledOnce()
    })
})
