import type { RequestHandler } from "./$types"
import { error } from "@sveltejs/kit"
import { isValidAnalyticsTopic, recordAnalytics } from "#lib/models/analytics.ts"

export const GET: RequestHandler = async ({ url }) => {
  const topic = url.searchParams.get('topic')
  if (topic === null || !isValidAnalyticsTopic(topic)) {
    error(500, 'unsupported topic')
  }
  await recordAnalytics(topic, 1)
  return Response.json({ status: 'ok' })
}
