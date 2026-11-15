import { describe, expect, it } from 'vitest'
import { describeError, errorForTheErrorPage } from '../src/lib/describe-error.ts'

describe('describeError()', () => {
  it('says what an error was and what it said', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('TypeError: Failed to fetch')
    class WorkerRefused extends Error { constructor (words: string) { super(words); this.name = 'WorkerRefused' } }
    expect(describeError(new WorkerRefused('the worker said no'))).toBe('WorkerRefused: the worker said no')
  })

  it('says something for anything else that was thrown', () => {
    expect(describeError('just some words')).toBe('just some words')
    expect(describeError(42)).toBe('42')
    expect(describeError(undefined)).toBe('undefined')
    expect(describeError({ toString: () => 'a strange thing' })).toBe('a strange thing')
  })

  it('keeps it to a line that fits a phone, saying it was cut', () => {
    const described = describeError(new Error('x'.repeat(1000)))
    expect(described.length).toBeLessThanOrEqual(301)
    expect(described.endsWith('…')).toBe(true)
  })

  it('does not throw for something that can\'t even be turned into words', () => {
    const awkward = { toString () { throw new Error('no') } }
    expect(() => describeError(awkward)).not.toThrow()
    expect(describeError(awkward).length).toBeGreaterThan(0)
  })
})

describe('errorForTheErrorPage()', () => {
  it('on a site with a label, such as a beta, says what went wrong, so it can be read without a computer', () => {
    expect(errorForTheErrorPage(new TypeError('Failed to fetch'), 'Beta')).toEqual({ message: 'TypeError: Failed to fetch' })
  })

  it('on a site without one, says nothing, so visitors keep the plain "Internal Error" and no detail leaks', () => {
    for (const label of [undefined, '']) expect(errorForTheErrorPage(new TypeError('Failed to fetch'), label)).toBeUndefined()
  })
})
