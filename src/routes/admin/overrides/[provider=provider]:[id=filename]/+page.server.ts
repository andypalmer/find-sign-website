import { decodeFilename, fn } from '#lib/models/filename-codec.ts'
import { getOverrideFor } from '#lib/models/index-override.ts'
import { userHasPower } from '#lib/models/user.ts'
import { readEncodedSearchData } from '#lib/orthagonal/write.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'

export async function load ({ locals, params }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  const [provider, id] = [params.provider, params.id].map(decodeFilename)
  const searchDataURL = import.meta.env.VITE_ENCODED_SEARCH_DATAS + fn`/${provider}.json`
  const searchData = await readEncodedSearchData(searchDataURL)
  const entry = { id, provider: { id: provider }, ...searchData[id] }
  let override = {}
  try {
    override = await getOverrideFor(provider, id)
  } catch (err) {}

  return { entry, override }
}
