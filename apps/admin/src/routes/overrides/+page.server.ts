import { listOverrides } from "@find-sign/indexer/models/index-override.ts"
import { loginRedirect } from '#lib/passkey/site-auth.ts'

export async function load ({ locals }) {
  if (!locals.username) loginRedirect()

  const overrides = await listOverrides()
  return { overrides }
}
