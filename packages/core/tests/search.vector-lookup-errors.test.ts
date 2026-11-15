import { describe, expect, it } from 'vitest'
import { sayingWhichLibrary } from '../src/search/vector-lookup-errors.ts'

const library = 'https://data.example/collections/wordvec/raw/commoncrawl-english-300'

describe('sayingWhichLibrary()', () => {
  it('gives the vector the lookup gave, and nothing for a word it doesn\'t have', async () => {
    const vector = new Float32Array([1, 2, 3])
    const lookup = sayingWhichLibrary(library, async word => word === 'cat' ? vector : undefined)
    expect(await lookup('cat')).toBe(vector)
    expect(await lookup('zzz')).toBeUndefined()
  })

  it('says which library it was when the lookup fails, because a bare "Failed to fetch" doesn\'t say', async () => {
    const lookup = sayingWhichLibrary(library, async () => { throw new TypeError('Failed to fetch') })
    const error = await lookup('elderly').catch(error => error)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(`${library}: Failed to fetch`)
  })

  it('keeps the original failure, for anyone who wants it', async () => {
    const original = new TypeError('Failed to fetch')
    const error = await sayingWhichLibrary(library, async () => { throw original })('elderly').catch(error => error)
    expect(error.cause).toBe(original)
  })

  it('copes with a failure that is not an Error', async () => {
    const error = await sayingWhichLibrary(library, async () => { throw 'just words' })('elderly').catch(error => error)
    expect(error.message).toBe(`${library}: just words`)
  })
})
