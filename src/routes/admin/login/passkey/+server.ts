import { passkeyPOST } from "$lib/passkey/site-auth"
import type { RequestHandler } from "@sveltejs/kit"

export const POST: RequestHandler = passkeyPOST
