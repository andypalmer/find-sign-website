import type { RequestHandler } from "./$types"
import { error, json } from "@sveltejs/kit"
import { isValidAnalyticsTopic, recordAnalytics } from "$lib/models/analytics"

export const GET: RequestHandler = async ({ url }) => {
  const topic = url.searchParams.get('topic')
  if (!isValidAnalyticsTopic(topic)) {
    error(500, 'unsupported topic')
  }
  await recordAnalytics(topic, 1)
  return json({ status: 'ok' })
}