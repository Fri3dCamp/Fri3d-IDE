import { toast } from 'sonner'
import { i18next } from '../../i18n'
import { withLoader } from '../../stores/ui'
import type { AppInfo } from '../../stores/apps'
import { buildMpkBytes, loadAppDetails, loadAppIconDataUrl } from '../apps.service'
import * as api from './api'
import { BadgeHubApiError, type AppMetadata } from './api'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

export interface PublishFields {
    name: string
    description: string
    longDescription: string
    author: string
    version: string
    categories: string[]
    licenseType: string
    gitUrl: string
    hidden: boolean
    developmentStatus: 'stable' | 'work_in_progress'
}

/** Prefill publish form from device manifest (+ existing BadgeHub draft when present). */
export async function loadPublishDefaults(app: AppInfo): Promise<{ fields: PublishFields; exists: boolean; owned: boolean }> {
    const details = await loadAppDetails(app)
    const m = (details?.manifest ?? {}) as Record<string, unknown>

    let existing: AppMetadata | undefined
    let exists = false
    let owned = false
    try {
        const draft = await api.getDraftProject(app.fullname)
        existing = draft.version?.app_metadata
        exists = true
        owned = true
    } catch (err) {
        if (err instanceof BadgeHubApiError && (err.status === 403 || err.status === 409)) {
            exists = true
            owned = false
        }
        // 404 -> free slug
    }

    const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Map MPOS manifest categories (lowercase) to BadgeHub category enum. */
const BADGEHUB_CATEGORIES = [
    'Audio', 'Communication', 'Data', 'Development', 'Driver', 'Event-related', 'Finance',
    'Game', 'Graphics', 'Hacking', 'Hardware', 'Interpreter', 'Knowledge', 'Network', 'SAO',
    'Silly', 'System', 'Troll', 'Uncategorised', 'Unusable', 'Utility', 'Virus', 'Wearable',
    'Adult', 'Default',
]
const MPOS_CATEGORY_MAP: Record<string, string> = {
    development: 'Development',
    games: 'Game',
    game: 'Game',
    media: 'Audio',
    productivity: 'Utility',
    utilities: 'Utility',
    system: 'System',
    other: 'Uncategorised',
}
function toBadgeHubCategory(raw: string): string {
    if (!raw) return 'Uncategorised'
    const exact = BADGEHUB_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase())
    return exact ?? MPOS_CATEGORY_MAP[raw.toLowerCase()] ?? 'Uncategorised'
}

    return {
        exists,
        owned,
        fields: {
            name: existing?.name ?? str(m.name) ?? app.name,
            description: existing?.description ?? str(m.short_description),
            longDescription: existing?.long_description ?? str(m.long_description),
            author: existing?.author ?? str(m.publisher),
            version: str(m.version) || existing?.version || '0.1.0',
            categories: existing?.categories ?? (str(m.category) ? [toBadgeHubCategory(str(m.category))] : []),
            licenseType: existing?.license_type ?? 'MIT',
            gitUrl: existing?.git_url ?? '',
            hidden: existing?.hidden ?? false,
            developmentStatus: existing?.development_status ?? 'work_in_progress',
        },
    }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const bin = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

/**
 * Full publish pipeline:
 * create (if new) -> metadata -> mpk upload -> icon upload -> icon convert -> publish.
 */
export async function publishAppToBadgeHub(
    app: AppInfo,
    fields: PublishFields,
    isNew: boolean,
    onProgress?: (msg: string) => void,
): Promise<boolean> {
    const slug = app.fullname
    const step = (msg: string) => onProgress?.(msg)

    const ok = await withLoader(
        t('badgehub.publishing', 'Publishing {{app}} to BadgeHub…', { app: fields.name || slug }),
        async (loader) => {
            const progress = (msg: string) => {
                loader.update({ message: msg })
                step(msg)
            }

            if (isNew) {
                progress(t('badgehub.step-create', 'Creating project…'))
                await api.createProject(slug, fields.gitUrl || undefined)
            }

            progress(t('badgehub.step-mpk', 'Reading app from device…'))
            const mpkBytes = await buildMpkBytes(app, (s) => {
                if (s.message) loader.update({ message: s.message, progress: s.progress })
            })
            if (!mpkBytes) throw new Error(t('app.connect-first', 'Connect your board first'))
            const mpkName = `${slug}_${fields.version || '0.0.0'}.mpk`

            progress(t('badgehub.step-metadata', 'Updating metadata…'))
            const metadata: AppMetadata = {
                project_type: 'app',
                name: fields.name,
                description: fields.description,
                long_description: fields.longDescription || undefined,
                author: fields.author || undefined,
                version: fields.version || undefined,
                categories: fields.categories.length ? fields.categories : undefined,
                license_type: fields.licenseType || undefined,
                git_url: fields.gitUrl || undefined,
                hidden: fields.hidden,
                development_status: fields.developmentStatus,
                badges: ['mpos_api_0'],
                application: [{ executable: mpkName }],
            }
            await api.changeDraftMetadata(slug, metadata)

            progress(t('badgehub.step-upload-mpk', 'Uploading {{name}}…', { name: mpkName }))
            await api.writeDraftFile(slug, mpkName, mpkBytes, 'application/zip')

            const iconDataUrl = await loadAppIconDataUrl(app)
            if (iconDataUrl) {
                progress(t('badgehub.step-upload-icon', 'Uploading icon…'))
                await api.writeDraftFile(slug, 'icon-64x64.png', dataUrlToBytes(iconDataUrl), 'image/png')
                progress(t('badgehub.step-convert-icon', 'Converting icon…'))
                await api.setDraftIconFromFile(slug, 'icon-64x64.png')
            }

            progress(t('badgehub.step-publish', 'Publishing version…'))
            await api.publishVersion(slug)
            return true
        },
    )

    if (ok) {
        toast.success(t('badgehub.published', 'Published {{app}} to BadgeHub', { app: fields.name || slug }))
    }
    return ok === true
}
