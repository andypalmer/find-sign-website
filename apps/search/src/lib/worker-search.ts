// The page's search: through the service worker when the SERVICE_WORKER setting is on, and the way the site has
// always done it otherwise (see "Turning it on" in docs/service-worker-messages.md). The server's render uses the
// direct search, since only a browser has a service worker.
import { browser, dev } from '$app/env'
import { SEARCH_DATA, SEARCH_INDEX_NAME, SEARCH_INDEXES, SERVICE_WORKER, VECTOR_INDEX } from '$app/env/public'
import { search } from '@find-sign/core/search/search.ts'
import { createPageSearch, serviceWorkerWanted } from '@find-sign/core/worker-client/page-search.ts'

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
  // the dev server serves the worker as a module; the built site's is a classic script
  type: dev ? 'module' : 'classic',
  fallback: (query, start, length) => search(query, start, length)
})
