import type { PageServerLoad } from './$types'
import { getUser } from '$lib/models/user'

import { loginRedirect } from '$lib/passkey/site-auth'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.username) loginRedirect()
  const user = await getUser(locals.username)
  if (!user) loginRedirect()

  return {
    username: locals.username,
    powers: [],
    ...user
  }
}
