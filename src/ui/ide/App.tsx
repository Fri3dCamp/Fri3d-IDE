import { ToolPanel } from './ToolPanel'
import { SideMenu } from './SideMenu'
import { MainEditor } from './MainEditor'
import { app } from '../legacy'

// The shell renders exactly once and must stay stateless: the legacy modules
// mutate this DOM directly (FontAwesome dom.watch(), applyTranslation(),
// xterm, and the file tree). A React re-render would clash
// with those mutations, so no useState/props may drive this tree.
export function App() {
    return (
        <>
            <ToolPanel />
            <div id="offline-indicator" hidden>
                <i className="fa-solid fa-plane-up"></i> <span id="offline-indicator-text">Offline</span>
            </div>
            <div id="container">
                <div id="overlay" onClick={() => app().autoHideSideMenu()}></div>
                <SideMenu />
                <div id="side-menu-resizer" title="Resize sidebar"></div>
                <MainEditor />
            </div>
        </>
    )
}
