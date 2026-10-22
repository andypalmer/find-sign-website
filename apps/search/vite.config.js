import adapter from '@sveltejs/adapter-node';
import { sveltePreprocess } from 'svelte-preprocess';
import { sveltekit } from '@sveltejs/kit/vite';
import appEnvAliases from '@find-sign/test-helpers/vitest-aliases.js';
import { searchForWorkspaceRoot } from 'vite';
import { readdirSync, realpathSync } from 'node:fs';

// while the pipeline's packages are linked from the folder next to this repo (file: dependencies), the dev server
// may serve them too. Installed from GitHub Packages, they're inside node_modules and this adds nothing new
/** @type {string[]} */
let linkedPackages = [];
try {
	linkedPackages = readdirSync('../../node_modules/@andypalmer').map(name => realpathSync(`../../node_modules/@andypalmer/${name}`));
} catch {}

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
	server: { allowedHosts: ['.local'], fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...linkedPackages] } },
	preview: { allowedHosts: ['.local'] },
	test: {
		name: 'search',
		include: ['tests/**/*.test.ts'],
		alias: appEnvAliases
	}
};

export default config;
