import { useTranslation } from 'react-i18next'
import { Eye, Pencil, Plus, X } from 'lucide-react'
import { useEditorTabsStore, createUntitledTab } from '../../stores/editorTabs'
import { useConfirm } from '../../components/dialogs'

export function EditorTabsBar() {
    const { t } = useTranslation()
    const confirm = useConfirm()
    const tabs = useEditorTabsStore((s) => s.tabs)
    const activeId = useEditorTabsStore((s) => s.activeId)
    const activate = useEditorTabsStore((s) => s.activate)
    const closeTab = useEditorTabsStore((s) => s.closeTab)
    const setViewMode = useEditorTabsStore((s) => s.setViewMode)
    const requestClose = async (id: string) => {
        const tab = useEditorTabsStore.getState().tabs.find((item) => item.id === id)
        if (!tab) return
        if (
            tab.dirty &&
            !(await confirm(t('editor.confirm-close-dirty', 'Close {{fn}} and discard unsaved changes?', { fn: tab.fn })))
        ) {
            return
        }
        closeTab(id)
    }

    return (
        <div className="flex items-center overflow-x-auto border-b-2 border-black bg-menu max-md:hidden" role="tablist">
            {tabs.map((tab) => {
                const active = tab.id === activeId
                const toggleable = tab.kind === 'markdown' || tab.kind === 'svg'
                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={active}
                        className={`group flex shrink-0 cursor-pointer items-center gap-1 border-e-2 border-black px-3 py-1.5 text-sm ${
                            active ? 'bg-tab-active text-tab-active-fg' : 'hover:bg-black/10 dark:hover:bg-white/10'
                        }`}
                        onClick={() => activate(tab.id)}
                        onAuxClick={(e) => {
                            if (e.button === 1) void requestClose(tab.id)
                        }}
                    >
                        <span className="max-w-40 truncate">
                            {tab.fn.split('/').pop()}
                            {tab.dirty && ' •'}
                        </span>
                        {toggleable && (
                            <button
                                type="button"
                                title={
                                    tab.viewMode === 'view'
                                        ? t('editor.md-edit', 'Edit raw')
                                        : t('editor.md-preview', 'Preview')
                                }
                                aria-label={
                                    tab.viewMode === 'view'
                                        ? t('editor.md-edit', 'Edit raw')
                                        : t('editor.md-preview', 'Preview')
                                }
                                className="opacity-60 hover:opacity-100"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setViewMode(tab.id, tab.viewMode === 'view' ? 'edit' : 'view')
                                }}
                            >
                                {tab.viewMode === 'view' ? <Pencil size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
                            </button>
                        )}
                        <button
                            type="button"
                            title={t('editor.close', 'Close')}
                            aria-label={t('editor.close', 'Close')}
                            className="opacity-50 hover:opacity-100"
                            onClick={(e) => {
                                e.stopPropagation()
                                void requestClose(tab.id)
                            }}
                        >
                            <X size={13} aria-hidden />
                        </button>
                    </div>
                )
            })}
            <button
                type="button"
                title={t('editor.new-file', 'New file')}
                aria-label={t('editor.new-file', 'New file')}
                className="px-2 py-1.5 opacity-60 hover:opacity-100"
                onClick={createUntitledTab}
            >
                <Plus size={15} aria-hidden />
            </button>
        </div>
    )
}
