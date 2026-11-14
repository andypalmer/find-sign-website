import { describe, expect, it, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeShelf } from '@find-sign/test-helpers/fake-shelf.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { OutdatedError } from '#lib/orthagonal/read.ts'
import { FrontDesk, SearchDesk } from '../src/worker/desks.ts'
import { FileKeeper } from '../src/worker/file-keeper.ts'
import { KeptLibrary } from '../src/worker/kept-library.ts'
import { DeskRefusal, type DeskHelpers, type IAnswerLetters, type Reply } from '../src/worker/letters.ts'
import { Switchboard } from '../src/worker/switchboard.ts'
import type { SearchLibrary, SearchSeams } from '../src/search/search-engine.ts'

const vector = (...numbers: number[]) => new Float32Array(numbers)
const known = { cat: vector(1, 0, 0, 0), kitten: vector(0.9, 0.1, 0, 0), car: vector(0, 0, 1, 0) }

function sign (id: string, vectors: Float32Array[], index = 'alpha') {
  return {
    id, words: [id], tags: [], vectors, indexURL: `https://data.test/${index}`,
    load: async () => ({ id, title: id.toUpperCase(), body: `About ${id}.`, words: [id], tags: [], media: [] })
  }
}
const animals = () => ({
  alpha: { entries: [sign('cat', [known.cat]), sign('kitten', [known.kitten])] },
  beta: { entries: [sign('car', [known.car], 'beta')] }
}) as unknown as SearchLibrary

function seamsFor (library = animals(), overrides: Partial<SearchSeams> = {}): SearchSeams {
  return {
    knownVectors: async () => known,
    lookupVector: async () => undefined,
    loadLibrary: async () => library,
    indexNameOf: entry => entry.indexURL.split('/').pop()!,
    ...overrides
  }
}

function helpers () {
  const progress: [number, string][] = []
  const controller = new AbortController()
  const given: DeskHelpers = { progress: (done, doing) => progress.push([done, doing]), cancelled: controller.signal }
  return { given, progress, controller }
}

const refusal = async (promise: Promise<unknown>) => await promise.then(() => undefined, error => error as DeskRefusal)

describe('the front desk', () => {
  const desk = new FrontDesk('build-7', [1, 2, 3])

  it('says the highest version both sides know, and which build of the worker this is', async () => {
    expect(await desk.answer('hello', { speaks: [1, 2] }, helpers().given)).toEqual({ protocol: 2, workerBuild: 'build-7' })
    expect(await desk.answer('hello', { speaks: [3, 9, 1] }, helpers().given)).toEqual({ protocol: 3, workerBuild: 'build-7' })
  })

  it('refuses a page that has no version in common, so it uses the fallback', async () => {
    const refused = await refusal(desk.answer('hello', { speaks: [4, 5] }, helpers().given))
    expect(refused).toBeInstanceOf(DeskRefusal)
    expect(refused).toMatchObject({ reason: 'no-such-question' })
    expect(refused!.message).toMatch(/4, 5|version/i)
    expect(await refusal(desk.answer('hello', { speaks: [] }, helpers().given))).toMatchObject({ reason: 'no-such-question' })
  })

  it('refuses details of the wrong shape', async () => {
    for (const bad of [undefined, null, 'hello', {}, { speaks: 1 }, { speaks: ['1'] }, { speaks: [1.5] }]) {
      expect(await refusal(desk.answer('hello', bad, helpers().given)), JSON.stringify(bad)).toMatchObject({ reason: 'bad-details' })
    }
  })

  it('refuses a question it doesn\'t have', async () => {
    expect(await refusal(desk.answer('goodbye', { speaks: [1] }, helpers().given))).toMatchObject({ reason: 'no-such-question' })
  })
})

describe('the search desk', () => {
  it('answers a search with the total and the page of results, each from its index', async () => {
    const answer = await new SearchDesk(seamsFor()).answer('search', { query: 'cat', start: 0, length: 10 }, helpers().given) as { totalResults: number, results: { index: string, id: string }[] }
    expect(answer.totalResults).toBe(3)
    expect(answer.results.map(result => `${result.index}:${result.id}`)).toEqual(['alpha:cat', 'alpha:kitten', 'beta:car'])
  })

  it('answers with plain data only, so it can travel to the page', async () => {
    const answer = await new SearchDesk(seamsFor()).answer('search', { query: 'cat', start: 0, length: 1 }, helpers().given)
    expect(structuredClone(answer)).toEqual(answer)
  })

  it('refuses details of the wrong shape', async () => {
    const desk = new SearchDesk(seamsFor())
    for (const bad of [undefined, null, 'cat', {}, { query: 7, start: 0, length: 10 }, { query: 'cat', start: -1, length: 10 }, { query: 'cat', start: 0, length: 1.5 }, { query: 'cat', start: '0', length: 10 }, { query: 'cat', start: 0 }]) {
      expect(await refusal(desk.answer('search', bad, helpers().given)), JSON.stringify(bad)).toMatchObject({ reason: 'bad-details' })
    }
  })

  it('refuses a question it doesn\'t have', async () => {
    expect(await refusal(new SearchDesk(seamsFor()).answer('pick-the-winner', {}, helpers().given))).toMatchObject({ reason: 'no-such-question' })
  })

  it('says how far along it is as it goes, moving forward, in words a person can read', async () => {
    const { given, progress } = helpers()
    await new SearchDesk(seamsFor()).answer('search', { query: 'cat', start: 0, length: 10 }, given)
    expect(progress.length).toBeGreaterThanOrEqual(2)
    const done = progress.map(([amount]) => amount)
    expect(done).toEqual([...done].sort((a, b) => a - b))
    for (const [amount, doing] of progress) {
      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThan(1)
      expect(doing.length).toBeGreaterThan(3)
    }
  })

  it('stops when the page says never-mind, before it does any more work', async () => {
    const { given, controller } = helpers()
    const loadLibrary = vi.fn(async () => animals())
    const desk = new SearchDesk(seamsFor(animals(), {
      knownVectors: async () => { controller.abort(); return known },
      loadLibrary
    }))
    await expect(desk.answer('search', { query: 'cat', start: 0, length: 10 }, given)).rejects.toThrow()
    expect(loadLibrary).not.toHaveBeenCalled()
  })

  it('stops after the library has loaded if the page said never-mind meanwhile, rather than ranking for nobody', async () => {
    const { given, controller } = helpers()
    const results = vi.fn(async () => ({}))
    const library = { alpha: { entries: [{ ...sign('cat', [known.cat]), load: results }] } } as unknown as SearchLibrary
    const desk = new SearchDesk(seamsFor(library, { loadLibrary: async () => { controller.abort(); return library } }))
    await expect(desk.answer('search', { query: 'cat', start: 0, length: 10 }, given)).rejects.toThrow()
    expect(results).not.toHaveBeenCalled()
  })

  it('says the network is the problem when a file isn\'t kept and can\'t be fetched', async () => {
    const desk = new SearchDesk(seamsFor(animals(), { loadLibrary: async () => { throw new TypeError('fetch failed') } }))
    expect(await refusal(desk.answer('search', { query: 'cat', start: 0, length: 10 }, helpers().given))).toMatchObject({ reason: 'no-network-and-not-kept' })
  })

  it('says the index keeps changing when the old way of saying so is used', async () => {
    const desk = new SearchDesk(seamsFor(animals(), { loadLibrary: async () => { throw new OutdatedError('rebuilt', 'https://data.test/alpha') } }))
    expect(await refusal(desk.answer('search', { query: 'cat', start: 0, length: 10 }, helpers().given))).toMatchObject({ reason: 'index-changed-too-often' })
  })

  it('leaves any other failure for the switchboard to report, as it is', async () => {
    const desk = new SearchDesk(seamsFor(animals(), { loadLibrary: async () => { throw new Error('something odd') } }))
    await expect(desk.answer('search', { query: 'cat', start: 0, length: 10 }, helpers().given)).rejects.toThrow('something odd')
    expect(await refusal(desk.answer('search', { query: 'cat', start: 0, length: 10 }, helpers().given))).not.toBeInstanceOf(DeskRefusal)
  })
})

// the desks on the real library, keeper and reader, through the real switchboard, as a letter really travels
describe('letters to the desks, through the switchboard', () => {
  const base = 'https://data.example/v2'
  const meaning: { [word: string]: number[] } = { cat: [1, 0, 0, 0], kitten: [0.9, 0.1, 0, 0], car: [0, 0, 1, 0] }
  const signs = (list: string[]) => Object.fromEntries(list.map(name => [name, { title: name.toUpperCase(), words: [name], tags: [], body: `About the ${name}.`, timestamp: 1, media: [] }])) as unknown as EncodedSearchData

  /** wraps a desk and says when it has been told never-mind, so a test can wait for that and not guess how long it takes */
  class WatchingDesk implements IAnswerLetters {
    sawNeverMind: Promise<void>
    private saw!: () => void
    constructor (private inner: IAnswerLetters) { this.sawNeverMind = new Promise(resolve => { this.saw = resolve }) }
    answer (ask: string, details: unknown, helpers: DeskHelpers) {
      if (helpers.cancelled.aborted) this.saw()
      else helpers.cancelled.addEventListener('abort', () => this.saw(), { once: true })
      return this.inner.answer(ask, details, helpers)
    }
  }

  async function setUp () {
    const server = new FakeDataServer()
    const data = { alpha: signs(['cat', 'kitten']), beta: signs(['car']) }
    const written = Object.fromEntries(await Promise.all(Object.entries(data).map(async ([name, s]) => [name, await writeVersion2Index(name, s, { shardCount: 2, scanCount: 1 })] as const)))
    const vectors = await writeVersion2Vectors(data, { lookupVector: async word => meaning[word], bucketCount: 4 })
    for (const file of planPublishOrder(written, vectors)) server.set(`${base}/${file.name}`, file.contents)
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), new FakeShelf(), base)
    const library = new KeptLibrary(keeper, { baseUrl: base, indexes: ['alpha', 'beta'] })
    const watching = new WatchingDesk(new SearchDesk(library.asSearchSeams(async () => undefined)))
    const switchboard = new Switchboard({ 'front-desk': new FrontDesk('test-build'), 'search-desk': watching })
    return { server, switchboard, watching }
  }

  /** sends a letter and gathers every reply until the exchange ends */
  function post (switchboard: Switchboard, letter: unknown, { neverMindAfterFirstReply = false } = {}): Promise<Reply[]> {
    const channel = new MessageChannel()
    const replies: Reply[] = []
    return new Promise(resolve => {
      channel.port1.onmessage = ({ data }) => {
        replies.push(data)
        if (neverMindAfterFirstReply && replies.length === 1) channel.port1.postMessage({ protocol: 1, kind: 'never-mind' })
        if (data.kind !== 'progress') { channel.port1.close(); resolve(replies) }
      }
      switchboard.receive(letter, channel.port2)
    })
  }

  it('welcomes a page that says hello', async () => {
    const { switchboard } = await setUp()
    const replies = await post(switchboard, { protocol: 1, to: 'front-desk', ask: 'hello', details: { speaks: [1] } })
    expect(replies.at(-1)).toEqual({ protocol: 1, kind: 'answer', details: { protocol: 1, workerBuild: 'test-build' } })
  })

  it('answers a search from the kept files, with progress notes first', async () => {
    const { switchboard } = await setUp()
    const replies = await post(switchboard, { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat', start: 0, length: 10 } })
    const ending = replies.at(-1) as Extract<Reply, { kind: 'answer' }>
    expect(ending.kind).toBe('answer')
    expect((ending.details as { results: { id: string }[] }).results.map(result => result.id)).toEqual(['cat', 'kitten', 'car'])
    expect(replies.slice(0, -1).every(reply => reply.kind === 'progress')).toBe(true)
    expect(replies.length).toBeGreaterThan(1)
  })

  it('fails with the network reason when nothing is kept and the data server can\'t be reached', async () => {
    const { switchboard, server } = await setUp()
    server.failures.set(`${base}/manifest.json`, 'network')
    const replies = await post(switchboard, { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat', start: 0, length: 10 } })
    expect(replies.at(-1)).toMatchObject({ kind: 'failed', reason: 'no-network-and-not-kept' })
  })

  it('fails with the index-changing reason when a file stays missing even after asking for manifest.json again', async () => {
    const { switchboard, server } = await setUp()
    for (const path of [...server.files.keys()]) if (/\/shard-/.test(path)) server.files.delete(path)
    const replies = await post(switchboard, { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat', start: 0, length: 10 } })
    expect(replies.at(-1)).toMatchObject({ kind: 'failed', reason: 'index-changed-too-often' })
  })

  it('ends a search with cancelled when the page says never-mind', async () => {
    const { switchboard, server, watching } = await setUp()
    // the data server holds its answers until the desk has been told never-mind, so the search can't finish first
    const answer = server.fetch.bind(server)
    server.fetch = async (input, init) => { await watching.sawNeverMind; return await answer(input, init) }
    const replies = await post(switchboard, { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat', start: 0, length: 10 } }, { neverMindAfterFirstReply: true })
    expect(replies.at(-1)).toMatchObject({ kind: 'failed', reason: 'cancelled' })
  })

  it('fails a search with bad details', async () => {
    const { switchboard } = await setUp()
    const replies = await post(switchboard, { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat' } })
    expect(replies.at(-1)).toMatchObject({ kind: 'failed', reason: 'bad-details' })
  })
})
