import '@find-sign/test-helpers/test-env.ts'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'

// count every time a sign's word spread is worked out. The spread only depends on the sign, so it should be
// worked out once per loaded sign, not on every search
const counted = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../src/functions/vector-utilities.ts', async (original) => {
  const real = await original<typeof import('../src/functions/vector-utilities.ts')>()
  return { ...real, diversity: (...vectors: Parameters<typeof real.diversity>) => { counted.calls++; return real.diversity(...vectors) } }
})

const base = 'https://data.example/index'
const wordVectors: Record<string, number[]> = { cat: [1, 0], kitten: [0.9, 0.1], dog: [0.4, 0.6], car: [0, 1] }
const sign = (name: string) => ({ title: name.toUpperCase(), words: [name], tags: ['animal'], body: '', link: `https://x.test/${name}`, timestamp: 1000, media: [] })
const collection = { alpha: { cat: sign('cat'), kitten: sign('kitten'), dog: sign('dog') }, beta: { car: sign('car') } } as unknown as Record<string, EncodedSearchData>

let server: FakeDataServer
beforeAll(async () => {
  server = new FakeDataServer().install()
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector: async (word: string) => wordVectors[word], bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)
  const { useTheBookshelf } = await import('../src/search/search.ts')
  const { makeBookshelf } = await import('../src/search/bookshelf-library.ts')
  useTheBookshelf(makeBookshelf({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) }))
})

describe('search ranking, once the signs are loaded', () => {
  it('does not work out the word spread of the same signs again on a second search', async () => {
    const { search } = await import('../src/search/search.ts')
    await search('cat', 0, 10)
    counted.calls = 0
    const again = await search('cat', 0, 10)

    expect(again.results.length).toBeGreaterThan(0) // so an empty answer can never pass
    expect(counted.calls).toBe(0)
  })
})
