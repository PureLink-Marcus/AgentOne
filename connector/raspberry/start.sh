#!/usr/bin/env sh
set -eu

test -f .env || { echo "Führe zuerst ./install.sh aus."; exit 1; }
set -a
. ./.env
set +a
test -n "${TAILSCALE_AUTH_KEY:-}" || { echo "TAILSCALE_AUTH_KEY fehlt in .env."; exit 1; }
test -n "${HOME_ASSISTANT_TOKEN:-}" || { echo "HOME_ASSISTANT_TOKEN fehlt in .env."; exit 1; }
test "${#CONNECTOR_TOKEN}" -ge 32 || { echo "CONNECTOR_TOKEN ist ungültig."; exit 1; }
mkdir -p "${HOST_SHARED_ROOT:-./shared}"

docker compose pull tailscale
docker compose up -d --build
attempt=1
until curl --fail --silent http://127.0.0.1:8787/health >/dev/null 2>&1; do
  if [ "$attempt" -ge 30 ]; then docker compose logs --tail=80; exit 1; fi
  attempt=$((attempt + 1))
  sleep 2
done
./verify.sh
echo "Der einmalige Tailscale-Key kann jetzt in der Admin-Konsole widerrufen werden. Der Gerätestatus bleibt im persistenten Volume erhalten."
