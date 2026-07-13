import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchVBadgeAssets } from './scripts/vite-plugin-vbadge.js'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        // Vendors the MicroPythonOS web build (virtual badge) into public/vbadge/.
        fetchVBadgeAssets(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png'],
            manifestFilename: 'site.webmanifest',
            manifest: {
                name: 'Fri3d IDE',
                short_name: 'Fri3d IDE',
                description: 'Browser-based IDE for connected devices',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                background_color: '#141418',
                theme_color: '#8835c9',
                icons: [
                    {
                        src: 'web-app-manifest-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                    {
                        src: 'web-app-manifest-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
            workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
                // MicroPythonOS virtual badge build is ~11MB; fetched on demand.
                globIgnores: ['vbadge/**'],
                // Don't serve the IDE index.html for badge-window navigations:
                // /vbadge/ is its own page (pop-out + PWA), not an SPA route.
                navigateFallbackDenylist: [/^\/vbadge\//],
            },
        }),
    ],
    define: {
        VIPER_IDE_VERSION: JSON.stringify(pkg.version),
        VIPER_IDE_BUILD: JSON.stringify(String(Date.now())),
    },
})
