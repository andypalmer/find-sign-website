// The page's search. With the service worker switched on, it registers the worker and searches through it, with
// today's direct search to fall back on; with it switched off, it searches directly, and tidies away a worker left
// from when it was on. The server never gets here: only the browser has service workers.
import { addressForTheWorker, type WorkerSettings } from '#lib/worker/worker-settings.ts'
import { Messenger, WorkerDidNotAnswer, type AskOptions, type IAskTheWorker } from './messenger.ts'
import { registerTheWorker, unregisterTheWorker, workerAsAPostbox, type IServiceWorkerContainerLike, type IWorkerLike } from './registration.ts'
import { SearchViaTheWorker, type ISearchForSigns } from './search-via-the-worker.ts'

/** is the service worker switched on? Only a clear yes is a yes, so a typo never turns it on */
export function serviceWorkerWanted (setting: string | undefined): boolean {
  return ['on', 'true', '1', 'yes'].includes((setting ?? '').trim().toLowerCase())
}

export type PageSearchOptions = {
  /** whether the service worker is switched on (see serviceWorkerWanted) */
  wanted: boolean,
  settings: WorkerSettings,
  /** the browser's navigator.serviceWorker, or undefined where there isn't one (an insecure page, an old browser) */
  container: IServiceWorkerContainerLike | undefined,
  /** where the worker's script is, such as /service-worker.js */
  scriptAddress: string,
  /** today's direct search, for when the worker isn't there or can't answer */
  fallback: ISearchForSigns['search'],
  type?: 'classic' | 'module',
  pageAddress?: string,
  /** how long to wait for the worker to be ready before searching without it for this page */
  registrationTimeoutMs?: number,
  silenceTimeoutMs?: number,
  log?: (words: string) => void,
}

/** the page's search, and a way to start getting the worker ready before anyone searches */
export interface IPageSearch extends ISearchForSigns {
  /** begins registering the worker (or tidying it away) now, in the background. Safe to call as often as you like */
  start (): void
}

export function createPageSearch (options: PageSearchOptions): IPageSearch {
  const log = options.log ?? (words => console.warn(`[search] ${words}`))
  const { container } = options

  if (!options.wanted || !container) {
    let tidied = false
    return {
      start () {
        if (tidied || options.wanted || !container) return
        tidied = true
        unregisterTheWorker(container).catch(error => log(`couldn't tidy away the service worker: ${(error as Error).message}`))
      },
      search (query, start, length, searchOptions) {
        this.start()
        return options.fallback(query, start, length, searchOptions ?? {})
      }
    }
  }

  // registering is done once, in the background, and only the first search that needs it waits for it
  let ready: Promise<IAskTheWorker> | undefined
  const getReady = (): Promise<IAskTheWorker> => {
    ready ??= (async () => {
      const worker: IWorkerLike = await registerTheWorker(container, addressForTheWorker(options.scriptAddress, options.settings), {
        type: options.type, timeoutMs: options.registrationTimeoutMs, pageAddress: options.pageAddress
      })
      return new Messenger(workerAsAPostbox(worker), { silenceTimeoutMs: options.silenceTimeoutMs })
    })()
    ready.catch(error => log(`the service worker isn't ready, so we search without it on this page: ${(error as Error).message}`))
    return ready
  }
  const worker: IAskTheWorker = {
    async ask<Answer = unknown> (to: string, ask: string, details: unknown, askOptions?: AskOptions): Promise<Answer> {
      let messenger: IAskTheWorker
      try {
        messenger = await getReady()
      } catch (error) {
        throw new WorkerDidNotAnswer(`the service worker isn't ready: ${(error as Error).message}`)
      }
      return await messenger.ask<Answer>(to, ask, details, askOptions)
    }
  }
  const search = new SearchViaTheWorker(worker, options.fallback, { log, helloTimeoutMs: options.silenceTimeoutMs })
  return {
    start () { void getReady().catch(() => {}) },
    search: (query, start, length, searchOptions) => search.search(query, start, length, searchOptions)
  }
}
