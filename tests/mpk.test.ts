import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildMpkArchive } from '../src/domain/mpk'

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
})