// Puts a file keeper together from the things the browser gives a worker: its own fetch and its IndexedDB.
import { FileKeeper, type FetchAFile } from './file-keeper.ts'
import { IndexedDbShelf, type OpensDatabases } from './indexeddb-shelf.ts'

export type BrowserParts = {
  /** the data server folder the index files live in */
  baseUrl: string
  /** the worker's `fetch` */
  fetch: FetchAFile
  /** the worker's `indexedDB` */
  indexedDB: OpensDatabases
  /** which database to keep files in; the default is fine unless two keepers must not share */
  databaseName?: string
}

export function fileKeeperForTheBrowser (parts: BrowserParts): FileKeeper {
  // The browser's fetch only runs when called on its own. Handed straight to the keeper it would be called as
  // one of the keeper's methods and the browser would refuse, so we wrap it.
  // (Even `parts.fetch(...)` would be a method call, on `parts`, so we take it out of the bag first.)
  const { fetch } = parts
  const fetchOnItsOwn: FetchAFile = (url, init) => fetch(url, init)
  const shelf = new IndexedDbShelf(parts.indexedDB, parts.databaseName ?? 'find-sign-index')
  return new FileKeeper(fetchOnItsOwn, shelf, parts.baseUrl)
}
