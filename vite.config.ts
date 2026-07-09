import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

export default defineConfig({
    build: {
        outDir: 'build',
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                bridge: resolve(__dirname, 'bridge.html'),
                benchmark: resolve(__dirname, 'benchmark.html'),
                // Service worker: bundled as its own entry, emitted unhashed at
                // the site root so its registration URL and scope stay stable.
                app_worker: resolve(__dirname, 'src/app_worker.ts'),
            },
            output: {
                entryFileNames: (chunk) =>
                    chunk.name === 'app_worker' ? 'app_worker.js' : 'assets/[name]-[hash].js',
            },
        },
    },
    define: {
        VIPER_IDE_VERSION: JSON.stringify(pkg.version),
        VIPER_IDE_BUILD: String(Date.now()),
    },
    plugins: [react()],
})
