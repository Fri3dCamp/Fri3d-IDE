import { SettingsMenu } from './SettingsMenu'
import { AboutMenu } from './AboutMenu'
import { app } from '../legacy'

function MenuTabs() {
    return (
        <div className="tabs" id="menu-tabs">
            <div>
                <a className="tab active" data-target="menu-files"><i className="fa-solid fa-folder fa-fw"></i></a>
                <a className="tab" data-target="menu-pkg" onClick={(e) => { e.preventDefault(); app().loadAllPkgIndexes() }}><i className="fa-solid fa-cubes fa-fw"></i></a>
                <a className="tab" data-target="menu-tools"><i className="fa-solid fa-tools fa-fw"></i></a>
            </div>
            <div>
                <a className="tab" data-target="menu-settings"><i className="fa-solid fa-sliders fa-fw"></i></a>
                <a className="tab" data-target="menu-about"><i className="fa-solid fa-circle-info fa-fw"></i></a>
            </div>
        </div>
    )
}

function FilesMenu() {
    return (
        <div id="menu-files" className="tab-content active">
            <div id="menu-file-title">
                <span id="menu-file-title-text">File Manager</span>
                <span className="menu-file-title-actions">
                    <a href="#" className="menu-action" title="Refresh" id="btn-file-refresh" onClick={(e) => { e.preventDefault(); app().refreshFileTree() }}><i className="fa-solid fa-arrows-rotate fa-fw"></i></a>
                    <a href="#" className="menu-action" title="Upload files" id="btn-file-upload" onClick={(e) => { e.preventDefault(); app().uploadFilesToBoard('/') }}><i className="fa-regular fa-circle-down fa-fw"></i></a>
                    <a href="#" className="menu-action" title="Expand All" id="btn-file-expand" onClick={(e) => { e.preventDefault(); app().expandAllFolders() }}><i className="fa-solid fa-folder-open fa-fw"></i></a>
                    <a href="#" className="menu-action" title="Collapse All" id="btn-file-collapse" onClick={(e) => { e.preventDefault(); app().collapseAllFolders() }}><i className="fa-solid fa-folder fa-fw file-tree-collapse-icon"></i></a>
                </span>
            </div>
            <div id="menu-file-tree">
                <div><span className="folder name"><i className="fa-solid fa-folder fa-fw"></i> /</span></div>
                <div>
                    <a href="#" className="name" onClick={(e) => { e.preventDefault(); app().connectDevice('usb') }}>&emsp;🤔 <span id="no-files">no files</span></a>
                    <a href="#" className="menu-action" onClick={(e) => { e.preventDefault(); app().connectDevice('usb') }}><i className="fa-solid fa-plug"></i></a>
                </div>
            </div>
            <div id="file-tree-usage" hidden></div>
        </div>
    )
}

function PackagesMenu() {
    return (
        <div id="menu-pkg" className="tab-content">
            <div id="menu-pkg-title">Package Manager</div>
            <div id="menu-pkg-list"></div>
        </div>
    )
}

function ToolsMenu() {
    return (
        <div id="menu-tools" className="tab-content">
            <div id="menu-tools-title">Tools</div>
            <div id="menu-tools-list">
                <div className="title-lines" id="menu-tools-line-conn">device connection</div>
                <div><a href="https://github.com/DrSkunk/Fri3d-IDE/blob/main/docs/Web-REPL-Relay.md" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> WebREPL over internet 🌎</a></div>
                <div><a href="https://github.com/DrSkunk/Fri3d-IDE/blob/main/docs/Web-REPL-Server.md" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> WebREPL in local network</a></div>
                <div><a href="https://github.com/DrSkunk/Fri3d-IDE/blob/main/docs/Bluetooth-REPL.md" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> Bluetooth REPL</a></div>
                <div><a href="bridge.html" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> P2P Bridge</a></div>
                <div><a href="benchmark.html" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> Device Benchmark</a></div>

                <div className="title-lines" id="menu-line-pkg-mgr">package manager</div>
                <div><a href="#" onClick={(e) => { e.preventDefault(); app().installPkgFromUrl() }} id="install-via-url">📦 Install package via link</a></div>

                <div className="title-lines" id="menu-tools-docs">documentation</div>
                <div><a href="https://docs.micropython.org/en/latest/" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> MicroPython docs</a></div>
                <div><a href="https://docs.micropythonos.com/" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> MicroPythonOS docs</a></div>
                <div><a href="https://fri3dcamp.github.io/badge_2026/" target="_blank"><i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i> Fri3d Camp 2026 badge</a></div>

                <div className="title-lines" id="menu-tools-python">Python</div>
                <div><a href="#" onClick={(e) => { e.preventDefault(); app().pyPrettify() }} id="py-prettify">🎀 Prettify current file</a></div>
                <div><a href="#" onClick={(e) => { e.preventDefault(); app().pyMinify() }} id="py-minify">🤏 Minify current file</a></div>
            </div>
        </div>
    )
}

export function SideMenu() {
    return (
        <div id="side-menu">
            <MenuTabs />
            <div id="create-new-app-section">
                <button onClick={() => app().createNewApp()} id="create-new-app">
                    <i className="fa-solid fa-cubes fa-fw"></i> <span id="create-new-app-label">Create new app scaffold</span>
                </button>
            </div>
            <FilesMenu />
            <PackagesMenu />
            <ToolsMenu />
            <SettingsMenu />
            <AboutMenu />
        </div>
    )
}
