// The page's messenger: asks the service worker one question at a time, the way docs/service-worker-messages.md
// says. Each question gets a channel of its own, so a reply can only ever belong to the question it was sent
// with. It gives up on a worker that goes silent, tells the worker never-mind when the caller cancels, and turns
// every way a question can fail into one of two errors the rest of the page can tell apart.
import { currentProtocol, type FailureReason, type Letter, type Reply } from '#lib/worker/letters.ts'

/** where letters are posted: the service worker, as the browser gives it to the page */
export interface IPostLetters {
  post (letter: Letter, replyPort: MessagePort): void
}

export type AskOptions = {
  /** abort to say never-mind: the worker is told, and the question fails as cancelled */
  signal?: AbortSignal,
  /** told of each progress note the worker sends */
  onProgress?: (done: number, doing: string) => void,
  /** how long the worker may be silent before we give up on it (progress notes count as a sign of life) */
  silenceTimeoutMs?: number,
}

/** something the page can ask the worker questions of */
export interface IAskTheWorker {
  ask<Answer = unknown> (to: string, ask: string, details: unknown, options?: AskOptions): Promise<Answer>
}

/** the worker answered, with a failure: the reason is one of the contract's fixed list */
export class WorkerRefused extends Error {
  readonly reason: FailureReason
  constructor (reason: FailureReason, words: string) {
    super(words)
    this.name = 'WorkerRefused'
    this.reason = reason
  }
}

/** the worker never answered: it was silent too long, or it couldn't be reached */
export class WorkerDidNotAnswer extends Error {
  constructor (words: string) {
    super(words)
    this.name = 'WorkerDidNotAnswer'
  }
}

/** how long a worker may be silent, unless a question says otherwise. The first visit has a lot to fetch, but the worker reports as it goes */
const defaultSilenceMs = 20_000

export class Messenger implements IAskTheWorker {
  private worker: IPostLetters
  private silenceTimeoutMs: number

  constructor (worker: IPostLetters, options: { silenceTimeoutMs?: number } = {}) {
    this.worker = worker
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? defaultSilenceMs
  }

  ask<Answer = unknown> (to: string, ask: string, details: unknown, options: AskOptions = {}): Promise<Answer> {
    const { signal, onProgress } = options
    const silenceMs = options.silenceTimeoutMs ?? this.silenceTimeoutMs
    if (signal?.aborted) return Promise.reject(new WorkerRefused('cancelled', 'the question was cancelled before it was asked'))

    return new Promise<Answer>((resolve, reject) => {
      const channel = new MessageChannel()
      const page = channel.port1
      let over = false
      let silence: ReturnType<typeof setTimeout> | undefined

      /** ends the question exactly once; says never-mind to the worker if it is still working on it */
      const finish = (settle: () => void, neverMind: boolean) => {
        if (over) return
        over = true
        clearTimeout(silence)
        signal?.removeEventListener('abort', cancelled)
        if (neverMind) {
          try { page.postMessage({ protocol: currentProtocol, kind: 'never-mind' }) } catch { /* the worker is gone anyway */ }
        }
        page.close()
        settle()
      }
      const waitForSomeSignOfLife = () => {
        clearTimeout(silence)
        silence = setTimeout(() => finish(() => reject(new WorkerDidNotAnswer(`the worker was silent for ${silenceMs} ms`)), true), silenceMs)
      }
      const cancelled = () => finish(() => reject(new WorkerRefused('cancelled', 'the page cancelled the question')), true)

      page.onmessage = ({ data }) => {
        const reply = data as Partial<Reply> | null
        if (over || typeof reply !== 'object' || reply === null) return
        if (reply.kind === 'progress') {
          waitForSomeSignOfLife()
          try { onProgress?.(reply.done as number, reply.doing as string) } catch { /* a listener's trouble is not the worker's */ }
        } else if (reply.kind === 'answer') {
          finish(() => resolve(reply.details as Answer), false)
        } else if (reply.kind === 'failed') {
          finish(() => reject(new WorkerRefused(reply.reason as FailureReason, String(reply.words))), false)
        }
        // anything else isn't a reply, so we carry on waiting for one
      }
      signal?.addEventListener('abort', cancelled, { once: true })
      waitForSomeSignOfLife()
      try {
        this.worker.post({ protocol: currentProtocol, to, ask, details }, channel.port2)
      } catch (error) {
        finish(() => reject(new WorkerDidNotAnswer(`the worker could not be reached: ${(error as Error).message}`)), false)
      }
    })
  }
}
