import { toast } from 'sonner'
import { unzipSync, zipSync } from 'fflate'
import { i18next } from '../i18n'
import { useConnectionStore } from '../stores/connection'
import { useAppsStore, type AppInfo } from '../stores/apps'
import { useEditorTabsStore } from '../stores/editorTabs'
import { withLoader } from '../stores/ui'
import { withRawMode, refreshTreeVia } from './device.service'
import { openFileContent } from './files.service'
import { tryDemoListDir } from './demoDevice'
import type { MpRawMode } from '../domain/rawmode'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

/**
 * MicroPythonOS app integration. Apps live in /apps/<fullname>/ with a
 * MANIFEST.JSON describing name/version/activities.
 * Docs: https://docs.micropythonos.com/apps/creating-apps/
 */

/** Scan /apps and parse each MANIFEST.JSON with optional progress callback. */
async function scanAppsVia(
    raw: MpRawMode,
    onProgress?: (done: number, total: number, currentAppId?: string) => void,
): Promise<AppInfo[]> {
    let entries: Array<{ name: string; path: string; content: unknown[] } | { name: string; path: string; size: number }> = []
    try {
        entries = (await raw.listDir('/apps')) as typeof entries
    } catch {
        return []
    }

    const appDirs = entries
        .filter((e): e is { name: string; path: string; content: unknown[] } => 'content' in e)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b))

    const total = appDirs.length
    onProgress?.(0, total)

    const apps: AppInfo[] = []
    for (let i = 0; i < appDirs.length; i++) {
        const fullname = appDirs[i]
        const path = `/apps/${fullname}`
        onProgress?.(i, total, fullname)

        let rawManifest = ''
        try {
            const bytes = await raw.readFile(`${path}/MANIFEST.JSON`)
            rawManifest = new TextDecoder().decode(bytes)
        } catch {
            apps.push({ fullname, name: fullname, version: '', activities: [], path, broken: true })
            onProgress?.(i + 1, total, fullname)
            continue
        }

        try {
            const m = JSON.parse(rawManifest)
            apps.push({
                fullname: m.fullname ?? fullname,
                name: m.name ?? fullname,
                version: m.version ?? '',
                publisher: m.publisher,
                short_description: m.short_description,
                category: m.category,
                activities: Array.isArray(m.activities) ? m.activities : [],
                path,
            })
        } catch {
            apps.push({ fullname, name: fullname, version: '', activities: [], path, broken: true })
        }

        onProgress?.(i + 1, total, fullname)
    }

    apps.sort((a, b) => a.name.localeCompare(b.name))
    return apps
}

export async function refreshApps(): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const store = useAppsStore.getState()
    if (store.scanning) return
    store.setScanning(true)
    try {
        await withLoader(t('apps.scanning', 'Scanning apps…'), async (loader) => {
            await withRawMode(async (raw) => {
                const apps = await scanAppsVia(raw, (done, total, currentAppId) => {
                    loader.update({
                        message:
                            total > 0
                                ? t('apps.scanning-progress', 'Scanning apps ({{done}}/{{total}})… {{app}}', {
                                      done,
                                      total,
                                      app: currentAppId ?? '',
                                  }).trim()
                                : t('apps.scanning', 'Scanning apps…'),
                        progress: total > 0 ? done / total : 1,
                    })
                })
                loader.update({ progress: 1 })
                useAppsStore.getState().setApps(apps)
            })
        })
    } catch (err) {
        console.warn('app scan failed:', err)
        useAppsStore.getState().setScanning(false)
    }
}

/** Launch app via AppManager; falls back with a toast when unsupported. */
export async function launchApp(fullname: string): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const store = useAppsStore.getState()
    if (store.launching) return
    store.setLaunching(fullname)
    try {
        await withRawMode(async (raw) => {
            await raw.exec(`
from mpos import AppManager
AppManager.start_app('${fullname}')
`)
        })
        toast.success(t('apps.launched', 'Launched {{app}}', { app: fullname }))
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('ImportError') || message.includes('no module')) {
            toast.error(t('apps.not-mpos', 'Device does not run MicroPythonOS'), {
                description: t('apps.not-mpos-hint', 'Launching apps requires the mpos module'),
            })
        } else {
            toast.error(t('apps.launch-failed', 'Launch failed'), { description: message })
        }
    } finally {
        useAppsStore.getState().setLaunching(null)
    }
}

/** Open the launcher entrypoint (or manifest) of an app in the editor. */
export async function openAppEntrypoint(app: AppInfo): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    const main = app.activities.find((a) =>
        a.intent_filters?.some((f) => f.action === 'main' && f.category === 'launcher'),
    ) ?? app.activities[0]
    const target = main ? `${app.path}/${main.entrypoint}` : `${app.path}/MANIFEST.JSON`
    await withLoader(t('files.opening', 'Opening {{fn}}…', { fn: target }), () =>
        withRawMode((raw) => openFileContent(raw, target)),
    )
}

/* ------------------------------------------------------------------ */
/* App editor support                                                  */
/* ------------------------------------------------------------------ */

export interface AppManifestFields {
    name: string
    version: string
    publisher: string
    short_description: string
    long_description: string
    category: string
}

/** Read full manifest (raw object) + top-level app entries (files + folders). */
export async function loadAppDetails(
    app: AppInfo,
): Promise<{
    manifest: Record<string, unknown>
    entries: Array<{ name: string; path: string; size: number; isDir: false } | { name: string; path: string; isDir: true }>
    files: Array<{ name: string; path: string; size: number }>
} | undefined> {
    return withRawMode(async (raw) => {
        let manifest: Record<string, unknown> = {}
        try {
            const bytes = await raw.readFile(`${app.path}/MANIFEST.JSON`)
            manifest = JSON.parse(new TextDecoder().decode(bytes))
        } catch {
            /* broken manifest — editor starts from scan values */
        }
        const rawEntries = (await raw.listDir(app.path)) as Array<
            { name: string; path: string; size: number } | { name: string; path: string; content: unknown[] }
        >
        const entries = rawEntries
            .map((e) => ('content' in e ? { name: e.name, path: e.path, isDir: true as const } : { name: e.name, path: e.path, size: e.size, isDir: false as const }))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
                return a.name.localeCompare(b.name)
            })
        const files = entries
            .filter((e): e is Extract<typeof e, { isDir: false }> => !e.isDir)
            .map(({ name, path, size }) => ({ name, path, size }))

        return { manifest, entries, files }
    })
}

/** List one directory level (folders + files), sorted folders first. */
export async function listDirectory(path: string): Promise<
    Array<{ name: string; path: string; isDir: true } | { name: string; path: string; size: number; isDir: false }> | undefined
> {
    const demo = tryDemoListDir(path)
    if (demo !== null) return demo
    return withRawMode(async (raw) => {
        const rawEntries = (await raw.listDir(path)) as Array<
            { name: string; path: string; size: number } | { name: string; path: string; content: unknown[] }
        >
        return rawEntries
            .map((e) => ('content' in e ? { name: e.name, path: e.path, isDir: true as const } : { name: e.name, path: e.path, size: e.size, isDir: false as const }))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
                return a.name.localeCompare(b.name)
            })
    })
}

/** Read app icon as data URL (png), when available. */
export async function loadAppIconDataUrl(app: AppInfo): Promise<string | undefined> {
    return withRawMode(async (raw) => {
        try {
            const bytes = await raw.readFile(`${app.path}/icon_64x64.png`)
            const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
            return `data:image/png;base64,${btoa(bin)}`
        } catch {
            return undefined
        }
    })
}

/** Merge edited fields into MANIFEST.JSON (preserving unknown keys) and rescan. */
export async function updateAppManifest(app: AppInfo, fields: AppManifestFields, iconPng?: Uint8Array): Promise<boolean> {
    const { port } = useConnectionStore.getState()
    if (!port) return false

    const ok = await withLoader(
        t('apps.saving', 'Saving {{app}}…', { app: fields.name || app.fullname }),
        async () => {
            const result = await withRawMode(async (raw) => {
                let manifest: Record<string, unknown> = {}
                try {
                    const bytes = await raw.readFile(`${app.path}/MANIFEST.JSON`)
                    manifest = JSON.parse(new TextDecoder().decode(bytes))
                } catch {
                    // Rebuild minimal manifest for broken apps.
                    manifest = {
                        fullname: app.fullname,
                        activities: app.activities.length
                            ? app.activities
                            : [{ entrypoint: 'main.py', classname: 'Main', intent_filters: [{ action: 'main', category: 'launcher' }] }],
                    }
                }
                manifest.name = fields.name.trim() || app.fullname
                manifest.version = fields.version.trim() || '0.1.0'
                manifest.publisher = fields.publisher.trim() || 'Unknown'
                manifest.short_description = fields.short_description.trim()
                manifest.long_description = fields.long_description.trim() || fields.short_description.trim()
                manifest.category = fields.category

                await raw.writeFile(`${app.path}/MANIFEST.JSON`, JSON.stringify(manifest, null, 2) + '\n')
                if (iconPng && iconPng.length > 0) {
                    await raw.writeFile(`${app.path}/icon_64x64.png`, iconPng)
                }

                try {
                    await raw.exec(`
from mpos import AppManager
AppManager.refresh_apps()
`)
                } catch {
                    /* non-MPOS device: manifest saved anyway */
                }

                useAppsStore.getState().setApps(await scanAppsVia(raw))
                return true
            })
            return result === true
        },
    )
    if (ok) toast.success(t('apps.saved', 'Saved {{app}}', { app: fields.name }))
    return ok
}

/** Open one file of an app in the editor. */
export async function openAppFile(path: string): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) return
    await withLoader(t('files.opening', 'Opening {{fn}}…', { fn: path }), () =>
        withRawMode((raw) => openFileContent(raw, path)),
    )
}

/** Recursively collect device file paths under `root` (relative names). */
async function walkAppFiles(
    raw: MpRawMode,
    root: string,
    rel = '',
): Promise<Array<{ rel: string; path: string; size: number }>> {
    const entries = (await raw.listDir(rel ? `${root}/${rel}` : root)) as Array<
        { name: string; path: string; size: number } | { name: string; path: string; content: unknown[] }
    >
    const out: Array<{ rel: string; path: string; size: number }> = []
    for (const e of entries) {
        const childRel = rel ? `${rel}/${e.name}` : e.name
        if ('content' in e) out.push(...(await walkAppFiles(raw, root, childRel)))
        else out.push({ rel: childRel, path: e.path, size: e.size })
    }
    return out
}

/** Export app folder from device as .mpk (zip with <fullname>/ top-level dir),
 *  downloaded through the browser. */
export async function exportMpk(app: AppInfo): Promise<boolean> {
    const { port } = useConnectionStore.getState()
    if (!port) {
        toast.info(t('app.connect-first', 'Connect your board first'))
        return false
    }

    const ok = await withLoader(
        t('apps.exporting', 'Exporting {{app}}…', { app: app.name || app.fullname }),
        async (loader) => {
            const zipped = await withRawMode(async (raw) => {
                const files = await walkAppFiles(raw, app.path)
                if (files.length === 0) throw new Error(t('apps.export-empty', 'App folder is empty'))
                const totalBytes = files.reduce((acc, f) => acc + f.size, 0)
                const tree: Record<string, Uint8Array> = {}
                let read = 0
                for (let i = 0; i < files.length; i++) {
                    const f = files[i]
                    loader.update({
                        message: t('apps.exporting-file', 'Reading {{name}} ({{index}}/{{total}})…', {
                            name: f.rel,
                            index: i + 1,
                            total: files.length,
                        }),
                        progress: totalBytes > 0 ? read / totalBytes : 0,
                    })
                    tree[`${app.fullname}/${f.rel}`] = await raw.readFile(f.path)
                    read += f.size
                }
                loader.update({ message: t('apps.exporting-zip', 'Building .mpk…'), progress: 1 })
                return zipSync(tree)
            })
            if (!zipped) return false

            const blob = new Blob([zipped as BlobPart], { type: 'application/zip' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${app.fullname}.mpk`
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 10000)
            return true
        },
    )

    if (ok) toast.success(t('apps.exported', 'Exported {{app}}.mpk', { app: app.fullname }))
    return ok === true
}

/** Delete whole app folder recursively, then refresh app registry + file tree. */export async function deleteApp(
    app: AppInfo,
    prompt: (msg: string, options?: { value?: string; placeholder?: string; password?: boolean }) => Promise<string | null>,
): Promise<boolean> {
    const { port } = useConnectionStore.getState()
    if (!port) return false

    const typed = await prompt(
        t(
            'apps.delete-confirm-type',
            'Delete app "{{name}}" ({{id}}).\n\nType **{{id}}** to confirm.',
            { name: app.name || app.fullname, id: app.fullname },
        ),
        { value: '', placeholder: app.fullname },
    )
    if ((typed ?? '').trim() !== app.fullname) return false

    try {
        const ok = await withLoader(
            t('apps.deleting', 'Deleting {{app}}…', { app: app.name || app.fullname }),
            async (loader) => {
                loader.update({
                    message: t('apps.deleting-files', 'Deleting app files…'),
                    progress: 0.05,
                })

                const result = await withRawMode(async (raw) => {
                    await raw.exec(
                        `
import os

def _rm(p):
 try:
  st=os.stat(p)
 except:
  return
 if st[0] & 0x4000:
  for n in os.listdir(p):
   _rm(p+'/'+n)
  try: os.rmdir(p)
  except: pass
 else:
  try: os.remove(p)
  except: pass

_rm('${app.path}')
`,
                        30_000,
                    )

                    loader.update({
                        message: t('apps.deleting-finalizing', 'Files deleted. Finalizing…'),
                        progress: 0.75,
                    })

                    try {
                        await raw.exec(
                            `
from mpos import AppManager
AppManager.refresh_apps()
AppManager.restart_launcher()
`,
                            15_000,
                        )
                    } catch {
                        // non-MPOS device or missing AppManager
                    }

                    loader.update({
                        message: t('apps.deleting-refreshing', 'Refreshing file tree and rescanning apps…'),
                        progress: 0.9,
                    })

                    await refreshTreeVia(raw)
                    useAppsStore.getState().setApps(await scanAppsVia(raw))
                    useAppsStore.getState().setSelected(null)

                    loader.update({ progress: 1 })
                    return true
                })
                return result === true
            },
        )

        if (ok) {
            useEditorTabsStore.getState().closeByPath(app.path, true)
            toast.success(t('apps.deleted', 'Deleted {{app}}', { app: app.name || app.fullname }))
        }
        return ok
    } catch (err) {
        toast.error(t('apps.delete-failed', 'Delete failed'), {
            description: err instanceof Error ? err.message : String(err),
        })
        return false
    }
}

/* ------------------------------------------------------------------ */
/* MPK install                                                         */
/* ------------------------------------------------------------------ */

export interface MpkFileEntry {
    archivePath: string
    devicePath: string
    bytes: Uint8Array
}

export interface MpkInstallPreview {
    fileName: string
    appId: string
    appName: string
    version: string
    publisher: string
    description: string
    location: string
    iconDataUrl?: string
    files: MpkFileEntry[]
    directories: string[]
    totalBytes: number
}

function bytesToDataUrlPng(bytes: Uint8Array): string {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return `data:image/png;base64,${btoa(bin)}`
}

function splitTop(path: string): [string, string] {
    const clean = path.replace(/^\/+/, '')
    const slash = clean.indexOf('/')
    return slash < 0 ? [clean, ''] : [clean.slice(0, slash), clean.slice(slash + 1)]
}

function normalizeZipPath(path: string): string {
    return path
        .replaceAll('\\', '/')
        .replace(/^\.\//, '')
        .replace(/\/+/g, '/')
}

function isIgnorableZipEntry(path: string): boolean {
    if (!path) return true
    if (path === '__MACOSX' || path.startsWith('__MACOSX/')) return true
    const base = path.endsWith('/') ? path.slice(0, -1).split('/').pop() ?? '' : path.split('/').pop() ?? ''
    return base === '.DS_Store' || base.startsWith('._')
}

/** Parse .mpk (zip) and build install preview/plan. */
export async function parseMpk(file: File): Promise<MpkInstallPreview> {
    const buf = new Uint8Array(await file.arrayBuffer())
    const unzipped = unzipSync(buf)
    const entries = Object.entries(unzipped)
        .map(([archivePath, bytes]) => ({ archivePath: normalizeZipPath(archivePath), bytes }))
        .filter(({ archivePath }) => !isIgnorableZipEntry(archivePath))

    if (entries.length === 0) throw new Error(t('apps.mpk-empty', 'MPK is empty'))

    const topDirs = new Set<string>()
    for (const { archivePath } of entries) {
        const [top] = splitTop(archivePath)
        if (top) topDirs.add(top)
    }
    if (topDirs.size !== 1) {
        throw new Error(
            t('apps.mpk-layout', 'Invalid MPK layout: archive must contain exactly one top-level app folder'),
        )
    }

    const appId = [...topDirs][0]
    validateAppFullname(appId)

    const files: MpkFileEntry[] = []
    const dirs = new Set<string>([`/apps/${appId}`])
    let totalBytes = 0

    for (const { archivePath, bytes } of entries.sort((a, b) => a.archivePath.localeCompare(b.archivePath))) {
        const [, rest] = splitTop(archivePath)
        if (!rest) continue
        const devicePath = `/apps/${appId}/${rest}`.replace(/\/+/g, '/')

        if (archivePath.endsWith('/')) {
            dirs.add(devicePath.replace(/\/+$/, ''))
            continue
        }

        const folder = devicePath.slice(0, devicePath.lastIndexOf('/'))
        if (folder) dirs.add(folder)
        files.push({ archivePath, devicePath, bytes })
        totalBytes += bytes.length
    }

    const manifestFile = files.find((f) => f.archivePath.toUpperCase() === `${appId}/MANIFEST.JSON`.toUpperCase())
    if (!manifestFile) throw new Error(t('apps.mpk-manifest-missing', 'MPK missing MANIFEST.JSON'))

    let manifest: Record<string, unknown>
    try {
        manifest = JSON.parse(new TextDecoder().decode(manifestFile.bytes))
    } catch {
        throw new Error(t('apps.mpk-manifest-invalid', 'MANIFEST.JSON is not valid JSON'))
    }

    const manifestId = String(manifest.fullname ?? appId)
    if (manifestId !== appId) {
        throw new Error(
            t('apps.mpk-id-mismatch', 'MANIFEST fullname does not match MPK folder name'),
        )
    }

    const iconBytes = files.find((f) => f.archivePath.toLowerCase() === `${appId}/icon_64x64.png`.toLowerCase())?.bytes

    return {
        fileName: file.name,
        appId,
        appName: String(manifest.name ?? appId),
        version: String(manifest.version ?? ''),
        publisher: String(manifest.publisher ?? ''),
        description: String(manifest.short_description ?? ''),
        location: `/apps/${appId}`,
        iconDataUrl: iconBytes ? bytesToDataUrlPng(iconBytes) : undefined,
        files,
        directories: [...dirs].sort((a, b) => a.length - b.length || a.localeCompare(b)),
        totalBytes,
    }
}

/** Install parsed MPK onto board under /apps/<fullname>. */
export async function installMpk(
    mpk: MpkInstallPreview,
    confirmOverwrite: (msg: string) => Promise<boolean>,
    onProgress?: (state: { message?: string; progress?: number }) => void,
): Promise<boolean> {
    const { port } = useConnectionStore.getState()
    if (!port) {
        toast.info(t('app.connect-first', 'Connect your board first'))
        return false
    }

    const appRoot = mpk.location
    const ok = await withLoader(
        t('apps.installing', 'Installing {{app}}…', { app: mpk.appName || mpk.appId }),
        async (loader) => {
            const result = await withRawMode(async (raw) => {
                const exists = (
                    await raw.exec(`
import os
try:
 os.stat('${appRoot}')
 print('1')
except:
 print('0')
`)
                )
                    .trim()
                    .endsWith('1')

                if (exists) {
                    const confirmed = await confirmOverwrite(
                        t('apps.mpk-confirm-overwrite', 'App folder {{path}} exists. Replace with MPK contents?', {
                            path: appRoot,
                        }),
                    )
                    if (!confirmed) return false

                    await raw.exec(`
import os

def _rm(p):
 try:
  st=os.stat(p)
 except:
  return
 if st[0] & 0x4000:
  for n in os.listdir(p):
   _rm(p+'/'+n)
  try: os.rmdir(p)
  except: pass
 else:
  try: os.remove(p)
  except: pass

_rm('${appRoot}')
`)
                }

                for (const dir of mpk.directories) {
                    await raw.makePath(dir)
                }

                const totalBytes = mpk.files.reduce((acc, f) => acc + f.bytes.length, 0)
                let writtenBytes = 0
                for (let i = 0; i < mpk.files.length; i++) {
                    const f = mpk.files[i]
                    const base = writtenBytes
                    const message = t('apps.installing-file', 'Installing {{name}} ({{index}}/{{total}})…', {
                        name: f.devicePath,
                        index: i + 1,
                        total: mpk.files.length,
                    })
                    const progress = totalBytes > 0 ? base / totalBytes : 0
                    loader.update({ message, progress })
                    onProgress?.({ message, progress })
                    await raw.writeFile(f.devicePath, f.bytes, 128, false, (sent, total) => {
                        const current = base + (total > 0 ? sent : f.bytes.length)
                        const p = totalBytes > 0 ? current / totalBytes : 0
                        loader.update({ progress: p })
                        onProgress?.({ progress: p })
                    })
                    writtenBytes += f.bytes.length
                }
                const finalizingMsg = t(
                    'apps.installing-finalizing',
                    'Files uploaded. Finalizing install: refreshing app registry, launcher, and app list…',
                )
                loader.update({ message: finalizingMsg, progress: 1 })
                onProgress?.({ message: finalizingMsg, progress: 1 })

                try {
                    await raw.exec(`
from mpos import AppManager
AppManager.refresh_apps()
AppManager.restart_launcher()
`)
                } catch {
                    // non-MPOS device or missing AppManager; files still installed
                }

                const refreshingMsg = t('apps.installing-refreshing-tree', 'Refreshing file tree and rescanning apps…')
                loader.update({ message: refreshingMsg, progress: 1 })
                onProgress?.({ message: refreshingMsg, progress: 1 })

                await refreshTreeVia(raw)
                useAppsStore.getState().setApps(await scanAppsVia(raw))
                return true
            })
            return result === true
        },
    )

    if (ok) toast.success(t('apps.installed', 'Installed {{app}}', { app: mpk.appName || mpk.appId }))
    return ok
}

/* ------------------------------------------------------------------ */
/* Create app scaffold                                                 */
/* ------------------------------------------------------------------ */

export interface NewAppInput {
    fullname: string
    name: string
    version: string
    publisher: string
    description: string
    template: 'hello' | 'blank'
    /** PNG bytes for icon_64x64.png */
    iconPng: Uint8Array
}

export function validateAppFullname(fullname: string): string {
    const value = fullname.trim()
    if (!value) throw new Error(t('apps.validate-required', 'App ID is required'))
    if (!value.includes('.'))
        throw new Error(t('apps.validate-dot', 'App ID should include at least one dot, e.g. com.example.myapp'))
    if (!/^[A-Za-z0-9_.-]+$/.test(value))
        throw new Error(
            t('apps.validate-chars', 'App ID may only contain letters, numbers, dots, dashes and underscores'),
        )
    return value
}

function mainPyFor(appName: string, template: 'hello' | 'blank'): string {
    if (template === 'blank') {
        return `from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        self.setContentView(screen)
`
    }
    return `from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        label = lv.label(screen)
        label.set_text("Hello from ${appName}!")
        label.center()
        self.setContentView(screen)
`
}

export async function createApp(input: NewAppInput, confirmOverwrite: (msg: string) => Promise<boolean>): Promise<boolean> {
    const { port } = useConnectionStore.getState()
    if (!port) {
        toast.info(t('app.connect-first', 'Connect your board first'))
        return false
    }

    const fullname = validateAppFullname(input.fullname)
    const appRoot = `/apps/${fullname}`

    const stageToastId = toast.loading(t('apps.creating', 'Creating app {{fullname}}…', { fullname }))

    const ok = await withLoader(
        t('apps.creating', 'Creating app {{fullname}}…', { fullname }),
        async (loader) => {
            const result = await withRawMode(async (raw) => {
                const exists = (
                    await raw.exec(`
import os
try:
 os.stat('${appRoot}')
 print('1')
except:
 print('0')
`)
                )
                    .trim()
                    .endsWith('1')
                if (exists) {
                    const confirmed = await confirmOverwrite(
                        t('apps.confirm-overwrite', 'App folder {{path}} already exists. Overwrite scaffold files?', {
                            path: appRoot,
                        }),
                    )
                    if (!confirmed) return false
                }

                const manifest = {
                    name: input.name.trim() || 'My App',
                    publisher: input.publisher.trim() || 'Unknown',
                    short_description: input.description.trim() || input.name,
                    long_description: input.description.trim() || input.name,
                    fullname,
                    version: input.version.trim() || '0.1.0',
                    category: 'development',
                    activities: [
                        {
                            entrypoint: 'main.py',
                            classname: 'Main',
                            intent_filters: [{ action: 'main', category: 'launcher' }],
                        },
                    ],
                }

                loader.update({ message: t('apps.creating-folders', 'Creating app folder…'), progress: 0.2 })
                toast.loading(t('apps.creating-folders', 'Creating app folder…'), { id: stageToastId })
                await raw.makePath(appRoot)

                loader.update({ message: t('apps.creating-manifest', 'Writing MANIFEST.JSON…'), progress: 0.45 })
                toast.loading(t('apps.creating-manifest', 'Writing MANIFEST.JSON…'), { id: stageToastId })
                await raw.writeFile(`${appRoot}/MANIFEST.JSON`, JSON.stringify(manifest, null, 2) + '\n')

                loader.update({ message: t('apps.creating-main', 'Writing main.py…'), progress: 0.65 })
                toast.loading(t('apps.creating-main', 'Writing main.py…'), { id: stageToastId })
                await raw.writeFile(`${appRoot}/main.py`, mainPyFor(manifest.name, input.template))

                loader.update({ message: t('apps.creating-icon', 'Writing icon…'), progress: 0.8 })
                toast.loading(t('apps.creating-icon', 'Writing icon…'), { id: stageToastId })
                await raw.writeFile(`${appRoot}/icon_64x64.png`, input.iconPng)

                // Refresh launcher; non-fatal when unsupported.
                try {
                    await raw.exec(`
from mpos import AppManager
AppManager.refresh_apps()
AppManager.restart_launcher()
`)
                } catch {
                    toast.warning(t('apps.launcher-refresh-failed', 'Scaffold created, but launcher refresh failed'))
                }

                loader.update({ message: t('apps.creating-refresh', 'Refreshing app list…'), progress: 0.92 })
                toast.loading(t('apps.creating-refresh', 'Refreshing app list…'), { id: stageToastId })
                await refreshTreeVia(raw)
                useAppsStore.getState().setApps(await scanAppsVia(raw))

                loader.update({ message: t('apps.creating-open', 'Opening main.py…'), progress: 0.98 })
                toast.loading(t('apps.creating-open', 'Opening main.py…'), { id: stageToastId })
                await openFileContent(raw, `${appRoot}/main.py`)
                loader.update({ progress: 1 })
                return true
            })
            return result === true
        },
    )

    if (ok) {
        toast.success(t('apps.created', 'Created app {{fullname}}', { fullname }), { id: stageToastId })
    } else {
        toast.dismiss(stageToastId)
    }
    return ok
}
