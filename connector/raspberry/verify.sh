#!/usr/bin/env sh
set -eu
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:8787/health
echo
set -a
. ./.env
set +a
test "${#CONNECTOR_TOKEN}" -ge 32
curl --fail --silent --show-error -H "Authorization: Bearer $CONNECTOR_TOKEN" http://127.0.0.1:8787/v1/capabilities
echo
docker compose exec -T tailscale tailscale ip -4
echo "Home Connector ist lokal erreichbar, authentifiziert und im Tailnet angemeldet."
