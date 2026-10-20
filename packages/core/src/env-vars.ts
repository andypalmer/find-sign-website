// settings shared by the apps' src/env.ts files (sveltekit's defineEnvVars). none are static, so they're read
// from the environment when the server starts (a container's env, or .env in dev): one image serves any
// deployment. public ones also reach the browser, in the page payload. code reads them from $app/env/public
// and $app/env/private
import { building } from '$app/env'

/** validator for a setting that must be set. sveltekit also starts the app while `vite build` analyses it,
 * when there's no deployment environment, so it's allowed to be missing then */
export function required (value: string | undefined): string {
  if (value) return value
  if (building) return ''
  throw new Error('must be set')
}

/** validator for a setting that may be left unset or empty */
export function optional (value: string | undefined): string | undefined {
  return value || undefined
}

/** validator for a setting this app must never be given */
export function forbidden (value: string | undefined): undefined {
  if (value) throw new Error('must not be set for this app')
  return undefined
}

/** read by core's search, in the browser and on the server */
export const coreEnvVars = {
  SEARCH_DATA: { public: true, schema: required, description: 'url of the find-sign collection on the data server, ending in /' },
  SEARCH_INDEX_NAME: { public: true, schema: required, description: 'folder in SEARCH_DATA holding the search indexes, usually "index"' },
  SEARCH_INDEXES: { public: true, schema: required, description: 'comma separated ids of the providers to search' },
  VECTOR_INDEX: { public: true, schema: required, description: 'url of the precomputed word vector library' },
  VERSION_LABEL: { public: true, schema: optional, description: 'label shown with the logo, such as "Beta"' },
}

/** read by the indexer, which only runs on the admin server */
export const indexerEnvVars = {
  ENCODED_SEARCH_DATAS: { schema: required, description: 'url of the encoded-search-data collection on the data server' },
  LOCALE: { schema: optional, description: 'locale for splitting titles into words, such as "en-AU"' },
  VECTOR_FIDELITY: { schema: optional, description: 'precision of global-vectors.lps, from 0 to 1 (default 1)' },
}
