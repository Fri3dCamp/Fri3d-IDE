import { toast } from 'sonner'
import { i18next } from '../i18n'
import { useEditorTabsStore } from '../stores/editorTabs'
import { withLoader } from '../stores/ui'
import { getRuff, ruffFormat } from './ruff'
import { getLiveView } from '../features/editor/CodeEditor'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

/** Format the active Python file with Ruff, replacing the live editor doc. */
export async function prettifyCurrentFile(): Promise<void> {
    const tabs = useEditorTabsStore.getState()
    const tab = tabs.activeTab()
    if (!tab || !tab.fn.endsWith('.py')) {
        toast.info(t('files.open-python-first', 'Please open a Python file'))
        return
    }

    const view = getLiveView(tab.id)
    const source = view ? view.state.doc.toString() : typeof tab.content === 'string' ? tab.content : ''

    await withLoader(t('files.formatting', 'Formatting…'), async () => {
        const ruff = await getRuff()
        if (!ruff) {
            toast.error(t('files.format-unavailable', 'Formatter failed to load'))
            return
        }
        let formatted: string
        try {
            formatted = ruffFormat(ruff, source)
        } catch (err) {
            // Syntax errors make format() throw; surface them instead of failing silently.
            toast.error(t('files.format-failed', 'Cannot format'), {
                description: err instanceof Error ? err.message : String(err),
            })
            return
        }
        if (formatted === source) {
            toast.info(t('files.format-clean', 'Already formatted'))
            return
        }
        if (view) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } })
        }
        tabs.setContent(tab.id, formatted)
        tabs.markDirty(tab.id)
    })
}
