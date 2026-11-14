// The worker's desks: what answers the letters addressed to 'front-desk' and 'search-desk'. See
// docs/service-worker-messages.md for what each question means. A desk turns a letter into a plain question,
// runs it, and turns what goes wrong into one of the contract's fixed reasons, so the page can decide what to do.
import { OutdatedError } from '#lib/orthagonal/read.ts'
import { answerSearch, type SearchResponse, type SearchSeams } from '#lib/search/search-engine.ts'
import { currentProtocol, DeskRefusal, type DeskHelpers, type IAnswerLetters } from './letters.ts'

/** the front desk's questions (docs/service-worker-messages.md: FrontDesk) */
export interface IWelcomePages {
  /** the highest protocol both sides know, or a refusal when there is none */
  hello (speaks: number[]): { protocol: number, workerBuild: string }
}

/** the search desk's questions (docs/service-worker-messages.md: SearchDesk) */
export interface IAnswerSearchQuestions {
  search (query: string, start: number, length: number, helpers: DeskHelpers): Promise<SearchResponse>
}

const isWholeNumberFrom = (value: unknown, least: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least

/** Every page says hello once, before asking anything else, and agrees what language to use. */
export class FrontDesk implements IAnswerLetters, IWelcomePages {
  private workerBuild: string
  private speaks: number[]

  /** `workerBuild` says which build of the worker this is, so a page and a log can tell */
  constructor (workerBuild: string, speaks: number[] = [currentProtocol]) {
    this.workerBuild = workerBuild
    this.speaks = speaks
  }

  hello (speaks: number[]): { protocol: number, workerBuild: string } {
    const common = speaks.filter(version => this.speaks.includes(version))
    if (!common.length) {
      throw new DeskRefusal('no-such-question', `this worker speaks protocol ${this.speaks.join(', ')}, and the page speaks ${speaks.length ? speaks.join(', ') : 'none'}`)
    }
    return { protocol: Math.max(...common), workerBuild: this.workerBuild }
  }

  async answer (ask: string, details: unknown, _helpers?: DeskHelpers): Promise<unknown> {
    if (ask !== 'hello') throw new DeskRefusal('no-such-question', `the front desk doesn't answer "${ask}"`)
    const speaks = (details as { speaks?: unknown } | null | undefined)?.speaks
    if (!Array.isArray(speaks) || !speaks.every(version => isWholeNumberFrom(version, 0))) {
      throw new DeskRefusal('bad-details', 'hello needs { speaks: a list of whole numbers }')
    }
    return this.hello(speaks)
  }
}

/** how it looks when the index kept changing under a search (see the reader's message for a file that stayed missing) */
const fileStayedMissing = (error: unknown) => error instanceof Error && /is missing, even after asking for manifest\.json again/.test(error.message)
/** how a fetch that couldn't reach the network fails, in the browsers and in node */
const lookedLikeNoNetwork = (error: unknown) => error instanceof TypeError && /fetch|network|load failed/i.test(error.message)

/** Answers "what matches this query?" with the search engine, on whatever index files the seams give it. */
export class SearchDesk implements IAnswerLetters, IAnswerSearchQuestions {
  private seams: SearchSeams

  constructor (seams: SearchSeams) {
    this.seams = seams
  }

  async search (query: string, start: number, length: number, { progress, cancelled }: DeskHelpers): Promise<SearchResponse> {
    // the engine can't be interrupted, so we stop it at the points where it hands over to one of its seams
    const stop = () => cancelled.throwIfAborted()
    const seams: SearchSeams = {
      ...this.seams,
      knownVectors: async () => {
        stop()
        progress(0.1, 'getting the word list')
        const words = await this.seams.knownVectors()
        stop()
        return words
      },
      loadLibrary: async (columns, knownVectors, forceReload) => {
        stop()
        progress(0.4, 'loading the index')
        const library = await this.seams.loadLibrary(columns, knownVectors, forceReload)
        stop()
        progress(0.8, 'ranking the signs')
        return library
      }
    }
    try {
      return await answerSearch(query, start, length, seams)
    } catch (error) {
      throw this.explain(error, cancelled)
    }
  }

  async answer (ask: string, details: unknown, helpers: DeskHelpers): Promise<unknown> {
    if (ask !== 'search') throw new DeskRefusal('no-such-question', `the search desk doesn't answer "${ask}"`)
    const { query, start, length } = (details ?? {}) as { query?: unknown, start?: unknown, length?: unknown }
    if (typeof query !== 'string' || !isWholeNumberFrom(start, 0) || !isWholeNumberFrom(length, 0)) {
      throw new DeskRefusal('bad-details', 'search needs { query: text, start: a whole number, length: a whole number }')
    }
    return await this.search(query, start, length, helpers)
  }

  /** what went wrong, in the contract's words when it is one of the ways we know of; any other failure as it was */
  private explain (error: unknown, cancelled: AbortSignal): unknown {
    if (cancelled.aborted || error instanceof DeskRefusal) return error
    if (error instanceof OutdatedError || fileStayedMissing(error)) {
      return new DeskRefusal('index-changed-too-often', `the index was rebuilt while we were searching, and again when we looked again: ${(error as Error).message}`)
    }
    if (lookedLikeNoNetwork(error)) {
      return new DeskRefusal('no-network-and-not-kept', `a file we needed isn't kept and the data server couldn't be reached: ${(error as Error).message}`)
    }
    return error
  }
}
