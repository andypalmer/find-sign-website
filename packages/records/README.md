# @find-sign/records

The sign record: what a Find Sign spider produces for each sign, and what the indexer builds search
indexes from. It also tracks signs across spider runs: when each was first and last found, when it last
changed, and whether it has gone missing.

It's plain TypeScript built to JavaScript, with [valibot](https://valibot.dev) as its only dependency, so
spiders in other repos can install it.

## Who writes what

| Part | Written by | Type |
| --- | --- | --- |
| The sign's content: id, title, words, tags, links, media sources | the spider | `RecordContent` |
| Each media item's `encoded`: thumbnail and encodes | the encoder | `Encoded` |
| `provenance`: first seen, last seen, last changed, content hash, status | `observe` / `reconcile` | `Provenance` |
| The provider's name and link, once per file | whoever writes the file | `ProviderInfo` |

A spider only needs `RecordContent` and `validateContent`.

## Rules

- **`id` is permanent.** It's part of the sign's public URL (`/sign/<provider>/<id>`), so derive it from
  something the provider won't change, and never reuse one. A sign inside a longer video can take the video's
  ID plus its start, as existing data does (`yxfk3r5PrcU-start=0`).
- **URLs may be relative.** They resolve against the URL of the record file that holds them, so a data tree
  can move hosts. Cached media is usually relative; links to the provider's site are usually absolute.
- **Unknown fields are rejected**, so a misspelt field fails validation rather than disappearing.
- **A sign changes when its content hash changes.** The hash covers the content and the media sources (URL,
  version, clipping). It ignores provenance, what the encoder made, and the provider's own dates. Writing a
  default out explicitly (`kind: 'sign'`, `published: true`, `body: ''`) isn't a change.
- **Change the media's `version`** (or URL or clipping) when the video itself changes. That's what tells the
  encoder to encode it again; `keepEncodings` carries existing encodes over otherwise.
- **Phrases** (idioms, sentences) set `kind: 'phrase'` and give `meaning`: plain words for what the phrase
  means, which search uses in place of its own words.
- **Provider dates are optional.** Set `sourceCreated` and `sourceUpdated` when the provider says, for example
  a YouTube `publishedAt` or a sitemap `lastmod`.

## Tracking runs

```ts
import { reconcile, validateContent, createRecordFile, serialiseRecordFile, parseRecordFile } from '@find-sign/records'

const previous = parseRecordFile(await readText('alpha.records.json')).records
const found = scraped.map(validateContent)
const { records, changes } = await reconcile(previous, found, { at: new Date().toISOString() })
// changes: { new, changed, unchanged, returned, missing, removed }, each a list of ids
await writeText('alpha.records.json', serialiseRecordFile(createRecordFile(provider, records)))
```

A sign a run doesn't find becomes `missing`, then `removed` after 3 runs in a row (pass
`{ removal: { removeAfterMissingRuns } }` to change that). Found again, it comes back as `returned`.
`reconcile` takes the run's time instead of reading the clock, and `contentHash` takes a `Digest` (SHA-256
with WebCrypto by default), so runs can be replayed in tests.

## Files

A record file holds one provider: `{ format: 'find-sign-records', version: 1, provider, records }`.
`serialiseRecordFile` writes records sorted by id, so a run's changes show as small diffs.

## Developing

```sh
npm run build -w packages/records   # emits dist/, which other packages import: rebuild after changing src/
npm test -w packages/records
```
