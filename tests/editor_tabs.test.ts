import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const RECOVERY_KEY = 'fri3d-ide-editor-recovery-v1'

describe('editor tab recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
        localStorage.clear()
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    it('restores dirty text tabs after a reload', async () => {
        localStorage.setItem(
            RECOVERY_KEY,
            JSON.stringify({
                tabs: [
                    {
                        id: 'tab-7',
                        fn: '/main.py',
                        kind: 'code',
                        viewMode: 'edit',
                        readOnly: false,
                        dirty: true,
                        content: 'print("recovered")',
                        savedContent: 'print("old")',
                    },
                ],
                activeId: 'tab-7',
            }),
        )

        const { useEditorTabsStore } = await import('../src/stores/editorTabs')

        expect(useEditorTabsStore.getState().activeId).toBe('tab-7')
        expect(useEditorTabsStore.getState().activeTab()?.content).toBe('print("recovered")')
    })

    it('persists dirty text and removes recovery after save', async () => {
        const { useEditorTabsStore } = await import('../src/stores/editorTabs')
        const store = useEditorTabsStore.getState()
        const id = store.openTab({
            fn: '/main.py',
            kind: 'code',
            viewMode: 'edit',
            readOnly: false,
            content: 'print(1)',
        })
        store.markDirty(id)
        vi.advanceTimersByTime(300)

        const recovered = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? '{}')
        expect(recovered.tabs).toHaveLength(1)
        expect(recovered.tabs[0].content).toBe('print(1)')

        useEditorTabsStore.getState().markDirty(id, false)
        vi.advanceTimersByTime(300)
        expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
    })
})
