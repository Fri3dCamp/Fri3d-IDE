import { describe, expect, it } from 'vitest'
import { escapeHtml } from '../../src/utils.js'

describe('escapeHtml', () => {
    it('escapes the five significant HTML characters', () => {
        expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
    })

    it('neutralizes an onclick breakout attempt', () => {
        // A file named like this previously broke out of an inline onclick.
        const malicious = `'); alert(1); ('`
        const escaped = escapeHtml(malicious)
        expect(escaped).not.toContain('<')
        expect(escaped).toContain('&#39;')
    })

    it('leaves spaces and newlines untouched', () => {
        expect(escapeHtml('a b\nc')).toBe('a b\nc')
    })

    it('coerces non-string input', () => {
        expect(escapeHtml(42)).toBe('42')
    })
})
