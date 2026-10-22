// The website's find-sign collection on the data server (SEARCH_DATA), through the pipeline's find-sign-data
// client, signed with the SEARCH_WRITE_IDENTITY setting.
import { findSignData } from '@andypalmer/data-store'
import { SEARCH_DATA } from '$app/env/public'
import { SEARCH_WRITE_IDENTITY } from '$app/env/private'

export type { FileInfoJSON, MathFormat, MathOperation, DataStore } from '@andypalmer/data-store'
export type BulkWriteFiles = { [filePath: string]: string | Uint8Array }

/** the collection, as the pipeline's packages (such as the indexer) take it */
export const dataStore = findSignData({ collection: SEARCH_DATA, identity: SEARCH_WRITE_IDENTITY, userAgent: 'find-sign-website' })

export const readFile = (path: string) => dataStore.read(path)
export const writeFile = (path: string, data: Uint8Array | string) => dataStore.write(path, data)
// anything that's neither text nor bytes is written as JSON, as before
export const bulkWrite = (path: string, files: BulkWriteFiles) => dataStore.writeMany(path, Object.fromEntries(Object.entries(files).map(([name, data]) =>
  [name, typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data)]
)))
export const mathWrite = dataStore.mathWrite
export const exists = dataStore.exists
export const listFiles = dataStore.listFiles
export const listFilenames = dataStore.list
export const deletePath = dataStore.delete
