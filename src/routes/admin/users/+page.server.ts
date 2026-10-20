import { getUser, listUsers } from '$lib/models/user'
import { loginRedirect } from '$lib/passkey/site-auth'

export async function load ({ locals }) {
  if (!locals.username) loginRedirect()
  const usernames = await listUsers()
  return { usernames }
}