#!/usr/bin/env bash
# Starts local Find Sign in this terminal: the data server, the TLS proxy, the search site and the admin app,
# each line of output prefixed with where it came from. Ctrl-C stops them all.
#
#   dev/start.sh            vite dev servers, reloading as you edit
#   dev/start.sh --build    production builds, as they run behind Traefik
#
# It works out this machine's LAN address each time and points the apps' data urls at it, overriding the
# addresses in their .env files, so a new IP address only needs a restart. Open https://<the address>:8443/
# for the search site and :8444 for admin. See dev/README.md for the one-time setup.
set -euo pipefail
cd "$(dirname "$0")/.."

ip=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo 127.0.0.1)
host="$(scutil --get LocalHostName | tr '[:upper:]' '[:lower:]').local"
origin="https://$ip:8443"
# the folder with serve.mjs and the collections, next to this repo
data_root="${DATA_ROOT:-$(cd .. && pwd)}"

export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
export VECTOR_INDEX="$origin/collections/wordvec/raw/commoncrawl-english-300"
export SEARCH_DATA="$origin/collections/find-sign/raw/"
export ENCODED_SEARCH_DATAS="$origin/collections/encoded-search-data/raw"
export ADMIN_URL="https://$ip:8444/"

if [ "${1:-}" = "--build" ]; then
  npm run build
  site_port=4173 admin_port=4174
else
  site_port=5173 admin_port=5174
fi

# runs a command in the background, prefixing its output with a name
run () {
  local name=$1; shift
  "$@" 2>&1 | awk -v name="$name" '{ print "[" name "] " $0; fflush() }' &
}

# stop everything this script started when it exits, including on Ctrl-C
trap 'trap - EXIT; kill 0' EXIT INT TERM

echo "search https://$ip:8443/  admin https://$ip:8444/  (also https://$host:8443/)"
run data node "$data_root/serve.mjs" 9090 "$data_root"
run proxy env DEV_HOST="$host" DEV_IP="$ip" SITE_PORT=$site_port ADMIN_PORT=$admin_port caddy run --config dev/Caddyfile
if [ "${1:-}" = "--build" ]; then
  run search env PORT=$site_port HOST=127.0.0.1 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node --env-file=apps/search/.env apps/search/build
  run admin env PORT=$admin_port HOST=127.0.0.1 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host node --env-file=apps/admin/.env apps/admin/build
else
  run search npm run dev -w apps/search
  run admin npm run dev -w apps/admin
fi
wait
