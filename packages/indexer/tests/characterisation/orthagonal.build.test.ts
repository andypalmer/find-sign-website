// Characterisation tests for buildSearchIndex(): the pipeline from encoded-search-data + overrides
// to a published orthagonal index and the shared global-vectors.lps file.
import '@find-sign/test-helpers/test-env.ts'
import { DataBase, VectorLibraryBase, writeKeyPair } from '@find-sign/test-helpers/test-env.ts'
import { expect, describe, it, beforeEach, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { IndexBase, alphaSearchData as publishedAlpha, publishSearchData, publishVectorLibrary } from '@find-sign/test-helpers/fixtures.ts'
import buildSearchIndex from '../../src/orthagonal/build'
import { parse as parseVectors } from '@find-sign/core/search/precomputed-vectors.ts'
import { decodeHex, sign_open } from 'tweetnacl-ts'
import { parseRecordFile } from '@andypalmer/records'

let server: FakeDataServer
const quiet = { log: () => {}, progress: () => {} }

beforeEach(async () => {
  server = new FakeDataServer().install()
  await publishVectorLibrary(server)
  publishSearchData(server)
})

function vectorWords (url: string) {
  return [...parseVectors(server.get(url)!)].map(x => x.word).sort()
}

describe('buildSearchIndex()', () => {
  it('writes the whole index in one signed bulk POST to the data server', async () => {
    await buildSearchIndex('alpha', quiet)
    const bulk = server.requests.filter(r => r.method === 'POST')
    expect(bulk).toHaveLength(1)
    expect(bulk[0].path).toBe(`${IndexBase}/alpha`)
    expect(bulk[0].body.type).toBe('bulk')
    expect(Object.keys(bulk[0].body.files).sort()).toEqual([
      'aliases.json', 'author.json', 'id.json', 'link.json', 'meta.json', 'shard-0.json',
      'tags.json', 'timestamp.json', 'title.json', 'vectors.lps', 'words.json',
    ])
    expect(bulk[0].body.files['vectors.lps'].encoding).toBe('base64')
    expect(bulk[0].body.files['meta.json'].encoding).toBe('string')

    // every data server request carries a license signed by the write identity
    const license = new URL(bulk[0].url).searchParams.get('license') as string
    const [scheme, publicKey, signature] = license.split('-')
    expect(scheme).toBe('ed25519')
    expect(decodeHex(publicKey)).toEqual(writeKeyPair.publicKey)
    expect(sign_open(decodeHex(signature), writeKeyPair.publicKey)).not.toBeNull()
  })

  it('drops published:false entries', async () => {
    await buildSearchIndex('alpha', quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/meta.json`).entries).toBe(3)
  })

  it('shallow-merges overrides for this provider, ignoring other providers and unknown ids', async () => {
    server.set(`${DataBase}overrides/alpha:cat.json`, { title: 'Overridden Cat', tags: ['override'] })
    server.set(`${DataBase}overrides/alpha:missing.json`, { title: 'Nope' })
    server.set(`${DataBase}overrides/beta:kitten.json`, { title: 'Wrong provider' })
    server.set(`${DataBase}overrides/alpha:hidden.json`, { published: true })
    await buildSearchIndex('alpha', quiet)
    const titles = server.getJSON(`${IndexBase}/alpha/title.json`).entries
    expect(titles).toEqual(['Overridden Cat', 'Dog', 'Car'])
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries[0]).toEqual(['override'])
    // unpublished entries are removed BEFORE overrides apply, so an override cannot republish them
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).not.toContain('hidden')
  })

  it('stores media urls relative to the index folder, leaving other origins and links absolute', async () => {
    const data = publishedAlpha()
    data.dog.media[0].thumbnail = 'https://cdn.test/dog.webp'
    publishSearchData(server, { alpha: data } as any)
    await buildSearchIndex('alpha', quiet)
    const [cat, dog] = server.getJSON(`${IndexBase}/alpha/shard-0.json`).entries
    expect(cat.media[0].thumbnail).toBe('../../../../encoded-search-data/raw/cat-media/cat-0.webp')
    expect(cat.media[0].encodes.map((x: any) => x.url)).toEqual([
      '../../../../encoded-search-data/raw/cat-media/cat-0.mp4',
      '../../../../encoded-search-data/raw/cat-media/cat-0.webm',
    ])
    expect(dog.media[0].thumbnail).toBe('https://cdn.test/dog.webp')
    expect(cat.link).toBe('https://alpha.test/cat')
    expect(cat.media[0].source.url).toBe('https://source.test/cat.mp4')
  })

  it('rebuilds global-vectors.lps from every configured index, tolerating indexes that do not exist yet', async () => {
    await buildSearchIndex('alpha', quiet)
    expect(vectorWords(`${IndexBase}/global-vectors.lps`)).toEqual(['car', 'cat', 'dog'])
    await buildSearchIndex('beta', quiet)
    expect(vectorWords(`${IndexBase}/global-vectors.lps`)).toEqual(['car', 'cat', 'dog', 'kitten', 'red', 'truck'])
  })

  // vector library lookups go through a process-wide LRU in loaded-precomputed-vectors, so these
  // tests load fresh module instances to observe real library traffic
  async function freshBuild () {
    vi.resetModules()
    return (await import('../../src/orthagonal/build')).default
  }

  it('looks every word up in the vector library on a normal build: one shard per word', async () => {
    const build = await freshBuild()
    await build('alpha', quiet)
    const library = server.requestsTo(VectorLibraryBase).map(r => r.path.split('/').pop() as string)
    // QUIRK: preload() caches the opened library but not the in-flight promise, so each of the
    // 3 concurrent lookup workers fetches info.json on a cold start
    expect(library.filter(x => x === 'info.json')).toHaveLength(3)
    expect(library.filter(x => x.endsWith('.lps'))).toHaveLength(3) // cat, dog, car
  })

  it('fast mode reuses the previous build vector cache instead of the vector library', async () => {
    await buildSearchIndex('alpha', quiet)
    const build = await freshBuild()
    server.resetRequests()
    await build('alpha', { ...quiet, fast: true })
    expect(server.requestsTo(VectorLibraryBase)).toHaveLength(0)
    // read twice: once as the fast-build cache, once again while rebuilding global-vectors.lps
    expect(server.requestsTo(`${IndexBase}/alpha/vectors.lps`).filter(r => r.method === 'GET')).toHaveLength(2)
    expect(vectorWords(`${IndexBase}/alpha/vectors.lps`)).toEqual(['car', 'cat', 'dog'])
  })

  it('keeps a record file per provider, with urls relative to it', async () => {
    await buildSearchIndex('alpha', quiet)
    const file = parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!)
    expect(file.provider.id).toBe('alpha')
    // unpublished entries are kept in the records, so their ids stay reserved
    expect(file.records.map(r => r.id)).toEqual(['car', 'cat', 'dog', 'hidden'])
    const cat = file.records.find(r => r.id === 'cat')!
    expect(cat.media[0].source.url).toBe('https://source.test/cat.mp4')
    const thumbnail = cat.media[0].encoded!.thumbnail!
    expect(thumbnail).toMatch(/^\.\.\//)
    expect(new URL(thumbnail, `${DataBase}records/alpha.records.json`).toString()).toBe('http://data.test/collections/encoded-search-data/raw/cat-media/cat-0.webp')
  })

  it('indexes readable ids, with old keys as aliases and kept as sourceId', async () => {
    const data = publishedAlpha() as any
    data['B8p5qc9noP5'] = { ...data.dog, title: 'Hello there, greeting', words: ['hello'] }
    publishSearchData(server, { alpha: data })
    await buildSearchIndex('alpha', quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car', 'hello-there'])
    expect(server.getJSON(`${IndexBase}/alpha/aliases.json`).entries).toEqual([null, null, null, ['B8p5qc9noP5']])
    const shard = server.getJSON(`${IndexBase}/alpha/shard-0.json`)
    expect(shard.entries[3]).toMatchObject({ id: 'hello-there', sourceId: 'B8p5qc9noP5', aliases: ['B8p5qc9noP5'] })
  })

  it('keeps each sign\'s id on later builds, even when its title changes', async () => {
    await buildSearchIndex('alpha', quiet)
    server.set(`${DataBase}overrides/alpha:cat.json`, { title: 'Kitty' })
    const logs: string[] = []
    await buildSearchIndex('alpha', { ...quiet, log: (...x) => logs.push(x.join(' ')) })
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/title.json`).entries[0]).toBe('Kitty')
    expect(logs).toContain('Records: 1 changed, 3 unchanged')
  })

  it('reports progress ending at 1 and logs "Build complete"', async () => {
    const logs: string[] = []
    const progress: number[] = []
    await buildSearchIndex('alpha', { log: (...x) => logs.push(x.join(' ')), progress: (n) => progress.push(n) })
    expect(logs[0]).toBe('Reading search data alpha...')
    expect(logs.at(-1)).toBe('Build complete')
    expect(progress.at(-1)).toBe(1)
  })
})
