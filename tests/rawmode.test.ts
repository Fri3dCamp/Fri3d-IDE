import { describe, expect, it, vi } from 'vitest'
import { MpRawMode } from '../src/domain/rawmode'

describe('MpRawMode.removeDir', () => {
    it('recursively removes files and nested folders', async () => {
        const raw = Object.create(MpRawMode.prototype) as MpRawMode
        const exec = vi.spyOn(raw, 'exec').mockResolvedValue('')

        await raw.removeDir('/apps/demo')

        expect(exec).toHaveBeenCalledOnce()
        const command = exec.mock.calls[0][0]
        expect(command).toContain("for n in os.listdir(p):")
        expect(command).toContain("if os.stat(child)[0] & 0x4000:")
        expect(command).toContain('remove_tree(child)')
        expect(command).toContain('os.remove(child)')
        expect(command).toContain("remove_tree('/apps/demo')")
    })
})

describe('MpRawMode upload paths', () => {
    it('quotes apostrophes safely when creating folders', async () => {
        const raw = Object.create(MpRawMode.prototype) as MpRawMode
        const exec = vi.spyOn(raw, 'exec').mockResolvedValue('')

        await raw.makePath("/data/kid's-app")

        expect(exec.mock.calls[0][0]).toContain(`for d in "/data/kid's-app".split('/')`)
    })

    it('quotes apostrophes safely when writing files', async () => {
        const raw = Object.create(MpRawMode.prototype) as MpRawMode
        const exec = vi.spyOn(raw, 'exec').mockResolvedValue('')

        await raw.writeFile("/data/kid's-app/main.py", new Uint8Array())

        expect(exec.mock.calls[0][0]).toContain(`f=open("/data/kid's-app/main.py.viper.tmp",'wb')`)
        expect(exec.mock.calls[1][0]).toContain(`os.rename("/data/kid's-app/main.py.viper.tmp","/data/kid's-app/main.py")`)
    })
})
