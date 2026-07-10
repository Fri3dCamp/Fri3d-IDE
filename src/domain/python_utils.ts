/*
 * Python tooling. Phase 1: traceback parsing is fully implemented; the
 * WASM-backed tools (mpy-cross validation/compilation, Ruff, minifier) are
 * stubbed and will be wired in a later phase.
 * SPDX-License-Identifier: MIT
 */

export interface StackTraceFrame {
    file: string
    line: number
    scope: string
}

export interface ParsedStackTrace {
    type: string
    message: string
    summary: string
    frames: StackTraceFrame[]
}

export function parseStackTrace(stackTrace: string): ParsedStackTrace | undefined {
    const lines = stackTrace.split('\n')
    const result: ParsedStackTrace = { type: '', message: '', summary: '', frames: [] }
    let inTraceback = false

    for (let line of lines) {
        line = line.trim()
        if (line.startsWith('Traceback (most recent call last):')) {
            inTraceback = true
            continue
        }
        if (!inTraceback) continue

        const fileMatch = line.match(/^File "(.*)", line (\d+)(, in (.*))?/)
        if (fileMatch) {
            result.frames.push({
                file: fileMatch[1],
                line: parseInt(fileMatch[2]),
                scope: fileMatch[4] || '<module>',
            })
        } else {
            const errorMatch = line.match(/^(.*?): (.*)/)
            if (errorMatch) {
                result.type = errorMatch[1]
                result.message = errorMatch[2]
                break
            }
        }
    }

    const last = result.frames.at(-1)
    if (last) {
        result.summary = `${result.message} at ${last.file}:${last.line}`
        return result
    }
    return undefined
}

/** Pre-save validation via mpy-cross WASM. Stubbed: no diagnostics in phase 1. */
export async function validatePython(
    _filename: string,
    _content: string,
    _devInfo?: unknown,
): Promise<ParsedStackTrace | undefined> {
    return undefined
}

/** .py → .mpy cross-compilation. Stubbed in phase 1. */
export async function compilePython(
    _filename: string,
    _content: string | ArrayBuffer,
    _devInfo?: unknown,
): Promise<Uint8Array> {
    throw new Error('mpy-cross is not available in this build. Enable "Prefer installing sources" in Settings.')
}
