import { describe, expect, it } from 'vitest'
import { sizeFmt, splitPath, Mutex } from '../src/domain/utils'

describe('sizeFmt', () => {
    it('formats bytes without decimals', () => {
        expect(sizeFmt(512)).toBe('512B')
    })
    it('formats KiB with one decimal', () => {
        expect(sizeFmt(2048)).toBe('2.0KiB')
    })
    it('handles null', () => {
        expect(sizeFmt(null)).toBe('unknown')
    })
})

describe('splitPath', () => {
    it('splits dir and file', () => {
        expect(splitPath('/a/b/c.py')).toEqual(['a/b', 'c.py'])
    })
    it('handles root files', () => {
        expect(splitPath('/main.py')).toEqual(['', 'main.py'])
    })
})

describe('Mutex', () => {
    it('serialises acquisitions', async () => {
        const mutex = new Mutex()
        const order: number[] = []
        const r1 = await mutex.acquire()
        const p2 = mutex.acquire().then((r2) => {
            order.push(2)
            r2()
        })
        order.push(1)
        r1()
        await p2
        expect(order).toEqual([1, 2])
    })
})
