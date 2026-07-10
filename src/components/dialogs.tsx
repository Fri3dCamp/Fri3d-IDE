import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { File, Folder, Plus } from 'lucide-react'

/*
 * Promise-based dialog system on top of native <dialog>.
 *
 *   const confirm = useConfirm()
 *   if (await confirm('Remove /main.py?')) …
 *
 *   const prompt = usePrompt()
 *   const name = await prompt('File name:', { value: 'main.py' })
 *
 *   const openDialog = useOpenDialog()
 *   const result = await openDialog<MyResult>((close) => <MyDialog close={close} />)
 *
 * Native <dialog> + showModal() gives focus trapping, Escape handling and
 * top-layer stacking for free. Focus restoration is handled by the platform.
 */

type OpenDialogFn = <T>(
    render: (close: (result: T | null) => void) => ReactNode,
    options?: DialogOptions,
) => Promise<T | null>

export interface DialogOptions {
    /** Wider shell (720px) for content-heavy dialogs (e.g. upload planner). */
    wide?: boolean
}

const DialogContext = createContext<OpenDialogFn | null>(null)

interface ActiveDialog {
    id: number
    node: ReactNode
    wide?: boolean
}

let dialogSeq = 0

export function DialogProvider({ children }: { children: ReactNode }) {
    const [dialogs, setDialogs] = useState<ActiveDialog[]>([])

    const openDialog = useCallback<OpenDialogFn>((render, options) => {
        return new Promise((resolve) => {
            const id = ++dialogSeq
            const close = (result: unknown) => {
                setDialogs((ds) => ds.filter((d) => d.id !== id))
                resolve(result as never)
            }
            setDialogs((ds) => [...ds, { id, node: render(close as never), wide: options?.wide }])
        })
    }, [])

    return (
        <DialogContext.Provider value={openDialog}>
            {children}
            {dialogs.map((d) => (
                <DialogShell key={d.id} wide={d.wide}>
                    {d.node}
                </DialogShell>
            ))}
        </DialogContext.Provider>
    )
}

/** Renders children inside an opened <dialog>, styled per the design system. */
function DialogShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
    const ref = useRef<HTMLDialogElement>(null)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    return (
        <dialog
            ref={ref}
            className={`m-auto max-h-[85vh] overflow-y-auto rounded-none border-3 border-black bg-menu p-5 text-fg shadow-brutal-lg backdrop:bg-black/60 backdrop:backdrop-blur-sm ${
                wide ? 'w-[min(760px,95vw)]' : 'w-[min(480px,90vw)]'
            }`}
        >
            {children}
        </dialog>
    )
}

export function useOpenDialog(): OpenDialogFn {
    const ctx = useContext(DialogContext)
    if (!ctx) throw new Error('useOpenDialog must be used inside <DialogProvider>')
    return ctx
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export function DialogActions({ children }: { children: ReactNode }) {
    return <div className="mt-5 flex justify-end gap-3">{children}</div>
}

export function CtaButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }) {
    return (
        <button
            {...props}
            className="border-2 border-black bg-cta px-4 py-1.5 font-semibold text-cta-fg shadow-brutal transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
        />
    )
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className="border-2 border-black bg-transparent px-4 py-1.5 text-fg hover:bg-black/10 dark:hover:bg-white/10"
        />
    )
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

function ConfirmDialog({ message, close }: { message: string; close: (r: boolean | null) => void }) {
    const { t } = useTranslation()
    const confirmRef = useRef<HTMLButtonElement>(null)
    useEffect(() => confirmRef.current?.focus(), [])

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                close(true)
            }}
        >
            <div className="whitespace-pre-line">{message}</div>
            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(false)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton ref={confirmRef} type="submit">
                    {t('app.dialog.btn-confirm', 'Confirm')}
                </CtaButton>
            </DialogActions>
        </form>
    )
}

export function useConfirm(): (message: string) => Promise<boolean> {
    const openDialog = useOpenDialog()
    return useCallback(
        async (message) =>
            (await openDialog<boolean>((close) => (
                <ConfirmDialog message={message} close={close} />
            ))) ?? false,
        [openDialog],
    )
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

interface PromptOptions {
    value?: string
    placeholder?: string
    password?: boolean
}

function PromptDialog({
    message,
    options,
    close,
}: {
    message: string
    options: PromptOptions
    close: (r: string | null) => void
}) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                close(inputRef.current?.value ?? '')
            }}
        >
            <div className="whitespace-pre-line">{message}</div>
            <input
                ref={inputRef}
                type={options.password ? 'password' : 'text'}
                defaultValue={options.value ?? ''}
                placeholder={options.placeholder ?? ''}
                autoComplete="off"
                spellCheck={false}
                className="mt-3 w-full border-2 border-black bg-edit px-3 py-2 text-fg outline-none focus:border-accent"
            />
            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                <CtaButton type="submit">{t('app.dialog.btn-confirm', 'OK')}</CtaButton>
            </DialogActions>
        </form>
    )
}

export function usePrompt(): (message: string, options?: PromptOptions) => Promise<string | null> {
    const openDialog = useOpenDialog()
    return useCallback(
        (message, options = {}) =>
            openDialog<string>((close) => (
                <PromptDialog message={message} options={options} close={close} />
            )),
        [openDialog],
    )
}

/* ------------------------------------------------------------------ */
/* Create file/folder                                                  */
/* ------------------------------------------------------------------ */

export interface CreateItemResult {
    name: string
    isFolder: boolean
}

function CreateItemDialog({
    parentPath,
    close,
}: {
    parentPath: string
    close: (r: CreateItemResult | null) => void
}) {
    const { t } = useTranslation()
    const [isFolder, setIsFolder] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    useEffect(() => inputRef.current?.focus(), [])

    const toggleClass = (active: boolean) =>
        `flex items-center gap-1.5 border-2 border-black px-3 py-1 text-sm transition-colors ${
            active ? 'bg-tab-active text-tab-active-fg' : 'bg-transparent hover:bg-black/10 dark:hover:bg-white/10'
        }`

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                const name = inputRef.current?.value.trim()
                if (name) close({ name, isFolder })
            }}
        >
            <div className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
                <Plus size={18} aria-hidden />
                {t('files.create-title', 'New in {{path}}', { path: parentPath })}
            </div>
            <div className="mb-3 flex gap-2" role="radiogroup" aria-label={t('files.type', 'Type')}>
                <button type="button" className={toggleClass(!isFolder)} onClick={() => setIsFolder(false)}>
                    <File size={14} aria-hidden /> {t('files.type-file', 'File')}
                </button>
                <button type="button" className={toggleClass(isFolder)} onClick={() => setIsFolder(true)}>
                    <Folder size={14} aria-hidden /> {t('files.type-folder', 'Folder')}
                </button>
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

export function useCreateItemDialog(): (parentPath: string) => Promise<CreateItemResult | null> {
    const openDialog = useOpenDialog()
    return useCallback(
        (parentPath) =>
            openDialog<CreateItemResult>((close) => (
                <CreateItemDialog parentPath={parentPath} close={close} />
            )),
        [openDialog],
    )
}
