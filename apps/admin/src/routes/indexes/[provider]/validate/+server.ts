import { createProgressLog, nextUpdateResponse } from '#lib/progress/progress-log.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'
import type { RequestHandler } from './$types'
import { readEncodedSearchData } from '#lib/indexing.ts'
import { validateEncodedSearchDataEntry } from '@find-sign/core/orthagonal/types.ts'
import { ENCODED_SEARCH_DATAS } from '$app/env/private'

/** long polling endpoint for progress and log streaming from the post endpoints long running output */
export const GET: RequestHandler = async (event) => {
  return await nextUpdateResponse(event)
}

/** endpoint for manually rebuilding search index, e.g. after authoring an index override */
export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.username) loginRedirect()
  const index = params.provider

  const progress = createProgressLog(async ({ log, progress }) => {
    const searchData = await readEncodedSearchData(`${ENCODED_SEARCH_DATAS}/${index}.json`)
    for (const key in searchData) {
      const entry = searchData[key]
      try {
        validateEncodedSearchDataEntry(entry)
      } catch (err) {
        log(`${key}: ${(err as Error).message}`)
      }
    }
    progress(1.0)
  })

  return Response.json({ progress })
}
