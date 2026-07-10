import { linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import type { Extension } from '@codemirror/state'
import { getRuff, ruffCheck } from '../../services/ruff'

/**
 * Ruff-backed CodeMirror lint source for Python. The wasm module loads
 * lazily on the first lint pass; until then the source reports no
 * diagnostics (and re-runs on the next edit).
 */
export function ruffLinter(): Extension {
    return linter(
        async (view) => {
            const ruff = await getRuff()
            if (!ruff) return []

            const doc = view.state.doc
            const diagnostics: Diagnostic[] = []
            try {
                for (const d of ruffCheck(ruff, doc.toString())) {
                    const from = doc.line(d.location.row).from + d.location.column - 1
                    const to = doc.line(d.end_location.row).from + d.end_location.column - 1
                    diagnostics.push({
                        from: Math.min(from, doc.length),
                        to: Math.min(Math.max(to, from), doc.length),
                        severity: d.message.includes('Error:') ? 'error' : 'warning',
                        message: d.code ? `${d.code}: ${d.message}` : d.message,
                    })
                }
            } catch (err) {
                // Parse panics on pathological input must not break editing.
                console.warn('ruff check failed:', err)
            }
            return diagnostics
        },
        { delay: 400 },
    )
}
