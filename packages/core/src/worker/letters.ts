// The words the page and the service worker use with each other. docs/service-worker-messages.md says
// what each one means; this file is the same thing in code. Nothing here touches the browser, so it runs
// under node as well.

/** the version of this language that the code below speaks */
export const currentProtocol = 1

/** a question, addressed to one desk (see "The envelope" in the doc) */
export type Letter = {
  protocol: number
  to: string
  ask: string
  details: unknown
}

/** why a question could not be answered. A short fixed list, so the page can decide what to do */
export type FailureReason =
  | 'no-such-actor'
  | 'no-such-question'
  | 'bad-details'
  | 'cancelled'
  | 'no-network-and-not-kept'
  | 'index-changed-too-often'
  | 'unexpected'

/** everything that can come back on the channel a question was sent with */
export type Reply =
  | { protocol: number, kind: 'progress', done: number, doing: string }
  | { protocol: number, kind: 'answer', details: unknown }
  | { protocol: number, kind: 'failed', reason: FailureReason, words: string }

/** what the page can send back down the same channel */
export type NeverMind = { protocol: number, kind: 'never-mind' }

/** the end of a MessageChannel that the worker answers on */
export type ReplyPort = Pick<MessagePort, 'postMessage' | 'close' | 'onmessage'>

/** what a desk is handed along with each question */
export type DeskHelpers = {
  /** tell the page how far along the answer is */
  progress (done: number, doing: string): void
  /** becomes aborted when the page says never-mind; a desk should stop as soon as it can */
  cancelled: AbortSignal
}

/** a desk that can be asked questions in letters */
export interface IAnswerLetters {
  /** answer one question, or throw a DeskRefusal to say why it can't */
  answer (ask: string, details: unknown, helpers: DeskHelpers): Promise<unknown>
}

/** a desk throws this to turn a question down for a reason the page understands */
export class DeskRefusal extends Error {
  constructor (readonly reason: FailureReason, words: string) {
    super(words)
    this.name = 'DeskRefusal'
  }
}

/** the front door of the worker: takes a letter and the channel to answer on */
export interface IReceiveLetters {
  /** the promise settles once the page has been given its ending */
  receive (letter: unknown, replyPort: ReplyPort): Promise<void>
}
