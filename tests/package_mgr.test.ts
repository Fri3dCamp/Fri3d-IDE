import { describe, expect, it } from 'vitest'
import { rewriteUrl } from '../src/domain/package_mgr'

describe('rewriteUrl', () => {
    it('upgrades http to https', () => {
        expect(rewriteUrl('http://example.com/x.json')).toBe('https://example.com/x.json')
    })

    it('rewrites github tree urls to raw', () => {
        expect(rewriteUrl('https://github.com/user/repo/blob/main/package.json')).toContain(
            'raw.githubusercontent.com/user/repo',
        )
    })

    it('rewrites gitlab urls to statically CDN', () => {
        expect(rewriteUrl('https://gitlab.com/user/repo/-/blob/main/package.json')).toContain(
            'cdn.statically.io/gl/user/repo',
        )
    })

    it('keeps plain https urls', () => {
        expect(rewriteUrl('https://vsh.pp.ua/mip-featured/index.json')).toBe(
            'https://vsh.pp.ua/mip-featured/index.json',
        )
    })
})
