// A fetch that asks the server every time. Browsers keep a copy of a file they've fetched, and some requests (the word
// vector library's uses "force-cache") reuse that copy without asking again, even when it's out of date. If a bad
// answer was stored once, every visit kept getting it until the browser's own cache was cleared. Asking every time
// costs only a small "not changed" answer from the server, and the server gives the current one.
export function checkedFetch (fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => fetch(input, { ...init, cache: 'no-cache' })
}
