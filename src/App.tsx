import { useEffect } from 'react'
import { DialogProvider, useConfirm, usePrompt } from './components/dialogs'
import { AppToaster, LoaderStack, OfflineBadge, SideMenuResizer } from './components/chrome'
import { ToolPanel } from './features/toolbar/ToolPanel'
import { SideMenu } from './features/side-menu/SideMenu'
import { EditorTabsBar } from './features/editor/EditorTabsBar'
import { EditorPanes } from './features/editor/EditorPanes'
import { TerminalDock } from './features/terminal/TerminalDock'
import { useEditorTabsStore, createUntitledTab } from './stores/editorTabs'
import { useSettingsStore } from './stores/settings'
import { saveCurrentFile, runCurrentFile, reboot } from './services/device.service'

/** Global keyboard shortcuts (Ctrl/Cmd+S, F5, Ctrl/Cmd+D). */
function useShortcuts() {
    const confirm = useConfirm()
    const prompt = usePrompt()

    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.ctrlKey || ev.metaKey) {
                if (ev.code === 'KeyS') void saveCurrentFile({ confirm, prompt })
                else if (ev.code === 'KeyD') void reboot('soft')
                else return
            } else if (ev.code === 'F5') {
                void runCurrentFile()
            } else {
                return
            }
            ev.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [confirm, prompt])
}

/** Zoom setting → root CSS var (body font-size scales the whole UI). */
function useZoom() {
    const zoom = useSettingsStore((s) => s.zoom)
    useEffect(() => {
        document.documentElement.style.setProperty('--app-zoom', String(zoom))
    }, [zoom])
}

function Shell() {
    useShortcuts()
    useZoom()

    // Welcome scratch tab on first mount.
    useEffect(() => {
        if (useEditorTabsStore.getState().tabs.length === 0) {
            createUntitledTab()
            const tab = useEditorTabsStore.getState().tabs[0]
            useEditorTabsStore.getState().setContent(
                tab.id,
                [
                    '# Fri3d-IDE - MicroPython Web IDE',
                    '# Read more: https://fri3dcamp.github.io/badge_2026/',
                    '',
                    '# Connect your device and start creating! 🤖👨‍💻🕹️',
                    '',
                ].join('\n'),
            )
        }
    }, [])

    return (
        <div className="flex h-full flex-col">
            <ToolPanel />
            <OfflineBadge />
            <LoaderStack />
            <div className="flex min-h-0 flex-1 max-md:flex-col">
                <SideMenu />
                <SideMenuResizer />
                <main className="flex min-w-0 flex-1 flex-col">
                    <EditorTabsBar />
                    <EditorPanes />
                    <TerminalDock />
                </main>
            </div>
        </div>
    )
}

export function App() {
    return (
        <DialogProvider>
            <AppToaster />
            <Shell />
        </DialogProvider>
    )
}
