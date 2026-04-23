import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

function genTranslations(srcDir, dst) {
    const result = {}
    const files = readdirSync(srcDir).filter(f => f.endsWith('.json')).sort()
    for (const fn of files) {
        const lang = fn.replace('.json', '')
        result[lang] = JSON.parse(readFileSync(path.join(srcDir, fn), 'utf8'))
    }
    mkdirSync(path.dirname(dst), { recursive: true })
    writeFileSync(dst, JSON.stringify(result))
}

function genManifest(src, dst) {
    const result = JSON.parse(readFileSync(src, 'utf8'))
    result.version = pkg.version
    writeFileSync(dst, JSON.stringify(result))
}

// Plugin: generate translations.json and manifest.json before every build/serve
function preparePlugin() {
    return {
        name: 'viper-prepare',
        buildStart() {
            genTranslations('./src/lang/', './build/translations.json')
            genManifest('./src/manifest.json', './build/manifest.json')
        },
    }
}

// Plugin: serve ./assets/ at /assets/ in the dev server
function serveAssetsPlugin() {
    return {
        name: 'viper-serve-assets',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url.split('?')[0]
                if (url.startsWith('/assets/') || url === '/app_worker.js') {
                    const filePath = path.join(process.cwd(), url)
                    try {
                        const data = readFileSync(filePath)
                        const ext = path.extname(filePath).toLowerCase()
                        const mimeTypes = {
                            '.png':  'image/png',
                            '.wasm': 'application/wasm',
                            '.gz':   'application/gzip',
                            '.js':   'text/javascript',
                        }
                        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
                        res.end(data)
                        return
                    } catch {
                        // fall through to next middleware
                    }
                }
                next()
            })
        },
    }
}

// When VIPER_PAGE is set, build only that page (required for vite-plugin-singlefile,
// which does not support multiple inputs). The dev server uses all pages.
const pageMap = {
    index:     'index.html',
    bridge:    'bridge.html',
    benchmark: 'benchmark.html',
}
const page = process.env.VIPER_PAGE
const buildInput = page ? pageMap[page] : pageMap

export default defineConfig(({ command }) => ({
    root: '.',
    publicDir: false,
    build: {
        outDir: 'build',
        emptyOutDir: false,
        copyPublicDir: false,
        rollupOptions: {
            input: buildInput,
            output: {
                assetFileNames: 'assets/[name][extname]',
            },
        },
    },
    define: {
        VIPER_IDE_VERSION: JSON.stringify(pkg.version),
        VIPER_IDE_BUILD:   String(Date.now()),
    },
    plugins: [
        preparePlugin(),
        command === 'build' && viteSingleFile({ deleteInlinedFiles: true }),
        serveAssetsPlugin(),
    ].filter(Boolean),
}))

