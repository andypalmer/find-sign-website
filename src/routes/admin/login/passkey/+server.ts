import { passkeyPOST } from "#lib/passkey/site-auth.ts"
import type { RequestHandler } from "@sveltejs/kit"

export const POST: RequestHandler = passkeyPOST
