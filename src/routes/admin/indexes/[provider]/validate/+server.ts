import { json } from '@sveltejs/kit'
import { createProgressLog, nextUpdateResponse } from '$lib/progress/progress-log'
import { loginRedirect } from '$lib/passkey/site-auth'
import type { RequestHandler } from './$types'
import { readEncodedSearchData } from '$lib/orthagonal/write'
import { validateEncodedSearchDataEntry } from '$lib/orthagonal/types'

/** long polling endpoint for progress and log streaming from the post endpoints long running output */
export const GET: RequestHandler = async (event) => {
  return await nextUpdateResponse(event)
}

/** endpoint for manually rebuilding search index, e.g. after authoring an index override */
export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.username) loginRedirect()
  const index = params.provider

  const progress = createProgressLog(async ({ log, progress }) => {
    const searchData = await readEncodedSearchData(`${import.meta.env.VITE_ENCODED_SEARCH_DATAS}/${index}.json`)
    for (const key in searchData) {
      const entry = searchData[key]
      try {
        validateEncodedSearchDataEntry(entry)
      } catch (err) {
        log(`${key}: ${err.message}`)
      }
    }
    progress(1.0)
  })

  return json({ progress })
}