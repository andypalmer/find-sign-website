import { json } from '@sveltejs/kit'
import { writeAuditLog, type AuditExtraData } from '$lib/models/audit-log'
import { fn } from '$lib/models/filename-codec'
import { userHasPower } from '$lib/models/user'
import buildSearchIndex from '$lib/orthagonal/build'
import { createProgressLog, nextUpdateResponse } from '$lib/progress/progress-log'
import { loginRedirect } from '$lib/passkey/site-auth'
import type { RequestHandler } from './$types'

/** long polling endpoint for progress and log streaming from the post endpoints long running output */
export const GET: RequestHandler = async (event) => {
  return await nextUpdateResponse(event)
}

/** endpoint for manually rebuilding search index, e.g. after authoring an index override */
export const POST: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')
  const fast = !!url.searchParams.has('fast')

  const auditExtra: AuditExtraData = {
    publicURL: fn`/sign/${params.provider}`,
    adminURL: `/admin/indexes/${encodeURIComponent(params.provider)}`,
    index: params.provider,
  }
  if (fast) {
    await writeAuditLog(locals.username, 'update-index', `Quick rebuilt "${params.provider}" index`, auditExtra)
  } else {
    await writeAuditLog(locals.username, 'rebuild-index', `Deep rebuilt "${params.provider}" index`, auditExtra)
  }

  const progress = createProgressLog(async ({ log, progress }) => {
    await buildSearchIndex(params.provider, { log, progress, fast })
  })

  return json({ progress })
}