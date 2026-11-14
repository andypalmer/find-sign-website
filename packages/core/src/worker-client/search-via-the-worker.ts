// The page's search, which asks the service worker first and uses today's direct search when the worker can't
// answer. What to do about each way the worker can fail is the table in docs/service-worker-messages.md.
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
  /** whether the worker is worth asking: found out once, by saying hello, and given up on for the rest of the page if it lets us down */
  private usable?: Promise<boolean>

  /** `worker` is undefined when the browser has no service worker for us; `fallback` is the search to use then */
  constructor (worker: IAskTheWorker | undefined, fallback: ISearchForSigns['search'], options: { speaks?: number[], log?: (words: string) => void, helloTimeoutMs?: number } = {}) {
    this.worker = worker
    this.fallback = fallback
    this.speaks = options.speaks ?? [currentProtocol]
    this.log = options.log ?? (words => console.warn(`[search] ${words}`))
    this.helloTimeoutMs = options.helloTimeoutMs
  }

  async search (query: string, start: number, length: number, options: SearchOptions = {}): Promise<SearchResponse> {
    if (!this.worker || !(await this.workerIsUsable())) return await this.fallback(query, start, length, options)
    try {
      const answer = await this.worker.ask('search-desk', 'search', { query, start, length }, { signal: options.signal, onProgress: options.onProgress })
      if (!looksLikeASearchResponse(answer)) throw new WorkerRefused('unexpected', 'the worker\'s answer wasn\'t a search answer')
      return answer
    } catch (error) {
      return await this.whatToDoAbout(error, query, start, length, options)
    }
  }

  private workerIsUsable (): Promise<boolean> {
    this.usable ??= (async () => {
      try {
        await this.worker!.ask('front-desk', 'hello', { speaks: this.speaks }, { silenceTimeoutMs: this.helloTimeoutMs })
        return true
      } catch (error) {
        this.log(`the worker didn't say hello back, so we search without it on this page: ${(error as Error).message}`)
        return false
      }
    })()
    return this.usable
  }

  private async whatToDoAbout (error: unknown, query: string, start: number, length: number, options: SearchOptions): Promise<SearchResponse> {
    // the caller cancelled: that is not a failure to make up for
    if (options.signal?.aborted) throw new DOMException('The search was cancelled', 'AbortError')

    if (error instanceof WorkerRefused) {
      // a problem the page shows, as it does today: a direct search would meet the same problem
      if (error.reason === 'no-network-and-not-kept' || error.reason === 'index-changed-too-often' || error.reason === 'cancelled') throw error
      // a worker that has no such desk or question is an old one: leave it alone for the rest of the page
      if (error.reason === 'no-such-actor' || error.reason === 'no-such-question') this.usable = Promise.resolve(false)
      this.log(`the worker couldn't search (${error.reason}: ${error.message}), so we searched without it`)
    } else if (error instanceof WorkerDidNotAnswer) {
      this.usable = Promise.resolve(false)
      this.log(`the worker stopped answering, so we search without it on this page: ${error.message}`)
    } else {
      this.log(`something went wrong asking the worker, so we searched without it: ${(error as Error)?.message}`)
    }
    return await this.fallback(query, start, length, options)
  }
}
