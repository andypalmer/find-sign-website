import { describe, expect, it } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { makeBookshelf } from '../src/search/bookshelf-library.ts'
import { swapOrigin } from '../src/functions/swap-origin.ts'

// the public address the site publishes under, and the internal address the server fetches from
const publicBase = 'https://data.example.test/collections/find-sign/raw/index'
const internalOrigin = 'http://data:8080'
const lookupVector = async (word: string) => ({ cat: [1, 0], dog: [0, 1] } as Record<string, number[]>)[word]
const sign = (name: string) => ({ title: name.toUpperCase(), words: [name], tags: ['animal'], body: '', link: `https://x.test/${name}`, timestamp: 1000, media: [] })
const collection = { alpha: { cat: sign('cat'), dog: sign('dog') } } as unknown as Record<string, EncodedSearchData>

describe('the server fetching from the internal origin', () => {
  it('fetches every file from the internal origin, but reports signs with their public address', async () => {
    const onInternal = new FakeDataServer()
    const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
    const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4 })
    for (const file of planPublishOrder(written, vectors)) onInternal.set(swapOrigin(`${publicBase}/${file.name}`, internalOrigin), file.contents)

    const requested: string[] = []
    const bookshelf = makeBookshelf({
      baseUrl: publicBase,
      indexes: ['alpha'],
      fetch: (url, init) => {
        const sent = swapOrigin(url, internalOrigin)
        requested.push(sent) // the address that actually goes out
        return onInternal.fetch(sent, init)
      }
    })
    const library = await bookshelf.getSearchLibrary(['alpha'], ['id'])

    expect(requested.length).toBeGreaterThan(0)
    expect(requested.every(url => url.startsWith(`${internalOrigin}/`))).toBe(true)
    expect(library.alpha.entries.map(entry => entry.indexURL)).toEqual([`${publicBase}/alpha`, `${publicBase}/alpha`])
  })
})
