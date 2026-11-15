# Changelog

## [1.1.0](https://github.com/andypalmer/find-sign-website/compare/v1.0.1...v1.1.0) (2026-11-15)


### Features

* **search:** break ties between indexes by the order they are configured in, then by id ([4b076ad](https://github.com/andypalmer/find-sign-website/commit/4b076ad308a640da07bc03466a12c0e0724e4ce8))
* **search:** put results that rank equally in id order, on purpose ([fbcc146](https://github.com/andypalmer/find-sign-website/commit/fbcc146539c7b0c5763410679afd34bdd08b16dc))
* **search:** register the service worker when SERVICE_WORKER is on, and search through it, falling back to the direct search ([e997803](https://github.com/andypalmer/find-sign-website/commit/e997803f284c2bb80b26165ff3064f8397a0b26d))
* **search:** show what went wrong on a labelled site's error page, so a failure can be read on a phone ([d95d84e](https://github.com/andypalmer/find-sign-website/commit/d95d84ef3c9a98148c87cdf7d3c22bd79abdcd8c))
* **worker:** answer hello and search letters, with progress, cancelling and the contract's failure reasons ([2a9fea2](https://github.com/andypalmer/find-sign-website/commit/2a9fea2f5a28c9afe174fc27132ad8d244e53b50))
* **worker:** answer hello and search letters, with progress, cancelling and the contract's failure reasons ([dff99e9](https://github.com/andypalmer/find-sign-website/commit/dff99e95ddd419adbe257f67911794386690ee35))
* **worker:** ask the worker from the page, and fall back to today's search when it can't answer ([9ffb4ce](https://github.com/andypalmer/find-sign-website/commit/9ffb4cee54ab977d572b645f1361b72b79b7e358))
* **worker:** build the file keeper from the browser's own fetch and IndexedDB ([b8fb455](https://github.com/andypalmer/find-sign-website/commit/b8fb45571094d20a1e37682777fdd877175d11bb))
* **worker:** drop kept files that have been out of date for over 30 days ([3b3c129](https://github.com/andypalmer/find-sign-website/commit/3b3c1294b33f37bd4de42f19af75728961720692))
* **worker:** follow the top manifest to each index's manifest, fetching only those not yet kept ([b0c5c4c](https://github.com/andypalmer/find-sign-website/commit/b0c5c4c1a0a0a02461337ca082c28bc1702e5577))
* **worker:** keep a content-named index file after the first fetch and serve it from storage ([8045f91](https://github.com/andypalmer/find-sign-website/commit/8045f918ef8028c84d95093fe842aed69ef8cd78))
* **worker:** keep index files in IndexedDB so they survive the worker stopping ([efb0e83](https://github.com/andypalmer/find-sign-website/commit/efb0e833457c47fd079efed87253874038c6f100))
* **worker:** load every index from the kept files, in the order we trust them ([973a8f5](https://github.com/andypalmer/find-sign-website/commit/973a8f5c112d125e3766a59cf08ce15454e0cca9))
* **worker:** read the file names out of the top manifest and the index manifests ([1dc1306](https://github.com/andypalmer/find-sign-website/commit/1dc13060fe10371cf3aafd81a83b83bdce991204))
* **worker:** read the shared vector list in manifest.json and keep those files ([dd78224](https://github.com/andypalmer/find-sign-website/commit/dd782248859aad806f22baaf3dafd31670c64f8f))
* **worker:** recheck the kept manifest with a conditional request and keep it if unchanged ([4351665](https://github.com/andypalmer/find-sign-website/commit/435166531f69500c7d1e70022d7d2852db85b28e))
* **worker:** refetch the manifest and retry once when a content-named file is missing ([402de62](https://github.com/andypalmer/find-sign-website/commit/402de627c921ed7fcdb7725de05468e3439718ae))
* **worker:** serve the kept manifest when the check can't reach the server ([2a42b68](https://github.com/andypalmer/find-sign-website/commit/2a42b6810105adc2a6edb615ebf113b2886e125e))
* **worker:** share one fetch between askers who want the same file at the same time ([4e3609f](https://github.com/andypalmer/find-sign-website/commit/4e3609f133b4fb32a813485cb3338a5c30205b71))
* **worker:** share one manifest check between askers who ask at the same time ([947d853](https://github.com/andypalmer/find-sign-website/commit/947d8533fb012c9553f820f14e3b61de37dca815))
* **worker:** tidy by itself when the manifest changes or a file's wait is over ([60079e5](https://github.com/andypalmer/find-sign-website/commit/60079e57554906df95e7f521987fc6d33d95d429))


### Bug Fixes

* **deploy:** let any website read the collections from a browser, by sending Access-Control-Allow-Origin * ([e022383](https://github.com/andypalmer/find-sign-website/commit/e02238348d4ffeac40defde46a8afd8aee2a2cbe))
* **search:** ask the server for the word vector library every time, so a stored bad answer can't outlive its fix ([4c9b206](https://github.com/andypalmer/find-sign-website/commit/4c9b2069118973cce5336d0c28e71518dd37dec6))
* **search:** register the service worker as a module, as sveltekit 3 builds it ([c9db2a1](https://github.com/andypalmer/find-sign-website/commit/c9db2a1b0bbb87c7a0ebec18b21c9c3140114680))
* **search:** search directly after a short wait when the worker hasn't said hello, and use the worker once it has ([ec306ba](https://github.com/andypalmer/find-sign-website/commit/ec306ba5661bd3b0b6db6e656c76e003e75b1123))
* **search:** search for a word as plain text when its vector can't be fetched, rather than failing the whole search ([abedc07](https://github.com/andypalmer/find-sign-website/commit/abedc0782dbf5b03db8dffea517e3b84bac148f5))
* **search:** use the direct search whenever the worker can't answer, because a refused request looks the same as being offline ([583aeff](https://github.com/andypalmer/find-sign-website/commit/583aeff208fc9fe6430acbc6639326f0c5fcfe01))
* **worker:** ask for manifest.json without headers of our own, so the browser needs no permission to ask ([cc41d7d](https://github.com/andypalmer/find-sign-website/commit/cc41d7dd84ca6a43fc86cd1c779a73ad9d1e9514))

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
