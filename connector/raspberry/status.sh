#!/usr/bin/env sh
set -eu
docker compose ps
docker compose exec -T tailscale tailscale status --peers=false || docker compose exec -T tailscale tailscale status
curl --fail --silent --show-error http://127.0.0.1:8787/health
echo
set -a
. ./.env
set +a
curl --fail --silent --show-error -H "Authorization: Bearer $CONNECTOR_TOKEN" http://127.0.0.1:8787/v1/status
echo
