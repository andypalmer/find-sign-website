# Local development over https

In production, find sign runs behind a TLS-terminating proxy (Traefik). `dev/Caddyfile` does the
same job locally with [Caddy](https://caddyserver.com), so the site is a browser *secure context*
on every device, not just `localhost`. Some browser APIs the site relies on, such as
`crypto.subtle` (used for word vector lookups) and passkeys, only exist in secure contexts. Without
this, testing from a phone on the LAN breaks.

```
browser ──https──▶ <host>:8443 (caddy, terminates TLS)
          │          ├─ /collections/*  ──▶ localhost:9090  data server (serve.mjs)
          │          └─ everything else ──▶ localhost:5173  public site, vite dev (or 4173 for `node build`)
          └─https──▶ <host>:8444 ──────────▶ localhost:5174  admin app, vite dev (or 4174 for `node build`)
```

## One-time setup

1. `brew install caddy`
2. Start caddy once (below), so it creates its local certificate authority, then trust it on this
   Mac (asks for your password): `caddy trust`
3. On each phone or tablet you test with, install and trust the root certificate at
   `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`
   - **iOS**: AirDrop the file to the device, install the profile (Settings → Profile Downloaded),
     then enable it under Settings → General → About → Certificate Trust Settings.
   - **Android**: Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
4. Point `apps/site/.env` and `apps/admin/.env` at the proxy (start from each app's `example.env`). These
   urls are built into the client, so every device must be able to reach the same address. Chrome on Android doesn't resolve `.local` (mDNS) names, so use this
   machine's LAN IP (`ipconfig getifaddr en0`), and give it a DHCP reservation on your router so it
   doesn't change:
   ```
   VITE_VECTOR_INDEX="https://192.168.1.10:8443/collections/wordvec/raw/commoncrawl-english-300"
   VITE_SEARCH_DATA="https://192.168.1.10:8443/collections/find-sign/raw/"
   VITE_ENCODED_SEARCH_DATAS="https://192.168.1.10:8443/collections/encoded-search-data/raw"
   ```
   In `apps/site/.env`, `VITE_ADMIN_URL="https://192.168.1.10:8444/"` makes searching for "admin" link to
   the admin app. If your devices only run iOS/macOS, the Bonjour name (`scutil --get LocalHostName`,
   lowercased, plus `.local`) works too and survives IP changes.

## Running

```sh
export DEV_HOST="$(scutil --get LocalHostName | tr A-Z a-z).local"
export DEV_IP="$(ipconfig getifaddr en0)"  # the certificate covers both names
# server side rendering fetches the data over https too, so node must trust caddy's CA
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"

node serve.mjs 9090 /path/to/auslan              # data server (from the parent folder)
caddy run --config dev/Caddyfile                 # proxy, SITE_PORT / ADMIN_PORT default to 5173 / 5174
npm run dev                                      # public site: https://$DEV_HOST:8443/
npm run dev:admin                                # admin app: https://$DEV_HOST:8444/
```

Both apps run on the same hostname locally, so the admin login cookie is also sent to the public site
(cookies ignore ports). The site never reads it. In production the admin app has its own hostname.

To test production builds instead, run caddy with `SITE_PORT=4173 ADMIN_PORT=4174`, and start each build the
way it runs behind Traefik, taking the public origin from the proxy's forwarded headers:

```sh
npm run build                                    # builds both apps
cd apps/site && PORT=4173 HOST=127.0.0.1 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node build
cd apps/admin && PORT=4174 HOST=127.0.0.1 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node build
```

The same `PROTOCOL_HEADER` / `HOST_HEADER` settings (or a fixed `paths.origin` in `vite.config.js`) apply in production
behind Traefik.
