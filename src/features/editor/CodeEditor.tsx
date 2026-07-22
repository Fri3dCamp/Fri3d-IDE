import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { linter, lintGutter } from '@codemirror/lint'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light'
import { useSettingsStore } from '../../stores/settings'
import { useThemeIsDark, useThemeStore } from '../../services/theme'

const FONT = '"Hack", "Droid Sans Mono", monospace'

/** Shared chrome: font + edit-background on top of either syntax theme. */
const baseTheme = EditorView.theme({
    '&': { backgroundColor: 'var(--raw-bg-edit)', height: '100%' },
    '.cm-scroller': { fontFamily: FONT },
    '.cm-gutters': { backgroundColor: 'var(--raw-bg-edit)' },
})

async function languageFor(fn: string): Promise<Extension[]> {
    const lower = fn.toLowerCase()
    if (lower.endsWith('.py')) {
        const [{ python }, { ruffLinter }] = await Promise.all([
            import('@codemirror/lang-python'),
            import('./ruffLinter'),
        ])
        return [python(), ruffLinter(), lintGutter()]
    }
    if (lower.endsWith('.json') || lower.endsWith('.map')) {
        const { json, jsonParseLinter } = await import('@codemirror/lang-json')
        return [json(), linter(jsonParseLinter()), lintGutter()]
    }
    if (lower.endsWith('.xml') || lower.endsWith('.svg')) {
        const { xml } = await import('@codemirror/lang-xml')
        return [xml()]
    }
    if (lower.endsWith('.md')) {
        const { markdown } = await import('@codemirror/lang-markdown')
        return [markdown()]
    }
    return []
}

function themeFor(dark: boolean): Extension {
    return dark
        ? monokaiInit({
              settings: {
                  fontFamily: FONT,
                  background: 'var(--raw-bg-edit)',
                  gutterBackground: 'var(--raw-bg-edit)',
              },
          })
        : vsCodeLight
}

interface CodeEditorProps {
    tabId: string
    fn: string
    /** Initial document. Component is uncontrolled after mount. */
    content: string
    readOnly?: boolean
    onDocChanged?: (doc: string) => void
    /** Called on unmount with the final doc so the tab store can snapshot it. */
    onUnmount?: (doc: string) => void
}

/** Live EditorView registry: tab id → view. Lets services (prettify) mutate
 *  the open document without round-tripping through React state. */
const liveViews = new Map<string, EditorView>()

export function getLiveView(tabId: string): EditorView | undefined {
    return liveViews.get(tabId)
}

/**
 * Imperative-island wrapper around CodeMirror 6. One EditorView per mounted
 * pane; theme and word-wrap react to store changes via compartments.
 */
export function CodeEditor({ tabId, fn, content, readOnly = false, onDocChanged, onUnmount }: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const themeCompartment = useRef(new Compartment())
    const wrapCompartment = useRef(new Compartment())
    const languageCompartment = useRef(new Compartment())
    const dark = useThemeIsDark()
    const wordWrap = useSettingsStore((s) => s.wordWrap)

    // Latest-callback refs so the update listener never goes stale.
    const onDocChangedRef = useRef(onDocChanged)
    onDocChangedRef.current = onDocChanged
    const onUnmountRef = useRef(onUnmount)
    onUnmountRef.current = onUnmount

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: content,
                extensions: [
                    basicSetup,
                    baseTheme,
                    keymap.of([indentWithTab]),
                    languageCompartment.current.of([]),
                    indentUnit.of('    '),
                    themeCompartment.current.of(themeFor(useThemeStore.getState().dark)),
                    wrapCompartment.current.of(
                        useSettingsStore.getState().wordWrap ? EditorView.lineWrapping : [],
                    ),
                    EditorState.readOnly.of(readOnly),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            onDocChangedRef.current?.(update.state.doc.toString())
                        }
                    }),
                ],
            }),
        })
        viewRef.current = view
        liveViews.set(tabId, view)

        return () => {
            liveViews.delete(tabId)
            onUnmountRef.current?.(view.state.doc.toString())
            view.destroy()
            viewRef.current = null
        }
        // Recreate only when the file identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId, fn, readOnly])

    useEffect(() => {
        let cancelled = false
        void languageFor(fn)
            .then((extensions) => {
                if (cancelled) return
                viewRef.current?.dispatch({
                    effects: languageCompartment.current.reconfigure(extensions),
                })
            })
            .catch((error) => console.error(`Failed to load editor support for ${fn}`, error))
        return () => {
            cancelled = true
        }
    }, [fn, tabId])

    useEffect(() => {
        viewRef.current?.dispatch({
            effects: themeCompartment.current.reconfigure(themeFor(dark)),
        })
    }, [dark])

    useEffect(() => {
        viewRef.current?.dispatch({
            effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
        })
    }, [wordWrap])

    return <div ref={hostRef} className="h-full overflow-hidden [&_.cm-editor]:h-full" />
}
