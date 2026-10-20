import readFeed from "#lib/data-io/rss.ts"
import { NEWS_RSS } from "$app/env/private"

export async function load ({}) {
  const feed = await readFeed(NEWS_RSS)

  return { feed }
}
