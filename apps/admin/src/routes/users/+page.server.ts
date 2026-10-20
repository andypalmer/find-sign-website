import { getUser, listUsers } from '#lib/models/user.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'

export async function load ({ locals }) {
  if (!locals.username) loginRedirect()
  const usernames = await listUsers()
  return { usernames }
}
