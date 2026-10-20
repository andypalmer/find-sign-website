// vitest aliases for every workspace's config: replace sveltekit's $app/env modules with stand-ins that read
// process.env, so tests set settings with test-env.ts. (in the apps' tests these take precedence over
// sveltekit's own modules, which would hold values loaded from .env when vitest started)
import { fileURLToPath } from 'node:url'

const here = (/** @type {string} */ file) => fileURLToPath(new URL(file, import.meta.url))

export default [
	{ find: /^\$app\/env\/public$/, replacement: here('./app-env-public.ts') },
	{ find: /^\$app\/env\/private$/, replacement: here('./app-env-private.ts') },
	{ find: /^\$app\/env$/, replacement: here('./app-env.ts') },
]
