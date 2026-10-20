import { listOverrides } from "$lib/models/index-override"
import { loginRedirect } from '$lib/passkey/site-auth'

export async function load ({ locals }) {
  if (!locals.username) loginRedirect()

  const overrides = await listOverrides()
  return { overrides }
}