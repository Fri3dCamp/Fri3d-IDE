#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readfile(fn) {
    return fs.readFileSync(fn, 'utf-8');
}

function run(cmd, options = {}) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', ...options });
}

function genTar(src, dst) {
    // Use GNU tar flags for reproducible output; fall back to basic tar
    try {
        execSync(
            `tar --owner=0 --group=0 --mtime='1970-01-01' -czf "${dst}" -C "${src}" .`,
            { stdio: 'pipe' }
        );
    } catch {
        // BSD tar (macOS) doesn't support --owner/--group
        execSync(`tar -czf "${dst}" -C "${src}" .`, { stdio: 'pipe' });
    }
}

async function downloadAndExtract(url, subfolder, dest) {
    console.log(`Downloading ${url} ...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const tmpZip = path.join(require('os').tmpdir(), 'viper_dl.zip');
    fs.writeFileSync(tmpZip, buffer);

    const tmpDir = path.join(require('os').tmpdir(), 'viper_extract_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        execSync(`unzip -o "${tmpZip}" "${subfolder}*" -d "${tmpDir}"`, { stdio: 'pipe' });
        const srcPath = path.join(tmpDir, subfolder);
        fs.cpSync(srcPath, dest, { recursive: true });
    } finally {
        fs.rmSync(tmpZip, { force: true });
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function buildServiceWorker() {
    const pkg = JSON.parse(readfile('package.json'));
    const src = readfile('src/app_worker.js')
        .replace(/VIPER_IDE_VERSION/g, JSON.stringify(pkg.version))
        .replace(/VIPER_IDE_BUILD/g, JSON.stringify(String(Date.now())));
    fs.writeFileSync('build/app_worker.js', src);
}

async function main() {
    // Prepare
    fs.rmSync('build', { recursive: true, force: true });
    fs.mkdirSync('build/assets', { recursive: true });
    fs.copyFileSync('./src/webrepl_content.js', './build/webrepl_content.js');
    fs.cpSync('./assets', './build/assets', { recursive: true });

    await downloadAndExtract(
        'https://github.com/dflook/python-minifier/archive/refs/tags/3.1.1.zip',
        'python-minifier-3.1.1/src/python_minifier/',
        'src/tools_vfs/lib/python_minifier'
    );
    genTar('src/tools_vfs', 'build/assets/tools_vfs.tar.gz');
    genTar('src/vm_vfs', 'build/assets/vm_vfs.tar.gz');

    // Build (vite generates translations.json/manifest.json via its plugin,
    // then bundles and inlines JS/CSS into the HTML output files).
    // Each page is built separately so vite-plugin-singlefile can inline everything.
    run('npx eslint');
    for (const page of ['index', 'bridge', 'benchmark']) {
        run(`npx vite build`, { env: { ...process.env, VIPER_PAGE: page } });
    }

    // Build service worker (plain JS file, handled separately from Vite)
    buildServiceWorker();

    // Add assets from packages
    fs.copyFileSync('node_modules/@micropython/micropython-webassembly-pyscript/micropython.wasm', './build/assets/micropython.wasm');
    fs.copyFileSync('node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs', './build/micropython.mjs');
    fs.copyFileSync('node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm', './build/assets/mpy-cross-v6.wasm');
    fs.copyFileSync('node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm', './build/assets/ruff_wasm_bg.wasm');

    console.log('\nBuild complete.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

