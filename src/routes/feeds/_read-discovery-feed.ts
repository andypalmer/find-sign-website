import { resolve } from '$app/paths'
import { encodeFilename } from '#lib/models/filename-codec.ts'
import { getSearchLibrary } from '#lib/search/search.ts'

export const prerender = false

export async function getUpdatesFeed ({ page = 0, length = 30, url, extended = false }: { page?: number, length?: number, url: URL, extended?: boolean }) {

  const libraries = await getSearchLibrary(false, ['timestamp'])
  let updates = Object.values(libraries).flatMap(x => x.entries)

  updates = updates.filter(x => x.timestamp && x.timestamp > 0)
  updates = updates.sort((a, b) => (b.timestamp as number) - (a.timestamp as number))
  updates = updates.slice(length * page, length * (page + 1))

  const loaded = await Promise.all(updates.map(x => x.load()))

  const version = 'https://jsonfeed.org/version/1.1'

  const title = 'Sign Language Updates'
  const home_page_url = (new URL(resolve(''), url)).toString()
  const feed_url = (new URL('?page=0', url)).toString()
  const next_url = updates.length ? (new URL(`?page=${page + 1}`, url)).toString() : null

  return {
    version, title, home_page_url, feed_url, next_url,
    items: loaded.map(entry => {
      // built index entries always have a provider, and these were filtered to ones with timestamps
      const provider = entry.provider as { id: string, name?: string, verb?: string, link?: string }
      return {
        id: `${provider.id}:${entry.id}`,
        title: `${provider.name} ${provider.verb || 'shared'}: ${entry.title}`,
        url: (new URL(`/sign/${encodeFilename(provider.id)}/${encodeFilename(entry.id)}`, url)).toString(),
        external_url: entry.link,
        authors: entry.author
          ? [{
              name: entry.author.name,
              url: entry.author.link,
              avatar: entry.author.avatar
            }]
          : [{
              name: provider.name,
              url: provider.link
            }],
        date_published: (new Date(entry.timestamp as number)).toISOString(),
        content_text: `${entry.body}`,
        attachments: entry.media.flatMap((x, idx) => {
          return x.encodes.map(x => {
            return {
              url: x.url,
              mime_type: x.type,
              title: `Video ${idx + 1}`,
              size_in_bytes: x.byteSize,
              duration_in_seconds: x.duration,
            }
          })
        }),
        ...(extended ? {
          __fs_verb: provider.verb,
          __fs_words: entry.words
        } : {})
      }
    })
  }
}