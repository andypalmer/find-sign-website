import { describe, it, expect } from 'vitest'
import { PageAtTheDesk } from '@find-sign/test-helpers/page-at-the-desk.ts'
import { Switchboard } from '../src/worker/switchboard.ts'
import { DeskRefusal, type DeskHelpers, type IAnswerLetters } from '../src/worker/letters.ts'

// a desk whose answers are whatever a test needs; it writes down every question it is asked
class TestDesk implements IAnswerLetters {
  asked: { ask: string, details: unknown }[] = []
  constructor (private whatToDo: (ask: string, details: unknown, helpers: DeskHelpers) => unknown = () => 'ok') {}
  async answer (ask: string, details: unknown, helpers: DeskHelpers) {
    this.asked.push({ ask, details })
    return await this.whatToDo(ask, details, helpers)
  }
}

function officeWith (desks: Record<string, IAnswerLetters>) {
  return new PageAtTheDesk(new Switchboard(desks), 500)
}

describe('the switchboard', () => {
  it('hands a question to the desk it is addressed to, and gives the page the desk\'s answer', async () => {
    const librarian = new TestDesk(() => ({ found: true }))
    const searcher = new TestDesk()
    const question = officeWith({ 'sign-librarian': librarian, 'search-desk': searcher }).ask('sign-librarian', 'find-sign', { index: 'alpha', id: 'one' })

    expect(await question.finished).toMatchObject({ kind: 'answer', details: { found: true } })
    expect(librarian.asked).toEqual([{ ask: 'find-sign', details: { index: 'alpha', id: 'one' } }])
    expect(searcher.asked).toEqual([])
    expect(await question.lateRepliesAfterAWhile()).toEqual([])
  })

  it('gives back a promise that settles once the page has its ending, so a worker can stay awake until then', async () => {
    const posted: { kind: string, details?: unknown }[] = []
    const port = { postMessage: (message: { kind: string }) => { posted.push(message) }, close: () => {}, onmessage: null } as unknown as MessagePort
    const board = new Switchboard({ 'search-desk': new TestDesk(async () => { await new Promise(resolve => setTimeout(resolve, 10)); return 'late' }) })

    const done = board.receive({ protocol: 1, to: 'search-desk', ask: 'search', details: {} }, port)
    expect(done).toBeInstanceOf(Promise)
    expect(posted).toEqual([])
    await done
    expect(posted.at(-1)).toMatchObject({ kind: 'answer', details: 'late' })
  })

  it('settles its promise when it turns a letter down, too, after telling the page', async () => {
    const posted: { kind: string, reason?: string }[] = []
    const port = { postMessage: (message: { kind: string }) => { posted.push(message) }, close: () => {}, onmessage: null } as unknown as MessagePort
    const done = new Switchboard({}).receive({ protocol: 1, to: 'nobody-here', ask: 'x', details: {} }, port)
    expect(done).toBeInstanceOf(Promise)
    await done
    expect(posted.at(-1)).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
  })

  it('tells the page when no desk has the name on the letter', async () => {
    const desk = new TestDesk()
    const ending = await officeWith({ 'search-desk': desk }).ask('nobody-here', 'search').finished

    expect(ending).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
    expect(desk.asked).toEqual([])
  })

  it('does not mistake the names every object has, like "constructor", for desks', async () => {
    const office = officeWith({ 'search-desk': new TestDesk() })

    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(await office.ask(name, 'search').finished).toMatchObject({ kind: 'failed', reason: 'no-such-actor' })
    }
  })

  it('passes on the reason when a desk turns a question down', async () => {
    const desk = new TestDesk(() => { throw new DeskRefusal('bad-details', 'the query must be text') })
    const ending = await officeWith({ 'search-desk': desk }).ask('search-desk', 'search', { query: 7 }).finished

    expect(ending).toMatchObject({ kind: 'failed', reason: 'bad-details', words: 'the query must be text' })
  })

  it('tells the page "unexpected" when a desk breaks in some other way, instead of leaving it waiting', async () => {
    const desk = new TestDesk(() => { throw new Error('something exploded') })
    const ending = await officeWith({ 'search-desk': desk }).ask('search-desk', 'search').finished

    expect(ending).toMatchObject({ kind: 'failed', reason: 'unexpected' })
  })

  it('passes on a desk\'s progress notes in order, before the answer', async () => {
    const desk = new TestDesk((_ask, _details, { progress }) => {
      progress(0.25, 'getting the word list')
      progress(0.75, 'ranking')
      return 'done'
    })
    const question = officeWith({ 'search-desk': desk }).ask('search-desk', 'search')
    await question.finished

    expect(question.progress.map(({ done, doing }) => [done, doing])).toEqual([[0.25, 'getting the word list'], [0.75, 'ranking']])
    expect(question.replies.at(-1)).toMatchObject({ kind: 'answer', details: 'done' })
  })

  it('tells the desk when the page says never-mind, and ends with "cancelled" even if the desk then answers', async () => {
    let deskWasToldToStop = false
    const desk = new TestDesk(async (_ask, _details, { cancelled }) => {
      await new Promise(resolve => cancelled.addEventListener('abort', resolve))
      deskWasToldToStop = cancelled.aborted
      return 'too late to matter'
    })
    const question = officeWith({ 'search-desk': desk }).ask('search-desk', 'search')
    question.neverMind()

    expect(await question.finished).toMatchObject({ kind: 'failed', reason: 'cancelled' })
    expect(deskWasToldToStop).toBe(true)
    expect(await question.lateRepliesAfterAWhile()).toEqual([])
  })

  it('fails the question, rather than going quiet, when the answer cannot be sent', async () => {
    // a function can't be copied to the page
    const desk = new TestDesk(() => ({ run: () => 'nope' }))
    const ending = await officeWith({ 'search-desk': desk }).ask('search-desk', 'search').finished

    expect(ending).toMatchObject({ kind: 'failed', reason: 'unexpected' })
  })

  it('answers something that is not a proper letter with "bad-details"', async () => {
    const desk = new TestDesk()
    const office = officeWith({ 'search-desk': desk })

    for (const notALetter of ['hello', 42, null, {}, { protocol: 1, to: 'search-desk' }, { protocol: 1, ask: 'search' }]) {
      expect(await office.send(notALetter).finished).toMatchObject({ kind: 'failed', reason: 'bad-details' })
    }
    expect(desk.asked).toEqual([])
  })

  it('refuses a letter in a version of the language it does not know', async () => {
    const desk = new TestDesk()
    const ending = await officeWith({ 'search-desk': desk }).send({ protocol: 999, to: 'search-desk', ask: 'search', details: {} }).finished

    expect(ending).toMatchObject({ kind: 'failed', reason: 'no-such-question' })
    expect(desk.asked).toEqual([])
  })
})
