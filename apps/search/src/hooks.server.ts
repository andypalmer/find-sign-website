// On the server, an error nobody expected is logged (so it is in the server's log), and on a site with a version label
// (a beta) the error page says what it was (see lib/describe-error.ts). The hook has to be here because it replaces
// SvelteKit's own logging.
import type { HandleServerError } from '@sveltejs/kit/hooks'
import { VERSION_LABEL } from '$app/env/public'
import { errorForTheErrorPage } from '#lib/describe-error.ts'

export const handleError: HandleServerError = ({ kind, error }) => {
  if (kind !== 'unknown') return
  console.error(error)
  return errorForTheErrorPage(error, VERSION_LABEL)
}
