import appEnvAliases from '@find-sign/test-helpers/vitest-aliases.js'

/** @type {import('vitest/config').ViteUserConfig} */
export default {
	test: {
		name: 'indexer',
		include: ['tests/**/*.test.ts'],
		alias: appEnvAliases
	}
}
