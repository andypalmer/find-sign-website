import { decodeFilename } from '@find-sign/core/models/filename-codec.ts'
import buildSearchIndex from '@find-sign/indexer/orthagonal/build.ts'
import { availableIndexes } from '@find-sign/core/search/search.ts'
import { AUTOMATION_KEY } from '$app/env/private'

/** endpoint for cron-like tasks to automatically rebuild orthagonal indexes after encoder has done it's work */
export async function GET ({ url, params }) {
  if (!AUTOMATION_KEY || url.searchParams.get('key') !== AUTOMATION_KEY) return new Response('needs automation key query string param', { status: 400 })

  const provider = decodeFilename(params.provider)
  if (!availableIndexes.includes(provider)) return new Response('unknown provider', { status: 404 })

  // stream the response back with realtime logging and progress updates as a chunked response
  return new Response(new ReadableStream({
    async start (controller) {
      let lastProgress = 0.0
      const progress = (num: number) => {
        if (num > lastProgress + 0.05 || num === 1.0) {
          controller.enqueue(`Progress: ${Math.round(num * 100)}%\n`)
          lastProgress = Math.round(num * 100) / 100
        }
      }
      const log = (...args: any[]) => {
        controller.enqueue(args.join(' ') + '\n')
      }

      await buildSearchIndex(provider, { log, progress, fast: true })

      controller.close()
    }
  }), { headers: { 'Content-Type': 'text/plain' } })
}
