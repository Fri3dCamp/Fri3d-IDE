import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchVBadgeAssets } from './scripts/vite-plugin-vbadge.js'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
const commit = process.env.GITHUB_SHA ?? 'local'

export default defineConfig({
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'react-vendor',
                            // Keep this chunk limited to React's self-contained runtime.
                            // Grouping react-i18next with application-owned i18n setup
                            // creates a circular index <-> vendor import in production.
                            test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
                            tags: ['$initial'],
                            includeDependenciesRecursively: false,
                        },
                        {
                            name: 'editor-vendor',
                            test: /node_modules[\\/](?:@codemirror|codemirror|@lezer|style-mod|w3c-keyname|crelt)[\\/]/,
                            tags: ['$initial'],
                            includeDependenciesRecursively: false,
                        },
                        {
                            name: 'ui-vendor',
                            test: /node_modules[\\/](?:lucide-react|sonner)[\\/]/,
                            tags: ['$initial'],
                            includeDependenciesRecursively: false,
                        },
                    ],
                },
            },
        },
    },
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
                // Resolve from the manifest URL so installs work both at /
                // and under a static-host subpath such as GitHub Pages.
                start_url: './',
                scope: './',
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
                navigateFallbackDenylist: [/\/vbadge(?:\/|$)/],
                runtimeCaching: [
                    {
                        // The virtual badge is too large to precache. Cache it
                        // after first use so later launches work offline.
                        urlPattern: /\/vbadge\//,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'virtual-badge',
                            expiration: {
                                maxEntries: 12,
                                maxAgeSeconds: 30 * 24 * 60 * 60,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
    define: {
        VIPER_IDE_VERSION: JSON.stringify(pkg.version),
        VIPER_IDE_BUILD: JSON.stringify(String(Date.now())),
        VIPER_IDE_COMMIT: JSON.stringify(commit),
    },
})
