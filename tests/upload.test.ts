import { describe, expect, it } from 'vitest'
import {
    canonicalizeUploadEntries,
    collectDroppedUploadEntries,
    joinDeviceUploadPath,
    normalizeRelativePath,
    singleTopLevelFolder,
    stripTopLevelFolder,
    uploadEntriesFromFiles,
} from '../src/domain/upload'

function file(name: string, content = name): File {
    return new File([content], name)
}

describe('recursive upload paths', () => {
    it('normalizes separators and rejects path traversal', () => {
        expect(normalizeRelativePath('app\\lib\\main.py')).toBe('app/lib/main.py')
        expect(() => normalizeRelativePath('../secret')).toThrow('Unsafe relative path')
        expect(() => normalizeRelativePath('/absolute')).toThrow('Invalid relative path')
        expect(() => normalizeRelativePath('C:/absolute')).toThrow('Invalid relative path')
        expect(() => normalizeRelativePath('app//main.py')).toThrow('Unsafe relative path')
    })

    it('infers and sorts parent directories before files', () => {
        const main = file('main.py')
        expect(
            canonicalizeUploadEntries([
                { kind: 'file', relativePath: 'demo/lib/main.py', file: main },
            ]),
        ).toEqual([
            { kind: 'directory', relativePath: 'demo' },
            { kind: 'directory', relativePath: 'demo/lib' },
            { kind: 'file', relativePath: 'demo/lib/main.py', file: main },
        ])
    })

    it('keeps equal filenames in different folders but rejects duplicate targets', () => {
        expect(
            canonicalizeUploadEntries([
                { kind: 'file', relativePath: 'one/main.py', file: file('main.py', 'one') },
                { kind: 'file', relativePath: 'two/main.py', file: file('main.py', 'two') },
            ]).filter((entry) => entry.kind === 'file'),
        ).toHaveLength(2)

        expect(() =>
            canonicalizeUploadEntries([
                { kind: 'file', relativePath: 'main.py', file: file('main.py', 'one') },
                { kind: 'file', relativePath: 'main.py', file: file('main.py', 'two') },
            ]),
        ).toThrow('Duplicate upload target')
    })

    it('preserves or strips one selected top-level folder', () => {
        const entries = canonicalizeUploadEntries([
            { kind: 'file', relativePath: 'demo/lib/main.py', file: file('main.py') },
            { kind: 'directory', relativePath: 'demo/empty' },
        ])
        expect(singleTopLevelFolder(entries)).toBe('demo')
        expect(stripTopLevelFolder(entries).map((entry) => entry.relativePath)).toEqual([
            'empty',
            'lib',
            'lib/main.py',
        ])
        expect(joinDeviceUploadPath('/apps', 'demo/main.py')).toBe('/apps/demo/main.py')
    })

    it('uses webkitRelativePath for folder picker files', () => {
        const main = file('main.py')
        Object.defineProperty(main, 'webkitRelativePath', { value: 'demo/src/main.py' })
        expect(uploadEntriesFromFiles([main], true).map((entry) => entry.relativePath)).toEqual([
            'demo',
            'demo/src',
            'demo/src/main.py',
        ])
    })
})

describe('dropped folder collection', () => {
    it('reads every directory batch, including batches beyond Chromium’s first 100 entries', async () => {
        const children = Array.from({ length: 101 }, (_, index) => ({
            name: `file-${index}.txt`,
            isFile: true,
            isDirectory: false,
            file: (resolve: (value: File) => void) => resolve(file(`file-${index}.txt`)),
        }))
        const batches = [children.slice(0, 100), children.slice(100), []]
        const root = {
            name: 'folder',
            isFile: false,
            isDirectory: true,
            createReader: () => ({
                readEntries: (resolve: (value: typeof children) => void) => resolve(batches.shift() ?? []),
            }),
        }
        const transfer = {
            items: [
                {
                    kind: 'file',
                    webkitGetAsEntry: () => root,
                    getAsFile: () => null,
                },
            ],
            files: [],
        } as unknown as DataTransfer

        const entries = await collectDroppedUploadEntries(transfer)
        expect(entries.filter((entry) => entry.kind === 'file')).toHaveLength(101)
        expect(entries.some((entry) => entry.relativePath === 'folder/file-100.txt')).toBe(true)
    })
})
