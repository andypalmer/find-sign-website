import { fn } from '#lib/models/filename-codec.ts'
import { getSearchLibrary, availableIndexes } from '#lib/search/search.ts'

const staticPages = [
  '/about',
  '/technology',
  '/feeds/discovery.atom',
  '/feeds/discovery.json',
  '/feeds/discovery.rss',
]

function lastmod (timestamp) {
  const date = new Date(timestamp)
  const prefix = (str) => `00${str}`.slice(-2)
  return `<lastmod>${date.getUTCFullYear()}-${prefix(date.getUTCMonth() + 1)}-${prefix(date.getUTCDate())}</lastmod>`
}

export async function GET ({ url }) {
  const indexes = [...availableIndexes]
  return new Response(new ReadableStream({
    start (controller) {
      controller.enqueue('<?xml version="1.0" encoding="UTF-8" ?>\n')
      controller.enqueue('<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">\n')

      controller.enqueue(`<url><loc>${new URL('/', url)}</loc><changefreq>daily</changefreq></url>`)

      for (const path of staticPages) {
        controller.enqueue(`<url><loc>${new URL(path, url)}</loc><changefreq>yearly</changefreq></url>\n`)
      }

      controller.enqueue(`<url><loc>${new URL(fn`/sign/`, url)}</loc><changefreq>yearly</changefreq></url>\n`)
    },
    async pull (controller) {
      if (indexes.length > 0) {
        const index = indexes.shift()

        const libraries = await getSearchLibrary([index], ['id', 'timestamp'])
        const lib = libraries[index]

        controller.enqueue(`<url><loc>${new URL(fn`/sign/${index}`, url)}</loc>${lastmod(lib.meta.buildTimestamp)}</url>\n`)

        for (const { id, timestamp } of lib.entries) {
          controller.enqueue('<url>')
          controller.enqueue(`<loc>${new URL(fn`/sign/${index}/${id}`, url)}</loc>`)
          if (timestamp) {
            controller.enqueue(lastmod(timestamp))
          }
          controller.enqueue('</url>\n')
        }
      } else {
        controller.enqueue('</urlset>\n')
        controller.close()
      }
    }
  }), { headers: { 'Content-Type': 'application/xml' } })
}
