# Deploying

CI (`.github/workflows/node.js.yml`) tests every workspace, then on each push to `main` or `production`, and
for each version tag, publishes two images to ghcr.io:

| image | app |
| --- | --- |
| `ghcr.io/andypalmer/find-sign-search` | the public site (`apps/search`) |
| `ghcr.io/andypalmer/find-sign-admin` | the admin app (`apps/admin`) |

The images hold no settings. Containers read them from their environment when they start, and refuse to
start if a required one is missing or the public site is given the write identity. One image therefore
serves any deployment (find.auslan.fyi, a beta, or another host).

Image tags:

| tag | moves? | published by |
| --- | --- | --- |
| `:production`, `:main` | yes: the latest build of that branch | pushes to the branch |
| `:1.4.2` | no | pushing the git tag `v1.4.2` |
| `:1.4`, `:1` | yes: the newest release in that line | the same (not for prereleases such as `v1.5.0-rc.1`, and no `:0`) |
| `:sha-1a2b3c4` | no | every build |

Both apps share one version: a tag releases the whole repo.

## Releasing a version

Releases come from [release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release-please.yml`). On every push to `main` it keeps a release PR open, which bumps the
version in `package.json` and adds the changes to `CHANGELOG.md`. The version follows the Conventional Commit
messages since the last release: `fix:` bumps the patch, `feat:` the minor, and `!` or `BREAKING CHANGE:` the
major. Merging the release PR tags the commit (`v1.4.2`), creates a GitHub release, then tests that commit and
publishes the versioned images.

To force a version, add `Release-As: 2.0.0` to the body of a commit message.

A version tag pushed by hand (`git tag v1.4.2 && git push origin v1.4.2`) also publishes versioned images, through
`node.js.yml`.

## Setting up a server

1. Copy `compose.yaml` here to the server, and adjust the hostnames and Traefik placeholders in it.
2. Next to it, create `search.env` from `apps/search/example.env` and `admin.env` from
   `apps/admin/example.env`.
3. `docker compose up -d`

For a beta server, run it with `FIND_SIGN_TAG=main`.

## Main and beta data

The main site and a beta can serve different builds of the same data. Each app's `SEARCH_INDEX_NAME` is the
folder in the find-sign collection its indexes are in: `index` for find.auslan.fyi, `beta` for beta.auslan.fyi.
The beta's admin app builds into `beta` (or run the indexer with `--index-name beta`), so a build can be tried
there before it's built into `index` for everyone.

What's in the collection once is shared by both: the encoded videos, overrides, claims, and the build's record
files, so a sign keeps the same id on both sites, and curators' work reaches each site when it's next built. An
index is about 45 MB, while the videos are gigabytes, so only the indexes are kept twice. Encoded files are named
for their source video, so re-encoding a changed video never overwrites what the other site still plays.

## The data server (nginx)

The index files come from a plain nginx that serves the find sign collections as static files. It can't search,
batch files, list a folder or accept writes, so everything the browser needs from it has to be a file it can
fetch. `nginx-index-files.conf` here holds the settings we want on its `/collections/` location. Put the file
in nginx's config and `include` it there, or copy the lines.

What it does, measured with headless Chrome against a local nginx using these settings (11 indexes, the same
steps before and after):

| | before | with the settings |
| --- | --- | --- |
| a visitor's first search | 5,833 kB | 3,542 kB |
| a later one-word search | 164 kB | 28 kB |
| a later two-word search | 173 kB | 34 kB |
| requests per search | 22 to 32 | 22 to 32 |

- **It squashes the JSON files** (columns, shards, `meta.json`). A `tags.json` goes from 750 kB to 31 kB.
  `nginx` still answers "has this changed?" with a `304`, even for a squashed file.
- **It leaves the `.lps` files alone.** They are word vectors, lists of decimal numbers that barely shrink
  (`global-vectors.lps` goes from 3.28 MB to 3.03 MB). That one file is 93% of what a first search still
  downloads, so making it smaller is a job for the index format, not for nginx.
- **It does not touch caching.** The index files keep their names from one build to the next, so a long
  `max-age` would hand out stale files, and `no-cache` would add a request per column per search. The app
  already checks each index's `meta.json` and re-fetches anything out of date. When files are named after their
  contents they can be sent as `immutable`, and the settings file shows the line to add.
- **It doesn't cut the number of requests.** Only the browser's behaviour does that (which is what the service
  worker is for), and the `404`s for a missing `englishPhrases.json`.

If the data host sits behind Cloudflare or another proxy, check what it does to these files too: compare the
`content-encoding` header of an index file fetched from the public address and straight from nginx.

## Rolling out a new version

Once CI has pushed new images:

```sh
docker compose pull && docker compose up -d
```

To pin a release, or roll back to an earlier one, set `FIND_SIGN_TAG` to its version (or any `sha-…` tag):

```sh
FIND_SIGN_TAG=1.4.1 docker compose pull && FIND_SIGN_TAG=1.4.1 docker compose up -d
```

Put `FIND_SIGN_TAG=1.4.1` in a `.env` file next to `compose.yaml` to keep it pinned across restarts. Remove
it to follow `:production` again.

## One-off GitHub setup

- release-please opens its PR with the workflow's own token, which GitHub only allows once it's enabled: Settings
  → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests". (PRs
  opened with that token don't run CI themselves; their commits are tested when merged.)
- CI installs the `@andypalmer` packages from GitHub Packages with the workflow's own token, which can only read
  them once this repo is allowed to: on each package's page (under find-sign-pipeline's Packages), Package
  settings → Manage Actions access → Add repository → find-sign-website, with the Read role. The image builds pass
  the same token to the Dockerfile as the `npmrc` build secret; to build an image by hand, pass your own:
  `docker build --secret id=npmrc,src=$HOME/.npmrc .`
- The first image push creates both packages as private. Make each public once, under the package's settings on
  GitHub (Package settings → Change visibility), so servers can pull without logging in.
