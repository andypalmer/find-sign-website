import { describe, expect, it, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeIndexedDb } from '@find-sign/test-helpers/fake-indexeddb.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData } from '@andypalmer/orthagonal'
import { addressForTheWorker, indexFolderOf, type WorkerSettings } from '../src/worker/worker-settings.ts'
import { startTheWorker, type WorkerScope } from '../src/worker/worker-entry.ts'
import type { Reply } from '../src/worker/letters.ts'

const settings: WorkerSettings = {
  dataUrl: 'https://data.example/collections/find-sign/raw/',
  indexName: 'v2',
  indexes: ['alpha', 'beta'],
  vectorLibraryUrl: 'https://data.example/collections/wordvec/raw/test-vectors'
}
const folder = indexFolderOf(settings)

const meaning: { [word: string]: number[] } = { cat: [1, 0, 0, 0], kitten: [0.9, 0.1, 0, 0], car: [0, 0, 1, 0] }
const signs = (list: string[]) => Object.fromEntries(list.map(name => [name, { title: name.toUpperCase(), words: [name], tags: [], body: `About the ${name}.`, timestamp: 1, media: [] }])) as unknown as EncodedSearchData

async function publish (server: FakeDataServer) {
  const data = { alpha: signs(['cat', 'kitten']), beta: signs(['car']) }
  const written = Object.fromEntries(await Promise.all(Object.entries(data).map(async ([name, s]) => [name, await writeVersion2Index(name, s, { shardCount: 2, scanCount: 1 })] as const)))
  const vectors = await writeVersion2Vectors(data, { lookupVector: async word => meaning[word], bucketCount: 4 })
  for (const file of planPublishOrder(written, vectors)) server.set(`${folder}/${file.name}`, file.contents)
}

/** the service worker's global, as far as the worker uses it: events are sent by the test, and what the worker asks of the browser is written down */
class PretendWorkerScope implements WorkerScope {
  listeners = new Map<string, ((event: any) => void)[]>()
  skippedWaiting = 0
  claimed = 0
  indexedDB = new FakeIndexedDb()
  clients = { claim: async () => { this.claimed += 1 } }

  constructor (public location: { href: string }, private server: FakeDataServer) {}

  // as fussy as the browser's: refuses to run when called as a method of anything but the global
  fetch = function (this: unknown, url: string, init?: RequestInit): Promise<Response> {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
    return pretend.server.fetch(url, init)
  } as WorkerScope['fetch']

  skipWaiting = async () => { this.skippedWaiting += 1 }
  addEventListener (type: string, listener: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }

  /** send an event, and wait for everything the worker asked the browser to keep it awake for */
  async dispatch (type: string, event: Record<string, unknown> = {}) {
    const waitingFor: Promise<unknown>[] = []
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...event, waitUntil: (promise: Promise<unknown>) => { waitingFor.push(promise) } })
    await Promise.all(waitingFor)
    return waitingFor.length
  }
}
// the fussy fetch above needs its server, and `this` can't be used there
const pretend: { server: FakeDataServer } = { server: undefined as unknown as FakeDataServer }

/** the page's end of a question: what the worker posts to it, at once */
function replyPort () {
  const posted: Reply[] = []
  const port = { postMessage: (message: Reply) => { posted.push(message) }, close: () => {}, onmessage: null } as unknown as MessagePort
  return { port, posted }
}

async function workerOn (address = addressForTheWorker('https://beta.example/service-worker.js', settings)) {
  const server = new FakeDataServer()
  pretend.server = server
  await publish(server)
  const scope = new PretendWorkerScope({ href: address }, server)
  startTheWorker(scope, 'build-42')
  return { scope, server }
}

async function ask (scope: PretendWorkerScope, to: string, question: string, details: unknown) {
  const { port, posted } = replyPort()
  await scope.dispatch('message', { data: { protocol: 1, to, ask: question, details }, ports: [port] })
  return posted
}

describe('starting the worker', () => {
  it('listens for the browser installing it, activating it, and a page sending it a letter', async () => {
    const { scope } = await workerOn()
    expect([...scope.listeners.keys()].sort()).toEqual(['activate', 'install', 'message'])
  })

  it('takes over from an older worker at once when it is installed, because pages and workers agree what to say in hello', async () => {
    const { scope } = await workerOn()
    expect(await scope.dispatch('install')).toBe(1)
    expect(scope.skippedWaiting).toBe(1)
  })

  it('takes charge of the pages already open when it is activated, so the first visit can use it, and keeps awake until it has', async () => {
    const { scope } = await workerOn()
    expect(await scope.dispatch('activate')).toBe(1)
    expect(scope.claimed).toBe(1)
  })
})

describe('a letter sent to the worker', () => {
  it('is answered by the front desk when it says hello', async () => {
    const { scope } = await workerOn()
    const posted = await ask(scope, 'front-desk', 'hello', { speaks: [1] })
    expect(posted.at(-1)).toEqual({ protocol: 1, kind: 'answer', details: { protocol: 1, workerBuild: 'build-42' } })
  })

  it('is answered by the search desk with results from the index files on the data server', async () => {
    const { scope } = await workerOn()
    const posted = await ask(scope, 'search-desk', 'search', { query: 'cat', start: 0, length: 10 })
    const ending = posted.at(-1) as Extract<Reply, { kind: 'answer' }>
    expect(ending.kind).toBe('answer')
    expect((ending.details as { results: { index: string, id: string }[] }).results.map(result => `${result.index}:${result.id}`)).toEqual(['alpha:cat', 'alpha:kitten', 'beta:car'])
    expect(posted.slice(0, -1).every(reply => reply.kind === 'progress')).toBe(true)
  })

  it('keeps the worker awake until the page has its ending, however long the answer takes', async () => {
    const { scope } = await workerOn()
    const { port, posted } = replyPort()
    const kept = await scope.dispatch('message', { data: { protocol: 1, to: 'search-desk', ask: 'search', details: { query: 'cat', start: 0, length: 10 } }, ports: [port] })
    expect(kept).toBe(1)
    expect(posted.at(-1)?.kind).toBe('answer')
  })

  it('costs only the small check of manifest.json the second time, since the files are kept', async () => {
    const { scope, server } = await workerOn()
    await ask(scope, 'search-desk', 'search', { query: 'cat', start: 0, length: 10 })
    server.requests = []
    const posted = await ask(scope, 'search-desk', 'search', { query: 'kitten', start: 0, length: 10 })
    expect(posted.at(-1)?.kind).toBe('answer')
    const names = server.requests.map(request => request.path.split('/').pop())
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter(name => name !== 'manifest.json')).toEqual([])
  })

  it('keeps its files in a database of its own for each index folder, so another folder\'s manifest.json is never mistaken for this one\'s', async () => {
    const { scope } = await workerOn()
    await ask(scope, 'search-desk', 'search', { query: 'cat', start: 0, length: 10 })
    const databases = (await (scope.indexedDB as IDBFactory).databases()).map(database => database.name)
    expect(databases).toEqual([`find-sign-index:${folder}`])
  })

  it('is turned down by the switchboard when it names a desk the worker doesn\'t have', async () => {
    const { scope } = await workerOn()
    expect((await ask(scope, 'sign-librarian', 'find-sign', { index: 'alpha', id: 'cat' })).at(-1)).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
  })

  it('is ignored when it brings no way to answer, since there is nobody to tell', async () => {
    const { scope } = await workerOn()
    expect(await scope.dispatch('message', { data: { protocol: 1, to: 'front-desk', ask: 'hello', details: { speaks: [1] } }, ports: [] })).toBe(0)
    expect(await scope.dispatch('message', { data: 'not even a letter' })).toBe(0)
  })
})

describe('a worker whose address has no settings', () => {
  it('still starts, but has no desks, so every question is turned down and the page uses its fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { scope } = await workerOn('https://beta.example/service-worker.js')
      expect((await ask(scope, 'front-desk', 'hello', { speaks: [1] })).at(-1)).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
      expect((await ask(scope, 'search-desk', 'search', { query: 'cat', start: 0, length: 10 })).at(-1)).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
      expect(error).toHaveBeenCalled()
      expect(String(error.mock.calls[0][0])).toMatch(/settings/i)
    } finally {
      error.mockRestore()
    }
  })

  it('still installs and activates, so the page isn\'t left with a worker that never finishes starting', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { scope } = await workerOn('https://beta.example/service-worker.js')
      await scope.dispatch('install')
      await scope.dispatch('activate')
      expect([scope.skippedWaiting, scope.claimed]).toEqual([1, 1])
    } finally {
      error.mockRestore()
    }
  })
})
