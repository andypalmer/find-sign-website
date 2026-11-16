// The server's library: the same kept library the worker uses, but its files sit in the server's memory
// (a MemoryShelf) instead of the browser's storage. It lasts as long as the server runs.
import { FileKeeper, type FetchAFile } from '../worker/file-keeper.ts'
import { KeptLibrary } from '../worker/kept-library.ts'
import { MemoryShelf } from '../worker/memory-shelf.ts'

export type ServerLibraryOptions = {
  /** the data server folder the index files live in */
  baseUrl: string,
  /** the indexes to search, in the order we trust them */
  indexes: string[],
  /** how files are fetched; the server uses the global `fetch` unless a test passes its own */
  fetch?: FetchAFile,
}

export function serverLibrary (options: ServerLibraryOptions): KeptLibrary {
  // read the global fetch at each request, not now, so tests can replace it
  const fetchFile: FetchAFile = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const keeper = new FileKeeper(fetchFile, new MemoryShelf(), options.baseUrl)
  return new KeptLibrary(keeper, { baseUrl: options.baseUrl, indexes: options.indexes })
}
