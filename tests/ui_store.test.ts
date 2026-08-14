import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../src/stores/ui'

describe('terminal dock state', () => {
    beforeEach(() => {
        useUiStore.setState({
            terminalTab: 'terminal',
            terminalHeight: 200,
            terminalCollapsed: false,
            loaders: [],
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

    it('clears stacked loaders on demand', () => {
        const loader = useUiStore.getState().showLoader('Scanning apps…')
        loader.update({ progress: 0.5 })

        expect(useUiStore.getState().loaders).toHaveLength(1)

        useUiStore.getState().clearLoaders()

        expect(useUiStore.getState().loaders).toEqual([])
    })
})
