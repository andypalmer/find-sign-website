# Talking to the service worker

How the page and the service worker send each other messages. This is the contract: the tests for the worker
are written against it, and the page's messenger is built from it.

## The idea in one picture

The worker is an office. Every message is addressed to a **role** at the desk that handles it, like a letter
to "the Librarian". The page never reaches into the worker, and the worker never reaches into the page. They
only post letters, and each letter says who it is for.

```
 page                                             service worker
 ────                                             ──────────────
 asks the index  ──▶  FrontDesk     welcomes a new page, agrees the language
 (a "stand-in"       SearchDesk     answers "what matches this query?"
  that looks like     SignLibrarian  finds one sign, or lists the signs in one index
  the real thing)
 SettingsClerk   ◀──  (the worker asks the page: "what did the page keep for 'region'?")
```

Behind the desks the worker has its own helpers (the one that keeps and fetches index files is the "file keeper").
Nobody outside the worker can send them a letter, so they are not part of this contract.

## Rules

1. **Everything addressed.** Each message names its actor in `to`. The worker has one switchboard that hands
   letters to the right desk and refuses a name it doesn't know (reply `failed`, reason `no-such-actor`).
   It never silently drops one.
2. **Plain data only.** Messages carry what the browser can copy: strings, numbers, booleans, lists, plain
   objects. No functions, no class instances, no `Error` objects (errors are described, see below).
3. **One reply channel per question.** The page makes a fresh `MessageChannel` for every question and sends
   one end with the letter. The worker answers on it. That ties a reply to its question with no ids to
   track, and the channel is also where progress notes arrive and where the page says "never mind".
   (`MessageChannel` also exists in node, so the same code is tested without a browser.)
4. **One kind of fetch for the page.** The page asks the same desk questions whether the answer comes from
   the worker or from today's direct code (the fallback). Each desk's questions are an interface
   (below). The page-side stand-in, the worker's desk and the fallback all keep the same promises.
5. **Version in every letter.** Every message carries `protocol: 1`. See "Old page, old worker".
6. **The worker only fetches static files.** The data server is plain nginx. Nothing in this contract
   assumes a server that can search, batch files, or list a folder.

## The envelope

```ts
// page → worker, and worker → page, for a new question
type Letter = {
  protocol: 1
  to: ActorName            // 'front-desk' | 'search-desk' | 'sign-librarian' | 'settings-clerk'
  ask: string              // the question, e.g. 'search'
  details: unknown         // the question's own fields, shapes below
}
// sent with the letter: the end of a MessageChannel to answer on

// everything that comes back on that channel
type Reply =
  | { protocol: 1, kind: 'progress', done: number, doing: string }  // zero or more; the page may ignore them
  | { protocol: 1, kind: 'answer', details: unknown }               // exactly one, ends the exchange
  | { protocol: 1, kind: 'failed', reason: FailureReason, words: string } // exactly one, ends the exchange
```

The page may send `{ protocol: 1, kind: 'never-mind' }` down the same channel. The worker stops as soon as it
can and ends with `failed`, reason `cancelled`. (A person typing fast starts a new search before the old one
finishes, so this is the normal case, not a rare one.)

`FailureReason` is a short fixed list so the page can decide what to do. `words` is for people and logs only,
never for code to read.

| reason | meaning | what the page does |
|---|---|---|
| `no-such-actor` / `no-such-question` | the letter names a desk or question the worker doesn't have, or is written in a protocol version the worker doesn't know | use the fallback for this question, and ask the worker to update |
| `bad-details` | the fields were the wrong shape | a bug: log it, use the fallback |
| `cancelled` | the page said never-mind | nothing |
| `no-network-and-not-kept` | the worker needed a file it hasn't kept and can't fetch it | show the same "offline" notice the site shows today |
| `index-changed-too-often` | the index was rebuilt mid-question again and again (today's `OutdatedError` retry gave up) | show an error; same as today |
| `unexpected` | anything else | log it, use the fallback once |

A sign that doesn't exist is **not** a failure. It is an ordinary answer (`found: false`), because the page
turns that into a 404 page, not an error page.

## The desks

### FrontDesk — `IWelcomePages`

Every page says hello once, before asking anything else.

| ask | details | answer |
|---|---|---|
| `hello` | `{ speaks: number[] }` — the protocol versions this page can use | `{ protocol: number, workerBuild: string }` — the highest version both sides know |

If there is no version in common, the answer is `failed`/`no-such-question`, and the page uses the fallback.
Until the page has had a good hello, it uses the fallback for every question.

### SearchDesk — `IAnswerSearchQuestions`

| ask | details | answer |
|---|---|---|
| `search` | `{ query: string, start: number, length: number }` | `{ totalResults: number, results: SearchResult[] }` |
| `pick-random-signs` | `{ count: number }` | `{ signs: { index: string, id: string }[] }` |

`search` is exactly today's `search(query, start, length)`. The region filter is already inside `query`
(the page writes `#vic (hello)` before asking), so the worker has no region setting to look up.
`pick-random-signs` replaces the page loading every entry's `id` and `tags` just to roll a die; the worker
already has those columns.

### SignLibrarian — `IFindSigns`

| ask | details | answer |
|---|---|---|
| `find-sign` | `{ index: string, id: string }` | `{ found: true, sign: SearchResult }` or `{ found: false }` or `{ found: 'renamed', id: string }` |
| `list-signs` | `{ index: string }` | `{ signs: { id: string, title: string }[] }` or `{ found: false }` (no such index) |

`renamed` means "that was the sign's old address; its readable address is `id`". The page sends the visitor
there with the `308` redirect it sends today. This replaces the page-side hand-over of loaded columns
between the old address and the new one: the worker keeps the files, so the second look costs nothing.

### SettingsClerk (a page desk) — `IReadThePagesSettings`

This one sits on the **page**, and the worker is the one who writes the letters. It exists because the worker
cannot read `localStorage` itself, and we don't want the page to check what the worker can do.

| ask | details | answer |
|---|---|---|
| `read-setting` | `{ key: string }` | `{ found: true, value: string }` or `{ found: false }` |

`value` is the raw text stored under the key; the worker does the reading of it. The worker keeps what it
learns (in IndexedDB, under the worker's storage rules, which we still have to write) so that if no page is open to answer, it uses the
last copy it kept. A page that is closed can't be asked. If there is no page and no kept copy, it behaves
as if the setting was never set.

**Nothing uses this yet.** Today's only setting is the region, and the region reaches the worker inside
`query`. The desk is part of the contract because we decided storage belongs to the worker. The first real
use will be the worker adding the region to a query itself. We shouldn't build that until we want it.

## One search, start to finish

```
page   ── Letter { to: 'search-desk', ask: 'search', details: { query: 'hello', start: 0, length: 10 } } ──▶ worker
worker ── Reply  { kind: 'progress', done: 0.2, doing: 'getting the word list' } ──▶ page
worker ── Reply  { kind: 'answer', details: { totalResults: 87, results: [ … ] } } ──▶ page
```

## Old page, old worker

A new release can be on the server while a visitor's browser still runs the old worker (a worker only
updates when the browser next checks). So a page and a worker can disagree about this contract.

- The page says what it knows (`speaks`) in `hello`; the worker picks the best version both know.
- Inside one version, changes only **add**: a new ask, a new optional field. Never rename or remove, and
  never change what a field means. Anything else is `protocol: 2`.
- A worker that meets a protocol it doesn't know, or a question it doesn't have, always replies `failed`.
  It never stays silent, so the page never waits forever. (The page also stops waiting after a timeout
  and falls back.)
- A page that can't agree with the worker uses the fallback, and asks the browser to update the worker.

## Turning it on

The page uses the worker only when the `SERVICE_WORKER` setting is `on` (`true`, `1` and `yes` also count, in any
case). Anything else, including not setting it, is off, so a typo never turns it on.

- **Off:** the page registers nothing and searches the way it always has. If a worker was left behind from when
  the setting was on, the page unregisters it, once, so that switching it off really does switch it off.
- **On:** the page registers `/service-worker.js` as soon as it loads, in the background, so the worker is usually
  ready by the time someone searches. The settings the worker needs (where the index is, which indexes to search
  and in what order, where the word vectors are) are on the end of the address it is registered at. The site
  reads its settings when its server starts, so one build can't hold them, and the address is the one place the
  page and the worker both see. A change of settings is a different address, so the browser installs a new worker.
- **First visit:** the worker has to be installed first. A search waits for it for at most four seconds, then
  uses the direct search; the worker carries on installing for next time.
- **Always:** the server's own render never uses the worker (only a browser has one). Whenever the worker can't
  answer, the page falls back to the direct search, except for the two problems the table above says to show.

## Decided here, and what we left out

Decided:

- Letters go through one `MessageChannel` per question. Replies, progress and "never mind" share that channel.
- Four roles: `front-desk`, `search-desk`, `sign-librarian` (worker side) and `settings-clerk` (page side).
- The worker pulls settings from the page. The page never pushes them. (We chose this.)
- A missing sign is an answer, not an error.

Left out on purpose:

- **Result videos and thumbnails.** They make up to 1.2 MB a results page, but they aren't index files and
  their caching has different needs (size, range requests, and nginx serves them). A later bead.
- **Analytics.** `client-record-analytics` fetches from the page. It's switched off, and we still have to decide whether it comes back.
- **Letting the worker tell pages that a new index build exists.** The worker handles a rebuilt index
  inside the question (today's `OutdatedError` retry), so the page needs no news. Add a `notice` kind in
  protocol 1's "only add" way if we ever want a banner.
- **Clearing or counting the worker's storage from the page.** That belongs with the worker's storage rules, which we still have to write.
