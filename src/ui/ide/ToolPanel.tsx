import { app } from '../legacy'

export function ToolPanel() {
    return (
        <div id="tool-panel">
            <div>
                <button onClick={() => app().toggleSideMenu()}><i className="fa-solid fa-bars"></i></button>
                <span className="logo">Fri3d-IDE</span>
                <button title="Save File [Ctrl+S]" onClick={() => app().saveCurrentFile()} id="btn-save"><i className="fa-solid fa-download"></i></button>
                <button title="Run File [F5]" onClick={() => app().runCurrentFile()} id="btn-run"><i className="fa-solid fa-circle-play" id="btn-run-icon"></i></button>
            </div>
            <div>
                <button title="Connect WebREPL" onClick={() => app().connectDevice('ws')} id="btn-conn-ws" className="advanced-only"><i className="fa-solid fa-link"></i></button>
                <button title="Connect Bluetooth" onClick={() => app().connectDevice('ble')} id="btn-conn-ble" className="advanced-only"><i className="fa-brands fa-bluetooth-b"></i></button>
                <button title="Connect USB/Serial" onClick={() => app().connectDevice('usb')} id="btn-conn-usb"><i className="fa-brands fa-usb"></i></button>
                <button title="Full Screen" onClick={() => app().toggleFullScreen('app')} id="app-expand"><i className="fa-solid fa-expand"></i></button>
            </div>
        </div>
    )
}
