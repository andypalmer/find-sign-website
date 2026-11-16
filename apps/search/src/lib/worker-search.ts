// The page's search: through the service worker when the SERVICE_WORKER setting is on, and the way the site has
// always done it otherwise (see "Turning it on" in docs/service-worker-messages.md). The server's render uses the
// direct search, since only a browser has a service worker.
import { browser } from '$app/env'
import { SEARCH_DATA, SEARCH_INDEX_NAME, SEARCH_INDEXES, SERVICE_WORKER, VECTOR_INDEX } from '$app/env/public'
import { availableIndexes, search } from '@find-sign/core/search/search.ts'
import { makeServerSearch } from '@find-sign/core/search/server-search.ts'
import { createPageSearch, serviceWorkerWanted } from '@find-sign/core/worker-client/page-search.ts'

/**
 * How the page registers the worker. Sveltekit builds it as a module (it imports the site's public settings from
 * /_app/env.js), in production as well as in dev, so it has to be registered as one: a classic script can't have
 * an import statement, and the browser refuses to start it. (service-worker.build.test.ts checks this against the build.)
 */
export const workerType: 'classic' | 'module' = 'module'

export const pageSearch = createPageSearch({
  wanted: serviceWorkerWanted(SERVICE_WORKER),
  settings: {
    dataUrl: SEARCH_DATA,
    indexName: SEARCH_INDEX_NAME,
    indexes: SEARCH_INDEXES.split(',').map(name => name.trim()),
    vectorLibraryUrl: VECTOR_INDEX
  },
  container: browser && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  scriptAddress: '/service-worker.js',
  type: workerType,
  fallback: (query, start, length) => browser ? search(query, start, length) : serverSearch(query, start, length)
})

// the server's render searches the version 2 index, kept in the server's memory. It is made the first time it is
// needed, so the browser (which never renders this) doesn't build it. The browser's own fallback stays on version 1.
let searchOnTheServer: ReturnType<typeof makeServerSearch> | undefined
function serverSearch (query: string, start: number, length: number) {
  searchOnTheServer ??= makeServerSearch({ baseUrl: `${SEARCH_DATA.replace(/\/+$/, '')}/${SEARCH_INDEX_NAME}`, indexes: availableIndexes })
  return searchOnTheServer(query, start, length)
}
