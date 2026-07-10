import { toast } from 'sonner'
import { i18next } from '../i18n'
import { useConnectionStore } from '../stores/connection'
import { useAppsStore, type AppInfo } from '../stores/apps'
import { withLoader } from '../stores/ui'
import { withRawMode, refreshTreeVia } from './device.service'
import { openFileContent } from './files.service'
import type { MpRawMode } from '../domain/rawmode'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

/**
 * MicroPythonOS app integration. Apps live in /apps/<fullname>/ with a
 * MANIFEST.JSON describing name/version/activities.
 * Docs: https://docs.micropythonos.com/apps/creating-apps/
 */

/** One-command scan: list /apps folders + dump each MANIFEST.JSON. */
async function scanAppsVia(raw: MpRawMode): Promise<AppInfo[]> {
    // Emits one line per app: <fullname>\t<manifest-json-or-empty>
    const rsp = await raw.exec(`
import os,json
try:
 for n in os.listdir('/apps'):
  p='/apps/'+n
  try:
   if os.stat(p)[0] & 0x4000:
    try:
     with open(p+'/MANIFEST.JSON') as f: m=f.read().replace('\\n','').replace('\\t','')
    except: m=''
    print(n+'\\t'+m)
  except: pass
except OSError: pass
`)
    const apps: AppInfo[] = []
    for (const line of rsp.split('\n')) {
        if (!line.trim()) continue
        const idx = line.indexOf('\t')
        if (idx < 0) continue
        const fullname = line.slice(0, idx).trim()
        const rawManifest = line.slice(idx + 1).trim()
        const path = `/apps/${fullname}`
        if (!rawManifest) {
            apps.push({ fullname, name: fullname, version: '', activities: [], path, broken: true })
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
        await withRawMode(async (raw) => {
            useAppsStore.getState().setApps(await scanAppsVia(raw))
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

    const ok = await withLoader(
        t('apps.creating', 'Creating app {{fullname}}…', { fullname }),
        async () => {
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

                await raw.makePath(appRoot)
                await raw.writeFile(`${appRoot}/MANIFEST.JSON`, JSON.stringify(manifest, null, 2) + '\n')
                await raw.writeFile(`${appRoot}/main.py`, mainPyFor(manifest.name, input.template))
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

                await refreshTreeVia(raw)
                useAppsStore.getState().setApps(await scanAppsVia(raw))
                await openFileContent(raw, `${appRoot}/main.py`)
                return true
            })
            return result === true
        },
    )

    if (ok) toast.success(t('apps.created', 'Created app {{fullname}}', { fullname }))
    return ok
}
