import { userHasPower } from '$lib/models/user'
import { getSearchLibrary } from '$lib/search/search'
import { loginRedirect } from '$lib/passkey/site-auth'

export async function load ({ locals, params }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  const indexes = await getSearchLibrary([params.provider], ['id', 'title'])
  const index = indexes[params.provider]
  return {
  provider: params.provider,
  meta: index.meta,
  entries: index.entries.map(x => ({ id: x.id, title: x.title }))
}
}