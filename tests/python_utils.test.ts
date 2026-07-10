import { describe, expect, it } from 'vitest'
import { parseStackTrace } from '../src/domain/python_utils'

const SAMPLE = `Traceback (most recent call last):
  File "main.py", line 4, in <module>
  File "lib/foo.py", line 10, in bar
ValueError: bad thing`

describe('parseStackTrace', () => {
    it('parses type, message and frames', () => {
        const res = parseStackTrace(SAMPLE)
        expect(res).toBeDefined()
        expect(res!.type).toBe('ValueError')
        expect(res!.message).toBe('bad thing')
        expect(res!.frames).toHaveLength(2)
        expect(res!.frames[1]).toEqual({ file: 'lib/foo.py', line: 10, scope: 'bar' })
        expect(res!.summary).toBe('bad thing at lib/foo.py:10')
    })

    it('returns undefined for non-tracebacks', () => {
        expect(parseStackTrace('hello world')).toBeUndefined()
    })
})
