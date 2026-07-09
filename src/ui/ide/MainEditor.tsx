import { app } from '../legacy'

export function MainEditor() {
    return (
        <div id="main-editor">
            <div className="tabs" id="editor-tabs"></div>
            <div id="terminal-container">
                <div
                    className="tabs"
                    id="terminal-tabs"
                    onMouseDown={(e) => app().initDrag(e.nativeEvent)}
                    onTouchStart={(e) => app().initDrag(e.nativeEvent)}
                >
                    <div>
                        <a className="tab" data-target="mpos-screen" id="tab-screen-link" style={{ display: 'none' }}><i className="fa-solid fa-display"></i> <span id="tab-screen">Display</span></a>
                        <a className="tab active" data-target="xterm"><i className="fa-solid fa-terminal"></i> <span id="tab-term">Terminal</span></a>
                    </div>
                    <div>
                        <button title="Clear" onClick={() => app().clearTerminal()} id="term-clear"><i className="fa-solid fa-trash-can"></i></button>
                        <button title="Soft Reset" onClick={() => app().reboot('soft')}><i className="fa-solid fa-arrows-rotate"></i></button>
                        <button title="Hard Reset" onClick={() => app().reboot('hard')}><i className="fa-solid fa-power-off"></i></button>
                        <button title="Full Screen" onClick={() => app().toggleFullScreen('terminal-container')} id="term-expand"><i className="fa-solid fa-expand"></i></button>
                    </div>
                </div>
                <div id="xterm" className="tab-content active">
                    {/* Xterm.js terminal mounts here */}
                </div>
                <div id="mpos-screen" className="tab-content">
                    {/* MicroPythonOS device canvas is injected here when connected */}
                </div>
                <div id="logs" className="tab-content">
                    {/* Logs content goes here */}
                </div>
            </div>
        </div>
    )
}
