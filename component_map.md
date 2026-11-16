# find-sign-website component map

Beyond the main search UI, the site does these jobs: a **Discord bot**, **outbound feeds and SEO endpoints**
(discovery feeds, sitemap, OpenSearch), **random sign** and **browse-by-provider** pages, a **manual corrections
("overrides")** layer, a **region filter**, and **analytics** (switched off in the code). The admin app (deployed
separately, and not deployed at the moment) adds index builds, overrides, users, the audit log and passkey login.

Paths are from the workspace root. `apps/search` is the public site, `apps/admin` is the admin app, and
`packages/` holds the code both share.

## Component map

### 1. Public UI (for people searching)
| Component | Where | Notes |
|---|---|---|
| Homepage + activity feed | `apps/search/src/routes/+page.svelte`, `apps/search/src/lib/DiscoveryFeed.svelte` | Merges the newest index entries with the news RSS feed |
| Search results | `apps/search/src/routes/search/`, `apps/search/src/lib/result/` | First page is rendered on the server; later navigation runs in the browser |
| Sign permalink page | `apps/search/src/routes/sign/[index=provider]/[id=filename]` | One entry in full |
| Browse by provider | `apps/search/src/routes/sign/` | Lists every entry in an index |
| Random sign | `apps/search/src/routes/random/`, `apps/search/src/lib/search/random.ts` | Hides some tags (signpedia, invented, crude, sexuality, fingerspelling) |
| Region filter | `apps/search/src/lib/RegionMap.svelte`, `apps/search/src/lib/models/region-store.ts` | Remembered in the browser; becomes a `#region` term in the query |
| News | `apps/search/src/routes/news/`, `apps/search/src/lib/data-io/rss.ts` | Tumblr and blog RSS |
| Static pages | `apps/search/src/routes/about`, `apps/search/src/routes/technology` | `technology` is prerendered at build time |

### 2. Search engine (runs in the browser and on the server)
| Component | Where | Notes |
|---|---|---|
| Query language | `packages/core/src/search/text.ts` | Words, `#tag`, `-#tag`, and logic; works out which index columns a query needs |
| Ranking | `packages/core/src/search/search-rank.ts` | Distance between word vectors |
| Search engine | `packages/core/src/search/search-engine.ts` | Turns a query into a ranked answer; shared by the page, the server and the worker |
| Word-vector lookup | `packages/core/src/search/precomputed-vectors.ts`, `loaded-precomputed-vectors.ts` | Sharded fastText common-crawl data, plus `global-vectors.lps` as a shortcut |
| Version 1 index reader | `packages/core/src/orthagonal/` | Re-exports the reader from the pipeline's `@andypalmer/orthagonal` package |
| Version 2 index on the server | `packages/core/src/search/bookshelf-library.ts`, `server-library.ts` | Keeps index files in server memory, and reuses them until `manifest.json` changes. Falls back to version 1 while the data server has no version 2 index |
| Version 2 index in the browser | `packages/core/src/worker/` | The service worker keeps index files in the browser and answers searches from them |

### 3. Index management
The index writer and the build run in the [find-sign-pipeline](https://github.com/andypalmer/find-sign-pipeline)
repo (`packages/indexer`, `packages/orthagonal`), not here. The site only reads what they publish.

| Component | Where | Notes |
|---|---|---|
| Index writer | `find-sign-pipeline` `packages/indexer`, `packages/orthagonal` | Writes version 1 and version 2 indexes, side by side |
| Build orchestration | `find-sign-pipeline` `packages/indexer/src/build.ts` | Leaves out unpublished entries, applies overrides, rebuilds `global-vectors.lps` |
| Build triggers (admin) | `apps/admin/src/routes/indexes/[provider]/build`, `apps/admin/src/routes/automation/build-index/[provider]` | The second needs the automation key |
| Validation (admin) | `apps/admin/src/routes/indexes/[provider]/validate` | Checks entries against the schema |
| Progress streaming (admin) | `apps/admin/src/lib/progress/` | Long-polling log viewer for builds |

### 4. Content curation
| Component | Where | Notes |
|---|---|---|
| Overrides (admin) | `apps/admin/src/lib/models/index-override.ts`, `apps/admin/src/routes/overrides/` | Per-entry manual corrections, merged in at build time |
| Publish flag | `published: false` in the data | Entry is left out of the index at build time; its id stays reserved |

### 5. Identity and access
| Component | Where | Notes |
|---|---|---|
| Passkey (WebAuthn) login (admin) | `apps/admin/src/lib/passkey/`, `apps/admin/src/hooks.server.ts` | Signed session in a cookie. The public site has no logins |
| Users and permissions (admin) | `apps/admin/src/lib/models/user.ts`, `apps/admin/src/routes/users/` | Permissions are `everything`, `edit-index` and `edit-users` |

### 6. Audit and analytics
| Component | Where | Notes |
|---|---|---|
| Audit log (admin) | `apps/admin/src/lib/models/audit-log.ts`, `apps/admin/src/routes/audit-log/` (with a JSON feed) | One file per action. The admin pages and feed have no login check yet |
| Analytics (public site) | `apps/search/src/lib/models/analytics.ts`, `apps/search/src/routes/analytics/` | Disabled: `AnalyticsEnabled` is `false`, so recording and reading return early |

### 7. Outbound feeds and discoverability
| Component | Where |
|---|---|
| Discovery feeds (JSON Feed, Atom, RSS) | `apps/search/src/routes/feeds/` |
| Sitemap (every entry) | `apps/search/src/routes/sitemap.xml/` |
| OpenSearch (browser search-bar integration) | `apps/search/src/routes/opensearch.xml/` |

### 8. Integrations
| Component | Where | Notes |
|---|---|---|
| Discord bot | `apps/search/src/routes/discord/` | `/search` and `/random` commands with paging buttons. `setup/` registers the commands with Discord |
| Tumblr and blog RSS (inbound) | `apps/search/src/lib/data-io/rss.ts` | |

### 9. Data store client
| Component | Where | Notes |
|---|---|---|
| find-sign-data protocol | `packages/data-io/src/data-io.ts`, `packages/data-io/src/auth.ts` | Each request carries a short-lived signed `?license=`. Writes use `PUT`, `DELETE` and `POST`, and the client can list directories. Writing is switched off at the moment, and the public data server doesn't allow directory listing (nginx) |

### 10. Outside this repo
| Component | Status |
|---|---|
| Media encoder (→ `encodes`, thumbnails) | Not in the workspace |
| Vector builder (fastText → sharded vectors) | Separate GitHub repo |
| `pigeon-signbank` (Auslan Signbank spider → YAML → search data) | Sibling folder of this repo, not part of it |
| Index writer and build | `find-sign-pipeline` repo |
| find-sign-data server (the writable data server) | Not in the workspace. `serve.mjs` is a partial local stand-in, kept in the sibling folder |

## Index traffic today
- **The server caches the search index.** On the version 2 path, the server keeps the index files in memory and
  checks `manifest.json` on each request. Repeat searches reuse the loaded library until the index changes.
- **Until version 2 is published, the server falls back to version 1.** The version 1 path still fetches its
  files on each search. The live data server has version 2 (checked at `v2/manifest.json`).
- **The browser still asks for everything with `no-cache`.** `meta.json` and `global-vectors.lps` always revalidate,
  and shards use `no-store`. Working out which files can be cached is open work.
- **Each search's word vectors are about 3 MB.** `global-vectors.lps` is the largest single file a first visit needs.
  Smaller options were measured, and we decided the saving didn't justify a new format (see `docs/word-vector-size.md`).

## Open items
Open work is tracked in the project's issue tracker, not in this file. Current open items cover: the admin
audit-log and overrides login checks, the automation key in `example.env`, the data server publishing audit-log
files, browser caching of index files, and the analytics decision.

This is from reading the code and measuring file sizes. Production traffic has not been profiled.
