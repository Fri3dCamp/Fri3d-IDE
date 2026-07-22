import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, FileCode2, Folder, FolderClosed, Loader2, Plus } from 'lucide-react'
import { CtaButton, DialogActions, SecondaryButton, useOpenDialog } from '../../components/dialogs'
import { listDirectory } from '../../services/apps.service'
import { appPanelIconHint } from './appPanelStyles'

interface CreateInAppResult {
    parentPath: string
    name: string
    isFolder: boolean
}

export function parentFolder(path: string, root: string): string | null {
    const clean = path.replace(/\/+$/, '')
    const rootClean = root.replace(/\/+$/, '')
    if (clean === rootClean) return null
    const index = clean.lastIndexOf('/')
    const parent = index > 0 ? clean.slice(0, index) : '/'
    return parent.length < rootClean.length ? rootClean : parent
}

function CreateInAppDialog({
    appPath,
    close,
}: {
    appPath: string
    close: (result: CreateInAppResult | null) => void
}) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)
    const [isFolder, setIsFolder] = useState(false)
    const [currentPath, setCurrentPath] = useState(appPath)
    const [loading, setLoading] = useState(false)
    const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([])

    useEffect(() => inputRef.current?.focus(), [])

    const loadFolders = useCallback(async () => {
        setLoading(true)
        try {
            const entries = await listDirectory(currentPath)
            setFolders(
                (entries ?? []).filter(
                    (entry): entry is { name: string; path: string; isDir: true } => entry.isDir,
                ),
            )
        } finally {
            setLoading(false)
        }
    }, [currentPath])

    useEffect(() => {
        void loadFolders()
    }, [loadFolders])

    const toggleClass = (active: boolean) =>
        `flex items-center gap-1.5 border-2 border-black px-3 py-1 text-sm transition-colors ${
            active
                ? 'bg-tab-active text-tab-active-fg'
                : 'bg-transparent hover:bg-black/10 dark:hover:bg-white/10'
        }`

    return (
        <form
            method="dialog"
            onSubmit={(event) => {
                event.preventDefault()
                const name = inputRef.current?.value.trim()
                if (!name) return
                close({
                    parentPath: currentPath.endsWith('/') ? currentPath : `${currentPath}/`,
                    name,
                    isFolder,
                })
            }}
        >
            <div className="mb-2 flex items-center gap-2 font-heading text-lg font-bold">
                <Plus size={18} aria-hidden />
                {t('files.create-title', 'New in {{path}}', { path: currentPath })}
            </div>

            <div className="mb-3 flex gap-2" role="radiogroup" aria-label={t('files.type', 'Type')}>
                <button type="button" className={toggleClass(!isFolder)} onClick={() => setIsFolder(false)}>
                    <FileCode2 size={14} aria-hidden /> {t('files.type-file', 'File')}
                </button>
                <button type="button" className={toggleClass(isFolder)} onClick={() => setIsFolder(true)}>
                    <Folder size={14} aria-hidden /> {t('files.type-folder', 'Folder')}
                </button>
            </div>

            <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                {t('files.select-folder', 'Select folder')}
            </div>
            <div className="mb-3 border-2 border-black bg-edit">
                <div className="flex items-center justify-between border-b border-black/20 px-2 py-1">
                    <code className="truncate text-xs">{currentPath}</code>
                    <button
                        type="button"
                        className="group/icon relative p-1 opacity-70 hover:opacity-100 disabled:opacity-40"
                        disabled={parentFolder(currentPath, appPath) === null}
                        onClick={() => {
                            const parent = parentFolder(currentPath, appPath)
                            if (parent) setCurrentPath(parent)
                        }}
                        aria-label={t('files.up-folder', 'Up folder')}
                    >
                        <ArrowUp size={14} aria-hidden />
                        <span aria-hidden className={appPanelIconHint}>
                            {t('files.up-folder', 'Up folder')}
                        </span>
                    </button>
                </div>
                <div className="max-h-40 overflow-y-auto p-1">
                    {loading ? (
                        <div className="flex items-center gap-2 px-2 py-1 text-sm opacity-70">
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                            {t('files.loading', 'Loading…')}
                        </div>
                    ) : null}
                    {!loading && folders.length === 0 ? (
                        <div className="px-2 py-1 text-sm opacity-60">
                            {t('files.no-folders', 'No subfolders')}
                        </div>
                    ) : null}
                    {!loading
                        ? folders.map((folder) => (
                              <button
                                  key={folder.path}
                                  type="button"
                                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-black/10 dark:hover:bg-white/10"
                                  onClick={() => setCurrentPath(folder.path)}
                              >
                                  <FolderClosed size={13} className="shrink-0 opacity-70" aria-hidden />
                                  <span className="truncate">{folder.name}</span>
                              </button>
                          ))
                        : null}
                </div>
            </div>

            <input
                ref={inputRef}
                type="text"
                placeholder={isFolder ? 'lib' : 'main.py'}
                autoComplete="off"
                spellCheck={false}
                className="w-full border-2 border-black bg-edit px-3 py-2 text-fg outline-none focus:border-accent"
            />

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">{t('files.create', 'Create')}</CtaButton>
            </DialogActions>
        </form>
    )
}

export function useCreateInAppDialog(): (appPath: string) => Promise<CreateInAppResult | null> {
    const openDialog = useOpenDialog()
    return useCallback(
        (appPath) =>
            openDialog<CreateInAppResult>((close) => (
                <CreateInAppDialog appPath={appPath} close={close} />
            )),
        [openDialog],
    )
}
