import { useEffect, useRef } from 'react'
import { python } from '@codemirror/lang-python'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { useThemeIsDark } from '../../services/theme'

const FONT = '"Hack", "Droid Sans Mono", monospace'

const snippetTheme = EditorView.theme({
    '&': {
        backgroundColor: 'var(--raw-bg-edit)',
        fontSize: '12px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
        fontFamily: FONT,
        overflow: 'auto',
    },
    '.cm-content': {
        padding: '8px 0',
    },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-cursor': { display: 'none' },
})

export function PythonSnippet({ code }: { code: string }) {
    const hostRef = useRef<HTMLDivElement>(null)
    const dark = useThemeIsDark()

    useEffect(() => {
        const host = hostRef.current
        if (!host) return

        const syntaxTheme = dark
            ? monokaiInit({
                  settings: {
                      fontFamily: FONT,
                      background: 'var(--raw-bg-edit)',
                      gutterBackground: 'var(--raw-bg-edit)',
                  },
              })
            : vsCodeLight
        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: code,
                extensions: [
                    basicSetup,
                    python(),
                    syntaxTheme,
                    snippetTheme,
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                ],
            }),
        })

        return () => view.destroy()
    }, [code, dark])

    return <div ref={hostRef} className="overflow-hidden border-2 border-black bg-edit" aria-label="Python code" />
}
