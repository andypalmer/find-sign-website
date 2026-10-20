// stands in for sveltekit's $app/env/public in tests (see vitest-aliases.js): values come from process.env,
// which test-env.ts fills before any module reading them loads
const { env } = process
export const SEARCH_DATA = env.SEARCH_DATA as string
export const SEARCH_INDEX_NAME = env.SEARCH_INDEX_NAME as string
export const SEARCH_INDEXES = env.SEARCH_INDEXES as string
export const VECTOR_INDEX = env.VECTOR_INDEX as string
export const VERSION_LABEL = env.VERSION_LABEL || undefined
export const ADMIN_URL = env.ADMIN_URL || undefined
