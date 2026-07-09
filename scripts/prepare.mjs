#!/usr/bin/env node
// Fetches and generates the runtime assets that the app serves verbatim from
// public/. Runs before `vite` (dev) and `vite build` via the predev/prebuild
// npm hooks. Everything written here is gitignored.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

function genTar(src, dst) {
    // Use GNU tar flags for reproducible output; fall back to basic tar
    try {
        execSync(
            `tar --owner=0 --group=0 --mtime='1970-01-01' -czf "${dst}" -C "${src}" .`,
            { stdio: 'pipe' }
        )
    } catch {
        // BSD tar (macOS) doesn't support --owner/--group
        execSync(`tar -czf "${dst}" -C "${src}" .`, { stdio: 'pipe' })
    }
}

async function downloadAndExtract(url, subfolder, dest) {
    if (fs.existsSync(dest)) return
    console.log(`Downloading ${url} ...`)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
    const tmpZip = path.join(os.tmpdir(), 'viper_dl.zip')
    fs.writeFileSync(tmpZip, Buffer.from(await resp.arrayBuffer()))

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viper_extract_'))
    try {
        execSync(`unzip -o "${tmpZip}" "${subfolder}*" -d "${tmpDir}"`, { stdio: 'pipe' })
        fs.cpSync(path.join(tmpDir, subfolder), dest, { recursive: true })
    } finally {
        fs.rmSync(tmpZip, { force: true })
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
}

// Fetch the MicroPythonOS web build (micropython.js/.wasm/.data) from the
// latest GitHub release. A .version stamp file makes this a no-op when the
// release hasn't changed; if GitHub is unreachable, previously fetched files
// are reused.
async function fetchMposWeb(destDir) {
    const versionFile = path.join(destDir, '.version')
    const wanted = ['micropython.js', 'micropython.wasm', 'micropython.data']
    const haveAll = wanted.every(f => fs.existsSync(path.join(destDir, f)))

    // Use the most recent release that actually ships a web build (not every
    // release carries one).
    let release, asset
    try {
        const resp = await fetch('https://api.github.com/repos/MicroPythonOS/MicroPythonOS/releases?per_page=20')
        if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`)
        const releases = await resp.json()
        for (const r of releases) {
            if (r.draft || r.prerelease) continue
            const a = (r.assets || []).find(a => /^MicroPythonOS_web_.*\.zip$/.test(a.name))
            if (a) { release = r; asset = a; break }
        }
        if (!release) throw new Error('no release with a MicroPythonOS_web_*.zip asset found')
    } catch (err) {
        if (haveAll) {
            console.warn(`Cannot check MicroPythonOS releases (${err.message}), reusing existing files in ${destDir}`)
            return
        }
        throw new Error(`Cannot fetch MicroPythonOS web build and no local copy exists: ${err.message}`)
    }

    const tag = release.tag_name
    if (haveAll && fs.existsSync(versionFile) && fs.readFileSync(versionFile, 'utf-8').trim() === tag) {
        console.log(`MicroPythonOS web build ${tag} is up to date`)
        return
    }

    console.log(`Downloading MicroPythonOS web build ${tag} (${asset.name}) ...`)
    const resp = await fetch(asset.browser_download_url)
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
    const tmpZip = path.join(os.tmpdir(), 'mpos_web.zip')
    fs.writeFileSync(tmpZip, Buffer.from(await resp.arrayBuffer()))

    try {
        fs.mkdirSync(destDir, { recursive: true })
        execSync(`unzip -o "${tmpZip}" ${wanted.map(f => `"${f}"`).join(' ')} -d "${destDir}"`, { stdio: 'pipe' })
        fs.writeFileSync(versionFile, tag + '\n')
    } finally {
        fs.rmSync(tmpZip, { force: true })
    }
}

async function main() {
    fs.mkdirSync('public/assets', { recursive: true })

    await fetchMposWeb('public/assets/mpos')

    // The in-browser mpy tools VFS ships a copy of python-minifier
    await downloadAndExtract(
        'https://github.com/dflook/python-minifier/archive/refs/tags/3.1.1.zip',
        'python-minifier-3.1.1/src/python_minifier/',
        'src/tools_vfs/lib/python_minifier'
    )
    genTar('src/tools_vfs', 'public/assets/tools_vfs.tar.gz')
    genTar('src/vm_vfs', 'public/assets/vm_vfs.tar.gz')

    // Wasm runtimes served at stable /assets/ URLs (also precached by the
    // service worker, which requires unhashed paths)
    fs.copyFileSync('node_modules/@micropython/micropython-webassembly-pyscript/micropython.wasm', 'public/assets/micropython.wasm')
    fs.copyFileSync('node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs', 'public/micropython.mjs')
    fs.copyFileSync('node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm', 'public/assets/mpy-cross-v6.wasm')
    fs.copyFileSync('node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm', 'public/assets/ruff_wasm_bg.wasm')

    // Version manifest consumed by the in-app update check
    const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf-8'))
    manifest.version = pkg.version
    fs.writeFileSync('public/manifest.json', JSON.stringify(manifest))

    console.log('Assets prepared.')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
