# Is the search slow enough to need WebAssembly?

We asked whether the search engine's ranking and vector maths should move to WebAssembly (WASM), with a
JavaScript fallback for visitors who block it. We measured where a search's time goes on a copy of the real data,
before deciding.

## What we measured

On a scratch build of the ten site indexes (17,440 signs), run in Node:

| Part of a search | Time (median) |
|---|---|
| First search after the server starts (includes loading) | about 470 ms |
| Search with only a tag, such as `#animal` | about 2 ms |
| Search with a word | about 160 ms |
| Ranking the signs for a word | about 157 ms |
| Of which: diversity of each sign's own words, which doesn't depend on the query | about 107 ms |
| Of which: distance between the query word and each sign, per query word | about 16 ms |
| Loading the ten results shown on a page | about 2 ms |

A tighter JavaScript loop for the distance step was only about 1.3 times faster than today's code, on the same
data. So the distance maths is not where the time goes.

## What it means

- **WASM would speed up the smallest part.** The distance step is about 16 ms per query word. Even a much faster
  version would save a few milliseconds per word.
- **Most of the ranking time is avoidable.** The diversity of each sign's words depends only on the sign, not on
  the query. The ranking recalculates it for every match on every search. Working it out once, when the index loads,
  should remove about 100 ms per word search. This is plain JavaScript, so it doesn't need WASM or a fallback.

## Recommendation

- Do not build the WASM engine now.
- Cache each sign's diversity when the index loads, and check that the rankings don't change. Then measure again.
- Revisit WASM only if the distance maths becomes the main cost after that.

## Caveats

- These timings are from Node, not a browser, so the numbers will differ on a visitor's device. The shape of the
  result (most of the time in ranking, not the distance maths) should hold in both.
- The totals come from 54 queries: single words, two tags and one phrase. The ranking split comes from eight
  single words. We have no timings for queries with many words.
