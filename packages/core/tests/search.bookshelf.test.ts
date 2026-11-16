import '@find-sign/test-helpers/test-env.ts'
import { describe, expect, it, beforeAll } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { bookshelfGetSearchLibrary } from '../src/search/bookshelf-library.ts'
import { getSearchLibrary, search, useTheBookshelf } from '../src/search/search.ts'
import { makeBookshelf } from '../src/search/bookshelf-library.ts'

// only version 2 is published here, so any answer must have come through the bookshelf
const base = 'https://data.example/index'
const lookupVector = async (word: string) => ({ cat: [1, 0], dog: [0, 1], car: [0.5, 0.5] } as Record<string, number[]>)[word]
const sign = (name: string) => ({ title: name.toUpperCase(), words: [name], tags: ['animal'], body: '', link: `https://x.test/${name}`, timestamp: 1000, media: [] })
const collection = { alpha: { cat: sign('cat'), dog: sign('dog') }, beta: { car: sign('car') } } as unknown as Record<string, EncodedSearchData>

let server: FakeDataServer
beforeAll(async () => {
  server = new FakeDataServer().install()
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)
  useTheBookshelf(makeBookshelf({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) }))
})

describe('getSearchLibrary, once the bookshelf is set', () => {
  it('answers from the bookshelf, so every caller gets version 2 without changing', async () => {
    const library = await getSearchLibrary(['alpha'], ['id'])

    expect(library.alpha.entries.map(entry => entry.id).sort()).toEqual(['cat', 'dog'])
    expect(library.alpha.entries[0].indexURL).toBe(`${base}/alpha`)
  })
})

describe('search, once the bookshelf is set', () => {
  it('finds signs through the bookshelf, and never asks for the version 1 word vector file', async () => {
    server.resetRequests()
    const response = await search('cat', 0, 10)

    expect(response.results.map(result => result.id)).toContain('cat')
    expect(server.requests.map(request => request.path.split('/').pop())).not.toContain('global-vectors.lps')
  })
})
