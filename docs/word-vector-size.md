# How small can the word vectors get?

The search keeps one file of word vectors for the whole collection, `global-vectors.lps`. Each word has 300
numbers, and each number takes one byte. After compression that file is about 3 MB, most of a visitor's first
search. This page records what happens to search when the file is made smaller. Nothing here changes the site:
each option is a build choice, or a planned format change.

## What we tried

We built the ten search indexes from a copy of the collections, then ran 62 real queries (sign words spread
across the list, two tags, and a phrase). Each variant's results were compared with the results from today's file.

- **Overlap:** how many of today's top 10 (and top 50) signs the variant still returns.
- **Same first result:** how many queries put the same sign first.

| Option | Size (after gzip) | Top 10 kept (average) | Worst query, top 10 | Same first result |
|---|---|---|---|---|
| Today (300 numbers, 1 byte each) | 2.99 MB | 100% | 100% | 62 of 62 |
| Pipeline `--fidelity 0.7` | 2.60 MB | 99% | 80% | 62 of 62 |
| Pipeline `--fidelity 0.5` | 2.26 MB | 98% | 90% | 62 of 62 |
| 300 numbers, 4 bits each (not gzipped yet) | 1.54 MB before gzip | 93% | 70% | 62 of 62 |
| 100 numbers (principal components), 1 byte each | 1.07 MB | 70% | 10% | 58 of 62 |
| 50 numbers (principal components), 1 byte each | 0.60 MB | 54% | 0% | 54 of 62 |

Fidelity changes how each vector is scaled, not how many numbers it has, so the raw size stays the same.
The 4-bit rows are calculated from the count of numbers, because the pipeline doesn't write that format yet.

## What it means

- **The fidelity setting is free.** It's already in the pipeline (`--fidelity`). At 0.5 it saves about a
  quarter of the file, and search barely changes.
- **Fewer numbers per word hurts search.** Dropping to 100 numbers saves more, but the top results change for
  many queries.
- **4 bits is the next option to test properly.** It roughly halves the raw size. It needs a new file format
  and a measured gzip size before we decide.

## Caveats

- One spike, one set of 62 queries, measured on a scratch build of the current data (10,281 words).
- "Kept" means the same as today's file, not better or worse for a visitor. We have no relevance judgements.
