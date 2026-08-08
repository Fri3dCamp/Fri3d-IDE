import { describe, expect, it } from 'vitest'
import { rawInstallPkg, rewriteUrl } from '../src/domain/package_mgr'

describe('package compatibility', () => {
    const dev = {
        sys_path: ['/lib'],
        mpy_arch: 'armv7m',
        mpy_ver: 6,
        mpy_sub: 1,
    }

    it('accepts packages matching device architecture and MPY ABI', async () => {
        await expect(rawInstallPkg({}, 'demo@1.2.3', {
            dev,
            pkg_info: { arch: ['armv7m'], mpy: ['6.1'] },
        })).resolves.toMatchObject({ name: 'demo' })
    })

    it('rejects packages for another architecture', async () => {
        await expect(rawInstallPkg({}, 'demo@1.2.3', {
            dev,
            pkg_info: { arch: ['xtensa', 'rv32imc'] },
        })).rejects.toThrow('demo@1.2.3 requires architecture: xtensa, rv32imc')
    })

    it('rejects packages for another MPY ABI', async () => {
        await expect(rawInstallPkg({}, 'demo@1.2.3', {
            dev,
            pkg_info: { mpy: ['5.3', '6.2'] },
        })).rejects.toThrow('demo@1.2.3 requires MPY ABI: 5.3, 6.2')
    })
})

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
