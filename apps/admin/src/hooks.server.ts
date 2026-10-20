import type { Handle } from '@sveltejs/kit/hooks';
import { getSession } from '#lib/passkey/site-auth.ts';

export const handle: Handle = async function ({ event, resolve }) {
	Object.assign(event.locals, getSession(event))

	return await resolve(event)
}
