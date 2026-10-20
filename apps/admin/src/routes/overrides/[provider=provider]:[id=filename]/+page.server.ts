import { decodeFilename, fn } from '@find-sign/core/models/filename-codec.ts'
import { getOverrideFor, type IndexOverride } from '@find-sign/indexer/models/index-override.ts'
import { userHasPower } from '#lib/models/user.ts'
import { readEncodedSearchData } from '@find-sign/indexer/orthagonal/write.ts'
import type { EncodedSearchDataEntry } from '@find-sign/core/orthagonal/types.ts'
import { loginRedirect } from '#lib/passkey/site-auth.ts'

export async function load ({ locals, params }) {
  if (!locals.username) loginRedirect()
  if (!await userHasPower(locals.username, 'edit-index')) throw new Error('You don’t have the right to edit search index')

  const [provider, id] = [params.provider, params.id].map(decodeFilename)
  const searchDataURL = import.meta.env.VITE_ENCODED_SEARCH_DATAS + fn`/${provider}.json`
  const searchData = await readEncodedSearchData(searchDataURL)
  const entry = { id, provider: { id: provider }, ...(searchData[id] as Partial<EncodedSearchDataEntry>) } as EncodedSearchDataEntry
  let override: IndexOverride = {}
  try {
    override = await getOverrideFor(provider, id)
  } catch (err) {}

  return { entry, override }
}
