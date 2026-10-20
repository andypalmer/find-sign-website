import { loadIndex, OutdatedError, type LoadedOrthagonalIndex } from '#lib/orthagonal/read.ts'
import type { EncodedSearchDataEntry } from '#lib/orthagonal/types.ts'
import { lookup } from '#lib/search/loaded-precomputed-vectors.ts'
import rank from '#lib/search/search-rank.ts'
import { checkQueryContainsWords, compileQuery } from '#lib/search/text.ts'
import normalizeWord from '#lib/orthagonal/normalize-word.ts'
import { fn } from '#lib/models/filename-codec.ts'
import openGlobalVectors from './global-vectors'
import type { WordVector } from './precomputed-vectors'

// the name of the overall index collection, to seperate prod builds from beta and tonino (phoenix's laptop)
const IndexName = import.meta.env.VITE_SEARCH_INDEX_NAME
// from .env, a list of indexes the search engine currently reads
export const availableIndexes = import.meta.env.VITE_SEARCH_INDEXES.split(',')
// an object of index names to url's where that index is published
export const indexURLs = Object.fromEntries(availableIndexes.map(name => {
  return [name, import.meta.env.VITE_SEARCH_DATA + fn`${IndexName}/${name}`]
}))
// an object of index names, keyed by the url to that index, for reverse lookup
export const indexByURL = Object.fromEntries(Object.entries(indexURLs).map(x => x.reverse()))

// return type of search()
export type SearchResponse = {
  results: SearchResult[],
  totalResults: number
}

// key-value object of all the loaded search indexes as a library collection
export type SearchLibrary = {
  [name: string]: LoadedOrthagonalIndex
}

// this is the type search() returns an array of in it's results property, and what
// the Result.svelte component expects to present a search result
export interface SearchResult extends EncodedSearchDataEntry {
  index: string, // string search index name, e.g. "auslan-signbank"
}

// getSearchLibrary loads a collection of search libraries, possibly limited to a specific set
// of indexes (e.g. auslan-signbank) and a specific set of columns (words, tags, link, id, author, etc)
export async function getSearchLibrary (limitLibraries: string[] | false = false, columns = ['words', 'tags'], forceReload = false, globalVectors?: { [word: string]: WordVector }): Promise<SearchLibrary> {
  if (limitLibraries === false) limitLibraries = Object.keys(indexURLs)

  const collection = Object.fromEntries(await Promise.all(limitLibraries.map(async name => {
    const index = await loadIndex(indexURLs[name], columns, forceReload, globalVectors)
    return [name, index]
  })))

  // TODO: implement freshen logic and caching of loaded libraries?
  return collection
}

// this is the main guts of the search engine, queries come in, and results come out
export async function search (query: string, start: number, length: number, forceReload = false): Promise<SearchResponse> {
  // load the globalVector cache, this file contains a word-vector pairing for every word that
  // exists in the search index (in the result titles/words lists)
  let globalVectors: { [word: string]: Float32Array }
  if (/*!globalVectors &&*/ checkQueryContainsWords(query)) {
    // !!! should this have a cache expiry mechanism?
    globalVectors = await openGlobalVectors(import.meta.env.VITE_SEARCH_DATA + fn`${IndexName}/global-vectors.lps`)
  }

  // word lookup function which checks the local vectors cache before bothering to load rare words
  // from the word vector library
  const lookupLocal = async function (word) {
    if (globalVectors && globalVectors[word]) return globalVectors[word]
    return lookup(word)
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

  // load the search libraries, only bothering to fetch the columns necessary to run the rank function
  const { requirements: columns, rank: rankFn } = compiledQuery
  const library = await getSearchLibrary(false, columns, forceReload, globalVectors)

  // sort the libraries in to one set of search results
  const rankedIndex = rank(library, rankFn)

  // slice out the results that are wanted (which page, basically)
  const resultEntries = rankedIndex.entries.slice(start, start + length)
  let results: SearchResult[]
  try {
    // load the full search result json for each result, so we have everything needed to present
    // to user
    results = await Promise.all(resultEntries.map(async entry => {
      const loadedResult: SearchResult = {
        ...await entry.load(),
        index: indexByURL[entry.indexURL]
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
        return await search(query, start, length, true)
      }
      throw error
    }
  }

  return {
    totalResults: rankedIndex.entries.length,
    results
  }
}
