import { describe, expect, it, vi } from 'vitest'
import { OutdatedError } from '#lib/orthagonal/read.ts'
import { answerSearch, type SearchLibrary, type SearchSeams } from '../src/search/search-engine.ts'

const vector = (...numbers: number[]) => new Float32Array(numbers)

type FakeSign = { id: string, words?: string[], tags?: string[], vectors?: Float32Array[], englishPhrases?: string[], index?: string, outdated?: boolean }

/** a sign as the engine meets it in a loaded index, with a load() that gives the whole sign */
function sign ({ id, words = [id], tags = [], vectors = [], englishPhrases, index = 'alpha', outdated = false }: FakeSign) {
  return {
    id, words, tags, vectors, englishPhrases, indexURL: `https://data.test/${index}`,
    load: async () => {
      if (outdated) throw new OutdatedError('the index was rebuilt', `https://data.test/${index}`)
      return { id, title: id.toUpperCase(), body: `About ${id}.`, words, tags, media: [] }
    }
  }
}

const libraryOf = (...signs: ReturnType<typeof sign>[]): SearchLibrary => {
  const indexes: { [name: string]: { entries: unknown[] } } = {}
  for (const entry of signs) (indexes[entry.indexURL.split('/').pop()!] ??= { entries: [] }).entries.push(entry)
  return indexes as unknown as SearchLibrary
}

const known = { cat: vector(1, 0, 0, 0), kitten: vector(0.9, 0.1, 0, 0), car: vector(0, 0, 1, 0) }
const animals = () => libraryOf(
  sign({ id: 'cat', vectors: [known.cat] }),
  sign({ id: 'kitten', vectors: [known.kitten] }),
  sign({ id: 'car', vectors: [known.car], index: 'beta' })
)

function seamsFor (library: SearchLibrary, overrides: Partial<SearchSeams> = {}) {
  const seams = {
    knownVectors: vi.fn(async () => known as { [word: string]: Float32Array } | undefined),
    lookupVector: vi.fn(async (_word: string) => undefined as Float32Array | undefined),
    loadLibrary: vi.fn(async (_columns: string[], _known: unknown, _forceReload: boolean) => library),
    indexNameOf: (entry: { indexURL: string }) => entry.indexURL.split('/').pop()!
  }
  return Object.assign(seams, overrides) as typeof seams
}

const ids = (response: { results: { index: string, id: string }[] }) => response.results.map(result => `${result.index}:${result.id}`)

describe('answerSearch()', () => {
  it('ranks signs by how near their words\' vectors are to the query\'s, and gives each result its index\'s name', async () => {
    const response = await answerSearch('cat', 0, 10, seamsFor(animals()))
    expect(ids(response)).toEqual(['alpha:cat', 'alpha:kitten', 'beta:car'])
    expect(response.totalResults).toBe(3)
  })

  it('gives the whole sign for each result, as its load() says', async () => {
    const { results: [first] }: { results: any[] } = await answerSearch('cat', 0, 1, seamsFor(animals()))
    expect(first).toMatchObject({ index: 'alpha', id: 'cat', title: 'CAT', body: 'About cat.' })
  })

  it('gives the page asked for, while the total counts every sign that matched', async () => {
    const response = await answerSearch('cat', 1, 1, seamsFor(animals()))
    expect(ids(response)).toEqual(['alpha:kitten'])
    expect(response.totalResults).toBe(3)
  })

  it('puts signs that rank equally in id order, however the library lists them', async () => {
    const same = [vector(1, 0, 0, 0)]
    const response = await answerSearch('cat', 0, 10, seamsFor(libraryOf(sign({ id: 'zebra', vectors: same }), sign({ id: 'ant', vectors: same }), sign({ id: 'moth', vectors: same }))))
    expect(ids(response)).toEqual(['alpha:ant', 'alpha:moth', 'alpha:zebra'])
  })

  it('puts equal-ranked signs from different indexes in the order the library lists its indexes, whatever their ids', async () => {
    const same = [vector(1, 0, 0, 0)]
    const response = await answerSearch('cat', 0, 10, seamsFor(libraryOf(sign({ id: 'zebra', vectors: same, index: 'beta' }), sign({ id: 'ant', vectors: same, index: 'alpha' }))))
    expect(ids(response)).toEqual(['beta:zebra', 'alpha:ant'])
  })

  it('asks for the collection\'s known vectors only when the query has words in it', async () => {
    const seams = seamsFor(animals())
    await answerSearch('#animal', 0, 10, seams)
    expect(seams.knownVectors).not.toHaveBeenCalled()
    await answerSearch('cat', 0, 10, seams)
    expect(seams.knownVectors).toHaveBeenCalledTimes(1)
  })

  it('loads the library with the columns the query needs, and the known vectors it was given', async () => {
    const seams = seamsFor(animals())
    await answerSearch('#animal cat', 0, 10, seams)
    const [columns, vectors, forceReload] = seams.loadLibrary.mock.calls[0]
    expect(columns).toEqual(expect.arrayContaining(['words', 'tags']))
    expect(vectors).toBe(known)
    expect(forceReload).toBe(false)
  })

  it('also loads English phrases when the query could be one, and not otherwise', async () => {
    const phrase = seamsFor(animals())
    await answerSearch('raining cats and dogs', 0, 10, phrase)
    expect(phrase.loadLibrary.mock.calls[0][0]).toContain('englishPhrases')
    const word = seamsFor(animals())
    await answerSearch('cat', 0, 10, word)
    expect(word.loadLibrary.mock.calls[0][0]).not.toContain('englishPhrases')
  })

  it('puts a sign first when the whole query is an English phrase it translates', async () => {
    const library = libraryOf(
      sign({ id: 'cat', vectors: [known.cat] }),
      sign({ id: 'dog', vectors: [vector(0, 1, 0, 0)], englishPhrases: ['raining cats and dogs'] })
    )
    const response = await answerSearch('raining cats and dogs', 0, 10, seamsFor(library, { knownVectors: async () => ({}) }))
    expect(ids(response)[0]).toBe('alpha:dog')
  })

  it('looks a word up in the whole vector library when the signs don\'t use it', async () => {
    const seams = seamsFor(animals(), { lookupVector: vi.fn(async (word: string) => word === 'feline' ? vector(0.95, 0.05, 0, 0) : undefined) })
    const response = await answerSearch('feline', 0, 10, seams)
    expect(seams.lookupVector).toHaveBeenCalledWith('feline')
    expect(ids(response)[0]).toBe('alpha:cat')
  })

  it('searches for the word as plain text, and says so, when its vector can\'t be fetched, rather than failing the whole search', async () => {
    const library = libraryOf(sign({ id: 'elderly', words: ['elderly'], vectors: [] }), sign({ id: 'young', words: ['young'], vectors: [] }))
    const warned: string[] = []
    const seams = seamsFor(library, {
      knownVectors: async () => ({}),
      lookupVector: vi.fn(async () => { throw new TypeError('Failed to fetch') }),
      warn: words => warned.push(words)
    })
    const response = await answerSearch('elderly', 0, 10, seams)
    expect(ids(response)).toEqual(['alpha:elderly'])
    expect(warned).toHaveLength(1)
    expect(warned[0]).toMatch(/elderly/)
    expect(warned[0]).toMatch(/Failed to fetch/)
  })

  it('does not let one word\'s failed lookup spoil the others in the same search', async () => {
    const library = libraryOf(sign({ id: 'cat', words: ['cat'], tags: ['animal'], vectors: [known.cat] }))
    const seams = seamsFor(library, { lookupVector: async () => { throw new Error('the library is down') }, warn: () => {} })
    // "cat" is known to the signs, so it needs no lookup; the tag is a plain filter
    expect(ids(await answerSearch('#animal cat', 0, 10, seams))).toEqual(['alpha:cat'])
  })

  it('says it in the console when nobody asked to hear it, so a failure is never silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const seams = seamsFor(libraryOf(sign({ id: 'elderly', words: ['elderly'], vectors: [] })), { knownVectors: async () => ({}), lookupVector: async () => { throw new TypeError('Failed to fetch') } })
      await answerSearch('elderly', 0, 10, seams)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('does not look a word up in the library when the signs already have it', async () => {
    const seams = seamsFor(animals())
    await answerSearch('cat', 0, 10, seams)
    expect(seams.lookupVector).not.toHaveBeenCalled()
  })

  it('ranks naughty signs after others that match as well', async () => {
    const same = [vector(1, 0, 0, 0)]
    const response = await answerSearch('cat', 0, 10, seamsFor(libraryOf(sign({ id: 'aaa', vectors: same, tags: ['lexis.crude'] }), sign({ id: 'zzz', vectors: same }))))
    expect(ids(response)).toEqual(['alpha:zzz', 'alpha:aaa'])
  })

  it('starts again with the caches skipped when the index was rebuilt while the results were being loaded', async () => {
    const stale = libraryOf(sign({ id: 'cat', vectors: [known.cat], outdated: true }))
    const fresh = libraryOf(sign({ id: 'cat', vectors: [known.cat] }))
    const seams = seamsFor(stale, { loadLibrary: vi.fn(async (_c: string[], _k: unknown, forceReload: boolean) => forceReload ? fresh : stale) })
    const response = await answerSearch('cat', 0, 10, seams)
    expect(ids(response)).toEqual(['alpha:cat'])
    expect(seams.loadLibrary.mock.calls.map(call => call[2])).toEqual([false, true])
  })

  it('gives up when the index was rebuilt again even with the caches skipped, rather than going round for ever', async () => {
    const stale = libraryOf(sign({ id: 'cat', vectors: [known.cat], outdated: true }))
    const seams = seamsFor(stale)
    await expect(answerSearch('cat', 0, 10, seams)).rejects.toBeInstanceOf(OutdatedError)
    expect(seams.loadLibrary).toHaveBeenCalledTimes(2)
  })

  it('passes on any other failure as it is', async () => {
    const seams = seamsFor(animals(), { loadLibrary: async () => { throw new Error('no network') } })
    await expect(answerSearch('cat', 0, 10, seams)).rejects.toThrow('no network')
  })
})
