import { describe, expect, it } from 'vitest'
import { rewriteUrl } from '../../src/package_mgr'

describe('rewriteUrl', () => {
    it('upgrades http to https', () => {
        expect(rewriteUrl('http://example.com/x.json')).toBe('https://example.com/x.json')
    })

    it('passes https URLs through unchanged', () => {
        expect(rewriteUrl('https://example.com/x.json')).toBe('https://example.com/x.json')
    })

    it('rewrites a github blob URL to raw.githubusercontent.com', () => {
        expect(rewriteUrl('https://github.com/owner/repo/blob/main/path/file.py'))
            .toBe('https://raw.githubusercontent.com/owner/repo/main/path/file.py')
    })

    it('strips a ?raw=true suffix from github blob URLs', () => {
        expect(rewriteUrl('https://github.com/owner/repo/blob/main/file.py?raw=true'))
            .toBe('https://raw.githubusercontent.com/owner/repo/main/file.py')
    })

    it('expands a github: shorthand using HEAD by default', () => {
        expect(rewriteUrl('github:owner/repo/file.py'))
            .toBe('https://raw.githubusercontent.com/owner/repo/HEAD/file.py')
    })

    it('honours an explicit branch override', () => {
        expect(rewriteUrl('github:owner/repo/file.py', { branch: 'v1.2.3' }))
            .toBe('https://raw.githubusercontent.com/owner/repo/v1.2.3/file.py')
    })

    it('rewrites a gitlab blob URL via the statically CDN', () => {
        expect(rewriteUrl('https://gitlab.com/owner/repo/-/blob/main/file.py'))
            .toBe('https://cdn.statically.io/gl/owner/repo/main/file.py')
    })

    it('resolves a relative URL against its base, stripping the filename', () => {
        expect(rewriteUrl('mod.py', { base: 'https://example.com/pkg/package.json' }))
            .toBe('https://example.com/pkg/mod.py')
    })

    it('throws for a relative URL without a base', () => {
        expect(() => rewriteUrl('mod.py')).toThrow('cannot be relative')
    })
})
