// types for the sveltekit modules the packages read settings from. inside an app, sveltekit generates these from
// the app's src/env.ts; packages type-check without an app, so they're declared here (matching env-vars.ts)

declare module '$app/env' {
	export const browser: boolean
	export const dev: boolean
	export const building: boolean
	export const version: string
}

declare module '$app/env/public' {
	export const SEARCH_DATA: string
	export const SEARCH_INDEX_NAME: string
	export const SEARCH_INDEXES: string
	export const VECTOR_INDEX: string
	export const VERSION_LABEL: string | undefined
}

declare module '$app/env/private' {
	export const ENCODED_SEARCH_DATAS: string
	export const LOCALE: string | undefined
	export const VECTOR_FIDELITY: string | undefined
	export const SEARCH_WRITE_IDENTITY: string | undefined
}
