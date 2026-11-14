import { describe, expect, it, vi } from 'vitest'
import type { SearchResponse, SearchLibrary, SearchSeams } from '#lib/search/search-engine.ts'
import { FrontDesk, SearchDesk } from '../src/worker/desks.ts'
import { DeskRefusal, type DeskHelpers, type FailureReason, type IAnswerLetters, type Letter } from '../src/worker/letters.ts'
import { Switchboard } from '../src/worker/switchboard.ts'
import { Messenger, WorkerDidNotAnswer, WorkerRefused, type IAskTheWorker, type IPostLetters } from '../src/worker-client/messenger.ts'
import { SearchViaTheWorker } from '../src/worker-client/search-via-the-worker.ts'

/** a desk whose answers are whatever a test needs; it writes down every question it is asked */
class ScriptedDesk implements IAnswerLetters {
  asked: { ask: string, details: unknown }[] = []
  constructor (private script: (ask: string, details: unknown, helpers: DeskHelpers) => unknown | Promise<unknown> = () => 'ok') {}
  async answer (ask: string, details: unknown, helpers: DeskHelpers) {
    this.asked.push({ ask, details })
    return await this.script(ask, details, helpers)
  }
}

/** the worker, in the same process: a letter and its channel go straight to a real switchboard */
function workerWith (desks: Record<string, IAnswerLetters>) {
  const letters: Letter[] = []
  const worker: IPostLetters = {
    post (letter, replyPort) {
      letters.push(structuredClone(letter)) // as the browser copies it
      void new Switchboard(desks).receive(structuredClone(letter), replyPort)
    }
  }
  return { worker, letters }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const refusal = async (promise: Promise<unknown>) => await promise.then(() => undefined, error => error as Error)

describe('the messenger', () => {
  it('gives the answer to a question, addressed to the desk it was for', async () => {
    const desk = new ScriptedDesk(() => ({ found: true }))
    const { worker, letters } = workerWith({ 'sign-librarian': desk })
    expect(await new Messenger(worker).ask('sign-librarian', 'find-sign', { index: 'alpha', id: 'one' })).toEqual({ found: true })
    expect(letters).toEqual([{ protocol: 1, to: 'sign-librarian', ask: 'find-sign', details: { index: 'alpha', id: 'one' } }])
    expect(desk.asked).toEqual([{ ask: 'find-sign', details: { index: 'alpha', id: 'one' } }])
  })

  it('gives each progress note to whoever asked to hear them, in order, before the answer', async () => {
    const desk = new ScriptedDesk((_ask, _details, { progress }) => { progress(0.2, 'one'); progress(0.6, 'two'); return 'done' })
    const heard: [number, string][] = []
    const answer = await new Messenger(workerWith({ d: desk }).worker).ask('d', 'x', {}, { onProgress: (done, doing) => heard.push([done, doing]) })
    expect(answer).toBe('done')
    expect(heard).toEqual([[0.2, 'one'], [0.6, 'two']])
  })

  it('fails with the worker\'s reason and words when the worker says it can\'t', async () => {
    const desk = new ScriptedDesk(() => { throw new DeskRefusal('no-network-and-not-kept', 'the data server is out of reach') })
    const error = await refusal(new Messenger(workerWith({ d: desk }).worker).ask('d', 'x', {}))
    expect(error).toBeInstanceOf(WorkerRefused)
    expect(error).toMatchObject({ reason: 'no-network-and-not-kept', message: 'the data server is out of reach' })
  })

  it('fails with the switchboard\'s reason when no desk has the name', async () => {
    const error = await refusal(new Messenger(workerWith({}).worker).ask('nobody', 'x', {}))
    expect(error).toMatchObject({ reason: 'no-such-actor' })
  })

  it('keeps questions apart, so replies never cross when several are asked together', async () => {
    const desk = new ScriptedDesk(async (_ask, details) => { await sleep((details as { wait: number }).wait); return details })
    const messenger = new Messenger(workerWith({ d: desk }).worker)
    const answers = await Promise.all([messenger.ask('d', 'x', { wait: 30, name: 'slow' }), messenger.ask('d', 'x', { wait: 1, name: 'fast' }), messenger.ask('d', 'x', { wait: 10, name: 'middle' })])
    expect(answers.map(answer => (answer as { name: string }).name)).toEqual(['slow', 'fast', 'middle'])
  })

  it('tells the worker never-mind when the caller cancels, and fails as cancelled at once', async () => {
    let sawCancel = false
    const desk = new ScriptedDesk(async (_ask, _details, { cancelled }) => {
      await new Promise(resolve => cancelled.addEventListener('abort', resolve))
      sawCancel = true
      return 'too late'
    })
    const controller = new AbortController()
    const question = new Messenger(workerWith({ d: desk }).worker).ask('d', 'x', {}, { signal: controller.signal })
    await sleep(10)
    controller.abort()
    expect(await refusal(question)).toMatchObject({ reason: 'cancelled' })
    await sleep(20)
    expect(sawCancel).toBe(true)
  })

  it('does not even post the letter when it is already cancelled', async () => {
    const { worker, letters } = workerWith({ d: new ScriptedDesk() })
    const controller = new AbortController()
    controller.abort()
    expect(await refusal(new Messenger(worker).ask('d', 'x', {}, { signal: controller.signal }))).toMatchObject({ reason: 'cancelled' })
    expect(letters).toEqual([])
  })

  it('gives up when the worker is silent for too long, and tells it never-mind so it can stop', async () => {
    let sawCancel = false
    const desk = new ScriptedDesk(async (_ask, _details, { cancelled }) => {
      await new Promise(resolve => cancelled.addEventListener('abort', resolve))
      sawCancel = true
    })
    const error = await refusal(new Messenger(workerWith({ d: desk }).worker, { silenceTimeoutMs: 40 }).ask('d', 'x', {}))
    expect(error).toBeInstanceOf(WorkerDidNotAnswer)
    await sleep(20)
    expect(sawCancel).toBe(true)
  })

  it('counts a progress note as a sign of life, so a slow answer that keeps reporting is waited for', async () => {
    const desk = new ScriptedDesk(async (_ask, _details, { progress }) => {
      for (let step = 1; step <= 5; step++) { await sleep(25); progress(step / 10, 'working') }
      return 'finally'
    })
    expect(await new Messenger(workerWith({ d: desk }).worker, { silenceTimeoutMs: 60 }).ask('d', 'x', {})).toBe('finally')
  })

  it('lets one question have its own silence limit', async () => {
    const desk = new ScriptedDesk(() => sleep(80))
    const messenger = new Messenger(workerWith({ d: desk }).worker, { silenceTimeoutMs: 1000 })
    expect(await refusal(messenger.ask('d', 'x', {}, { silenceTimeoutMs: 20 }))).toBeInstanceOf(WorkerDidNotAnswer)
  })

  it('fails as not answered when the worker can\'t be posted to', async () => {
    const worker: IPostLetters = { post () { throw new Error('the worker has gone') } }
    const error = await refusal(new Messenger(worker).ask('d', 'x', {}))
    expect(error).toBeInstanceOf(WorkerDidNotAnswer)
    expect(error!.message).toMatch(/gone/)
  })

  it('ignores replies that are not replies', async () => {
    const worker: IPostLetters = {
      post (_letter, port) {
        port.postMessage('noise')
        port.postMessage(null)
        port.postMessage({ protocol: 1, kind: 'mystery' })
        port.postMessage({ protocol: 1, kind: 'answer', details: 'the real one' })
      }
    }
    expect(await new Messenger(worker).ask('d', 'x', {})).toBe('the real one')
  })
})

// ---- the page's search, on the real desks ----
const vector = (...numbers: number[]) => new Float32Array(numbers)
const known = { cat: vector(1, 0, 0, 0), kitten: vector(0.9, 0.1, 0, 0) }
const entry = (id: string, vectors: Float32Array[]) => ({ id, words: [id], tags: [], vectors, indexURL: 'https://data.test/alpha', load: async () => ({ id, title: id.toUpperCase(), body: '', words: [id], tags: [], media: [] }) })
const library = { alpha: { entries: [entry('cat', [known.cat]), entry('kitten', [known.kitten])] } } as unknown as SearchLibrary
const seams: SearchSeams = { knownVectors: async () => known, lookupVector: async () => undefined, loadLibrary: async () => library, indexNameOf: () => 'alpha' }
const direct: SearchResponse = { totalResults: 1, results: [{ index: 'alpha', id: 'from-the-fallback', title: 'X', body: '', words: [], media: [], tags: [] }] as any }

function pageWith (desks: Record<string, IAnswerLetters>, options: { silenceTimeoutMs?: number, log?: (words: string) => void } = {}) {
  const { worker, letters } = workerWith(desks)
  const fallback = vi.fn(async () => direct)
  const log = options.log ?? vi.fn()
  const messenger = new Messenger(worker, { silenceTimeoutMs: options.silenceTimeoutMs ?? 1000 })
  return { page: new SearchViaTheWorker(messenger, fallback, { log, helloTimeoutMs: options.silenceTimeoutMs ?? 1000 }), fallback, letters, log: log as ReturnType<typeof vi.fn> }
}
const workingDesks = () => ({ 'front-desk': new FrontDesk('test-build'), 'search-desk': new SearchDesk(seams) })
const searchLetters = (letters: Letter[]) => letters.filter(letter => letter.ask === 'search')
const helloLetters = (letters: Letter[]) => letters.filter(letter => letter.ask === 'hello')

describe('the page\'s search, asking the worker', () => {
  it('says hello first, then gets the search answered by the worker, not the fallback', async () => {
    const { page, fallback, letters } = pageWith(workingDesks())
    const response = await page.search('cat', 0, 10)
    expect(response.results.map(result => result.id)).toEqual(['cat', 'kitten'])
    expect(letters.map(letter => letter.ask)).toEqual(['hello', 'search'])
    expect(letters[0].details).toEqual({ speaks: [1] })
    expect(letters[1].details).toEqual({ query: 'cat', start: 0, length: 10 })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('says hello only once, however many searches there are, even when the first ones start together', async () => {
    const { page, letters } = pageWith(workingDesks())
    await Promise.all([page.search('cat', 0, 10), page.search('kitten', 0, 10), page.search('cat', 10, 10)])
    await page.search('cat', 0, 1)
    expect(helloLetters(letters)).toHaveLength(1)
    expect(searchLetters(letters)).toHaveLength(4)
  })

  it('passes the worker\'s progress notes on', async () => {
    const { page } = pageWith(workingDesks())
    const heard: string[] = []
    await page.search('cat', 0, 10, { onProgress: (_done, doing) => heard.push(doing) })
    expect(heard.length).toBeGreaterThan(0)
  })

  it('uses the fallback for every search when the worker has no version in common, and never asks it to search', async () => {
    const { page, fallback, letters } = pageWith({ 'front-desk': new FrontDesk('old', [7]), 'search-desk': new SearchDesk(seams) })
    expect((await page.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    await page.search('kitten', 0, 10)
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(searchLetters(letters)).toEqual([])
    expect(helloLetters(letters)).toHaveLength(1)
  })

  it('uses the fallback when there is no worker at all, without saying hello to anyone', async () => {
    const fallback = vi.fn(async () => direct)
    const page = new SearchViaTheWorker(undefined, fallback)
    expect(await page.search('cat', 3, 7)).toBe(direct)
    expect(fallback).toHaveBeenCalledWith('cat', 3, 7, {})
  })

  it('uses the fallback when the worker never says hello back, and doesn\'t ask again on this page', async () => {
    const { page, fallback, letters } = pageWith({ 'front-desk': new ScriptedDesk(() => sleep(200)), 'search-desk': new SearchDesk(seams) }, { silenceTimeoutMs: 30 })
    await page.search('cat', 0, 10)
    await page.search('cat', 0, 10)
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(searchLetters(letters)).toEqual([])
    expect(helloLetters(letters)).toHaveLength(1)
  })

  it.each<[FailureReason]>([['bad-details'], ['unexpected']])('uses the fallback for this search when the worker says %s, and still asks the worker next time', async (reason) => {
    let first = true
    const search = new ScriptedDesk(async (ask, details, helpers) => {
      if (first) { first = false; throw new DeskRefusal(reason, 'one bad day') }
      return await new SearchDesk(seams).answer(ask, details, helpers)
    })
    const { page, fallback, log } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': search })
    expect((await page.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect((await page.search('cat', 0, 10)).results[0].id).toBe('cat')
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalled()
  })

  it.each<[FailureReason]>([['no-such-actor'], ['no-such-question']])('uses the fallback, and stops asking the worker on this page, when it says %s', async (reason) => {
    const search = new ScriptedDesk(() => { throw new DeskRefusal(reason, 'not here') })
    const { page, fallback, letters } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': search })
    await page.search('cat', 0, 10)
    await page.search('cat', 0, 10)
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(searchLetters(letters)).toHaveLength(1)
  })

  it('uses the fallback when the worker stops answering, and then stops asking it on this page', async () => {
    const hang = new ScriptedDesk(() => sleep(300))
    const { page, fallback, letters } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': hang }, { silenceTimeoutMs: 40 })
    await page.search('cat', 0, 10)
    await page.search('cat', 0, 10)
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(searchLetters(letters)).toHaveLength(1)
  })

  it.each<[FailureReason]>([['no-network-and-not-kept'], ['index-changed-too-often']])('does not use the fallback when the worker says %s, because the page shows that problem', async (reason) => {
    const search = new ScriptedDesk(() => { throw new DeskRefusal(reason, 'that problem') })
    const { page, fallback } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': search })
    const error = await refusal(page.search('cat', 0, 10))
    expect(error).toBeInstanceOf(WorkerRefused)
    expect(error).toMatchObject({ reason })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('is cancelled, and does not use the fallback, when the caller cancels', async () => {
    const slow = new ScriptedDesk(async (_ask, _details, { cancelled }) => { await new Promise(resolve => cancelled.addEventListener('abort', resolve)) })
    const { page, fallback } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': slow })
    const controller = new AbortController()
    const search = page.search('cat', 0, 10, { signal: controller.signal })
    await sleep(15)
    controller.abort()
    const error = await refusal(search)
    expect(error).toBeDefined()
    expect(error!.name === 'AbortError' || (error as WorkerRefused).reason === 'cancelled').toBe(true)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses the fallback when the worker\'s answer isn\'t a search answer at all', async () => {
    const search = new ScriptedDesk(() => ({ nonsense: true }))
    const { page, fallback } = pageWith({ 'front-desk': new FrontDesk('b'), 'search-desk': search })
    expect((await page.search('cat', 0, 10)).results[0].id).toBe('from-the-fallback')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('hands the caller\'s cancel signal on to the fallback, so a direct search can be cancelled too', async () => {
    const fallback = vi.fn(async (_query: string, _start: number, _length: number, _options?: unknown) => direct)
    const controller = new AbortController()
    await new SearchViaTheWorker(undefined, fallback).search('cat', 0, 10, { signal: controller.signal })
    expect(fallback.mock.calls[0][3]).toMatchObject({ signal: controller.signal })
  })
})
