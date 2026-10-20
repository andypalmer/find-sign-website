import type { PageServerLoad } from './$types'
import { userHasPower } from '#lib/models/user.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'
import { getSearchLibrary } from '@find-sign/core/search/search.ts'
import { decodeFilename } from '@find-sign/core/models/filename-codec.ts'
import { error } from '@sveltejs/kit'

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  const provider = decodeFilename(params.provider)
  const id = decodeFilename(params.id)

  const indexes = await getSearchLibrary([provider], ['id', 'title'])
  const index = indexes[provider]
  const entry = index.entries.find(x => x.id === id)
  if (entry) {
    return { provider, id, entry: await entry.load() }
  } else {
    error(404)
  }
}
