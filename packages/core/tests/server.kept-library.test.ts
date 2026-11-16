import { describe, expect, it } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { serverLibrary } from '../src/search/server-library.ts'

const base = 'https://data.example/v2'
const manifestUrl = `${base}/manifest.json`
const lookupVector = async (word: string) => ({ cat: [1, 0], dog: [0, 1], car: [0.5, 0.5] } as Record<string, number[]>)[word]

function sign (name: string) {
  return { title: name.toUpperCase(), words: [name], tags: ['animal'], body: `About the ${name}.`, link: `https://x.test/${name}`, timestamp: 1000, media: [] }
}
const signs = (list: string[]) => Object.fromEntries(list.map(name => [name, sign(name)])) as unknown as EncodedSearchData
const collection = { alpha: signs(['cat', 'dog']), beta: signs(['car']) }

async function publishedServer () {
  const server = new FakeDataServer()
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)
  return server
}
const idsOf = (library: { [index: string]: { entries: { id?: string }[] } }, index: string) => library[index].entries.map(entry => entry.id).sort()

describe('the server\'s kept library', () => {
  it('loads the signs of every index it was given, from the data server', async () => {
    const server = await publishedServer()
    const library = serverLibrary({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    const loaded = await library.loadLibrary(['id'], undefined, false)

    expect(idsOf(loaded, 'alpha')).toEqual(['cat', 'dog'])
    expect(idsOf(loaded, 'beta')).toEqual(['car'])
  })

  it('keeps the files between loads, so a second load asks the server only for manifest.json', async () => {
    const server = await publishedServer()
    const library = serverLibrary({ baseUrl: base, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    await library.loadLibrary(['id'], undefined, false)
    const after = server.requests.length
    await library.loadLibrary(['id'], undefined, false)
    const second = server.requests.slice(after).map(request => request.path.split('/').pop())

    expect(second).toEqual(['manifest.json'])
  })
})
