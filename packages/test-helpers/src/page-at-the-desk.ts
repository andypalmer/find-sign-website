// A pretend page for testing the service worker's logic under node, with no browser.
//
// It does what the real page does: for every question it makes a fresh MessageChannel, posts the letter
// (copied, as the browser would copy it, so anything that can't be copied fails here too) with one end of
// the channel, and listens on the other end. It writes down every reply, in order.
import { currentProtocol, type IReceiveLetters, type Reply } from '@find-sign/core/worker/letters.ts'

/** the reply that ended a question: an answer or a failure */
export type Ending = Extract<Reply, { kind: 'answer' | 'failed' }>

export class Question {
  /** every reply so far, in the order they came */
  replies: Reply[] = []
  /** replies that came after the question had already ended; there should never be any */
  lateReplies: Reply[] = []
  /** resolves with the reply that ended the question, or fails if none comes in time */
  finished: Promise<Ending>

  private page: MessagePort

  constructor (office: IReceiveLetters, letter: unknown, giveUpAfterMs: number) {
    const channel = new MessageChannel()
    this.page = channel.port1

    let end: (ending: Ending) => void
    let giveUp: (reason: Error) => void
    this.finished = new Promise<Ending>((resolve, reject) => { end = resolve; giveUp = reject })
    const timer = setTimeout(() => giveUp(new Error(`no ending reply within ${giveUpAfterMs}ms; replies so far: ${JSON.stringify(this.replies)}`)), giveUpAfterMs)

    let ended = false
    this.page.onmessage = ({ data }) => {
      const reply = data as Reply
      if (ended) {
        this.lateReplies.push(reply)
        return
      }
      this.replies.push(reply)
      if (reply.kind === 'answer' || reply.kind === 'failed') {
        ended = true
        clearTimeout(timer)
        end(reply)
      }
    }

    office.receive(structuredClone(letter), channel.port2)
    // the page is finished with its end once the question has ended and a moment has passed for stragglers
    this.finished.finally(() => setTimeout(() => this.page.close(), 20)).catch(() => {})
  }

  /** say never-mind down the channel */
  neverMind (): void {
    this.page.postMessage({ protocol: currentProtocol, kind: 'never-mind' })
  }

  /** wait a little, then say whether any reply arrived after the end */
  async lateRepliesAfterAWhile (): Promise<Reply[]> {
    await new Promise(resolve => setTimeout(resolve, 15))
    return this.lateReplies
  }

  /** just the progress replies, in order */
  get progress (): Extract<Reply, { kind: 'progress' }>[] {
    return this.replies.filter((reply): reply is Extract<Reply, { kind: 'progress' }> => reply.kind === 'progress')
  }
}

export class PageAtTheDesk {
  constructor (private office: IReceiveLetters, private giveUpAfterMs = 1000) {}

  /** ask a desk a question the way the real page will */
  ask (to: string, ask: string, details: unknown = {}): Question {
    return this.send({ protocol: currentProtocol, to, ask, details })
  }

  /** send anything at all, even something that is not a proper letter */
  send (letter: unknown): Question {
    return new Question(this.office, letter, this.giveUpAfterMs)
  }
}
