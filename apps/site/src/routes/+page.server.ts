import type { PageServerLoad } from './$types'
import { getUpdatesFeed } from './feeds/_read-discovery-feed'
import { immediateResponseCache } from '#lib/functions/cache.ts'
import readFeed from '#lib/data-io/rss.ts'

export const prerender = false

const feedEntries = 20

export const load: PageServerLoad = immediateResponseCache(async ({ url, setHeaders }) => {
  const [searchFeed, rssFeed] = await Promise.all([
    getUpdatesFeed({ url, page: 0, length: feedEntries, extended: true }),
    (async function () {
      try {
        return await readFeed(import.meta.env.VITE_NEWS_RSS)
      } catch (err) {
        console.error('Homepage blog feed failed to load', err)
        return []
      }
    })()
  ])
  const feed = [...searchFeed.items.map(x => ({
    author: x.authors[0],
    verb: x.__fs_verb,
    title: (x.__fs_words ?? []).join(' '),
    date: x.date_published,
    cacheURL: x.url,
    remoteURL: x.external_url
  })).reverse(), ...rssFeed.map(entry => ({
    author: { name: 'Find Sign' },
    verb: 'blogged',
    title: entry.title || 'an update about the site',
    date: (new Date(entry.pubDate)).toISOString(),
    remoteURL: entry.link,
  }))].sort((x, y) => Date.parse(x.date) - Date.parse(y.date)).slice(-feedEntries)

  const automated = url.searchParams.has('automated')

  return { feed, automated }
})
