import '@find-sign/test-helpers/test-env.ts'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { IndexBase, alphaSearchData, betaSearchData, publishBuiltIndexes, wordVectors } from '@find-sign/test-helpers/fixtures.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { search, type SearchResult } from '../src/search/search.ts'
import { lookup } from '../src/search/loaded-precomputed-vectors.ts'
import { makeServerSearch } from '../src/search/server-search.ts'

let server: FakeDataServer
// like the version 1 builder, leave out unpublished signs (they stay in the records, but are not indexed)
const everySign = { alpha: alphaSearchData(), beta: betaSearchData() } as unknown as Record<string, Record<string, { published?: boolean }>>
const collection = Object.fromEntries(Object.entries(everySign).map(([name, signs]) => [name, Object.fromEntries(Object.entries(signs).filter(([, sign]) => sign.published !== false))])) as unknown as Record<string, EncodedSearchData>
const lookupVector = async (word: string) => wordVectors[word]

beforeAll(async () => {
  server = new FakeDataServer().install()
  // version 1, as the site has it today
  await publishBuiltIndexes(server)
  // version 2, beside it in the same folder, built from the same signs
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) => [name, await writeVersion2Index(name, data, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${IndexBase}/${file.name}`, file.contents)
})

beforeEach(() => server.resetRequests())

// the sign that answered, by index and id: order between equal ranks can differ, so we compare the set
const signsOf = (response: { results: SearchResult[] }) => response.results.map(r => `${r.index}:${r.id}:${r.title}:${r.link}`).sort()

describe('the server\'s search on the version 2 index', () => {
  const queries = ['cat', 'dog', 'car', 'kitten', 'red truck', 'feline', '#animal', 'raining cats and dogs']

  it.each(queries)('finds the same signs for "%s" as the version 1 search does', async query => {
    const v2 = makeServerSearch({ baseUrl: IndexBase, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    const fromV1 = await search(query, 0, 50)
    const fromV2 = await v2(query, 0, 50)

    expect(fromV1.results.length).toBeGreaterThan(0) // so an empty answer can never pass
    expect(fromV2.totalResults).toBe(fromV1.totalResults)
    expect(signsOf(fromV2)).toEqual(signsOf(fromV1))
  })

  it('answers the second search from kept files, asking the server only for manifest.json', async () => {
    const v2 = makeServerSearch({ baseUrl: IndexBase, indexes: ['alpha', 'beta'], fetch: (url, init) => server.fetch(url, init) })
    await v2('cat', 0, 10)
    const after = server.requests.length
    await v2('dog', 0, 10)
    const second = server.requests.slice(after).map(request => request.path.split('/').pop())

    expect(second.length).toBeGreaterThan(0)
    expect(second.every(name => name === 'manifest.json')).toBe(true)
  })
})
