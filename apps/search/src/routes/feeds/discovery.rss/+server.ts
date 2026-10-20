import { getUpdatesFeed } from '../_read-discovery-feed'
import encode from 'pigeonmark-xml/library/encode.js'

export const prerender = false

// how many entries does the json feed contain
const length = 50

export async function GET ({ url }) {
  const page = parseInt(url.searchParams.get('page') || '0')
  const jsonFeed = await getUpdatesFeed({ url, page, length })

  const body = encode(['#document', { xmlpi: [['?xml', { version: '1.0' }]] },
    ['rss', { version: '2.0', 'xmlns:atom': 'http://www.w3.org/2005/Atom' },
      ['channel',
        ['title', jsonFeed.title],
        ['link', jsonFeed.home_page_url],
        ['atom:link', { rel: 'self', type: 'application/rss+xml', href: jsonFeed.feed_url }],
        ['description', 'Discovery Feed, provides a feed of recently added new entries in the search engine'],
        ['lastBuildDate', (new Date).toUTCString()],
        ['generator', 'find-sign-website'],
        ...jsonFeed.items.map(item => (['item',
          ['title', item.title],
          ['link', item.url],
          ['pubDate', (new Date(item.date_published)).toUTCString()],
          ['guid', item.external_url],
          ['description', item.content_text],
          ...item.attachments.map(media =>
            ['enclosure', { type: media.mime_type, url: media.url, length: `${media.size_in_bytes}` }]
          )
        ]))
      ]
    ]
  ])

  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=UTF-8' } })
}