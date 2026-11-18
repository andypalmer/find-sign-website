import { describe, expect, it, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { makeBookshelf } from '../src/search/bookshelf-library.ts'

// "feline" is not a word any sign uses, so only the word vector library can say what it means
const base = 'https://data.example.test/collections/find-sign/raw/index'
const knownVectors: Record<string, number[]> = { cat: [1, 0], kitten: [0.9, 0.1], dog: [0.4, 0.6], car: [0, 1] }
const sign = (name: string) => ({ title: name.toUpperCase(), words: [name], tags: ['animal'], body: '', link: `https://x.test/${name}`, timestamp: 1000, media: [] })
const collection = { alpha: { cat: sign('cat'), kitten: sign('kitten'), dog: sign('dog') }, beta: { car: sign('car') } } as unknown as Record<string, EncodedSearchData>

describe('the bookshelf\'s search, looking up words the index does not use', () => {
  it('finds signs for a word using the lookup it was given', async () => {
    const server = new FakeDataServer()
    const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
    const vectors = await writeVersion2Vectors(collection, { lookupVector: async (word: string) => knownVectors[word] && Float32Array.from(knownVectors[word]), bucketCount: 4 })
    for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)

    const lookupVector = vi.fn(async (word: string) => word === 'feline' ? Float32Array.from([0.95, 0.05]) : undefined)
    const bookshelf = makeBookshelf({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init), lookupVector })
    const response = await bookshelf.search('feline', 0, 10)

    expect(lookupVector).toHaveBeenCalledWith('feline')
    expect(response.results.map(result => result.id)).toContain('cat')
  })
})
