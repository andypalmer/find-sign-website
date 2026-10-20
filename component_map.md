# find-sign-website component map

Beyond the main search UI, client-side search, admin interface, Tumblr feed, the custom "orthagonal" index store and the writable data server, the site also does these jobs: a **Discord bot**, **outbound feeds and SEO endpoints** (discovery feeds, sitemap, OpenSearch), **random sign** and **browse-by-provider** pages, a **manual corrections ("overrides")** layer, a **region filter**, and **analytics** (switched off in the code). Below are all the components, grouped by category.

## Component map

### 1. Public UI (for people searching)
| Component | Where | Notes |
|---|---|---|
| Homepage + activity feed | `routes/+page.*`, `lib/DiscoveryFeed.svelte` | Merges the 20 newest index entries with the Tumblr RSS feed |
| Search results | `routes/search/`, `lib/result/Result.svelte`, `Carousel.svelte` | Runs on the server for the first page load, then in the browser on later navigation |
| Sign permalink page | `routes/sign/[index]/[id]` | One entry in full |
| Browse by provider | `routes/sign/`, `routes/sign/[index]` | Lists every entry in an index |
| Random sign | `routes/random/`, `lib/search/random.ts` | Hides some tags (signpedia, invented, crude, sexuality, fingerspelling) |
| Region filter | `lib/RegionMap.svelte`, `region-store.ts` | Remembered in `localStorage`; becomes a `#region` term in the query |
| News | `routes/news/`, `lib/data-io/rss.ts` | Tumblr/blog RSS |
| Static pages | `about`, `technology` | `technology` is prerendered at build time |

### 2. Search engine (runs in both browser and server)
| Component | Where | Notes |
|---|---|---|
| Query language | `lib/search/text.ts` | Words, `#tag`, `-#tag`, and logic; works out which index columns a query needs |
| Ranking | `lib/search/search-rank.ts` | Word-vector distance |
| Word-vector lookup | `precomputed-vectors.ts`, `loaded-precomputed-vectors.ts` | Sharded fastText common-crawl data, plus `global-vectors.lps` as a shortcut |
| Index reader | `lib/orthagonal/read.ts` | Loads the column files you need, then loads full entries from shards on demand |

### 3. Index management (the "orthagonal" store)
| Component | Where | Notes |
|---|---|---|
| Index writer | `lib/orthagonal/write.ts`, `types.ts` | encoded-search-data → column files, shards and `vectors.lps` |
| Build orchestration | `lib/orthagonal/build.ts` | Removes unpublished entries, applies overrides, rebuilds `global-vectors.lps` |
| Build triggers | `admin/indexes/[provider]/build` (logged in), `automation/build-index/[provider]` (needs the automation key) | |
| Validation | `admin/indexes/[provider]/validate` | Checks entries against the schema |
| Progress streaming | `lib/progress/*` | Long-polling log viewer for builds |

### 4. Content curation
| Component | Where | Notes |
|---|---|---|
| Overrides | `lib/models/index-override.ts`, `admin/overrides/*`, `lib/admin/ui/*` | Per-entry manual corrections, merged in at build time. Stored at `overrides/<provider>:<id>.json` |
| Publish flag | `published: false` in the data | Entry is skipped at build |

### 5. Identity and access
| Component | Where | Notes |
|---|---|---|
| Passkey (WebAuthn) login | `lib/passkey/*`, `admin/login/passkey`, `hooks.ts` | Signed session in a cookie |
| Users and permissions | `lib/models/user.ts`, `admin/users/*` | Permissions are `everything`, `edit-index` and `edit-users`; each user is stored as `users/<name>.json` |

### 6. Audit and analytics
| Component | Where | Notes |
|---|---|---|
| Audit log | `lib/models/audit-log.ts`, `admin/audit-log/*` (including a JSON feed) | One file per action. Needs the data server to list a directory, which nginx can't do, hence broken |
| Analytics | `lib/models/analytics.ts`, `routes/analytics/*` | Per-minute counters written with a custom "math" write. Disabled: `recordAnalytics` and `readAnalyticsYear` start with an early `return` |

### 7. Outbound feeds and discoverability
| Component | Where |
|---|---|
| Discovery feeds (JSON Feed, Atom, RSS) | `routes/feeds/*` |
| Sitemap (every entry) | `routes/sitemap.xml` |
| OpenSearch (browser search-bar integration) | `routes/opensearch.xml` |

### 8. Integrations
| Component | Where | Notes |
|---|---|---|
| Discord bot | `routes/discord/*` | `/search`- and `/random`-style commands with paging buttons; `/discord/setup` registers the commands with Discord |
| Tumblr/blog RSS (inbound) | `lib/data-io/rss.ts` | |

### 9. Data store client
| Component | Where | Notes |
|---|---|---|
| find-sign-data protocol | `lib/data-io/data-io.ts`, `auth.ts` | Every request carries a short-lived ed25519-signed `?license=`. Writes use `PUT`, `DELETE`, a JSON `POST {type:'bulk'}` and `POST {type:'math'}`; it also lists directories. nginx supports none of this, so everything under **3–6** that writes data or lists directories fails in production |

### 10. Pipeline outside this repo
| Component | Status |
|---|---|
| Media encoder (→ `encodes`, thumbnails) | Not in the workspace |
| `find-sign-vectors-builder` (fastText → sharded vectors) | Separate GitHub repo |
| `pigeon-signbank` | In the workspace: Auslan Signbank spider → YAML → search-data |
| find-sign-data server (the writable data server) | Not in the workspace; `serve.mjs` is a partial local stand-in |

## Why there's so much index traffic
- **No caching on the server.** `getSearchLibrary` re-fetches index files on every call; there's no in-memory cache (its own `TODO` says so). The check that would reuse global vectors is commented out in `search.ts` (`/*!globalVectors &&*/`).
- **About 5 MB per search.** Every word search fetches `global-vectors.lps` (3.2 MB) plus `meta`, `words` and `tags` for all 11 indexes (about 1.9 MB). That includes server-rendered searches and Discord searches.
- **Everything is fetched with `no-cache`.** `meta.json` and `global-vectors.lps` always revalidate, and shards use `no-store`.
- **Other pages load every index too.** Random, sitemap, the homepage feed and Discord each load columns from all indexes per request; only the homepage has a small response cache.

## Security issues
- `admin/audit-log` and its `feed.json` don't check for a login.
- `admin/overrides` and `validate` check for a login but not for a permission.
- The automation key in `.env` is the same value as in `example.env`, which is committed to the repo.

This is from reading the code and measuring file sizes; production traffic has not been profiled.
