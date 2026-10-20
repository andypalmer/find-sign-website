import { parse, type WordVector } from './precomputed-vectors'

export default async function open (path: string): Promise<{ [word: string]: WordVector } | undefined> {
  const response = await fetch(path, { cache: 'no-cache' })
  if (response.ok) {
    const buffer = new Uint8Array(await response.arrayBuffer())

    const obj: { [word: string]: WordVector } = {}
    for (const { word, getVector} of parse(buffer)) {
      obj[word] = getVector()
    }

    return obj
  }
}
