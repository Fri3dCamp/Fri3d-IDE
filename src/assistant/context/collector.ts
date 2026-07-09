/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

export interface AssistantEditorState {
    filename?: string
    selection?: string
    content?: string
}

export interface AssistantRuntime {
    getEditorState(): AssistantEditorState | null
    getTerminalLines(): string[] | null
    getTraceback(): string | null
    getBoardInfo(): any
}

export interface AssistantPrivacy {
    includeEditor: boolean
    includeTerminal: boolean
    includeBoard: boolean
}

export interface AssistantContextLimits {
    editorMaxLines: number
    terminalMaxLines: number
    tracebackMaxLines: number
}

export interface AssistantContext {
    editor: { filename: string, selection: string, content: string } | null
    terminal: string | null
    traceback: string | null
    board: any
}

const DEFAULT_LIMITS: AssistantContextLimits = {
    editorMaxLines: 400,
    terminalMaxLines: 120,
    tracebackMaxLines: 80,
}

function clipLines(text: string, maxLines: number): string {
    const src = String(text || '').split('\n')
    if (src.length <= maxLines) {
        return src.join('\n')
    }
    return src.slice(src.length - maxLines).join('\n')
}

export function collectAssistantContext(runtime: AssistantRuntime, privacy: AssistantPrivacy, limits: AssistantContextLimits = DEFAULT_LIMITS): AssistantContext {
    const context: AssistantContext = {
        editor: null,
        terminal: null,
        traceback: null,
        board: null,
    }

    if (privacy.includeEditor) {
        const editorState = runtime.getEditorState()
        if (editorState) {
            context.editor = {
                filename: editorState.filename || 'unknown',
                selection: editorState.selection || '',
                content: clipLines(editorState.selection || editorState.content || '', limits.editorMaxLines),
            }
        }
    }

    if (privacy.includeTerminal) {
        const terminalLines = runtime.getTerminalLines()
        if (terminalLines && terminalLines.length) {
            context.terminal = clipLines(terminalLines.join('\n'), limits.terminalMaxLines)
        }
    }

    const traceback = runtime.getTraceback()
    if (traceback) {
        context.traceback = clipLines(traceback, limits.tracebackMaxLines)
    }

    if (privacy.includeBoard) {
        const board = runtime.getBoardInfo()
        if (board) {
            context.board = board
        }
    }

    return context
}
