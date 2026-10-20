import { getUser, userHasPower } from '#lib/models/user.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'
import { error } from '@sveltejs/kit'

export async function load ({ locals, params }) {
  if (!locals.username) loginRedirect()
  const canEdit = await userHasPower(locals.username, 'edit-users')
  const user = await getUser(params.user)
  if (!user) error(404, 'User not found')
  return { username: params.user, user, canEdit }
}
