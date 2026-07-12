/*
 * Vite plugin: fetch the MicroPythonOS web build assets into public/vbadge/.
 *
 * The virtual badge transport (src/domain/virtualBadge.ts) loads
 * /vbadge/index.html, which needs micropython.{js,wasm,data} from the
 * MicroPythonOS gh-pages deployment. Vendoring them at build time keeps the
 * iframe same-origin and avoids committing ~11MB of binaries to the repo.
 *
 * - Runs on `vite build` and on dev-server startup.
 * - Skips downloads when files exist and are fresh (mtime < maxAgeMs).
 * - `FORCE_VBADGE_FETCH=1 vite build` forces re-download.
 * - Local development builds: drop a `.local` marker file in public/vbadge/
 *   (`touch public/vbadge/.local`) or set VBADGE_LOCAL=1 — the plugin then
 *   never overwrites existing assets, so locally-built MicroPythonOS
 *   artifacts survive. Missing files are still fetched.
 * - Fails the production build when assets are missing AND unreachable;
 *   dev server only warns (offline development stays possible).
 */

import { existsSync, mkdirSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const UPSTREAM_BASE = 'https://micropythonos.github.io/MicroPythonOS/'
const ASSETS = ['micropython.js', 'micropython.wasm', 'micropython.data']
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000 // re-check upstream daily

interface Options {
    outDir?: string
    baseUrl?: string
    maxAgeMs?: number
}

async function fetchAsset(url: string, dest: string): Promise<void> {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) throw new Error(`${url}: empty response`)
    // Write via temp file so an aborted download never leaves a truncated
    // asset that would poison later "already present" checks.
    const tmp = dest + '.part'
    writeFileSync(tmp, buf)
    renameSync(tmp, dest)
}

function isFresh(path: string, maxAgeMs: number): boolean {
    try {
        const st = statSync(path)
        return st.size > 0 && Date.now() - st.mtimeMs < maxAgeMs
    } catch {
        return false
    }
}

export function fetchVBadgeAssets(opts: Options = {}): Plugin {
    const outDir = opts.outDir ?? 'public/vbadge'
    const baseUrl = opts.baseUrl ?? UPSTREAM_BASE
    const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
    const force = process.env.FORCE_VBADGE_FETCH === '1'
    const localPin = () =>
        process.env.VBADGE_LOCAL === '1' || existsSync(join(outDir, '.local'))

    let isBuild = false

    async function ensureAssets(logger: { info(m: string): void; warn(m: string): void }) {
        mkdirSync(outDir, { recursive: true })

        const missing = ASSETS.filter((f) => !existsSync(join(outDir, f)))
        const pinned = !force && localPin()
        const stale = force
            ? ASSETS
            : pinned
              ? [] // local build pinned: never refresh existing files
              : ASSETS.filter((f) => !isFresh(join(outDir, f), maxAgeMs))
        const toFetch = [...new Set([...missing, ...stale])]
        if (pinned) logger.info('[vbadge] local assets pinned (.local marker / VBADGE_LOCAL=1)')
        if (toFetch.length === 0) {
            logger.info(`[vbadge] assets up to date in ${outDir}`)
            return
        }

        for (const f of toFetch) {
            const url = new URL(f, baseUrl).toString()
            const dest = join(outDir, f)
            try {
                logger.info(`[vbadge] fetching ${url}`)
                await fetchAsset(url, dest)
                logger.info(`[vbadge] saved ${dest} (${statSync(dest).size} bytes)`)
            } catch (err) {
                const msg = `[vbadge] failed to fetch ${url}: ${String(err)}`
                if (existsSync(dest)) {
                    // Stale copy present: keep it, just warn.
                    logger.warn(`${msg} — using existing (possibly stale) copy`)
                } else if (isBuild) {
                    // Production build without the asset would ship a broken
                    // virtual badge; abort.
                    throw new Error(msg)
                } else {
                    logger.warn(`${msg} — virtual badge will not work this session`)
                }
            }
        }
    }

    return {
        name: 'fetch-vbadge-assets',
        configResolved(config) {
            isBuild = config.command === 'build'
        },
        async buildStart() {
            await ensureAssets({
                info: (m) => this.info(m),
                warn: (m) => this.warn(m),
            })
        },
    }
}
