# An index that updates without being re-downloaded

The design for the next index format ("version 2"). The goal: when a few signs are added, changed or
removed, a visitor who already holds the index downloads a few kilobytes, not the whole thing, and the
files they already hold stay valid. It has to work on a plain nginx serving static files, because that is
all the data server is. The writer and reader live in the `find-sign-pipeline` repo (`@andypalmer/orthagonal`);
this page says what they must produce, and what the service worker relies on.

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
own manifest, the names of the word vector files that every index shares, and the format version. Each
index's manifest (itself content-named) lists its shards and its scan files. A visitor asks for `manifest.json`
(the browser checks its own copy with the data server, which usually answers `304` in a few hundred bytes; we
send no headers of our own, so the data server never has to give permission first), and if it hasn't changed,
nothing else is needed. If it has, they fetch only the index manifests whose names changed, and from those only the files whose
names are new. One request replaces today's 11.

**Two kinds of file in each index, because they are used in two ways.**

- *Shards* hold whole signs (the body, the videos). A results page needs ten signs, so ten small
  files is right. Target about 16 signs per shard.
- *Scan files* hold what every search looks at: for each sign, its id, title, words, tags, English phrases,
  aliases, dates, link and author. A search needs all of them, so they are few and bigger: about 1,300 signs
  each, split by the same hash. Most indexes need one; the biggest needs nine and the next four.

**Word vectors, shared by the whole collection and split by word.** A word goes in bucket `hash(word) % 64`,
in a content-named file of about 50 kB. There is one set of buckets for the whole collection, listed in
`manifest.json`, because the indexes share most of their words: the ten indexes use 16,256 words if we count
each on its own, but only 10,623 different ones. Giving every index its own buckets would make a visitor
download the same word's vector again for each index (5.05 MB before compressing, against 3.28 MB shared,
which is the size of today's `global-vectors.lps`). A word's vector never changes, so a bucket only changes
when a new word lands in it. We never remove a word from a bucket when its last sign goes (a stale word is
harmless and small); a planned rebuild clears them. To keep them, the indexer passes the last build's words
back in, read out of the last build's buckets, and that gives the same bytes. The number 64 trades first-visit
requests (64) against how much changes per build (a few buckets).

**Publish in an order that is never wrong.** The writer writes every content-named file first (shards, scan
files and vector buckets), then the index manifests, and `manifest.json` last. Until that last write, visitors
see the old, complete build. Today's order (meta first) leaves a window where files disagree, and that is
what the `OutdatedError` retry papers over.

**Keep old files for a while.** A visitor in the middle of a session may still ask for a file the newest build
no longer uses. The writer deletes a content-named file only when none of the last ten manifests mention it
and it is over 30 days old. If a content-named file is ever missing (`404`), the reader fetches
`manifest.json` again, ignoring its cache, works the file's name out again from the new manifests, and tries
once more. That one rule replaces the `OutdatedError` retry.

**Keep the counts fixed.** The shard a sign lives in comes from its id and the shard count, so changing the
count moves almost every sign, and every shard in that index gets a new name. If we let the count follow the
number of signs (16 per shard), one extra sign could do it: 324 shards is exactly full at 5,184 signs, and the
5,185th would ask for 325. So once an index has a count, the writer keeps it as signs come and go, and only
doubles it when the average shard holds more than twice its target. See "Changing the numbers later".

**Cache headers become possible.** Content-named files never change, so nginx can send them with
`Cache-Control: public, max-age=31536000, immutable`, matched by their names (a dot, ten hex digits, then
`.json` or `.lps`). `manifest.json` is sent with `no-cache`, so it is checked every time. Cloudflare can cache the
immutable files for good, so almost no request reaches the origin.

**Ties are broken by the order of the indexes, then by id.** Results that rank equally used to come out in
the order the build listed the signs. That order no longer means anything, so the ranking breaks ties on
purpose: first by where the sign's index comes in the list of indexes (the `SEARCH_INDEXES` setting, so the
index listed first is the one we trust most), then by id within an index. We measured what that changes, on
the real index with its real word vectors, over 380 searches: single words, two words, whole titles, tags
alone, and tags with a word. For the 360 that found anything:

| | first ten results changed | first fifty changed |
| --- | --- | --- |
| today's site (it doesn't load each sign's id) | 0 | 0 |
| version 2, which has each sign's id | 64 (18%) | 134 (37%) |

Today's site is unchanged because ties between indexes keep the order the indexes are listed in, which is what
the old order gave, and the id only matters within one index. Once the site reads version 2 (whose scan files
carry the id for every sign), tied signs from the same index come out in id order and not in the order the build
happened to list them. Nothing is lost or added: signs that tie swap places. (We first tried id alone, with the
index address as a last resort. That changed 36% and 59% of the searches, mostly by interleaving the same word
from two providers, so we ranked the indexes instead.)

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
  },
  "vectors": ["vectors-0.b1b2b3b4b5.lps", "vectors-1.c1c2c3c4c5.lps"]
}
```

The number of files in `vectors` is the bucket count, so a word's bucket is `hash(word) % vectors.length`.

An index's manifest (content-named, so it never changes):

```json
{
  "shardCount": 1100,
  "shards": ["shard-0.4f9a1c07be.json", "shard-1.c3d4e5f6a7.json"],
  "scans": ["scan-0.77aa01cc22.json"]
}
```

Every shard number has a name in `shards`, even a shard with no signs in it, so shard N is the Nth name.

Rules the reader holds us to: every name is one plain file name (letters, numbers, dots, dashes and underscores;
no folders, no `..`, no addresses), because a name is put on the end of the data server's address. A missing
list is an error, not an empty list, so a broken manifest can never make a visitor throw files away. A `version`
the reader doesn't know is refused with a message that says so, and the page uses its fallback.

## What a build changes

We cut the real collection this way: 18,177 signs in 10 indexes (two providers with nothing in them are left
out), with the real word vectors. Sizes are gzipped.

| kind of file | files | average | largest | in all |
| --- | --- | --- | --- | --- |
| shards (16 signs each) | 1,139 | 4.0 kB | 11.4 kB | 4.5 MB |
| scan files | 21 | 30.7 kB | 68.8 kB | 0.64 MB |
| shared vector buckets | 64 | 47.5 kB | 58.3 kB | 3.04 MB (3.28 MB before compressing) |

That is 1,235 files to publish, and all 18,177 signs read back through the reader exactly as they went in. A
rebuild with nothing changed makes no new file.

Then we changed 30 signs (removed 5, edited 5, added 20), keeping each index's counts and the old words:

| where the 30 changes were | new files | new bytes | what changed |
| --- | --- | --- | --- |
| spread over all ten providers | 46 | 315 kB | 25 shards, 11 scan files, 10 index manifests |
| all in one provider (`auslan-signbank`) | 33 | 431 kB | 28 shards, 4 scan files, 1 index manifest |

`manifest.json` changes too, but it is a few hundred bytes. The signs we added used invented words with no
vector, so no vector bucket changed; a real new word changes about one bucket (about 48 kB).

Without the fixed counts, the one-provider change grew `auslan-signbank` from 324 to 325 shards, and every one of
them got a new name: about 2.3 MB for the same 30 changes.

A returning visitor after a build downloads the manifest (a `304` or about 300 bytes), the index manifests and
scan files of the indexes that changed, and only the shards they next open that changed. A first-time visitor
downloads the scan files (0.64 MB) and the word vectors (3.04 MB), then shards as they look at signs.

We chose 16 signs per shard: smaller means more files for a small saving; bigger makes every results page cost
more (ten of our 4 kB shards are about 40 kB) for fewer files overall. We measured only 16. An earlier version of
this page had a table for 8, 32 and 64 as well, but its file counts didn't match the data (18,177 ÷ 16 is about
1,140 shards, not 1,702), so we took it out.

## Changing the numbers later

The shard count and the scan count are written in each index's manifest (the scan count is the length of its
`scans` list), and the vector bucket count is the length of `vectors` in `manifest.json`, so they can change
without changing the format. The writer keeps them, with these rules:

- **Shard count:** keep the last build's count while signs come and go. When the average shard holds more than
  32 signs (twice the target), double the count, and keep doubling until it doesn't.
- **Scan count:** the same, with 2,600 signs (twice 1,300).
- **Never shrink.** Halving would move signs just the same, so an index that loses signs keeps its count.
- **Doubling splits every shard cleanly in two.** A sign in shard `s` of `N` lands in shard `s` or `s + N` of
  `2N`. A visitor's old shards for that index still go unused, so we expect a refetch; this should be rare.
- **The vector bucket count never changes** on its own. Changing it moves every word, so it waits for a planned
  rebuild.

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

- **Making the vectors smaller.** Sharing them fixes how much a first visit downloads across indexes (3.28 MB,
  not 5.05 MB), and splitting them by word fixes how much changes per build, but 3.28 MB doesn't compress. Fewer
  numbers per word, or rounding harder, would shrink it, but it changes search quality and needs measuring against
  real searches. A separate piece of work.
- **How long to keep old files** (ten manifests and 30 days are a guess; the first month of real use will tell).
- **Per-index or whole-collection manifests.** We chose per-index files under one top manifest, because the admin
  app builds one index at a time and the top manifest stays tiny. The word vectors are the exception: they are
  listed once, in the top manifest, because every index uses them.
