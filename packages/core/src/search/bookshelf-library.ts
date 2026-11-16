// The bookshelf: the server's view of the search index. It reads the version 2 index from the server's kept files,
// and answers with the same shapes and arguments as the version 1 loaders, so every caller can use it unchanged.
// Version 2 names a sign's index by the collection folder, so this gives each sign the index's own address, the one
// version 1 gives, and the callers that look signs up by that address (random, the feeds) keep working.
// While the data server has no version 2 index (no manifest.json), it hands each call to the version 1 code it
// was given instead. Any other failure is reported as it is.
import { answerSearch, type SearchLibrary, type SearchResponse } from './search-engine.ts'
import type { WordVector } from './precomputed-vectors.ts'
import { lookup } from './loaded-precomputed-vectors.ts'
import { serverLibrary, type ServerLibraryOptions } from './server-library.ts'
import { FileUnavailable } from '../worker/file-keeper.ts'

/** the version 1 library call, which the bookshelf can hand over to when there is no version 2 index */
export type GetSearchLibrary = (limitLibraries?: string[] | false, columns?: string[], forceReload?: boolean, globalVectors?: { [word: string]: WordVector }) => Promise<SearchLibrary>

/** the version 1 search, which the bookshelf can hand over to when there is no version 2 index */
export type SearchVersion1 = (query: string, start: number, length: number, forceReload?: boolean) => Promise<SearchResponse>

/** what the server asks of the index: a library for its callers, and the page's search */
export type Bookshelf = { getSearchLibrary: GetSearchLibrary, search: SearchVersion1 }

export type BookshelfOptions = ServerLibraryOptions & {
  /** the version 1 library call, used while there is no version 2 index */
  fallback?: GetSearchLibrary,
  /** the version 1 search, used while there is no version 2 index */
  fallbackSearch?: SearchVersion1,
}

/** a 404 for manifest.json: the data server has no version 2 index yet */
function noVersion2Index (error: unknown): boolean {
  return error instanceof FileUnavailable && error.fileName === 'manifest.json' && error.status === 404
}

export function makeBookshelf (options: BookshelfOptions): Bookshelf {
  const kept = serverLibrary(options)
  const folder = options.baseUrl.replace(/\/+$/, '')

  const getSearchLibrary: GetSearchLibrary = async (limitLibraries = false, columns = ['words', 'tags'], forceReload = false, globalVectors) => {
    const names = limitLibraries === false ? options.indexes : limitLibraries
    let everything
    try {
      everything = await kept.loadLibrary(columns, globalVectors, forceReload)
    } catch (error) {
      if (options.fallback && noVersion2Index(error)) return options.fallback(limitLibraries, columns, forceReload, globalVectors)
      throw error
    }
    return Object.fromEntries(names.map(name => {
      const index = everything[name]
      const address = `${folder}/${name}`
      return [name, { ...index, url: address, entries: index.entries.map(entry => ({ ...entry, indexURL: address })) }]
    }))
  }

  // one search reads manifest.json once, and both the known vectors and the library use that same copy
  const search: SearchVersion1 = async (query, start, length, forceReload = false) => {
    let manifestBytes: Uint8Array
    try {
      manifestBytes = await kept.manifest()
    } catch (error) {
      if (options.fallbackSearch && noVersion2Index(error)) return options.fallbackSearch(query, start, length, forceReload)
      throw error
    }
    return answerSearch(query, start, length, kept.asSearchSeamsFor(manifestBytes, lookup), forceReload)
  }

  return { getSearchLibrary, search }
}

/** the library call on its own, for callers that don't need the search */
export function bookshelfGetSearchLibrary (options: BookshelfOptions): GetSearchLibrary {
  return makeBookshelf(options).getSearchLibrary
}
