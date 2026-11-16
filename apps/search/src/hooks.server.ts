// On the server, an error nobody expected is logged (so it is in the server's log), and on a site with a version label
// (a beta) the error page says what it was (see lib/describe-error.ts). The hook has to be here because it replaces
// SvelteKit's own logging.
import type { HandleServerError } from '@sveltejs/kit/hooks'
import { SEARCH_DATA, SEARCH_INDEX_NAME, VERSION_LABEL } from '$app/env/public'
import { errorForTheErrorPage } from '#lib/describe-error.ts'
import { availableIndexes, getSearchLibraryFromVersion1, knownVectorsFromVersion1, useTheBookshelf } from '@find-sign/core/search/search.ts'
import { makeBookshelf } from '@find-sign/core/search/bookshelf-library.ts'

// the server reads the version 2 index from its own memory for every search and every caller of getSearchLibrary.
// Until the data server publishes version 2, the bookshelf answers from the version 1 files instead (see bookshelf-library.ts)
useTheBookshelf(makeBookshelf({
  baseUrl: `${SEARCH_DATA.replace(/\/+$/, '')}/${SEARCH_INDEX_NAME}`,
  indexes: availableIndexes,
  fallback: getSearchLibraryFromVersion1,
  fallbackKnownVectors: knownVectorsFromVersion1
}))

export const handleError: HandleServerError = ({ kind, error }) => {
  if (kind !== 'unknown') return
  console.error(error)
  return errorForTheErrorPage(error, VERSION_LABEL)
}
