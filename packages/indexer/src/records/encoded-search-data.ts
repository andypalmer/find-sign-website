// Converts between today's encoded-search-data files and record files (@find-sign/records), in both
// directions, keeping urls relative to the file as stored. Converting a file to records and back gives the
// entries readEncodedSearchData would have read from it, apart from the quirks the record schema doesn't
// allow, which are fixed and reported (see Quirk).
import { createRecordFile, observe, type Digest, type MediaItem, type ProviderInfo, type RecordContent, type RecordFile, type SignRecord } from '@find-sign/records'
import type { EncodedSearchData, EncodedSearchDataEntry, SearchDataEncodedMedia } from '@find-sign/core/orthagonal/types.ts'
import { withSearchDataDefaults } from '../orthagonal/search-data-defaults.ts'

export type FromEncodedSearchDataOptions = {
  /** the provider's id, the file's name without .json */
  provider: string,
  /** when the conversion ran (an ISO timestamp): first seen, for entries without a timestamp, and last seen */
  seenAt: string,
  /** for splitting titles into words, when an entry has no words */
  locale?: string,
  digest?: Digest,
  /** told about each quirk fixed on the way in */
  onQuirk?: (quirk: Quirk) => void,
}

/** something in an encoded-search-data entry the record schema doesn't allow, and what was done about it */
export type Quirk = { id: string, message: string }

/** records for an encoded-search-data file, as stored (urls not yet resolved) */
export async function recordFileFromEncodedSearchData (raw: Record<string, Partial<EncodedSearchDataEntry>>, { provider, seenAt, locale, digest, onQuirk = () => {} }: FromEncodedSearchDataOptions): Promise<RecordFile> {
  const data = withSearchDataDefaults(raw, locale)
  const records: SignRecord[] = []
  for (const entry of Object.values(data)) {
    // the entry's timestamp is when it was added, so it's the best guess at when it was first seen
    const firstSeen = entry.timestamp === undefined ? seenAt : new Date(entry.timestamp).toISOString()
    const { record } = await observe(undefined, contentFromEntry(entry, message => onQuirk({ id: entry.id, message })), { at: firstSeen }, { digest })
    records.push({ ...record, provenance: { ...record.provenance, lastSeen: seenAt } })
  }
  return createRecordFile(providerInfo(provider, data), records)
}

/** the encoded-search-data entries for a record file, as stored. Removed records and media not yet encoded
 * are left out by default (unencoded media can't be played) */
export function encodedSearchDataFromRecordFile (file: RecordFile, { include = (record: SignRecord) => record.provenance.status !== 'removed' } = {}): EncodedSearchData {
  const data: EncodedSearchData = {}
  for (const record of file.records) {
    if (!include(record)) continue
    data[record.id] = {
      id: record.id,
      title: record.title,
      words: record.words,
      link: record.link,
      nav: record.nav,
      body: record.body ?? '',
      media: record.media.flatMap(mediaFromItem),
      tags: record.tags,
      published: record.published ?? true,
      provider: { ...file.provider },
      author: record.author,
      timestamp: Date.parse(record.provenance.firstSeen),
    }
  }
  return data
}

function contentFromEntry (entry: EncodedSearchDataEntry, quirk: (message: string) => void): RecordContent {
  return {
    id: entry.id,
    title: entry.title,
    words: entry.words,
    body: entry.body,
    link: entry.link,
    nav: entry.nav,
    tags: entry.tags,
    author: entry.author,
    media: entry.media.map(media => itemFromMedia(media, quirk)),
    // true is the default, so only an unpublished entry says so
    published: entry.published === false ? false : undefined,
  }
}

function itemFromMedia (media: SearchDataEncodedMedia, quirk: (message: string) => void): MediaItem {
  const { method, url, version, clipping } = media.source
  // null meant no version
  if ((version as string | null) === null) quirk(`media ${url}: version null, dropped`)
  // an impossible clipping: keep where it starts, the part the encoder will have used
  let clip = clipping
  if (clipping?.end !== undefined && clipping.end <= (clipping.start ?? 0)) {
    quirk(`media ${url}: clipping ends (${clipping.end}) before it starts (${clipping.start ?? 0}), end dropped`)
    clip = { start: clipping.start }
  }
  return {
    type: media.type,
    source: { method, url, version: version ?? undefined, clipping: clip },
    encoded: media.encodes ? { thumbnail: media.thumbnail, encodedAt: new Date(media.timestamp).toISOString(), encodes: media.encodes } : undefined,
  }
}

function mediaFromItem (item: MediaItem): SearchDataEncodedMedia[] {
  if (!item.encoded) return []
  return [{
    type: item.type,
    source: { ...item.source, method: item.source.method ?? 'fetch' } as SearchDataEncodedMedia['source'],
    timestamp: Date.parse(item.encoded.encodedAt),
    thumbnail: item.encoded.thumbnail as string,
    encodes: item.encoded.encodes,
  }]
}

/** every entry in a file carries the same provider details: they become the file's */
function providerInfo (id: string, data: EncodedSearchData): ProviderInfo {
  const given = Object.values(data).find(entry => entry.provider)?.provider
  return { id, name: given?.name ?? id, verb: given?.verb, link: given?.link }
}
