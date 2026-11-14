# An index that updates without being re-downloaded

The design for the next index format ("version 2"). The goal: when a few signs are added, changed or
removed, a visitor who already holds the index downloads a few kilobytes, not the whole thing, and the
files they already hold stay valid. It has to work on a plain nginx serving static files, because that is
all the data server is. The writer and reader live in the `find-sign-pipeline` repo; this page says what they
must produce, and what the service worker relies on.

## What is wrong today

1. **Every file is stamped with the build's id.** A fresh `buildID` is written inside every column and every
   shard, and the reader refuses a file whose stamp doesn't match `meta.json`. So after any build, every
   file's bytes are new, even where no sign changed, and nothing a visitor holds can be kept. This is the
   main problem, and fixing it alone would help.
2. **A sign is found by its position.** Entry number N lives in shard `N / 8`, slot `N % 8`, and each column is
   a list in the same order. Removing or inserting one sign in the middle moves every sign after it into a
   different shard.
3. **Shards are tiny and numerous.** 17,663 signs in 11 indexes make 2,213 shards of 8 signs each.
4. **One file holds every word vector.** `global-vectors.lps` is 3.28 MB (10,424 words, 300 numbers each, one
   byte per number). It changes whenever any word is added, and it barely compresses (8%). After
   compression it is 93% of a visitor's first search.
5. **A search checks 11 `meta.json` files**, one per index, every time.

## The design

**Find a sign by its name, not its place.** A sign's shard is `hash(id) % shardCount`, where `hash` is the first
four bytes of the SHA-256 of the id, and `shardCount` is fixed for the index and written in its manifest.
Adding a sign puts it in one shard and touches nothing else. Within a shard, signs are sorted by id, so the
same signs always make the same bytes.

**Name each file after what is in it.** A file is called `shard-12.4f9a1c07be.json`: its kind, its number, and
the first ten hex digits of the SHA-256 of its bytes. If a build doesn't change a shard, the bytes are the same,
so the name is the same, so everyone who has it keeps it. A changed shard gets a new name, so no one is ever
handed a file that doesn't match its name. Nothing inside a file says which build it came from.

**Keep one small file that can change: `manifest.json`.** It lists, for each index, the name of that index's
own manifest, and the format version. Each index's manifest (itself content-named) lists its shards, its scan
files and its vector buckets. A visitor asks for `manifest.json` (a conditional request, usually a `304` of a few
hundred bytes), and if it hasn't changed, nothing else is needed. If it has, they fetch only the index manifests
whose names changed, and from those only the files whose names are new. One request replaces today's 11.

**Two kinds of file, because they are used in two ways.**

- *Shards* hold whole signs (the body, the videos). A results page needs ten signs, so ten small
  files is right. Target about 16 signs per shard.
- *Scan files* hold what every search looks at: for each sign, its id, title, words, tags, English phrases,
  aliases and dates. A search needs all of them, so they are few and bigger: about 1,300 signs each, split
  by the same hash. Most indexes need one; the biggest needs eight and the next four.

**Word vectors, split by word.** A word goes in bucket `hash(word) % 64`, in a content-named file of about 51 kB.
A word's vector never changes, so a bucket only changes when a new word lands in it. We never remove a word
from a bucket when its last sign goes (a stale word is harmless and small); a planned rebuild clears them.
The number 64 trades first-visit requests (64) against how much changes per build (a few buckets).

**Publish in an order that is never wrong.** The writer writes every content-named file first, then the index
manifests, and `manifest.json` last. Until that last write, visitors see the old, complete build. Today's
order (meta first) leaves a window where files disagree, and that is what the `OutdatedError` retry papers over.

**Keep old files for a while.** A visitor in the middle of a session may still ask for a file the newest build
no longer uses. The writer deletes a content-named file only when none of the last ten manifests mention it
and it is over 30 days old. If a content-named file is ever missing (`404`), the reader fetches
`manifest.json` again, ignoring its cache, and tries once more. That one rule replaces the `OutdatedError` retry.

**Cache headers become possible.** Content-named files never change, so nginx can send them with
`Cache-Control: public, max-age=31536000, immutable`, matched by their names (a dot, ten hex digits, then
`.json` or `.lps`). `manifest.json` is sent with `no-cache`, so it is checked every time. Cloudflare can cache the
immutable files for good, so almost no request reaches the origin.

**Ties are broken by id.** Results that rank equally come out today in the order the build listed the signs. That
order no longer means anything, so the reader must break ties by id, on purpose. (A small change for signs that
tie; the tests will say which searches it touches.)

**A renamed sign moves.** Its id changes, so its shard does too: two shards change, and the old id is kept as an
alias. A visitor who opens the old address finds the new id in the scan files' aliases, then the new shard.

## The manifest files

Both kinds of manifest are plain JSON made of lists of file names. The reader (`manifest-reader.ts` in the worker)
needs nothing more than "which names are mentioned".

`manifest.json`, the one file that can change:

```json
{
  "version": 2,
  "indexes": {
    "alpha": "index-alpha.1a2b3c4d5e.json",
    "beta": "index-beta.9f8e7d6c5b.json"
  }
}
```

An index's manifest (content-named, so it never changes):

```json
{
  "shardCount": 1100,
  "shards": ["shard-0.4f9a1c07be.json", "shard-1.c3d4e5f6a7.json"],
  "scans": ["scan-0.77aa01cc22.json"],
  "vectors": ["vectors-0.b1b2b3b4b5.lps"]
}
```

Rules the reader holds us to: every name is one plain file name (letters, numbers, dots, dashes and underscores;
no folders, no `..`, no addresses), because a name is put on the end of the data server's address. A missing
list is an error, not an empty list, so a broken manifest can never make a visitor throw files away. A `version`
the reader doesn't know is refused with a message that says so, and the page uses its fallback.

## What a build changes

We re-cut the real 17,663 signs this way and then changed 30 of them (removed 5, edited 5, added 20):

| signs per shard | shard files | average shard | shards that changed | new bytes to fetch |
| --- | --- | --- | --- | --- |
| 8 | 3,402 | 1.7 kB | 29 | 108 kB |
| **16** | **1,702** | **2.7 kB** | **27** | **175 kB** |
| 32 | 852 | 4.7 kB | 21 | 248 kB |
| 64 | 428 | 8.4 kB | 15 | 331 kB |

All sizes are gzipped. The scan files for the same change: 22 files, 28 kB each on average (68 kB the
largest), 0.62 MB in all; one file changed, 20 kB. Today, the same change makes every file new.

We chose 16 per shard. Smaller means more files for a small saving; bigger makes every results page cost more
(ten 64-sign shards are 84 kB, ten 16-sign shards are 27 kB) for fewer files overall.

A returning visitor after that build downloads the manifest (a `304` or about 300 bytes), one scan file
(about 20 kB), and only the shards they next open that changed. A first-time visitor downloads the scan
files (0.62 MB) and the word vectors (3.28 MB), then shards as they look at signs.

## Changing the numbers later

`shardCount` and the scan split are written in each index's manifest, so they can change without changing the
format. Doubling a shard count splits every shard in two, and the visitor's old shards for that index become
unused; do it only when the average shard has grown past about twice its target, and expect to refetch.
The format version in `manifest.json` is for changes that need new code; a reader that doesn't know a version
says so and the page uses its fallback.

## Moving over

Version 1 files (`<index>/meta.json` and friends) and version 2 files (`manifest.json` and content-named files)
use different names, so they can sit side by side. The indexer writes both until everything that reads the
index (the public site's server and browser, the Discord bot, the admin app, the service worker) reads version 2;
then it stops writing version 1 and a later build clears the old files.

The reader these all share is `@andypalmer/orthagonal`, so it learns version 2 first, and every user of it
inherits that.

## Left open

- **Making the vectors smaller.** Splitting them by word fixes how much changes per build, not how much a
  first visit downloads (3.28 MB, which doesn't compress). Fewer numbers per word, or rounding harder, would
  shrink it, but it changes search quality and needs measuring against real searches. A separate piece of work.
- **How long to keep old files** (ten manifests and 30 days are a guess; the first month of real use will tell).
- **Per-index or whole-collection manifests.** We chose per-index files under one top manifest, because the admin
  app builds one index at a time and the top manifest stays tiny.
