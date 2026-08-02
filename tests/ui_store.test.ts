import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../src/stores/ui'

describe('terminal dock state', () => {
    beforeEach(() => {
        useUiStore.setState({
            terminalTab: 'terminal',
            terminalHeight: 200,
            terminalCollapsed: false,
        })
    })

    it('collapses and expands with one toggle', () => {
        useUiStore.getState().toggleTerminalCollapsed()
        expect(useUiStore.getState().terminalCollapsed).toBe(true)

        useUiStore.getState().toggleTerminalCollapsed()
        expect(useUiStore.getState().terminalCollapsed).toBe(false)
    })

    it('expands when a terminal tab is selected', () => {
        useUiStore.getState().setTerminalCollapsed(true)
        useUiStore.getState().setTerminalTab('display')

        expect(useUiStore.getState()).toMatchObject({
            terminalTab: 'display',
            terminalCollapsed: false,
        })
    })
})
