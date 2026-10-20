// route parameter matchers
// `vite build` validates this file by importing it with plain node (no vite), so it must only import
// modules node can load directly (no extensionless imports, nothing reading import.meta.env when loaded)
import { defineParams } from '@sveltejs/kit/params'
import { isValidAnalyticsTopic } from '#lib/models/analytics-topics.ts'
import { filename, provider } from '@find-sign/core/models/param-matchers.ts'

export const params = defineParams({
  analyticsTopic: (param) => isValidAnalyticsTopic(param) ? param : undefined,
  filename,
  provider,
})
