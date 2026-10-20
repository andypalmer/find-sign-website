// Where providers' record files are kept between builds.
import { parseRecordFile, serialiseRecordFile, type RecordFile } from '@andypalmer/records'
import { readFile, writeFile } from '@find-sign/data-io/data-io.ts'
import { bytesToString } from '@find-sign/core/functions/string-encode.ts'
import { fn } from '@find-sign/core/models/filename-codec.ts'

export interface RecordStore {
  /** the url the provider's record file is stored at: its relative urls resolve against this */
  url (provider: string): string,
  /** the provider's record file, or undefined when it has none yet */
  read (provider: string): Promise<RecordFile | undefined>,
  write (file: RecordFile): Promise<void>,
}

/** record files on the data server, at records/<provider>.records.json in the collection at `collection`
 * (SEARCH_DATA, the collection data-io writes to) */
export function dataServerRecordStore (collection: string): RecordStore {
  const path = (provider: string) => fn`records/${provider}.records.json`
  return {
    url: provider => `${collection}${path(provider)}`,
    async read (provider) {
      const bytes = await readFile(path(provider))
      return bytes && parseRecordFile(bytesToString(bytes))
    },
    async write (file) {
      await writeFile(path(file.provider.id), serialiseRecordFile(file))
    },
  }
}
