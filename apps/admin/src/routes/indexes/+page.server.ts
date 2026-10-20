import type { PageServerLoad } from "./$types"
import { userHasPower } from "#lib/models/user.ts"
import { availableIndexes } from "@find-sign/core/search/search.ts"
import { loginRedirect } from "#lib/passkey/site-auth.ts"

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  return { availableIndexes }
}
