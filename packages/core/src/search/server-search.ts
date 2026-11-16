// The server's search on the version 2 index: the same search engine the page uses, run on the server's kept
// library (see server-library.ts). Word vectors come from the same word vector library the version 1 search uses.
import { answerSearch, type SearchResponse } from './search-engine.ts'
import { lookup } from './loaded-precomputed-vectors.ts'
import { serverLibrary, type ServerLibraryOptions } from './server-library.ts'

export function makeServerSearch (options: ServerLibraryOptions): (query: string, start: number, length: number) => Promise<SearchResponse> {
  const seams = serverLibrary(options).asSearchSeams(lookup)
  return (query, start, length) => answerSearch(query, start, length, seams)
}
