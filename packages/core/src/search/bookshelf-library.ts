// The bookshelf library: answers with the same shape and arguments as the version 1 getSearchLibrary, but reads
// the version 2 index from the server's kept files. Version 2 names a sign's index by the collection folder, so
// this gives each sign the index's own address, the one version 1 gives, and the callers that look signs up by
// that address (random, the feeds) keep working.
// While the data server has no version 2 index (no manifest.json), it hands the same call to the fallback, the
// version 1 library. Any other failure is reported as it is.
import type { SearchLibrary } from './search-engine.ts'
import { serverLibrary, type ServerLibraryOptions } from './server-library.ts'
import { FileUnavailable } from '../worker/file-keeper.ts'

/** the version 1 library call, which the bookshelf can hand over to when there is no version 2 index */
export type GetSearchLibrary = (limitLibraries: string[] | false, columns: string[], forceReload: boolean, globalVectors?: Parameters<ReturnType<typeof serverLibrary>['loadLibrary']>[1]) => Promise<SearchLibrary>

export function bookshelfGetSearchLibrary (options: ServerLibraryOptions & { fallback?: GetSearchLibrary }) {
  const kept = serverLibrary(options)
  const folder = options.baseUrl.replace(/\/+$/, '')
  return async (limitLibraries: string[] | false = false, columns: string[] = ['words', 'tags'], forceReload = false, globalVectors?: Parameters<typeof kept.loadLibrary>[1]): Promise<SearchLibrary> => {
    const names = limitLibraries === false ? options.indexes : limitLibraries
    let everything
    try {
      everything = await kept.loadLibrary(columns, globalVectors, forceReload)
    } catch (error) {
      // a data server with no manifest.json has no version 2 index: the version 1 library answers instead
      if (options.fallback && error instanceof FileUnavailable && error.fileName === 'manifest.json' && error.status === 404) {
        return options.fallback(limitLibraries, columns, forceReload, globalVectors)
      }
      throw error
    }
    return Object.fromEntries(names.map(name => {
      const index = everything[name]
      const address = `${folder}/${name}`
      return [name, { ...index, url: address, entries: index.entries.map(entry => ({ ...entry, indexURL: address })) }]
    }))
  }
}
