// Building the website's search indexes with @andypalmer/indexer, from this app's settings.
import { buildSearchIndex as build, readEncodedSearchData as read, type BuildOptions, type IndexSettings } from '@andypalmer/indexer'
import { dataStore } from '@find-sign/data-io/data-io.ts'
import { lookup } from '@find-sign/core/search/loaded-precomputed-vectors.ts'
import { SEARCH_DATA, SEARCH_INDEX_NAME, SEARCH_INDEXES } from '$app/env/public'
import { ENCODED_SEARCH_DATAS, LOCALE, VECTOR_FIDELITY } from '$app/env/private'

export function indexSettings (): IndexSettings {
  return {
    store: dataStore,
    collectionURL: SEARCH_DATA,
    encodedSearchDataURL: ENCODED_SEARCH_DATAS,
    indexName: SEARCH_INDEX_NAME,
    indexes: SEARCH_INDEXES.split(','),
    lookupVector: lookup,
    vectorFidelity: parseFloat(VECTOR_FIDELITY || '1.0'),
    locale: LOCALE,
  }
}

/** builds a provider's index from its encoded-search-data, then rebuilds global-vectors.lps */
export async function buildSearchIndex (provider: string, options: BuildOptions = {}) {
  await build(provider, indexSettings(), options)
}

/** an encoded-search-data file, with defaults applied and its urls made absolute */
export async function readEncodedSearchData (url: string) {
  return await read(url, { locale: LOCALE })
}
