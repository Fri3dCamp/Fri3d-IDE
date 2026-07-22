import { describe, expect, it } from 'vitest'
import { sanitizeNodes, useFileStore, type FsNode } from '../src/stores/files'

describe('sanitizeNodes', () => {
    it('filters out . and .. directories and files', () => {
        const rawTree: FsNode[] = [
            { name: '.', path: 'builtin/.', content: [] },
            { name: '..', path: 'builtin/..', content: [] },
            {
                name: 'builtin',
                path: 'builtin',
                content: [
                    { name: '.', path: 'builtin/.', content: [] },
                    { name: '..', path: 'builtin/..', content: [] },
                    { name: 'math.py', path: 'builtin/math.py', size: 123 },
                ],
            },
            { name: 'main.py', path: 'main.py', size: 456 },
        ]

        const sanitized = sanitizeNodes(rawTree)
        expect(sanitized).toEqual([
            {
                name: 'builtin',
                path: 'builtin',
                content: [{ name: 'math.py', path: 'builtin/math.py', size: 123 }],
            },
            { name: 'main.py', path: 'main.py', size: 456 },
        ])
    })
})

describe('useFileStore sanitization', () => {
    it('sanitizes nodes when setting tree and folder children', () => {
        const store = useFileStore.getState()
        store.setTree([
            { name: 'builtin', path: 'builtin', content: [], loaded: false },
        ])

        store.setFolderChildren('builtin', [
            { name: '.', path: 'builtin/.', content: [] },
            { name: 'display.py', path: 'builtin/display.py', size: 100 },
        ])

        const currentTree = useFileStore.getState().tree
        expect(currentTree).toEqual([
            {
                name: 'builtin',
                path: 'builtin',
                content: [{ name: 'display.py', path: 'builtin/display.py', size: 100 }],
                loaded: true,
            },
        ])
    })
})
