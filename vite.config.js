import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vitest/config').UserConfig} */
const config = {
	plugins: [sveltekit()],
	test: {
		include: ['tests/**/*.test.ts'],
		coverage: {
			include: ['src/**']
		}
	}
};

export default config;
