// The search engine: query in, ranked results out. It knows nothing about where the index files come from, or
// about the site's settings: whoever calls it hands it the few things it needs (see SearchSeams). The page's
// own search (search.ts) and the service worker's search desk both run on it, so they rank the same way.
import { OutdatedError, type LoadedOrthagonalEntry, type LoadedOrthagonalIndex } from '#lib/orthagonal/read.ts'
import type { EncodedSearchDataEntry } from '#lib/orthagonal/types.ts'
import normalizeWord from '#lib/orthagonal/normalize-word.ts'
import rank from '#lib/search/search-rank.ts'
import { checkQueryContainsWords, compileQuery, compileQueryAST, parseQuery, queryPhrase } from '#lib/search/text.ts'
import { normalizePhrase } from '@andypalmer/orthagonal'
import type { WordVector } from './precomputed-vectors'

// return type of the engine
export type SearchResponse = {
  results: SearchResult[],
  totalResults: number
}

// key-value object of all the loaded search indexes as a library collection
export type SearchLibrary = {
  [name: string]: LoadedOrthagonalIndex
}

// this is the type the engine returns an array of in its results property, and what
// the Result.svelte component expects to present a search result
export interface SearchResult extends EncodedSearchDataEntry {
  index: string, // string search index name, e.g. "auslan-signbank"
}

/** where the engine gets everything it can't work out for itself */
export type SearchSeams = {
  /** the word vectors the collection already holds (every word its signs use). Only asked for when the query has words */
  knownVectors (): Promise<{ [word: string]: WordVector } | undefined>,
  /** a word's vector from the whole word vector library, for words the signs don't use */
  lookupVector (word: string): Promise<WordVector | undefined>,
  /** every index, with these columns loaded, and the known vectors if there are any. `forceReload` skips caches */
  loadLibrary (columns: string[], knownVectors: { [word: string]: WordVector } | undefined, forceReload: boolean): Promise<SearchLibrary>,
  /** the name of the index a result came from */
  indexNameOf (entry: LoadedOrthagonalEntry): string,
}

// the rank of a sign whose English phrase is the query: well before any match by words, which start at 0, even
// with the spread of its words and a naughty sign's penalty added
const phraseMatch = -10

// this is the main guts of the search engine, queries come in, and results come out
export async function answerSearch (query: string, start: number, length: number, seams: SearchSeams, forceReload = false): Promise<SearchResponse> {
  // the collection's own word vectors: a word-vector pairing for every word that exists in the search index
  // (in the result titles/words lists). Only worth having when the query has words in it
  let knownVectors: { [word: string]: WordVector } | undefined
  if (checkQueryContainsWords(query)) knownVectors = await seams.knownVectors()

  // word lookup function which checks the known vectors before bothering to load rare words
  // from the word vector library
  const lookupLocal = async function (word: string) {
    if (knownVectors && knownVectors[word]) return knownVectors[word]
    return seams.lookupVector(word)
  }

  // parse and compile the user's search query string in to a list of which data needs to be loaded
  // and a rank function. requirements lists the columns of the dataset that are needed to run rank
  // and rank accepts a search library entry and returns a distance number, with 0 being
  // a perfect match
  const compiledQuery = await compileQuery(query, async (word) => {
    const normalized = normalizeWord(word)
    const normalizedResult = await lookupLocal(normalized)
    if (normalizedResult) {
      return normalizedResult
    } else if (normalized !== normalized.toLowerCase()) {
      const lowerCasedResult = await lookupLocal(normalized.toLowerCase())
      return lowerCasedResult
    }
  })

  // a query of several words may be an English phrase a sign translates, which puts it first ("spill the beans"
  // finds GOSSIP), as long as the query's tags and authors let it through
  const phrased = queryPhrase(parseQuery(query))
  const phrase = phrased && normalizePhrase(phrased.words.join(' '))
  const passes = phrased && await compileQueryAST(phrased.filters)
  const rankFn = phrased ? (entry: LoadedOrthagonalEntry) => {
    if (passes!(entry) < Infinity && entry.englishPhrases?.some(english => normalizePhrase(english) === phrase)) return phraseMatch
    return compiledQuery.rank(entry)
  } : compiledQuery.rank

  // load the search libraries, only bothering to fetch the columns necessary to run the rank function, and tags,
  // which rank uses to put naughty signs after the others
  const columns = [...new Set([...compiledQuery.requirements, 'tags', ...(phrased ? ['englishPhrases'] : [])])]
  const library = await seams.loadLibrary(columns, knownVectors, forceReload)

  // sort the libraries in to one set of search results
  const rankedIndex = rank(library, rankFn)

  // slice out the results that are wanted (which page, basically)
  const resultEntries = rankedIndex.entries.slice(start, start + length)
  let results: SearchResult[] = []
  try {
    // load the full search result json for each result, so we have everything needed to present
    // to user
    results = await Promise.all(resultEntries.map(async entry => {
      const loadedResult: SearchResult = {
        ...await entry.load(),
        index: seams.indexNameOf(entry)
      }
      return loadedResult
    }))
  } catch (error) {
    // if an OutdatedError throws, the currently loaded in memory search libraries are not up
    // to date with the current version on the server, so the whole thing is re-run with
    // forceReload set to true, causing the browser to fetch with cache invalidating headers
    // In this spot, an OutdatedError is likely to throw because a search library was updated
    // after the user loaded the library, but before the user loaded the search result json
    if (error instanceof OutdatedError) {
      if (forceReload === false) {
        return await answerSearch(query, start, length, seams, true)
      }
    }
    throw error
  }

  return {
    totalResults: rankedIndex.entries.length,
    results
  }
}
