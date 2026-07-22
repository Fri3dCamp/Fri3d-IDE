import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorTabsStore, type EditorTab } from '../../stores/editorTabs'
import { useFileStore } from '../../stores/files'
import { imageMimeFor } from '../../services/files.service'
import { CodeEditor } from './CodeEditor'

const MarkdownViewer = lazy(() =>
    import('./MarkdownViewer').then((module) => ({ default: module.MarkdownViewer })),
)

/* ------------------------------------------------------------------ */
/* Viewers                                                             */
/* ------------------------------------------------------------------ */

/** Object-URL lifecycle bound to a single effect: StrictMode-safe.
 *  (useMemo + revoke-in-cleanup breaks under double-mount: the memo isn't
 *  re-run after the first cleanup revokes the URL.) */
function useObjectUrl(make: () => Blob, deps: React.DependencyList): string | null {
    const [url, setUrl] = useState<string | null>(null)
    useEffect(() => {
        const objectUrl = URL.createObjectURL(make())
        setUrl(objectUrl)
        return () => URL.revokeObjectURL(objectUrl)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
    return url
}

function SvgViewer({ content, fn }: { content: string; fn: string }) {
    const url = useObjectUrl(() => new Blob([content], { type: 'image/svg+xml' }), [content])
    if (!url) return null
    return (
        <div className="grid h-full place-items-center overflow-auto bg-edit p-4">
            <img src={url} alt={fn.split('/').pop() ?? 'SVG preview'} className="max-h-full max-w-full" />
        </div>
    )
}

function ImageViewer({ content, fn }: { content: Uint8Array; fn: string }) {
    const url = useObjectUrl(
        () => new Blob([content.slice()], { type: imageMimeFor(fn) ?? 'application/octet-stream' }),
        [content, fn],
    )
    if (!url) return null
    return (
        <div className="grid h-full place-items-center overflow-auto bg-edit p-4">
            <img src={url} alt={fn.split('/').pop() ?? 'Image preview'} className="max-h-full max-w-full" />
        </div>
    )
}

function HexViewer({ content }: { content: Uint8Array }) {
    const lines = useMemo(() => {
        const out: Array<{ addr: string; hex: string; ascii: string }> = []
        for (let offset = 0; offset < content.length; offset += 16) {
            let hex = ''
            let ascii = ''
            for (let i = 0; i < 16; i++) {
                if (offset + i < content.length) {
                    const byte = content[offset + i]
                    hex += byte.toString(16).padStart(2, '0') + ' '
                    ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
                } else {
                    hex += '   '
                    ascii += ' '
                }
                if (i === 7) hex += ' '
            }
            out.push({ addr: offset.toString(16).padStart(8, '0'), hex: hex.trimEnd(), ascii })
        }
        return out
    }, [content])

    return (
        <div className="h-full overflow-y-auto bg-edit p-3 font-mono text-xs leading-5">
            {lines.map((l) => (
                <div key={l.addr} className="whitespace-pre">
                    <span className="opacity-50">{l.addr}</span>{'  '}
                    <span className="text-hex-hex">{l.hex}</span>{'  '}
                    <span className="text-hex-ascii">{l.ascii}</span>
                </div>
            ))}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Pane dispatch                                                       */
/* ------------------------------------------------------------------ */

function Pane({ tab }: { tab: EditorTab }) {
    const setContent = useEditorTabsStore((s) => s.setContent)
    const markDirty = useEditorTabsStore((s) => s.markDirty)
    const markChanged = useFileStore((s) => s.markChanged)
    // Track dirty only once per editing session to avoid store churn per keystroke.
    const dirtyRef = useRef(false)
    useEffect(() => {
        dirtyRef.current = tab.dirty
    }, [tab.id, tab.dirty])

    if (tab.kind === 'image' && tab.content instanceof Uint8Array) {
        return <ImageViewer content={tab.content} fn={tab.fn} />
    }
    if (tab.kind === 'hex' && tab.content instanceof Uint8Array) {
        return <HexViewer content={tab.content} />
    }

    const text = typeof tab.content === 'string' ? tab.content : ''

    if (tab.kind === 'markdown' && tab.viewMode === 'view') {
        return (
            <Suspense fallback={<div className="h-full bg-edit" />}>
                <MarkdownViewer content={text} />
            </Suspense>
        )
    }
    if (tab.kind === 'svg' && tab.viewMode === 'view') {
        return <SvgViewer content={text} fn={tab.fn} />
    }

    return (
        <CodeEditor
            tabId={tab.id}
            fn={tab.fn}
            content={text}
            readOnly={tab.readOnly}
            onDocChanged={(doc) => {
                // Content snapshot stays fresh so save/run/toggle read the live doc.
                setContent(tab.id, doc)
                if (!dirtyRef.current) {
                    dirtyRef.current = true
                    markDirty(tab.id)
                    if (tab.fn !== 'Untitled') markChanged(tab.fn)
                }
            }}
            onUnmount={(doc) => setContent(tab.id, doc)}
        />
    )
}

export function EditorPanes() {
    const tabs = useEditorTabsStore((s) => s.tabs)
    const activeId = useEditorTabsStore((s) => s.activeId)

    return (
        <div className="relative min-h-0 flex-1 bg-edit">
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    className={`absolute inset-0 ${tab.id === activeId ? '' : 'hidden'}`}
                    role="tabpanel"
                >
                    <Pane tab={tab} />
                </div>
            ))}
        </div>
    )
}
