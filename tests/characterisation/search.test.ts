// Characterisation tests for the search engine end to end: query -> vectors -> ranking -> loaded results,
// including the network traffic each search generates (a baseline for future efficiency work).
import '../helpers/test-env'
import { VectorLibraryBase } from '../helpers/test-env'
import { expect, describe, it, beforeAll, beforeEach } from 'vitest'
import { FakeDataServer } from '../helpers/fake-data-server'
import { IndexBase, publishBuiltIndexes } from '../helpers/fixtures'
import { search, availableIndexes, indexURLs, indexByURL } from '../../src/lib/search/search'
import { compileQuery } from '../../src/lib/search/text'

let server: FakeDataServer

beforeAll(async () => {
  server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

beforeEach(() => server.resetRequests())

const ids = (response) => response.results.map(r => `${r.index}:${r.id}`)

describe('index configuration', () => {
  it('derives index urls from VITE_SEARCH_DATA, VITE_SEARCH_INDEX_NAME and VITE_SEARCH_INDEXES', () => {
    expect(availableIndexes).toEqual(['alpha', 'beta'])
    expect(indexURLs).toEqual({ alpha: `${IndexBase}/alpha`, beta: `${IndexBase}/beta` })
    expect(indexByURL[`${IndexBase}/beta`]).toBe('beta')
  })
})

describe('search() ranking', () => {
  it('ranks by word vector distance, and every entry with a vector is a result', async () => {
    const response = await search('cat', 0, 10)
    // ranks: cat 0, kitten ~0.02, dog ~0.72, red-truck ~1.71 (1.68 + diversity), car 2
    expect(ids(response)).toEqual(['alpha:cat', 'beta:kitten', 'alpha:dog', 'beta:red-truck', 'alpha:car'])
    expect(response.totalResults).toBe(5)
  })

  it('returns fully loaded entries tagged with their index name', async () => {
    const { results: [first] }: { results: any[] } = await search('cat', 0, 1)
    expect(first).toMatchObject({ index: 'alpha', id: 'cat', title: 'Cat', body: 'A small feline.', provider: { id: 'alpha' } })
    expect(first.media[0].encodes).toHaveLength(2)
  })

  it('paginates with start and length, while totalResults counts everything', async () => {
    const response = await search('cat', 1, 2)
    expect(ids(response)).toEqual(['beta:kitten', 'alpha:dog'])
    expect(response.totalResults).toBe(5)
  })

  it('adds 0.1 x word diversity to the rank of multi-word entries', async () => {
    // red-truck: exact "truck" match (0) + 0.1 x diversity of [red, truck] (0.32) = ~0.032
    // car: distance("car", "truck") = ~0.08, so a small diversity penalty still beats a near miss
    const response = await search('truck', 0, 10)
    expect(ids(response).slice(0, 2)).toEqual(['beta:red-truck', 'alpha:car'])
    // multi-word queries sum the per-word distances (implicit AND)
    expect(ids(await search('red truck', 0, 1))).toEqual(['beta:red-truck'])
  })

  it('filters by tags, keeping index order when ranks tie', async () => {
    expect(ids(await search('#vehicle', 0, 10))).toEqual(['alpha:car', 'beta:red-truck'])
    expect(ids(await search('#animal -#invented', 0, 10))).toEqual(['alpha:cat', 'alpha:dog'])
    expect(ids(await search('#animal cat', 0, 10))).toEqual(['alpha:cat', 'beta:kitten', 'alpha:dog'])
  })

  it('filters by author', async () => {
    expect(ids(await search('@phoenix', 0, 10))).toEqual(['alpha:car'])
  })

  it('looks up words missing from global vectors in the full vector library', async () => {
    const response = await search('feline', 0, 2)
    expect(ids(response)).toEqual(['alpha:cat', 'beta:kitten'])
    expect(server.requestsTo(VectorLibraryBase).length).toBeGreaterThan(0)
  })

  it('returns nothing for a word with no vector anywhere (falls back to exact word match)', async () => {
    const response = await search('zebra', 0, 10)
    expect(response).toEqual({ totalResults: 0, results: [] })
  })

  it('returns nothing for a query that is all punctuation', async () => {
    const response = await search('?', 0, 10)
    // "?" becomes an empty word, which has no vector and matches no entry
    expect(response.totalResults).toBe(0)
  })
})

describe('compileQuery() word fallback quirk', () => {
  it('compares lowercased entry words against the query word as typed, so capitalised queries never match', async () => {
    const noVectors = async () => undefined
    const { rank: lower } = await compileQuery('cat', noVectors)
    const { rank: upper } = await compileQuery('Cat', noVectors)
    const entry: any = { words: ['Cat'], tags: [], vectors: [] }
    expect(lower(entry)).toBe(0)
    expect(upper(entry)).toBe(Infinity)
  })
})

describe('search() network traffic', () => {
  const summary = () => server.requests.map(r => `${r.path.replace(`${IndexBase}/`, '')} ${r.cache}`).sort()

  it('a word search fetches global vectors, meta and words for every index, plus one shard per result', async () => {
    await search('cat', 0, 1)
    expect(summary()).toEqual([
      'alpha/meta.json no-cache',
      'alpha/shard-0.json no-store',
      'alpha/words.json default',
      'beta/meta.json no-cache',
      'beta/words.json default',
      'global-vectors.lps no-cache',
    ])
  })

  it('does not memoise global vectors or index columns between searches', async () => {
    await search('cat', 0, 1)
    const first = server.requests.length
    await search('cat', 0, 1)
    expect(server.requests.length).toBe(first * 2)
    expect(server.requestsTo('global-vectors.lps')).toHaveLength(2)
  })

  it('a tag-only search skips global vectors and loads the tags column instead', async () => {
    await search('#vehicle', 0, 1)
    expect(summary()).toEqual([
      'alpha/meta.json no-cache',
      'alpha/shard-0.json no-store',
      'alpha/tags.json default',
      'beta/meta.json no-cache',
      'beta/tags.json default',
    ])
  })
})

describe('search() error handling', () => {
  it('QUIRK: swallows non-OutdatedError failures while loading results, returning results: undefined', async () => {
    const shard = `${IndexBase}/beta/shard-0.json`
    server.failures.set(shard, 500)
    try {
      const response = await search('kitten', 0, 1)
      expect(response.totalResults).toBe(5)
      expect(response.results).toBeUndefined()
    } finally {
      server.failures.delete(shard)
    }
  })

  it('re-runs the whole search with forceReload when a shard is from a newer build, then throws if still outdated', async () => {
    const shard = `${IndexBase}/alpha/shard-0.json`
    const original = server.get(shard)
    server.set(shard, { ...server.getJSON(shard), buildID: 'newer' })
    try {
      await expect(search('cat', 0, 1)).rejects.toThrow('Entry buildID unsyncronized')
      expect(server.requestsTo('global-vectors.lps')).toHaveLength(2)
    } finally {
      server.set(shard, original)
    }
  })
})
