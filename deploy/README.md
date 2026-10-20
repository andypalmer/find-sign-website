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

Tag the commit (usually the head of `production`) and push the tag:

```sh
git tag v1.4.2
git push origin v1.4.2
```

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

The first push creates both packages as private. Make each public once, under the package's settings on
GitHub (Package settings → Change visibility), so servers can pull without logging in.
