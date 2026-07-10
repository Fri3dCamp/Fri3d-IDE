import { describe, expect, it } from 'vitest'
import { ConnectionUID } from '../src/domain/connection_uid'

describe('ConnectionUID', () => {
    it('parses valid ids', () => {
        expect(ConnectionUID.parse('0W8N-4Y1H-P5DF').value()).toBe('0W8N-4Y1H-P5DF')
    })

    it('normalises homoglyphs and case', () => {
        // B→8, O→0, I→1, S→5
        expect(ConnectionUID.parse('bw8n-4y1h-p5df').value()).toBe('8W8N-4Y1H-P5DF')
        expect(ConnectionUID.parse('OW8N-4Y1H-P5DF').value()).toBe('0W8N-4Y1H-P5DF')
    })

    it('rejects malformed ids', () => {
        expect(() => ConnectionUID.parse('zz!')).toThrow('Malformed Connection ID')
        expect(() => ConnectionUID.parse('')).toThrow()
    })

    it('random() produces parseable ids', () => {
        for (let i = 0; i < 20; i++) {
            const id = ConnectionUID.random().value()
            expect(ConnectionUID.parse(id).value()).toBe(id)
            expect(id).toMatch(/^[0W8N4Y1HP5DF9K6JM3C2XA7R]{4}-[0W8N4Y1HP5DF9K6JM3C2XA7R]{4}-[0W8N4Y1HP5DF9K6JM3C2XA7R]{4}$/)
        }
    })
})
