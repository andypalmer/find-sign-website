// The page's search, which asks the service worker first and uses today's direct search whenever the worker can't
// answer. If the direct search fails too, its own problem is what the page shows, as it always has. We don't show the
// worker's problem instead, even for "offline": the browser can't tell a refused request (a CORS error, a blocked
// header) from a dead network, so "offline" from the worker may only mean the worker's own requests were refused,
// and the direct search, which asks for different things, may work. See docs/service-worker-messages.md.
import type { SearchResponse } from '#lib/search/search-engine.ts'
import { currentProtocol } from '#lib/worker/letters.ts'
import { WorkerDidNotAnswer, WorkerRefused, type IAskTheWorker } from './messenger.ts'

export type SearchOptions = {
  signal?: AbortSignal,
  onProgress?: (done: number, doing: string) => void,
}

/** something that can search for signs: the worker, today's direct search, or one that tries the worker first */
export interface ISearchForSigns {
  search (query: string, start: number, length: number, options?: SearchOptions): Promise<SearchResponse>
}

const looksLikeASearchResponse = (answer: unknown): answer is SearchResponse =>
  typeof answer === 'object' && answer !== null && typeof (answer as SearchResponse).totalResults === 'number' && Array.isArray((answer as SearchResponse).results)

export class SearchViaTheWorker implements ISearchForSigns {
  private worker?: IAskTheWorker
  private fallback: ISearchForSigns['search']
  private speaks: number[]
  private log: (words: string) => void
  private helloTimeoutMs?: number
  /** the hello: started once, and settles to whether the worker answered. It can still be pending when a search runs */
  private hello?: Promise<boolean>
  private helloGraceMs: number

  /** `worker` is undefined when the browser has no service worker for us; `fallback` is the search to use then */
  constructor (worker: IAskTheWorker | undefined, fallback: ISearchForSigns['search'], options: { speaks?: number[], log?: (words: string) => void, helloTimeoutMs?: number, helloGraceMs?: number } = {}) {
    this.worker = worker
    this.fallback = fallback
    this.speaks = options.speaks ?? [currentProtocol]
    this.log = options.log ?? (words => console.warn(`[search] ${words}`))
    this.helloTimeoutMs = options.helloTimeoutMs
    // how long a search waits for hello before searching directly. A worker that is still installing or fetching
    // must not hold up the search: it can take over for the next one
    this.helloGraceMs = options.helloGraceMs ?? 1500
  }

  async search (query: string, start: number, length: number, options: SearchOptions = {}): Promise<SearchResponse> {
    if (!this.worker || !(await this.workerIsReadyWithinGrace())) return await this.fallback(query, start, length, options)
    try {
      const answer = await this.worker.ask('search-desk', 'search', { query, start, length }, { signal: options.signal, onProgress: options.onProgress })
      if (!looksLikeASearchResponse(answer)) throw new WorkerRefused('unexpected', 'the worker\'s answer wasn\'t a search answer')
      return answer
    } catch (error) {
      return await this.whatToDoAbout(error, query, start, length, options)
    }
  }

  /**
   * Whether the worker has said hello, waiting at most the grace period for it. A hello that has come back is kept, so
   * later searches use the worker straight away; a hello that never comes back makes the page search directly from then on.
   */
  private workerIsReadyWithinGrace (): Promise<boolean> {
    this.hello ??= (async () => {
      try {
        await this.worker!.ask('front-desk', 'hello', { speaks: this.speaks }, { silenceTimeoutMs: this.helloTimeoutMs })
        return true
      } catch (error) {
        this.log(`the worker didn't say hello back, so we search without it on this page: ${(error as Error).message}`)
        return false
      }
    })()
    const grace = new Promise<boolean>(resolve => setTimeout(() => resolve(false), this.helloGraceMs))
    return Promise.race([this.hello, grace])
  }

  private async whatToDoAbout (error: unknown, query: string, start: number, length: number, options: SearchOptions): Promise<SearchResponse> {
    // the caller cancelled: that is not a failure to make up for
    if (options.signal?.aborted) throw new DOMException('The search was cancelled', 'AbortError')

    if (error instanceof WorkerRefused) {
      if (error.reason === 'cancelled') throw error
      // a worker that has no such desk or question is an old one: leave it alone for the rest of the page
      if (error.reason === 'no-such-actor' || error.reason === 'no-such-question') this.hello = Promise.resolve(false)
      this.log(`the worker couldn't search (${error.reason}: ${error.message}), so we searched without it`)
    } else if (error instanceof WorkerDidNotAnswer) {
      this.hello = Promise.resolve(false)
      this.log(`the worker stopped answering, so we search without it on this page: ${error.message}`)
    } else {
      this.log(`something went wrong asking the worker, so we searched without it: ${(error as Error)?.message}`)
    }
    return await this.fallback(query, start, length, options)
  }
}
