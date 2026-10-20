import { getUser, userHasPower } from '$lib/models/user'
import { loginRedirect } from '$lib/passkey/site-auth'

export async function load ({ locals, params }) {
  if (!locals.username) loginRedirect()
  const canEdit = await userHasPower(locals.username, 'edit-users')
  const user = await getUser(params.user)
  return { username: params.user, user, canEdit }
}
