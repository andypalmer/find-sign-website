import { decode } from 'pigeonmark-xml'
import pm from 'pigeonmark-utils'

export type FeedEntry = {
  title?: string,
  description: string,
  pubDate: number,
  guid: string,
  link: string,
  category: string[]
}
export type Feed = FeedEntry[]

export default async function readFeed (feedURL: string): Promise<Feed> {
  const feed: Feed = []

  const feedResponse = await fetch(feedURL)
  const feedXML = decode(await feedResponse.text())

  for (const rss of pm.get.children(feedXML)) {
    for (const channel of pm.get.children(rss)) {
      for (const item of pm.get.children(channel)) {
        if (pm.get.name(item) !== 'item') continue;
        const entry: FeedEntry = {
          title: undefined,
          description: '',
          link: '',
          guid: '',
          pubDate: 0,
          category: []
        }
        for (const element of pm.get.children(item)) {
          const name = pm.get.name(element)
          const text = pm.get.text(element)
          if (name === 'category') {
            entry[name].push(text)
          } else if (name === 'pubDate') {
            entry[name] = Date.parse(text)
          } else {
            ;(entry as { [field: string]: unknown })[name] = text
          }
        }
        feed.push(entry)
      }
    }
  }

  return feed.sort((x, y) => y.pubDate - x.pubDate)
}