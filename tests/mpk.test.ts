import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { buildMpkArchive } from '../src/domain/mpk'

const { raw } = vi.hoisted(() => ({
    raw: {
        listDir: vi.fn(async (path: string) => {
            if (path === '/apps/com.example') {
                return [
                    { name: 'MANIFEST.JSON', path: `${path}/MANIFEST.JSON`, size: 2 },
                    { name: 'lib', path: `${path}/lib`, content: [] },
                ]
            }
            return [{ name: 'main.py', path: `${path}/main.py`, size: 8 }]
        }),
        readFile: vi.fn(async (path: string) =>
            new TextEncoder().encode(path.endsWith('.JSON') ? '{}' : 'print(1)'),
        ),
    },
}))

vi.mock('../src/services/device.service', () => ({
    refreshTreeVia: vi.fn(),
    withRawMode: vi.fn(async (callback: (value: typeof raw) => unknown) => callback(raw)),
}))

import { buildMpkBytes } from '../src/services/apps.service'

describe('buildMpkArchive', () => {
    it('starts with an explicit top-level app directory', async () => {
        const appId = 'be.masynmachien.remotecontrol'
        const archive = await buildMpkArchive(appId, {
            'MANIFEST.JSON': new TextEncoder().encode('{}'),
        })

        expect(Object.keys(unzipSync(archive))).toEqual([
            `${appId}/`,
            `${appId}/MANIFEST.JSON`,
        ])
    })

    it('adds the app directory only once when exporting device files', async () => {
        const archive = await buildMpkBytes({
            fullname: 'com.example',
            name: 'Example',
            version: '1.0.0',
            activities: [],
            path: '/apps/com.example',
        })

        expect(archive).toBeDefined()
        expect(Object.keys(unzipSync(archive!))).toEqual([
            'com.example/',
            'com.example/MANIFEST.JSON',
            'com.example/lib/main.py',
        ])
        expect(Object.keys(unzipSync(archive!))).not.toContain(
            'com.example/com.example/MANIFEST.JSON',
        )
    })
})
