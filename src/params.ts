// route parameter matchers
// `vite build` validates this file by importing it with plain node (no vite), so it must only import
// modules node can load directly (no extensionless imports, nothing reading import.meta.env when loaded)
import { defineParams } from '@sveltejs/kit/params'
import { isValidAnalyticsTopic } from '#lib/models/analytics-topics.ts'
import { decodeFilename } from '#lib/models/filename-codec.ts'

export const params = defineParams({
  analyticsTopic: (param) => isValidAnalyticsTopic(param) ? param : undefined,

  // no m flag: the whole value must match, not just one line of it
  filename: (param) => /^[a-z0-9*~'()_.!-]+$/iu.test(param) ? param : undefined,

  // same list as availableIndexes in search.ts, read when called rather than when this file loads
  provider: (param) => import.meta.env.VITE_SEARCH_INDEXES.split(',').includes(decodeFilename(param)) ? param : undefined,
})
