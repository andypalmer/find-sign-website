import type { Bookshelf } from './bookshelf-library.ts'
import { loadIndex } from '#lib/orthagonal/read.ts'
import { lookup } from '#lib/search/loaded-precomputed-vectors.ts'
import { answerSearch, type SearchLibrary, type SearchResponse } from '#lib/search/search-engine.ts'
import { fn } from '#lib/models/filename-codec.ts'
import openGlobalVectors from './global-vectors'
import type { WordVector } from './precomputed-vectors'
import { SEARCH_DATA, SEARCH_INDEX_NAME, SEARCH_INDEXES } from '$app/env/public'

// the name of the overall index collection, to seperate prod builds from beta and tonino (phoenix's laptop)
const IndexName = SEARCH_INDEX_NAME
// from the SEARCH_INDEXES setting, a list of indexes the search engine currently reads
export const availableIndexes: string[] = SEARCH_INDEXES.split(',')
// an object of index names to url's where that index is published
export const indexURLs = Object.fromEntries(availableIndexes.map(name => {
  return [name, SEARCH_DATA + fn`${IndexName}/${name}`]
}))
// an object of index names, keyed by the url to that index, for reverse lookup
export const indexByURL: { [url: string]: string } = Object.fromEntries(Object.entries(indexURLs).map(([name, url]) => [url, name]))

// what the engine answers with, and the library it ranks: defined with the engine, which the service worker uses too
export type { SearchLibrary, SearchResponse, SearchResult } from '#lib/search/search-engine.ts'

// the server's bookshelf (see bookshelf-library.ts), once the server has set one at start-up. The browser never sets one
let theBookshelf: Bookshelf | undefined

/** the server sets its bookshelf once, at start-up; from then on every library call and search goes through it */
export function useTheBookshelf (bookshelf: Bookshelf): void {
  theBookshelf = bookshelf
}

// getSearchLibrary loads a collection of search libraries, possibly limited to a specific set
// of indexes (e.g. auslan-signbank) and a specific set of columns (words, tags, link, id, author, etc).
// Every caller comes through here: the bookshelf answers when the server has set one, and the version 1 files otherwise
export async function getSearchLibrary (limitLibraries: string[] | false = false, columns: string[] = ['words', 'tags'], forceReload = false, globalVectors?: { [word: string]: WordVector }): Promise<SearchLibrary> {
  if (theBookshelf) return theBookshelf.getSearchLibrary(limitLibraries, columns, forceReload, globalVectors)
  return getSearchLibraryFromVersion1(limitLibraries, columns, forceReload, globalVectors)
}

// the version 1 loader: the bookshelf hands its calls to this when the data server has no version 2 index
export async function getSearchLibraryFromVersion1 (limitLibraries: string[] | false = false, columns: string[] = ['words', 'tags'], forceReload = false, globalVectors?: { [word: string]: WordVector }): Promise<SearchLibrary> {
  if (limitLibraries === false) limitLibraries = Object.keys(indexURLs)

  const collection = Object.fromEntries(await Promise.all(limitLibraries.map(async name => {
    const index = await loadIndex(indexURLs[name], columns, forceReload, globalVectors)
    return [name, index]
  })))

  // TODO: implement freshen logic and caching of loaded libraries?
  return collection
}

// the version 1 known vectors: a file with a word-vector pairing for every word that exists in the search index.
// The bookshelf hands its calls here when the data server has no version 2 index
export function knownVectorsFromVersion1 () {
  // !!! should this have a cache expiry mechanism?
  return openGlobalVectors(SEARCH_DATA + fn`${IndexName}/global-vectors.lps`)
}

// the page's search: the bookshelf's search when the server has one, and the v1 index files otherwise
export async function search (query: string, start: number, length: number, forceReload = false): Promise<SearchResponse> {
  if (theBookshelf) return theBookshelf.search(query, start, length, forceReload)
  return searchVersion1(query, start, length, forceReload)
}

// the search engine, run on the v1 index files and the site's settings
export async function searchVersion1 (query: string, start: number, length: number, forceReload = false): Promise<SearchResponse> {
  return await answerSearch(query, start, length, {
    knownVectors: () => knownVectorsFromVersion1(),
    lookupVector: lookup,
    loadLibrary: (columns, knownVectors, reload) => getSearchLibraryFromVersion1(false, columns, reload, knownVectors),
    indexNameOf: entry => indexByURL[entry.indexURL]
  }, forceReload)
}
