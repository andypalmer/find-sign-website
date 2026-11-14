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

// getSearchLibrary loads a collection of search libraries, possibly limited to a specific set
// of indexes (e.g. auslan-signbank) and a specific set of columns (words, tags, link, id, author, etc)
export async function getSearchLibrary (limitLibraries: string[] | false = false, columns: string[] = ['words', 'tags'], forceReload = false, globalVectors?: { [word: string]: WordVector }): Promise<SearchLibrary> {
  if (limitLibraries === false) limitLibraries = Object.keys(indexURLs)

  const collection = Object.fromEntries(await Promise.all(limitLibraries.map(async name => {
    const index = await loadIndex(indexURLs[name], columns, forceReload, globalVectors)
    return [name, index]
  })))

  // TODO: implement freshen logic and caching of loaded libraries?
  return collection
}

// the page's search: the search engine, run on the v1 index files and the site's settings
export async function search (query: string, start: number, length: number, forceReload = false): Promise<SearchResponse> {
  return await answerSearch(query, start, length, {
    // this file contains a word-vector pairing for every word that exists in the search index
    // !!! should this have a cache expiry mechanism?
    knownVectors: () => openGlobalVectors(SEARCH_DATA + fn`${IndexName}/global-vectors.lps`),
    lookupVector: lookup,
    loadLibrary: (columns, knownVectors, reload) => getSearchLibrary(false, columns, reload, knownVectors),
    indexNameOf: entry => indexByURL[entry.indexURL]
  }, forceReload)
}
