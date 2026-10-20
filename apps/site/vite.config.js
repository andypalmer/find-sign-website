import adapter from '@sveltejs/adapter-node';
import { sveltePreprocess } from 'svelte-preprocess';
import { sveltekit } from '@sveltejs/kit/vite';
import secretGuard from '@find-sign/core/vite/secret-guard.js';

/** @type {import('vitest/config').ViteUserConfig} */
const config = {
	plugins: [
		secretGuard({
			secret: ['VITE_DISCORD_BOT_TOKEN', 'VITE_AUTOMATION_KEY'],
			// the public site never holds the data server write identity
			forbidden: ['VITE_SEARCH_WRITE_IDENTITY', 'VITE_PASSKEY_CHALLENGE_SECRET']
		}),
		sveltekit({
			// Consult https://github.com/sveltejs/svelte-preprocess
			// for more information about preprocessors
			preprocess: sveltePreprocess({ preserve: ['ld+json'] }),

			adapter: adapter({
				precompress: false // enable gzip and brotli
			}),

			prerender: {
				crawl: false
			}
		})
	],
	// allow requests forwarded by the dev TLS proxy (dev/Caddyfile) for this machine's .local name
	server: { allowedHosts: ['.local'] },
	preview: { allowedHosts: ['.local'] },
	test: {
		name: 'site',
		include: ['tests/**/*.test.ts']
	}
};

export default config;
