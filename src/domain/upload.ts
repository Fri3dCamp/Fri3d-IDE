export type LocalUploadEntry =
    | { kind: 'directory'; relativePath: string }
    | { kind: 'file'; relativePath: string; file: File }

interface DroppedFileSystemEntry {
    name: string
    isFile: boolean
    isDirectory: boolean
    file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void
    createReader?: () => {
        readEntries: (
            success: (entries: DroppedFileSystemEntry[]) => void,
            error?: (error: DOMException) => void,
        ) => void
    }
}

interface EntryDataTransferItem {
    kind: string
    getAsFile: () => File | null
    getAsEntry?: () => DroppedFileSystemEntry | null
    webkitGetAsEntry?: () => DroppedFileSystemEntry | null
}

/** Normalize an untrusted browser-relative path without allowing device path escape. */
export function normalizeRelativePath(input: string): string {
    const path = input.replace(/\\/g, '/')
    if (!path || path.startsWith('/') || /^[a-zA-Z]:\//.test(path)) {
        throw new Error(`Invalid relative path: ${input || '(empty)'}`)
    }

    const parts = path.split('/')
    if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
        throw new Error(`Unsafe relative path: ${input}`)
    }
    return parts.join('/')
}

/** Validate, de-duplicate and add every implicit parent directory. */
export function canonicalizeUploadEntries(entries: LocalUploadEntry[]): LocalUploadEntry[] {
    const byPath = new Map<string, LocalUploadEntry>()

    const addDirectory = (relativePath: string) => {
        const existing = byPath.get(relativePath)
        if (existing?.kind === 'file') throw new Error(`Path is both a file and folder: ${relativePath}`)
        if (!existing) byPath.set(relativePath, { kind: 'directory', relativePath })
    }

    for (const raw of entries) {
        const relativePath = normalizeRelativePath(raw.relativePath)
        const parts = relativePath.split('/')
        for (let i = 1; i < parts.length; i++) addDirectory(parts.slice(0, i).join('/'))

        const existing = byPath.get(relativePath)
        if (raw.kind === 'directory') {
            addDirectory(relativePath)
        } else {
            if (existing) throw new Error(`Duplicate upload target: ${relativePath}`)
            byPath.set(relativePath, { ...raw, relativePath })
        }
    }

    return [...byPath.values()].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
        if (a.kind === 'directory') {
            const depth = a.relativePath.split('/').length - b.relativePath.split('/').length
            if (depth) return depth
        }
        return a.relativePath.localeCompare(b.relativePath)
    })
}

export function uploadEntriesFromFiles(files: File[] | FileList, preserveRelativePaths = false): LocalUploadEntry[] {
    return canonicalizeUploadEntries(
        Array.from(files).map((file) => ({
            kind: 'file' as const,
            relativePath: preserveRelativePaths && file.webkitRelativePath ? file.webkitRelativePath : file.name,
            file,
        })),
    )
}

function fileFromEntry(entry: DroppedFileSystemEntry): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!entry.file) {
            reject(new Error(`Cannot read dropped file: ${entry.name}`))
            return
        }
        entry.file(resolve, (error) => reject(error))
    })
}

/** Chromium returns at most 100 entries per read; keep reading until empty. */
async function readAllDirectoryEntries(entry: DroppedFileSystemEntry): Promise<DroppedFileSystemEntry[]> {
    const reader = entry.createReader?.()
    if (!reader) throw new Error(`Cannot read dropped folder: ${entry.name}`)

    const result: DroppedFileSystemEntry[] = []
    for (;;) {
        const batch = await new Promise<DroppedFileSystemEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, (error) => reject(error))
        })
        if (!batch.length) return result
        result.push(...batch)
    }
}

async function walkEntry(
    entry: DroppedFileSystemEntry,
    parentPath: string,
    result: LocalUploadEntry[],
): Promise<void> {
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name
    if (entry.isDirectory) {
        result.push({ kind: 'directory', relativePath })
        const children = await readAllDirectoryEntries(entry)
        for (const child of children) await walkEntry(child, relativePath, result)
    } else if (entry.isFile) {
        result.push({ kind: 'file', relativePath, file: await fileFromEntry(entry) })
    }
}

/** Collect dropped files and folders recursively, with a flat-file fallback. */
export async function collectDroppedUploadEntries(dataTransfer: DataTransfer): Promise<LocalUploadEntry[]> {
    const items = Array.from(dataTransfer.items).filter(
        (item) => item.kind === 'file',
    ) as unknown as EntryDataTransferItem[]
    const captured = items.map((item) => {
        const getEntry = item.getAsEntry ?? item.webkitGetAsEntry
        return { item, entry: getEntry?.call(item) ?? null }
    })

    if (captured.some(({ entry }) => entry !== null)) {
        const result: LocalUploadEntry[] = []
        for (const { item, entry } of captured) {
            if (entry) await walkEntry(entry, '', result)
            else {
                const file = item.getAsFile()
                if (file) result.push({ kind: 'file', relativePath: file.name, file })
            }
        }
        return canonicalizeUploadEntries(result)
    }

    return uploadEntriesFromFiles(dataTransfer.files)
}

export function singleTopLevelFolder(entries: LocalUploadEntry[]): string | null {
    if (!entries.length) return null
    const roots = new Set(entries.map((entry) => normalizeRelativePath(entry.relativePath).split('/')[0]))
    if (roots.size !== 1) return null
    const root = [...roots][0]
    return entries.some((entry) => entry.kind === 'directory' && entry.relativePath === root) ? root : null
}

export function stripTopLevelFolder(entries: LocalUploadEntry[]): LocalUploadEntry[] {
    const root = singleTopLevelFolder(entries)
    if (!root) return entries
    const prefix = `${root}/`
    return canonicalizeUploadEntries(
        entries.flatMap((entry) => {
            if (entry.relativePath === root) return []
            if (!entry.relativePath.startsWith(prefix)) return [entry]
            return [{ ...entry, relativePath: entry.relativePath.slice(prefix.length) }]
        }),
    )
}

export function joinDeviceUploadPath(destination: string, relativePath: string): string {
    const base = destination === '/' ? '' : destination.replace(/\/+$/, '')
    return `${base}/${normalizeRelativePath(relativePath)}`
}

export function uploadEntrySummary(entries: LocalUploadEntry[]): {
    files: number
    directories: number
    bytes: number
} {
    let files = 0
    let directories = 0
    let bytes = 0
    for (const entry of entries) {
        if (entry.kind === 'file') {
            files++
            bytes += entry.file.size
        } else {
            directories++
        }
    }
    return { files, directories, bytes }
}
