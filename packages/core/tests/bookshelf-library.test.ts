import { describe, expect, it } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { bookshelfGetSearchLibrary } from '../src/search/bookshelf-library.ts'

const base = 'https://data.example/index'
const lookupVector = async (word: string) => ({ cat: [1, 0], dog: [0, 1], car: [0.5, 0.5] } as Record<string, number[]>)[word]
const sign = (name: string) => ({ title: name.toUpperCase(), words: [name], tags: ['animal'], body: '', link: `https://x.test/${name}`, timestamp: 1000, media: [] })
const collection = { alpha: { cat: sign('cat'), dog: sign('dog') }, beta: { car: sign('car') } } as unknown as Record<string, EncodedSearchData>

async function publishedServer () {
  const server = new FakeDataServer()
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)
  return server
}

describe('the bookshelf library, which answers the way the version 1 library does', () => {
  it('gives each sign the address of its own index, as version 1 does', async () => {
    const server = await publishedServer()
    const getLibrary = bookshelfGetSearchLibrary({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    const library = await getLibrary(false, ['id'])

    expect(library.alpha.entries.map(entry => entry.indexURL)).toEqual([`${base}/alpha`, `${base}/alpha`])
    expect(library.beta.entries.map(entry => entry.indexURL)).toEqual([`${base}/beta`])
  })

  it('gives only the indexes asked for, when the caller names some', async () => {
    const server = await publishedServer()
    const getLibrary = bookshelfGetSearchLibrary({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    const library = await getLibrary(['beta'], ['id'])

    expect(Object.keys(library)).toEqual(['beta'])
  })

  it('gives the whole sign when a caller asks for it, as version 1 does', async () => {
    const server = await publishedServer()
    const getLibrary = bookshelfGetSearchLibrary({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    const library = await getLibrary(['beta'], ['id'])
    const whole = await library.beta.entries[0].load()

    expect(whole.title).toBe('CAR')
  })
})
