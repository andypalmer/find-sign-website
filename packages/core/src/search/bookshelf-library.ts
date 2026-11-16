// The bookshelf: the server's view of the search index. It reads the version 2 index from the server's kept files,
// and answers with the same shapes and arguments as the version 1 loaders, so every caller can use it unchanged.
// Version 2 names a sign's index by the collection folder, so this gives each sign the index's own address, the one
// version 1 gives, and the callers that look signs up by that address (random, the feeds) keep working.
// While the data server has no version 2 index (no manifest.json), it hands each call to the version 1 loader it
// was given instead. Any other failure is reported as it is.
import type { SearchLibrary } from './search-engine.ts'
import type { WordVector } from './precomputed-vectors.ts'
import { serverLibrary, type ServerLibraryOptions } from './server-library.ts'
import { FileUnavailable } from '../worker/file-keeper.ts'

/** the version 1 library call, which the bookshelf can hand over to when there is no version 2 index */
export type GetSearchLibrary = (limitLibraries?: string[] | false, columns?: string[], forceReload?: boolean, globalVectors?: { [word: string]: WordVector }) => Promise<SearchLibrary>

/** every word the signs use, with its vector (or nothing, when the version 1 loader is used instead) */
export type KnownVectors = () => Promise<{ [word: string]: WordVector } | undefined>

/** the two things a search asks of the index */
export type Bookshelf = { getSearchLibrary: GetSearchLibrary, knownVectors: KnownVectors }

export type BookshelfOptions = ServerLibraryOptions & {
  /** the version 1 library call, used while there is no version 2 index */
  fallback?: GetSearchLibrary,
  /** the version 1 known vectors, used while there is no version 2 index */
  fallbackKnownVectors?: KnownVectors,
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

  const knownVectors: KnownVectors = async () => {
    try {
      return await kept.knownVectors()
    } catch (error) {
      if (options.fallbackKnownVectors && noVersion2Index(error)) return options.fallbackKnownVectors()
      throw error
    }
  }

  return { getSearchLibrary, knownVectors }
}

/** the library call on its own, for callers that don't need the known vectors */
export function bookshelfGetSearchLibrary (options: BookshelfOptions): GetSearchLibrary {
  return makeBookshelf(options).getSearchLibrary
}
