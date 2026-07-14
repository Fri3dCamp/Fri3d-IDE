import { getToken } from './auth'
import { BADGEHUB_API_BASE } from './config'

/* ------------------------------------------------------------------ */
/* Types (per swagger.json + live data)                                */
/* ------------------------------------------------------------------ */

export interface ProjectSummary {
    slug: string
    idp_user_id: string
    latest_revision?: number | null
    name: string
    hidden?: boolean
    published_at: string | null
    installs?: number
    license_type?: string
    categories?: string[]
    badges?: string[]
    description?: string
    version?: string
    revision?: number
    git_url?: string
}

export interface ProjectFile {
    dir: string
    name: string
    ext: string
    mimetype: string
    size_of_content: number
    sha256: string
    full_path: string
    url: string
}

export interface AppMetadata {
    project_type?: 'app' | 'library' | 'firmware' | 'other'
    git_url?: string
    hidden?: boolean
    name?: string
    description?: string
    long_description?: string
    categories?: string[]
    author?: string
    license_type?: string
    version?: string
    badges?: string[]
    application?: Array<{ executable: string }>
}

export interface ProjectDetails {
    slug: string
    idp_user_id: string
    latest_revision: number | null
    version: {
        revision: number
        files: ProjectFile[]
        app_metadata: AppMetadata
        published_at?: string | null
        project_slug?: string
    }
}

export class BadgeHubApiError extends Error {
    status: number
    body: string
    constructor(status: number, body: string, message?: string) {
        super(message ?? `BadgeHub API error ${status}: ${body.slice(0, 200)}`)
        this.status = status
        this.body = body
    }
}

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

async function request<T>(
    method: string,
    path: string,
    opts: { auth?: boolean; json?: unknown; body?: BodyInit; raw?: boolean } = {},
): Promise<T> {
    const headers: Record<string, string> = {}
    if (opts.auth) {
        const token = await getToken()
        if (!token) throw new BadgeHubApiError(401, '', 'Not logged in to BadgeHub')
        headers.Authorization = `Bearer ${token}`
    }
    let body: BodyInit | undefined = opts.body
    if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(opts.json)
    }
    const res = await fetch(`${BADGEHUB_API_BASE}${path}`, { method, headers, body })
    if (!res.ok) throw new BadgeHubApiError(res.status, await res.text())
    if (opts.raw) return (await res.arrayBuffer()) as T
    const text = await res.text()
    if (!text) return undefined as T
    try {
        return JSON.parse(text) as T
    } catch {
        return text as T
    }
}

const enc = encodeURIComponent

/* ------------------------------------------------------------------ */
/* Public endpoints (no auth)                                          */
/* ------------------------------------------------------------------ */

export interface SummaryFilter {
    category?: string
    badge?: string
    search?: string
    userId?: string
    pageStart?: number
    pageLength?: number
}

export function getProjectSummaries(filter: SummaryFilter = {}): Promise<ProjectSummary[]> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') q.set(k, String(v))
    const qs = q.toString()
    return request('GET', `/project-summaries${qs ? `?${qs}` : ''}`)
}

export function getProject(slug: string): Promise<ProjectDetails> {
    return request('GET', `/projects/${enc(slug)}`)
}

export function getCategories(): Promise<string[]> {
    return request('GET', '/categories')
}

export function downloadFile(url: string): Promise<ArrayBuffer> {
    return request('GET', url.replace(BADGEHUB_API_BASE, ''), { raw: true })
}

export function fileUrl(slug: string, filePath: string): string {
    return `${BADGEHUB_API_BASE}/projects/${enc(slug)}/latest/files/${filePath}`
}

export function reportInstall(slug: string, revision: number): Promise<void> {
    return request('POST', `/projects/${enc(slug)}/rev${revision}/report/install`).catch(() => undefined) as Promise<void>
}

/* ------------------------------------------------------------------ */
/* Private endpoints (JWT)                                             */
/* ------------------------------------------------------------------ */

export function createProject(slug: string, gitUrl?: string): Promise<void> {
    return request('POST', `/projects/${enc(slug)}`, { auth: true, json: gitUrl ? { git: gitUrl } : {} })
}

export function getUserDrafts(userId: string): Promise<ProjectSummary[]> {
    return request('GET', `/users/${enc(userId)}/drafts`, { auth: true })
}

export function getDraftProject(slug: string): Promise<ProjectDetails> {
    return request('GET', `/projects/${enc(slug)}/draft`, { auth: true })
}

export function changeDraftMetadata(slug: string, metadata: AppMetadata): Promise<void> {
    return request('PATCH', `/projects/${enc(slug)}/draft/metadata`, { auth: true, json: metadata })
}

export function writeDraftFile(slug: string, filePath: string, bytes: Uint8Array, mimetype = 'application/octet-stream'): Promise<void> {
    const form = new FormData()
    form.append('file', new Blob([bytes as BlobPart], { type: mimetype }), filePath.split('/').pop() ?? filePath)
    return request('POST', `/projects/${enc(slug)}/draft/files/${filePath}`, { auth: true, body: form })
}

export function setDraftIconFromFile(slug: string, filePath: string): Promise<{ iconPaths: Record<string, string> }> {
    return request('POST', `/projects/${enc(slug)}/draft/icon`, {
        auth: true,
        json: { filePath, sizes: ['8x8', '16x16', '32x32', '64x64'] },
    })
}

export function publishVersion(slug: string): Promise<void> {
    return request('PATCH', `/projects/${enc(slug)}/publish`, { auth: true })
}

export function deleteProject(slug: string): Promise<void> {
    return request('DELETE', `/projects/${enc(slug)}`, { auth: true })
}
