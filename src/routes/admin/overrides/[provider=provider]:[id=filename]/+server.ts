import { writeAuditLog } from '$lib/models/audit-log'
import { decodeFilename, fn } from '$lib/models/filename-codec'
import { getOverrideFor, setOverrideFor, deleteOverrideFor } from '$lib/models/index-override'
import { userHasPower } from '$lib/models/user'
import { loginRedirect } from '$lib/passkey/site-auth'

export async function POST ({ locals, params, request, url }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')
  const [provider, id] = [params.provider, params.id].map(decodeFilename)
  const json = await request.json()
  await writeAuditLog(locals.username, 'override-search-data-entry', `Edited search index override for "${provider}:${id}"`, {
    index: provider,
    entryID: id,
    adminURL: url.pathname,
    publicURL: fn`/sign/${provider}/${id}`,
    object: json
  })
  await setOverrideFor(provider, id, json)
  return new Response(null, { status: 204 })
}

export async function DELETE ({ locals, params, url }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  const [provider, id] = [params.provider, params.id].map(decodeFilename)
  await writeAuditLog(locals.username, 'override-search-data-entry', `Edited search index override for "${provider}:${id}"`, {
    index: provider,
    entryID: id,
    adminURL: url.pathname,
    publicURL: fn`/sign/${provider}/${id}`,
    object: await getOverrideFor(provider, id)
  })
  await deleteOverrideFor(provider, id)
  return new Response(null, { status: 204 })
}
