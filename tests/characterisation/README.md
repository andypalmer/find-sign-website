# Characterisation tests

These tests pin down what the code does **today**, so functionality can be extracted and refactored
without changing behaviour by accident. They are not a specification: a failing test means behaviour
changed, and you decide whether that was intended. If it was, update the test in the same change.

Test names use two labels:

- **QUIRK**: odd but harmless current behaviour (e.g. `readFeed` ignoring HTTP errors).
- **GAP**: probably a bug or security hole (e.g. the audit log needing no login). Fix these
  deliberately, and flip the test to assert the new behaviour.

## How they run

- `helpers/test-env.ts` must be the **first import**. Several modules read `import.meta.env` at load
  time; in vitest that is backed by `process.env`, which this file fills with fixed test values
  (indexes `alpha,beta`, a deterministic write identity and passkey secret, fake hostnames).
- `helpers/fake-data-server.ts` replaces `fetch` with an in-memory server. It implements the
  find-sign-data protocol (GET/HEAD/PUT/DELETE, bulk and math POSTs, directory listings), records
  every request (method, path, cache mode, headers, body), and can force failures per url
  (`server.failures.set(url, 500 | 'network')`).
- `helpers/fixtures.ts` has two small providers and a 4-dimensional word vector library.
  `publishBuiltIndexes()` runs the **real** build pipeline to produce the indexes that search,
  feed and random tests read.

Some modules keep process-wide state (vector library LRU, homepage response cache). Tests that need
a cold start call `vi.resetModules()` and re-import.

Run with `npx vitest --run tests/characterisation`.
