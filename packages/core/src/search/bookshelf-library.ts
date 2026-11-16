// The bookshelf library: answers with the same shape and arguments as the version 1 getSearchLibrary, but reads
// the version 2 index from the server's kept files. Version 2 names a sign's index by the collection folder, so
// this gives each sign the index's own address, the one version 1 gives, and the callers that look signs up by
// that address (random, the feeds) keep working.
import type { SearchLibrary } from './search-engine.ts'
import { serverLibrary, type ServerLibraryOptions } from './server-library.ts'

export function bookshelfGetSearchLibrary (options: ServerLibraryOptions) {
  const kept = serverLibrary(options)
  const folder = options.baseUrl.replace(/\/+$/, '')
  return async (limitLibraries: string[] | false = false, columns: string[] = ['words', 'tags'], forceReload = false, globalVectors?: Parameters<typeof kept.loadLibrary>[1]): Promise<SearchLibrary> => {
    const names = limitLibraries === false ? options.indexes : limitLibraries
    const everything = await kept.loadLibrary(columns, globalVectors, forceReload)
    return Object.fromEntries(names.map(name => {
      const index = everything[name]
      const address = `${folder}/${name}`
      return [name, { ...index, url: address, entries: index.entries.map(entry => ({ ...entry, indexURL: address })) }]
    }))
  }
}
