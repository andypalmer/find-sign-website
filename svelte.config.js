import adapter from '@sveltejs/adapter-node';
import { sveltePreprocess } from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: sveltePreprocess({ preserve: ['ld+json'] }),

	kit: {
		adapter: adapter({
			precompress: false // enable gzip and brotli
		}),

		prerender: {
			crawl: false
		}
	}
};

export default config;
