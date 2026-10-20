import { listAnalyticsTopics } from "#lib/models/analytics.ts"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async () => {
  return { topics: await listAnalyticsTopics() }
}
