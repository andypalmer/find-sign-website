// How the service worker learns its settings. The site's settings are read when its server starts, so one build
// can serve any deployment, and the worker is built once, so it can't have them baked in. The page gives them to
// the worker in the worker's own address: it registers `/service-worker.js?data=…&index=…`, and the worker reads
// them back from where it was loaded. That way they are there from the first moment, they can't be out of step
// with the worker's code, and a change of settings is a new address, which makes the browser install a new worker.

/** what the worker needs to know to do its work: where the index is, and which of it to search */
export type WorkerSettings = {
  /** the find-sign collection on the data server (SEARCH_DATA), ending in / */
  dataUrl: string,
  /** the folder in the collection that holds the index files (SEARCH_INDEX_NAME) */
  indexName: string,
  /** the indexes to search, in the order we trust them (SEARCH_INDEXES) */
  indexes: string[],
  /** the whole word vector library (VECTOR_INDEX), for words the signs don't use */
  vectorLibraryUrl: string,
}

/** the address for the worker's script, with the settings on the end: what the page registers */
export function addressForTheWorker (scriptAddress: string, settings: WorkerSettings): string {
  const parameters = new URLSearchParams({
    data: settings.dataUrl,
    index: settings.indexName,
    indexes: settings.indexes.join(','),
    vectors: settings.vectorLibraryUrl
  })
  return `${scriptAddress}?${parameters}`
}

/** the settings in the address the worker was loaded from, or nothing if any is missing or unsafe */
export function settingsFromTheWorkersAddress (address: string): WorkerSettings | undefined {
  let parameters: URLSearchParams
  try {
    parameters = new URL(address).searchParams
  } catch {
    return undefined
  }
  const dataUrl = parameters.get('data')
  const indexName = parameters.get('index')
  const indexes = parameters.get('indexes')?.split(',')
  const vectorLibraryUrl = parameters.get('vectors')
  if (!dataUrl || !isWebAddress(dataUrl) || !indexName || !isPlainName(indexName)) return undefined
  if (!indexes || !indexes.length || !indexes.every(isPlainName)) return undefined
  if (!vectorLibraryUrl || !isWebAddress(vectorLibraryUrl)) return undefined
  return { dataUrl, indexName, indexes, vectorLibraryUrl }
}

/** the folder of index files on the data server */
export function indexFolderOf (settings: WorkerSettings): string {
  return `${settings.dataUrl.replace(/\/+$/, '')}/${settings.indexName}`
}

function isWebAddress (text: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol)
  } catch {
    return false
  }
}

/** one plain name: letters, numbers, dots, dashes and underscores, and not a way up out of a folder */
function isPlainName (name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && !name.includes('..')
}
