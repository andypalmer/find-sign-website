import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vitest/config').UserConfig} */
const config = {
	plugins: [sveltekit()],
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
