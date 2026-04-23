#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readfile(fn) {
    return fs.readFileSync(fn, 'utf-8');
}

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

function genTranslations(srcDir, dst) {
    const result = {};
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
    for (const fn of files) {
        const lang = fn.replace('.json', '');
        result[lang] = JSON.parse(readfile(path.join(srcDir, fn)));
    }
    fs.writeFileSync(dst, JSON.stringify(result, null, null));
}

function genManifest(src, dst) {
    const pkg = JSON.parse(readfile('package.json'));
    const result = JSON.parse(readfile(src));
    result.version = pkg.version;
    fs.writeFileSync(dst, JSON.stringify(result));
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

function combine(dst) {
    let combined = readfile(dst);
    combined = combined.replace(
        '<link rel="stylesheet" href="./app.css">',
        () => '<style>\n' + readfile('build/app.css') + '\n</style>'
    );
    combined = combined.replace(
        '<link rel="stylesheet" href="./viper_lib.css">',
        () => '<style>\n' + readfile('build/viper_lib.css') + '\n</style>'
    );
    combined = combined.replace(
        '<script src="./app.js"></script>',
        () => '<script>\n' + readfile('build/app.js') + '\n</script>'
    );
    combined = combined.replace(
        '<script src="./viper_lib.js"></script>',
        () => '<script>\n' + readfile('build/viper_lib.js') + '\n</script>'
    );
    fs.writeFileSync(dst, combined);
}

async function main() {
    // Prepare
    fs.rmSync('build', { recursive: true, force: true });
    fs.mkdirSync('build/assets', { recursive: true });
    fs.copyFileSync('./src/webrepl_content.js', './build/webrepl_content.js');
    fs.cpSync('./assets', './build/assets', { recursive: true });
    genTranslations('./src/lang/', 'build/translations.json');
    genManifest('./src/manifest.json', 'build/manifest.json');

    await downloadAndExtract(
        'https://github.com/dflook/python-minifier/archive/refs/tags/3.1.1.zip',
        'python-minifier-3.1.1/src/python_minifier/',
        'src/tools_vfs/lib/python_minifier'
    );
    genTar('src/tools_vfs', 'build/assets/tools_vfs.tar.gz');
    genTar('src/vm_vfs', 'build/assets/vm_vfs.tar.gz');

    // Build
    run('npx eslint');
    run('npx rollup --config');

    // Combine everything (inline CSS/JS into HTML)
    combine('build/index.html');
    combine('build/bridge.html');
    combine('build/benchmark.html');

    // Cleanup intermediate files
    for (const f of ['build/app.css', 'build/viper_lib.css', 'build/app.js', 'build/viper_lib.js']) {
        fs.rmSync(f, { force: true });
    }

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
