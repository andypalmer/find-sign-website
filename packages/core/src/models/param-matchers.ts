// route parameter matchers shared by the apps' src/params.ts files
// `vite build` validates params.ts by importing it with plain node (no vite), so this file must only import
// modules node can load directly (no extensionless imports, nothing reading import.meta.env when loaded)
import { decodeFilename } from '#lib/models/filename-codec.ts'

// no m flag: the whole value must match, not just one line of it
export const filename = (param: string) => /^[a-z0-9*~'()_.!-]+$/iu.test(param) ? param : undefined

// same list as availableIndexes in search.ts, read when called rather than when this file loads
export const provider = (param: string) => import.meta.env.VITE_SEARCH_INDEXES.split(',').includes(decodeFilename(param)) ? param : undefined
