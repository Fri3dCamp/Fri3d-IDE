import { describe, expect, it } from 'vitest'
import type { ProjectFile } from '../src/services/badgehub/api'
import { selectMpkFile } from '../src/services/badgehub/package-selection'

function file(fullPath: string): ProjectFile {
    const dot = fullPath.lastIndexOf('.')
    return {
        dir: '',
        name: fullPath.slice(0, dot),
        ext: fullPath.slice(dot),
        mimetype: 'application/octet-stream',
        size_of_content: 1,
        sha256: '',
        full_path: fullPath,
        url: `https://badgehub.eu/${fullPath}`,
    }
}

describe('selectMpkFile', () => {
    it('ignores a Python executable and selects the version-matched MPK', () => {
        const selected = selectMpkFile(
            [
                file('blinky_badge.py'),
                file('com.joram.blinkybadge_0.1.0.mpk'),
                file('com.joram.blinkybadge_0.1.1.mpk'),
            ],
            'blinky_badge.py',
            '0.1.1',
        )

        expect(selected?.full_path).toBe('com.joram.blinkybadge_0.1.1.mpk')
    })

    it('honours the executable when it names an MPK', () => {
        const selected = selectMpkFile(
            [file('app_1.0.0.mpk'), file('app_2.0.0.mpk')],
            'app_1.0.0.mpk',
            '2.0.0',
        )

        expect(selected?.full_path).toBe('app_1.0.0.mpk')
    })

    it('falls back to the first MPK and never returns a non-MPK', () => {
        expect(selectMpkFile([file('main.py'), file('app.mpk')])?.full_path).toBe('app.mpk')
        expect(selectMpkFile([file('main.py')])).toBeUndefined()
    })
})
