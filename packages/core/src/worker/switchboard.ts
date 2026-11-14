import {
  currentProtocol, DeskRefusal,
  type FailureReason, type IAnswerLetters, type IReceiveLetters, type Letter, type ReplyPort
} from './letters.ts'

/** the page's end of one question: sends replies, makes sure the question ends exactly once, hears never-mind */
class OneQuestionsReplies {
  private over = false
  readonly cancelled = new AbortController()

  constructor (private port: ReplyPort) {
    port.onmessage = ({ data }) => {
      if ((data as { kind?: unknown } | null)?.kind === 'never-mind') this.cancelled.abort()
    }
  }

  progress (done: number, doing: string): void {
    if (!this.over) this.port.postMessage({ protocol: currentProtocol, kind: 'progress', done, doing })
  }

  answer (details: unknown): void {
    if (this.over) return
    if (this.cancelled.signal.aborted) return this.fail('cancelled', 'the page said never-mind')
    try {
      this.port.postMessage({ protocol: currentProtocol, kind: 'answer', details })
    } catch (error) {
      // most likely something in the answer that can't be copied to the page, such as a function
      this.fail('unexpected', `the answer could not be sent: ${(error as Error).message}`)
      return
    }
    this.finish()
  }

  fail (reason: FailureReason, words: string): void {
    if (this.over) return
    this.port.postMessage({ protocol: currentProtocol, kind: 'failed', reason, words })
    this.finish()
  }

  private finish (): void {
    this.over = true
    this.port.close()
  }
}

/** looks at a letter's shape; a Letter if it is one, otherwise why not */
function readLetter (letter: unknown): Letter | string {
  if (typeof letter !== 'object' || letter === null) return 'a letter must be an object'
  const { protocol, to, ask } = letter as Record<string, unknown>
  if (typeof protocol !== 'number') return 'a letter needs a protocol number'
  if (typeof to !== 'string' || to === '') return 'a letter needs a "to"'
  if (typeof ask !== 'string' || ask === '') return 'a letter needs an "ask"'
  return letter as Letter
}

/**
 * Takes each letter that arrives, works out which desk it is for, and sends that desk's answer back on the
 * channel that came with the letter. Whatever happens, the page gets exactly one ending: an answer or a failure.
 */
export class Switchboard implements IReceiveLetters {
  constructor (private desks: Record<string, IAnswerLetters>) {}

  receive (letter: unknown, replyPort: ReplyPort): void {
    const replies = new OneQuestionsReplies(replyPort)
    this.passItOn(letter, replies).catch(error => {
      replies.fail('unexpected', `the switchboard broke: ${(error as Error).message}`)
    })
  }

  private async passItOn (rawLetter: unknown, replies: OneQuestionsReplies): Promise<void> {
    const letter = readLetter(rawLetter)
    if (typeof letter === 'string') return replies.fail('bad-details', letter)
    if (letter.protocol !== currentProtocol) {
      return replies.fail('no-such-question', `this worker speaks protocol ${currentProtocol}, not ${letter.protocol}`)
    }
    if (!Object.hasOwn(this.desks, letter.to)) return replies.fail('no-such-actor', `there is no desk called "${letter.to}"`)

    try {
      const answer = await this.desks[letter.to].answer(letter.ask, letter.details, {
        progress: (done, doing) => replies.progress(done, doing),
        cancelled: replies.cancelled.signal
      })
      replies.answer(answer)
    } catch (error) {
      if (replies.cancelled.signal.aborted) return replies.fail('cancelled', 'the page said never-mind')
      if (error instanceof DeskRefusal) return replies.fail(error.reason, error.message)
      replies.fail('unexpected', `the desk broke: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
