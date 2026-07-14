import { i18next } from '../../i18n'
import { useAppsStore } from '../../stores/apps'
import { parseMpk, installMpk } from '../apps.service'
import * as api from './api'
import type { ProjectSummary } from './api'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

/** Badges considered installable via .mpk on MicroPythonOS. */
const MPOS_BADGES = new Set(['mpos_api_0', 'fri3d_2026_native', 'fri3d_2024_native', 'fri3d_2022_native'])

export interface StoreApp {
    slug: string
    name: string
    description: string
    version: string
    revision: number | null
    categories: string[]
    badges: string[]
    installs: number
    gitUrl?: string
    iconUrl: string
    /** Compatible with MicroPythonOS mpk install flow. */
    installable: boolean
    /** Installed on connected device? Filled by caller from apps store. */
    installedVersion?: string
}

export async function fetchStoreApps(filter: { category?: string; search?: string } = {}): Promise<StoreApp[]> {
    const summaries = await api.getProjectSummaries({ ...filter, pageLength: 200 })
    const installed = new Map(
        (useAppsStore.getState().apps ?? []).map((a) => [a.fullname, a.version]),
    )
    return summaries
        .filter((s) => !s.hidden)
        .map((s: ProjectSummary) => ({
            slug: s.slug,
            name: s.name || s.slug,
            description: s.description ?? '',
            version: s.version ?? '',
            revision: s.revision ?? s.latest_revision ?? null,
            categories: s.categories ?? [],
            badges: s.badges ?? [],
            installs: s.installs ?? 0,
            gitUrl: s.git_url,
            iconUrl: api.fileUrl(s.slug, 'icon-64x64.png'),
            installable: (s.badges ?? []).some((b) => MPOS_BADGES.has(b)),
            installedVersion: installed.get(s.slug),
        }))
}

/** Download published mpk of a project and install to connected device. */
export async function installFromBadgeHub(
    storeApp: StoreApp,
    confirmOverwrite: (msg: string) => Promise<boolean>,
    onProgress?: (state: { message?: string; progress?: number }) => void,
): Promise<boolean> {
    const details = await api.getProject(storeApp.slug)
    const files = details.version?.files ?? []
    const executable = details.version?.app_metadata?.application?.[0]?.executable
    const mpkFile =
        (executable && files.find((f) => f.full_path === executable)) ??
        files.find((f) => f.ext === '.mpk')
    if (!mpkFile) {
        throw new Error(t('badgehub.no-mpk', 'This project has no installable .mpk file'))
    }

    onProgress?.({ message: t('badgehub.downloading', 'Downloading {{name}}…', { name: mpkFile.full_path }) })
    const buf = await api.downloadFile(mpkFile.url)
    const file = new File([buf], mpkFile.full_path, { type: 'application/zip' })

    const preview = await parseMpk(file)
    const ok = await installMpk(preview, confirmOverwrite, onProgress)
    if (ok && storeApp.revision !== null) {
        void api.reportInstall(storeApp.slug, storeApp.revision)
    }
    return ok
}
