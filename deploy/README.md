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
- The first image push creates both packages as private. Make each public once, under the package's settings on
  GitHub (Package settings → Change visibility), so servers can pull without logging in.
