// route parameter matchers shared by the apps' src/params.ts files
// `vite build` validates params.ts by importing it with plain node (no vite), so this file must only import
// modules node can load directly: no extensionless imports, and no settings ($app/env), which plain node can't load

// no m flag: the whole value must match, not just one line of it
export const filename = (param: string) => /^[a-z0-9*~'()_.!-]+$/iu.test(param) ? param : undefined

// a provider id's shape only: matchers can't read the SEARCH_INDEXES setting, so routes check
// availableIndexes (search.ts) themselves and 404 for providers that aren't configured
export const provider = filename
