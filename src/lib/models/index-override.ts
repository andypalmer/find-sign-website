import { readFile, writeFile, deletePath, listFilenames } from '#lib/data-io/data-io.ts'
import { bytesToString } from '#lib/functions/string-encode.ts'
import { fn, decodeFilename } from '#lib/models/filename-codec.ts'
import type { SearchDataEncodedMedia } from '#lib/orthagonal/types.ts'

export type IndexOverride = {
  id?: string,
  published?: boolean,
  title?: string,
  words?: string[],
  tags?: string[],
  body?: string,
  link?: string,
  nav?: [label: string, link: string][],
  provider?: {
    id: string,
    name: string,
    link: string,
  },
  author?: {
    id: string,
    name: string,
    link: string,
    avatar: string,
  }
  media?: SearchDataEncodedMedia[],
  timestamp?: number,
}

export async function listOverrides () {
  const filenames = await listFilenames('overrides')
  return filenames.filter(x =>
    x.endsWith('.json')
  ).map(x => {
    const [provider, id] = x.replace(/\.json$/, '').split(':').map(decodeFilename)
    return { provider, id }
  })
}

export async function getOverrideFor (provider: string, id: string): Promise<IndexOverride> {
  const data = await readFile(fn`overrides/${provider}:${id}.json`)
  if (!data) throw new Error(`No override for ${provider}:${id}`)
  const json = JSON.parse(bytesToString(data))
  return json
}

export async function setOverrideFor (provider: string, id: string, data: IndexOverride) {
  await writeFile(fn`overrides/${provider}:${id}.json`, JSON.stringify(data))
}

export async function deleteOverrideFor (provider: string, id: string) {
  await deletePath(fn`overrides/${provider}:${id}.json`)
}
