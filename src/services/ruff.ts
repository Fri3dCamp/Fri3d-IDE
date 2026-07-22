/*
 * Ruff (Python linter/formatter) via WASM. Lazy singleton: the ~10 MB wasm
 * module loads on first use (first .py file opened or first Prettify).
 */
import type { Workspace as RuffWorkspace } from '@astral-sh/ruff-wasm-web'
// Vite turns this into a hashed asset URL; wasm loads over fetch.
import ruffWasmUrl from '@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm?url'

export interface RuffDiagnostic {
    code: string | null
    message: string
    location: { row: number; column: number }
    end_location: { row: number; column: number }
}

let workspace: RuffWorkspace | null = null
let initPromise: Promise<RuffWorkspace | null> | null = null

export function getRuff(): Promise<RuffWorkspace | null> {
    if (workspace) return Promise.resolve(workspace)
    if (!initPromise) {
        initPromise = (async () => {
            try {
                const { default: ruffInit, Workspace } = await import('@astral-sh/ruff-wasm-web')
                await ruffInit({ module_or_path: ruffWasmUrl })
                console.log('Ruff', Workspace.version())
                const settings = Workspace.defaultSettings()
                settings.set('line-length', 120)
                workspace = new Workspace(settings)
                return workspace
            } catch (err) {
                console.error('Failed to init Ruff workspace:', err)
                return null
            }
        })()
    }
    return initPromise
}

export function ruffCheck(ruff: RuffWorkspace, code: string): RuffDiagnostic[] {
    return ruff.check(code) as RuffDiagnostic[]
}

export function ruffFormat(ruff: RuffWorkspace, code: string): string {
    return ruff.format(code)
}
