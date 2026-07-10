import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: {
        VIPER_IDE_VERSION: JSON.stringify(pkg.version),
        VIPER_IDE_BUILD: JSON.stringify(String(Date.now())),
    },
})
