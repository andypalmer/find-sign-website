# Changelog

## [1.0.1](https://github.com/andypalmer/find-sign-website/compare/v1.0.0...v1.0.1) (2026-10-22)


### Bug Fixes

* **search:** a failed front page load no longer stops the server ([fd0b8fd](https://github.com/andypalmer/find-sign-website/commit/fd0b8fdfbacdadd28c26953cc8097bd9042abc30))

## 1.0.0 (2026-10-22)


### ⚠ BREAKING CHANGES

* **records:** RecordContent.id is replaced by sourceId; observe() is replaced by firstObservation() and nextObservation().
* **deploy:** settings drop the VITE_ prefix and are read at runtime; deploys pull images instead of building on the server.
* the site builds to apps/site/build and reads apps/site/.env; deploys need pm2 pointed at the new path, and the admin app deployed separately.
* **deps:** migrate to SvelteKit 3, Vite 8, vitest 5 and TypeScript 6
* **deps:** migrate to SvelteKit 2, Svelte 5, Vite 5 and vitest 2

### Features

* add script to automatically find the local ip and start the servers with TLS ([62df559](https://github.com/andypalmer/find-sign-website/commit/62df559538e382beb5e83111720fb0182ffd6649))
* **deploy:** publish runtime-configured images to ghcr.io ([f507e11](https://github.com/andypalmer/find-sign-website/commit/f507e11c1cd95d141e93ba7d3c2716551ec9fd39))
* **dev:** add Caddy TLS proxy so local dev is a secure context ([86ab991](https://github.com/andypalmer/find-sign-website/commit/86ab991022d38fb1a0526fd59c6bf8c8f9988d2f))
* **index:** readable sign urls, redirecting old permalinks ([b553263](https://github.com/andypalmer/find-sign-website/commit/b55326305d3cdd58c775b1d3fbc6c45700c1a1b9))
* **records:** add the sign record schema and change tracking ([5316dab](https://github.com/andypalmer/find-sign-website/commit/5316dab6271be91763da0103263dce051bd59809))
* **records:** separate sign identity from its readable id, publish to GitHub Packages ([a620f84](https://github.com/andypalmer/find-sign-website/commit/a620f841eab525a64cb6d44e3d0637336beaa511))
* tag display, English phrase search and discovery order, on the published pipeline packages ([a3328ae](https://github.com/andypalmer/find-sign-website/commit/a3328ae2010e155bc03987dea9208d88c373b1df))


### Bug Fixes

* **analytics:** render empty charts when there is no hit data ([6b6c19e](https://github.com/andypalmer/find-sign-website/commit/6b6c19e69b63a746bc2ccfc4ca1f80a76c89acf3))
* **auth:** expire passkey challenges, support autofill login, validate usernames ([3a5479d](https://github.com/andypalmer/find-sign-website/commit/3a5479d64a55ab8942edc0b9557bbdd6527a7d29))


### Miscellaneous Chores

* **deps:** migrate to SvelteKit 2, Svelte 5, Vite 5 and vitest 2 ([9c93a78](https://github.com/andypalmer/find-sign-website/commit/9c93a78b9604fa651310b5525e22bf9180d584a6))
* **deps:** migrate to SvelteKit 3, Vite 8, vitest 5 and TypeScript 6 ([bcec5f3](https://github.com/andypalmer/find-sign-website/commit/bcec5f351ae62c51b56e9e1131e93a9fd5789f76))


### Code Refactoring

* split admin into its own app, as npm workspaces ([2d9a0c8](https://github.com/andypalmer/find-sign-website/commit/2d9a0c8b940527f84e6d003decd5e91a9c2d4abb))
