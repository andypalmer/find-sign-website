import { describe, expect, it, vi } from 'vitest'
import type { SearchLibrary, SearchResponse, SearchSeams } from '#lib/search/search-engine.ts'
import { FrontDesk, SearchDesk } from '../src/worker/desks.ts'
import { DeskRefusal, type IAnswerLetters } from '../src/worker/letters.ts'
import { Switchboard } from '../src/worker/switchboard.ts'
import { settingsFromTheWorkersAddress, type WorkerSettings } from '../src/worker/worker-settings.ts'
import { registerTheWorker, unregisterTheWorker, workerAsAPostbox, type IRegistrationLike, type IServiceWorkerContainerLike, type IWorkerLike } from '../src/worker-client/registration.ts'
import { createPageSearch, serviceWorkerWanted } from '../src/worker-client/page-search.ts'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const settled = async (promise: Promise<unknown>): Promise<{ value?: unknown, error?: Error }> => await promise.then(value => ({ value }), error => ({ error: error as Error }))

/** a service worker as the browser gives it to the page: it has a state, and says when the state changes */
class PretendWorker implements IWorkerLike {
  private listeners: (() => void)[] = []
  posted: { message: unknown, transfer: Transferable[] }[] = []
  constructor (public scriptURL: string, public state: string = 'installing', private onMessage: (message: unknown, transfer: Transferable[]) => void = () => {}) {}
  postMessage (message: unknown, transfer: Transferable[]) { this.posted.push({ message, transfer }); this.onMessage(message, transfer) }
  addEventListener (_type: 'statechange', listener: () => void) { this.listeners.push(listener) }
  removeEventListener (_type: 'statechange', listener: () => void) { this.listeners = this.listeners.filter(each => each !== listener) }
  become (state: string) { this.state = state; for (const listener of [...this.listeners]) listener() }
}

class PretendRegistration implements IRegistrationLike {
  private listeners: (() => void)[] = []
  unregistered = false
  constructor (public installing: IWorkerLike | null = null, public waiting: IWorkerLike | null = null, public active: IWorkerLike | null = null) {}
  addEventListener (_type: 'updatefound', listener: () => void) { this.listeners.push(listener) }
  removeEventListener (_type: 'updatefound', listener: () => void) { this.listeners = this.listeners.filter(each => each !== listener) }
  async unregister () { this.unregistered = true; return true }
  updateFound () { for (const listener of [...this.listeners]) listener() }
}

class PretendContainer implements IServiceWorkerContainerLike {
  registered: { address: string, options?: { type?: string } }[] = []
  existing: PretendRegistration[] = []
  constructor (private makeRegistration: (address: string) => PretendRegistration | Promise<PretendRegistration> = address => new PretendRegistration(null, null, new PretendWorker(new URL(address, 'https://beta.example/').href, 'activated'))) {}
  async register (address: string, options?: { type?: 'classic' | 'module' }) { this.registered.push({ address, options }); return await this.makeRegistration(address) }
  async getRegistrations () { return this.existing }
}

const pageAddress = 'https://beta.example/search?query=cat'

describe('registering the worker', () => {
  it('registers at the address it is given and gives back the worker once it is active', async () => {
    const worker = new PretendWorker('https://beta.example/service-worker.js?x=1', 'installing')
    const container = new PretendContainer(() => new PretendRegistration(worker))
    const registering = registerTheWorker(container, '/service-worker.js?x=1', { type: 'module', pageAddress })
    await sleep(5)
    expect(container.registered).toEqual([{ address: '/service-worker.js?x=1', options: { type: 'module' } }])
    worker.become('installed')
    worker.become('activating')
    worker.become('activated')
    expect(await registering).toBe(worker)
  })

  it('gives back at once a worker at that address that is already active', async () => {
    const worker = new PretendWorker('https://beta.example/service-worker.js?x=1', 'activated')
    const container = new PretendContainer(() => new PretendRegistration(null, null, worker))
    expect(await registerTheWorker(container, '/service-worker.js?x=1', { pageAddress })).toBe(worker)
  })

  it('does not take an older worker at another address for the new one, but waits for the new one', async () => {
    const old = new PretendWorker('https://beta.example/service-worker.js?old=1', 'activated')
    const fresh = new PretendWorker('https://beta.example/service-worker.js?new=1', 'installing')
    const container = new PretendContainer(() => new PretendRegistration(fresh, null, old))
    const registering = registerTheWorker(container, '/service-worker.js?new=1', { pageAddress })
    await sleep(5)
    fresh.become('activated')
    expect(await registering).toBe(fresh)
  })

  it('waits for a worker that only turns up after the registration is made', async () => {
    const registration = new PretendRegistration()
    const container = new PretendContainer(() => registration)
    const registering = registerTheWorker(container, '/service-worker.js?x=1', { pageAddress })
    await sleep(5)
    const worker = new PretendWorker('https://beta.example/service-worker.js?x=1', 'installing')
    registration.installing = worker
    registration.updateFound()
    worker.become('activated')
    expect(await registering).toBe(worker)
  })

  it('fails, saying how long it waited, when the worker isn\'t ready in time', async () => {
    const container = new PretendContainer(() => new PretendRegistration(new PretendWorker('https://beta.example/service-worker.js?x=1', 'installing')))
    const result = await settled(registerTheWorker(container, '/service-worker.js?x=1', { pageAddress, timeoutMs: 30 }))
    expect(result.error?.message).toMatch(/30 ms/)
  })

  it('fails when the worker is thrown away before it is ready', async () => {
    const worker = new PretendWorker('https://beta.example/service-worker.js?x=1', 'installing')
    const container = new PretendContainer(() => new PretendRegistration(worker))
    const registering = settled(registerTheWorker(container, '/service-worker.js?x=1', { pageAddress }))
    await sleep(5)
    worker.become('redundant')
    expect((await registering).error?.message).toMatch(/replaced|redundant|thrown away/i)
  })

  it('fails when the browser refuses to register it', async () => {
    const container = new PretendContainer(() => Promise.reject(new Error('the script could not be fetched')))
    expect((await settled(registerTheWorker(container, '/service-worker.js', { pageAddress }))).error?.message).toMatch(/could not be fetched/)
  })
})

describe('unregistering the worker', () => {
  it('unregisters the registrations of our worker script, and leaves other scripts alone', async () => {
    const ours = new PretendRegistration(null, null, new PretendWorker('https://beta.example/service-worker.js?data=1', 'activated'))
    const oursStillInstalling = new PretendRegistration(new PretendWorker('https://beta.example/service-worker.js?data=2'))
    const other = new PretendRegistration(null, null, new PretendWorker('https://beta.example/other-worker.js', 'activated'))
    const container = new PretendContainer()
    container.existing = [ours, oursStillInstalling, other]
    expect(await unregisterTheWorker(container)).toBe(2)
    expect([ours.unregistered, oursStillInstalling.unregistered, other.unregistered]).toEqual([true, true, false])
  })

  it('says none when there is nothing to unregister', async () => {
    expect(await unregisterTheWorker(new PretendContainer())).toBe(0)
  })
})

describe('posting letters to the worker', () => {
  it('posts the letter with the end of its channel handed over, as the browser needs', () => {
    const worker = new PretendWorker('https://beta.example/service-worker.js', 'activated')
    const channel = new MessageChannel()
    const letter = { protocol: 1, to: 'front-desk', ask: 'hello', details: { speaks: [1] } }
    workerAsAPostbox(worker).post(letter, channel.port2)
    expect(worker.posted).toEqual([{ message: letter, transfer: [channel.port2] }])
    channel.port1.close()
  })
})

describe('serviceWorkerWanted()', () => {
  it('is on for on, true, 1 and yes, in any case, with spaces around', () => {
    for (const on of ['on', 'ON', 'On', 'true', 'TRUE', '1', 'yes', 'Yes', ' on ']) expect(serviceWorkerWanted(on), on).toBe(true)
  })

  it('is off when it isn\'t set, and for anything else, so a typo never turns it on', () => {
    for (const off of [undefined, '', 'off', 'false', '0', 'no', 'onn', 'enabled', ' ']) expect(serviceWorkerWanted(off), String(off)).toBe(false)
  })
})

// ---- the page's search ----
const settings: WorkerSettings = {
  dataUrl: 'https://data.example/collections/find-sign/raw/', indexName: 'v2', indexes: ['alpha'],
  vectorLibraryUrl: 'https://data.example/collections/wordvec/raw/test-vectors'
}
const vector = (...numbers: number[]) => new Float32Array(numbers)
const known = { cat: vector(1, 0, 0, 0) }
const library = { alpha: { entries: [{ id: 'cat', words: ['cat'], tags: [], vectors: [known.cat], indexURL: 'https://data.test/alpha', load: async () => ({ id: 'cat', title: 'CAT', body: '', words: ['cat'], tags: [], media: [] }) }] } } as unknown as SearchLibrary
const seams: SearchSeams = { knownVectors: async () => known, lookupVector: async () => undefined, loadLibrary: async () => library, indexNameOf: () => 'alpha' }
const direct: SearchResponse = { totalResults: 1, results: [{ index: 'alpha', id: 'from-the-fallback', title: 'X', body: '', words: [], media: [], tags: [] }] as any }

/** a worker that answers letters with a real switchboard, in the same process */
function workerAnswering (desks: Record<string, IAnswerLetters>, address: string, state = 'activated') {
  return new PretendWorker(new URL(address, 'https://beta.example/').href, state, (message, transfer) => {
    void new Switchboard(desks).receive(structuredClone(message), transfer[0] as MessagePort)
  })
}
const workingDesks = () => ({ 'front-desk': new FrontDesk('test'), 'search-desk': new SearchDesk(seams) })

function pageSearchWith (overrides: Partial<Parameters<typeof createPageSearch>[0]> = {}, container: PretendContainer | null = new PretendContainer(address => new PretendRegistration(null, null, workerAnswering(workingDesks(), address)))) {
  const fallback = vi.fn(async (_query: string, _start: number, _length: number, _options?: unknown) => direct)
  const log = vi.fn()
  const search = createPageSearch({ wanted: true, settings, container: container ?? undefined, scriptAddress: '/service-worker.js', fallback, pageAddress, log, ...overrides })
  return { search, container, fallback, log }
}

describe('the page\'s search, with the service worker switched on', () => {
  it('registers the worker at an address that carries the settings, once, and has the worker answer', async () => {
    const { search, container, fallback } = pageSearchWith()
    const response = await search.search('cat', 0, 10)
    expect(response.results.map(result => result.id)).toEqual(['cat'])
    expect(fallback).not.toHaveBeenCalled()
    await search.search('cat', 0, 10)
    expect(container!.registered).toHaveLength(1)
    expect(settingsFromTheWorkersAddress(new URL(container!.registered[0].address, pageAddress).href)).toEqual(settings)
    expect(container!.registered[0].address.startsWith('/service-worker.js?')).toBe(true)
  })

  it('starts registering when told to, before anyone searches, and not again for a search or another start', async () => {
    const { search, container } = pageSearchWith()
    search.start()
    search.start()
    await sleep(5)
    expect(container!.registered).toHaveLength(1)
    await search.search('cat', 0, 10)
    expect(container!.registered).toHaveLength(1)
  })

  it('passes the module type on when asked, as a worker with imports needs', async () => {
    const { search, container } = pageSearchWith({ type: 'module' })
    await search.search('cat', 0, 10)
    expect(container!.registered[0].options).toEqual({ type: 'module' })
  })

  it('uses the direct search, without throwing, when the worker can\'t be made ready in time, and doesn\'t try again on this page', async () => {
    const container = new PretendContainer(() => new PretendRegistration(new PretendWorker('https://beta.example/service-worker.js', 'installing')))
    const { search, fallback, log } = pageSearchWith({ registrationTimeoutMs: 30 }, container)
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(container.registered).toHaveLength(1)
    expect(log).toHaveBeenCalled()
  })

  it('uses the direct search when the browser refuses to register the worker', async () => {
    const { search, fallback } = pageSearchWith({}, new PretendContainer(() => Promise.reject(new Error('insecure context'))))
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('uses the direct search when the worker has no search desk, as an old one wouldn\'t', async () => {
    const desks = { 'front-desk': new FrontDesk('old') }
    const { search, fallback } = pageSearchWith({}, new PretendContainer(address => new PretendRegistration(null, null, workerAnswering(desks, address))))
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('shows the problem the worker reports when the network is down and nothing is kept, rather than searching directly', async () => {
    const desks = { 'front-desk': new FrontDesk('b'), 'search-desk': { answer: async () => { throw new DeskRefusal('no-network-and-not-kept', 'offline') } } as IAnswerLetters }
    const { search, fallback } = pageSearchWith({}, new PretendContainer(address => new PretendRegistration(null, null, workerAnswering(desks, address))))
    expect((await settled(search.search('cat', 0, 10))).error).toMatchObject({ reason: 'no-network-and-not-kept' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses the direct search when the browser has no service workers to give', async () => {
    const { search, fallback } = pageSearchWith({}, null)
    search.start()
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})

describe('the page\'s search, with the service worker switched off', () => {
  it('searches directly and registers nothing', async () => {
    const { search, container, fallback } = pageSearchWith({ wanted: false })
    search.start()
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(container!.registered).toEqual([])
  })

  it('unregisters a worker left from when it was switched on, once however often it is told to start or search', async () => {
    const left = new PretendRegistration(null, null, new PretendWorker('https://beta.example/service-worker.js?data=1', 'activated'))
    const container = new PretendContainer()
    container.existing = [left]
    const spy = vi.spyOn(container, 'getRegistrations')
    const { search } = pageSearchWith({ wanted: false }, container)
    search.start()
    search.start()
    await search.search('cat', 0, 10)
    await sleep(5)
    expect(left.unregistered).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('carries on searching directly, and says so, when unregistering fails', async () => {
    const container = new PretendContainer()
    container.getRegistrations = async () => { throw new Error('the browser said no') }
    const { search, log } = pageSearchWith({ wanted: false }, container)
    search.start()
    await sleep(5)
    expect((await search.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(log).toHaveBeenCalled()
  })
})
