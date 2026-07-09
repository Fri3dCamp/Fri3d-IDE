import { describe, expect, it } from 'vitest'
import { ConnectionUID } from '../../src/connection_uid'

describe('ConnectionUID', () => {
    it('normalizes ambiguous characters while parsing', () => {
        const uid = ConnectionUID.parse('BELS-GIQO')
        expect(uid.value()).toBe('8F15-6100')
    })

    it('accepts valid canonical UID values', () => {
        const uid = new ConnectionUID('0W8N-4Y1H-P5DF')
        expect(uid.value()).toBe('0W8N-4Y1H-P5DF')
    })

    it('rejects malformed UID values', () => {
        expect(() => new ConnectionUID('ABCD-1234')).toThrow('Malformed Connection ID')
        expect(() => ConnectionUID.parse('bad!')).toThrow('Malformed Connection ID')
    })

    it('generates random UIDs in canonical format', () => {
        const uid = ConnectionUID.random().value()
        expect(uid).toMatch(/^([0W8N4Y1HP5DF9K6JM3C2XA7R]{4}-){2}[0W8N4Y1HP5DF9K6JM3C2XA7R]{4}$/)
    })
})
