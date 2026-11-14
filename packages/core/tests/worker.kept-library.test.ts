import { describe, expect, it } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeShelf } from '@find-sign/test-helpers/fake-shelf.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { FileKeeper } from '../src/worker/file-keeper.ts'
import { fetchThroughTheKeeper, KeptLibrary } from '../src/worker/kept-library.ts'
import { answerSearch } from '../src/search/search-engine.ts'

const base = 'https://data.example/v2'
const manifestUrl = `${base}/manifest.json`

// a tiny meaning space: [feline, canine, vehicle, cargo]
const meaning: { [word: string]: number[] } = {
  cat: [1, 0, 0, 0], kitten: [0.9, 0.1, 0, 0], dog: [0.4, 0.6, 0, 0], car: [0, 0, 1, 0], truck: [0, 0, 0.8, 0.2]
}
const lookupVector = async (word: string) => meaning[word]

function sign (name: string, extra: object = {}) {
  return {
    title: name.toUpperCase(), words: [name], tags: ['animal'], body: `About the ${name}.`, link: `https://x.test/${name}`, timestamp: 1000,
    media: [{ type: 'video', source: { method: 'fetch', url: `https://source.test/${name}.mp4`, version: '1' }, timestamp: 1, thumbnail: `${name}-media/${name}-0.webp`, encodes: [] }],
    ...extra
  }
}
const signs = (list: string[], extra: { [name: string]: object } = {}) => Object.fromEntries(list.map(name => [name, sign(name, extra[name])])) as unknown as EncodedSearchData
const collection = (extra: { [name: string]: object } = {}) => ({ alpha: signs(['cat', 'kitten', 'dog'], extra), beta: signs(['car', 'truck'], extra) })

async function publish (server: FakeDataServer, data = collection()) {
  const written = Object.fromEntries(await Promise.all(Object.entries(data).map(async ([name, signs]) => [name, await writeVersion2Index(name, signs, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(data, { lookupVector, bucketCount: 4 })
  const plan = planPublishOrder(written, vectors)
  for (const file of plan) server.set(`${base}/${file.name}`, file.contents)
}

async function libraryOn (indexes = ['alpha', 'beta']) {
  const server = new FakeDataServer()
  await publish(server)
  const keeper = new FileKeeper((url, init) => server.fetch(url, init), new FakeShelf(), base)
  return { server, keeper, library: new KeptLibrary(keeper, { baseUrl: base, indexes }) }
}
const requestedNames = (server: FakeDataServer) => server.requests.map(request => request.path.split('/').pop()!)
const idsOf = (library: { [index: string]: { entries: { id?: string }[] } }, index: string) => library[index].entries.map(entry => entry.id).sort()

describe('fetchThroughTheKeeper()', () => {
  it('gives a file the keeper holds as an ordinary response', async () => {
    const { keeper, server } = await libraryOn()
    const name = (JSON.parse(server.getText(manifestUrl)!) as { indexes: { alpha: string } }).indexes.alpha
    const response = await fetchThroughTheKeeper(keeper, base)(`${base}/${name}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('shardCount')
  })

  it('asks the keeper for manifest.json, which checks with the server, and not for a kept copy that may be old', async () => {
    const { keeper, server } = await libraryOn()
    const fetched = fetchThroughTheKeeper(keeper, base)
    await fetched(manifestUrl)
    server.set(manifestUrl, '{"version":2,"indexes":{},"vectors":[]}')
    expect(await (await fetched(manifestUrl)).text()).toBe('{"version":2,"indexes":{},"vectors":[]}')
  })

  it('says 404 for a file the data server hasn\'t got, and any other status as it came', async () => {
    const { keeper, server } = await libraryOn()
    const fetched = fetchThroughTheKeeper(keeper, base)
    expect((await fetched(`${base}/shard-0.0000000000.json`)).status).toBe(404)
    server.failures.set(`${base}/shard-1.1111111111.json`, 500)
    expect((await fetched(`${base}/shard-1.1111111111.json`)).status).toBe(500)
  })

  it('lets a network failure through as a failure, not as a missing file', async () => {
    const { keeper, server } = await libraryOn()
    server.failures.set(`${base}/shard-2.2222222222.json`, 'network')
    await expect(fetchThroughTheKeeper(keeper, base)(`${base}/shard-2.2222222222.json`)).rejects.toThrow()
  })

  it('refuses an address outside the folder it was given', async () => {
    const { keeper } = await libraryOn()
    await expect(fetchThroughTheKeeper(keeper, base)('https://elsewhere.test/x.json')).rejects.toThrow(/outside/)
  })
})

describe('KeptLibrary.loadLibrary()', () => {
  it('gives every index\'s signs, with what a search looks at, and says which index each is in', async () => {
    const { library } = await libraryOn()
    const loaded = await library.loadLibrary(['words', 'tags'], undefined, false)
    expect(idsOf(loaded, 'alpha')).toEqual(['cat', 'dog', 'kitten'])
    expect(idsOf(loaded, 'beta')).toEqual(['car', 'truck'])
    expect(loaded.alpha.entries[0]).toMatchObject({ indexName: 'alpha', tags: ['animal'] })
    expect(loaded.beta.entries[0]).toMatchObject({ indexName: 'beta' })
  })

  it('lists the indexes in the order it was given them, whatever order the manifest has, because that order settles ties', async () => {
    const { library } = await libraryOn(['beta', 'alpha'])
    expect(Object.keys(await library.loadLibrary(['words'], undefined, false))).toEqual(['beta', 'alpha'])
  })

  it('searches only the indexes it was given', async () => {
    const { library } = await libraryOn(['beta'])
    expect(Object.keys(await library.loadLibrary(['words'], undefined, false))).toEqual(['beta'])
  })

  it('says which index is missing when the data server\'s manifest hasn\'t got one it was told to search', async () => {
    const { library } = await libraryOn(['alpha', 'nope'])
    await expect(library.loadLibrary(['words'], undefined, false)).rejects.toThrow(/nope/)
  })

  it('fetches no word vectors when it has none to attach', async () => {
    const { library, server } = await libraryOn()
    const loaded = await library.loadLibrary(['tags'], undefined, false)
    expect(requestedNames(server).some(name => name.startsWith('vectors-'))).toBe(false)
    expect(loaded.alpha.entries[0].vectors).toEqual([])
  })

  it('gives each sign the vectors of its words when it is given the known vectors', async () => {
    const { library } = await libraryOn()
    const known = await library.knownVectors()
    const loaded = await library.loadLibrary(['words', 'vectors'], known, false)
    const cat = loaded.alpha.entries.find(entry => entry.id === 'cat')!
    expect(cat.vectors).toHaveLength(1)
    expect(cat.vectors![0][0]).toBeCloseTo(1, 1)
    const truck = loaded.beta.entries.find(entry => entry.id === 'truck')!
    expect(truck.vectors![0][2]).toBeCloseTo(0.8, 1)
  })

  it('keeps what it loaded while manifest.json is unchanged, so the next search costs one small check', async () => {
    const { library, server } = await libraryOn()
    const first = await library.loadLibrary(['words'], undefined, false)
    server.requests = []
    const second = await library.loadLibrary(['words'], undefined, false)
    expect(second).toBe(first)
    expect(requestedNames(server)).toEqual(['manifest.json'])
  })

  it('loads again, from the new files, when a build has changed manifest.json', async () => {
    const { library, server } = await libraryOn()
    await library.loadLibrary(['words'], undefined, false)
    await publish(server, collection({ cat: { title: 'KITTY CAT' } }))
    const loaded = await library.loadLibrary(['words'], undefined, false)
    expect(loaded.alpha.entries.find(entry => entry.id === 'cat')!.title).toBe('KITTY CAT')
  })

  it('loads again when told to skip what it holds, but fetches nothing it has already kept', async () => {
    const { library, server } = await libraryOn()
    const first = await library.loadLibrary(['words'], undefined, false)
    server.requests = []
    const second = await library.loadLibrary(['words'], undefined, true)
    expect(second).not.toBe(first)
    expect(new Set(requestedNames(server))).toEqual(new Set(['manifest.json']))
  })

  it('shares one load between searches that arrive together', async () => {
    const { library, server } = await libraryOn()
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => library.loadLibrary(['words'], undefined, false)))
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(requestedNames(server).filter(name => name.startsWith('scan-'))).toHaveLength(2)
  })

  it('works with no network at all once the files are kept', async () => {
    const { library, server } = await libraryOn()
    await library.loadLibrary(['words'], undefined, false)
    server.failures.set(manifestUrl, 'network')
    expect(idsOf(await library.loadLibrary(['words'], undefined, false), 'alpha')).toEqual(['cat', 'dog', 'kitten'])
  })

  it('says so when the network is down and nothing is kept', async () => {
    const { library, server } = await libraryOn()
    server.failures.set(manifestUrl, 'network')
    await expect(library.loadLibrary(['words'], undefined, false)).rejects.toThrow()
  })

  it('gives the whole sign, through the keeper, with its media addresses made full', async () => {
    const { library } = await libraryOn()
    const loaded = await library.loadLibrary(['words'], undefined, false)
    const whole = await loaded.alpha.entries.find(entry => entry.id === 'cat')!.load()
    expect(whole).toMatchObject({ id: 'cat', body: 'About the cat.' })
    expect(whole.media[0].thumbnail).toBe(`${base}/cat-media/cat-0.webp`)
  })

  it('still gives a whole sign after a build has changed its shard and the old files have gone', async () => {
    const { library, server } = await libraryOn()
    const loaded = await library.loadLibrary(['words'], undefined, false)
    const entry = loaded.alpha.entries.find(entry => entry.id === 'cat')!
    server.files.clear()
    await publish(server, collection({ cat: { body: 'A new body.' } }))
    expect((await entry.load()).body).toBe('A new body.')
  })
})

describe('KeptLibrary.knownVectors()', () => {
  it('gives every word of the shared vectors', async () => {
    const { library } = await libraryOn()
    const known = await library.knownVectors()
    expect(Object.keys(known).sort()).toEqual(['car', 'cat', 'dog', 'kitten', 'truck'])
    expect(known.cat).toBeInstanceOf(Float32Array)
  })

  it('fetches the vector files once, however often it is asked', async () => {
    const { library, server } = await libraryOn()
    await library.knownVectors()
    server.requests = []
    await library.knownVectors()
    expect(requestedNames(server).filter(name => name.startsWith('vectors-'))).toEqual([])
  })

  it('gives the new words after a build has added some', async () => {
    const { library, server } = await libraryOn()
    await library.knownVectors()
    meaning.lion = [0.95, 0.05, 0, 0]
    try {
      await publish(server, { alpha: signs(['cat', 'kitten', 'dog', 'lion']), beta: signs(['car', 'truck']) })
      expect(Object.keys(await library.knownVectors())).toContain('lion')
    } finally {
      delete meaning.lion
    }
  })
})

describe('KeptLibrary on the search engine', () => {
  it('answers a search from the kept files, ranked, with each result\'s index named', async () => {
    const { library } = await libraryOn()
    const response = await answerSearch('cat', 0, 10, library.asSearchSeams(async () => undefined))
    expect(response.results.map(result => `${result.index}:${result.id}`)).toEqual(['alpha:cat', 'alpha:kitten', 'alpha:dog', 'beta:truck', 'beta:car'])
    expect(response.totalResults).toBe(5)
  })

  it('answers a search by tag alone without fetching any word vectors', async () => {
    const { library, server } = await libraryOn()
    const response = await answerSearch('#animal', 0, 10, library.asSearchSeams(async () => undefined))
    expect(response.totalResults).toBe(5)
    expect(requestedNames(server).some(name => name.startsWith('vectors-'))).toBe(false)
  })

  it('looks a word the signs don\'t use up in the whole vector library', async () => {
    const { library } = await libraryOn()
    const asked: string[] = []
    const response = await answerSearch('feline', 0, 10, library.asSearchSeams(async word => { asked.push(word); return word === 'feline' ? new Float32Array([0.95, 0.05, 0, 0]) : undefined }))
    expect(asked).toEqual(['feline'])
    expect(response.results[0].id).toBe('cat')
  })

  it('answers from the kept files when the network has gone', async () => {
    const { library, server } = await libraryOn()
    await answerSearch('cat', 0, 10, library.asSearchSeams(async () => undefined))
    server.failures.set(manifestUrl, 'network')
    const response = await answerSearch('cat', 0, 10, library.asSearchSeams(async () => undefined))
    expect(response.results[0].id).toBe('cat')
  })
})
