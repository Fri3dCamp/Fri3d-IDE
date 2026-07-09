export function AssistantSidebar() {
    return (
        <aside id="assistant-sidebar">
            <div className="assistant-header">
                <div id="menu-assistant-title">Assistant</div>
                <button id="assistant-collapse" type="button" title="Collapse assistant">Collapse</button>
            </div>
            <div id="assistant-provider-status" className="assistant-provider-status">Provider: idle</div>
            <div className="assistant-task-row">
                <label htmlFor="assistant-task-preset">Task:</label>
                <select id="assistant-task-preset">
                    <option value="none">General chat</option>
                    <option value="traceback-fix">Traceback auto-fix</option>
                    <option value="memory-opt">Memory optimization advisor</option>
                    <option value="cpython-port">CPython to MicroPython helper</option>
                    <option value="board-bringup">Board bring-up checklist</option>
                    <option value="app-bootstrap">New app bootstrap</option>
                </select>
                <button id="assistant-run-task" type="button">Run task</button>
            </div>
            <div className="assistant-quick-actions">
                <button id="assistant-explain-selection" type="button">Explain selection</button>
                <button id="assistant-fix-traceback" type="button">Fix traceback</button>
            </div>
            <textarea id="assistant-prompt" rows={5} placeholder="Ask about MicroPython, board behavior, APIs, or debugging..."></textarea>
            <div className="assistant-actions">
                <button id="assistant-ask" type="button">Ask</button>
                <button id="assistant-stop" type="button">Stop</button>
                <span id="assistant-status" className="assistant-status">idle</span>
            </div>
            <details>
                <summary>Context preview</summary>
                <pre id="assistant-context-preview" className="assistant-output"></pre>
            </details>
            <div id="assistant-output" className="assistant-output"></div>
        </aside>
    )
}
