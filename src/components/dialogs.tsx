import {
    Fragment,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, File, Folder, Plus, Trash2 } from 'lucide-react'

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
    cancel: () => void
    wide?: boolean
}

let dialogSeq = 0

export function DialogProvider({ children }: { children: ReactNode }) {
    const [dialogs, setDialogs] = useState<ActiveDialog[]>([])

    const openDialog = useCallback<OpenDialogFn>((render, options) => {
        return new Promise((resolve) => {
            const id = ++dialogSeq
            let settled = false
            const close = (result: unknown) => {
                if (settled) return
                settled = true
                setDialogs((ds) => ds.filter((d) => d.id !== id))
                resolve(result as never)
            }
            setDialogs((ds) => [
                ...ds,
                {
                    id,
                    node: render(close as never),
                    cancel: () => close(null),
                    wide: options?.wide,
                },
            ])
        })
    }, [])

    return (
        <DialogContext.Provider value={openDialog}>
            {children}
            {dialogs.map((d) => (
                <DialogShell key={d.id} wide={d.wide} onCancel={d.cancel}>
                    {d.node}
                </DialogShell>
            ))}
        </DialogContext.Provider>
    )
}

/** Renders children inside an opened <dialog>, styled per the design system. */
function DialogShell({
    children,
    wide,
    onCancel,
}: {
    children: ReactNode
    wide?: boolean
    onCancel: () => void
}) {
    const ref = useRef<HTMLDialogElement>(null)

    useEffect(() => {
        ref.current?.showModal()
        // Re-promote the toaster popover above this dialog in the top layer.
        window.dispatchEvent(new Event('ui:modal-opened'))
    }, [])

    return (
        <dialog
            ref={ref}
            onCancel={(event) => {
                event.preventDefault()
                onCancel()
            }}
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
            className="border-2 border-black bg-cta px-4 py-1.5 font-semibold text-cta-fg shadow-brutal transition-transform enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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

export interface PromptOptions {
    value?: string
    placeholder?: string
    password?: boolean
    /** Require this exact value before enabling confirmation. */
    expected?: string
    /** Use irreversible-action styling and copy. */
    destructive?: boolean
    title?: string
    confirmLabel?: string
}

function renderMessageWithBold(message: string) {
    return message.split('\n').map((line, lineIdx) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
            <Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {parts.map((part, idx) =>
                    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
                        <strong key={idx}>{part.slice(2, -2)}</strong>
                    ) : (
                        <Fragment key={idx}>{part}</Fragment>
                    ),
                )}
            </Fragment>
        )
    })
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
    const inputId = useId()
    const helpId = useId()
    const [value, setValue] = useState(options.value ?? '')
    const requiresMatch = options.expected !== undefined
    const matches = !requiresMatch || value.trim() === options.expected
    const hasMismatch = requiresMatch && value.length > 0 && !matches

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    const destructiveButtonClass =
        'inline-flex items-center gap-2 border-2 border-black bg-red-600 px-4 py-1.5 font-semibold text-white shadow-brutal transition-transform enabled:hover:bg-red-500 enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none'

    return (
        <form
            method="dialog"
            onSubmit={(e) => {
                e.preventDefault()
                if (!matches) {
                    inputRef.current?.focus()
                    inputRef.current?.select()
                    return
                }
                close(value)
            }}
        >
            {(options.title || options.destructive) && (
                <div className="mb-4 flex items-start gap-3">
                    {options.destructive && (
                        <span className="grid size-10 shrink-0 place-items-center border-2 border-black bg-red-600 text-white shadow-[2px_2px_0_#000]">
                            <AlertTriangle size={21} aria-hidden />
                        </span>
                    )}
                    <div>
                        <h2 className="font-heading text-xl font-bold leading-tight">
                            {options.title ?? t('app.dialog.destructive-title', 'Delete permanently?')}
                        </h2>
                        {options.destructive && (
                            <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                                {t('app.dialog.irreversible', 'This action cannot be undone.')}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="text-sm leading-relaxed">{renderMessageWithBold(message)}</div>

            {requiresMatch && (
                <div className="mt-4 border-2 border-black bg-black/5 p-3 dark:bg-white/5">
                    <label htmlFor={inputId} className="block text-sm font-semibold">
                        {t('app.dialog.type-to-confirm', 'Type this value to confirm:')}
                    </label>
                    <code className="mt-1 block select-all break-all border-l-4 border-red-600 pl-2 font-bold text-fg">
                        {options.expected}
                    </code>
                </div>
            )}

            {!requiresMatch && (
                <label htmlFor={inputId} className="sr-only">
                    {message}
                </label>
            )}
            <input
                id={inputId}
                ref={inputRef}
                type={options.password ? 'password' : 'text'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={options.placeholder ?? options.expected ?? ''}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={hasMismatch || undefined}
                aria-describedby={requiresMatch ? helpId : undefined}
                className={`mt-3 w-full border-2 bg-edit px-3 py-2 font-mono text-fg outline-none transition-colors ${
                    hasMismatch
                        ? 'border-red-600 focus:border-red-600'
                        : matches && requiresMatch
                          ? 'border-green-600 focus:border-green-600'
                          : 'border-black focus:border-accent'
                }`}
            />

            {requiresMatch && (
                <div
                    id={helpId}
                    role="status"
                    aria-live="polite"
                    className={`mt-2 flex min-h-5 items-center gap-1.5 text-sm font-semibold ${
                        matches
                            ? 'text-green-700 dark:text-green-300'
                            : hasMismatch
                              ? 'text-red-700 dark:text-red-300'
                              : 'opacity-65'
                    }`}
                >
                    {matches ? (
                        <>
                            <Check size={15} strokeWidth={3} aria-hidden />
                            {t('app.dialog.value-matches', 'Value matches. Ready to delete.')}
                        </>
                    ) : hasMismatch ? (
                        <>
                            <AlertTriangle size={15} aria-hidden />
                            {t('app.dialog.value-mismatch', 'Value does not match. Check spelling and capitalization.')}
                        </>
                    ) : (
                        t('app.dialog.exact-match-required', 'Exact match required. The delete button stays disabled until then.')
                    )}
                </div>
            )}

            <DialogActions>
                <SecondaryButton type="button" onClick={() => close(null)}>
                    {t('app.dialog.btn-cancel', 'Cancel')}
                </SecondaryButton>
                {options.destructive ? (
                    <button type="submit" disabled={!matches} className={destructiveButtonClass}>
                        <Trash2 size={16} aria-hidden />
                        {options.confirmLabel ?? t('app.dialog.btn-delete', 'Delete permanently')}
                    </button>
                ) : (
                    <CtaButton type="submit" disabled={!matches}>
                        {options.confirmLabel ?? t('app.dialog.btn-ok', 'OK')}
                    </CtaButton>
                )}
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
