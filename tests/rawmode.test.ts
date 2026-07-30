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
