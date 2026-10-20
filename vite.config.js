import adapter from '@sveltejs/adapter-node';
import { sveltePreprocess } from 'svelte-preprocess';
import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vitest/config').ViteUserConfig} */
const config = {
	plugins: [
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
		include: ['tests/**/*.test.ts'],
		coverage: {
			include: ['src/**']
		}
	}
};

export default config;
