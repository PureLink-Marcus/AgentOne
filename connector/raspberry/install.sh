#!/usr/bin/env sh
set -eu

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose fehlt. Installiere zuerst Docker Engine mit Compose Plugin."
  exit 1
fi

arch="$(uname -m)"
case "$arch" in
  aarch64|arm64|x86_64|amd64) ;;
  *) echo "Nicht unterstützte Architektur: $arch"; exit 1 ;;
esac

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL fehlt. Installiere zuerst das Paket openssl."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  token="$(openssl rand -hex 32)"
  sed -i "s/^CONNECTOR_TOKEN=.*/CONNECTOR_TOKEN=$token/" .env
  chmod 600 .env
  echo "Konfiguration .env wurde angelegt."
fi

echo "1. Trage TAILSCALE_AUTH_KEY und HOME_ASSISTANT_TOKEN in .env ein."
echo "2. Prüfe HOME_ASSISTANT_URL."
echo "3. Starte danach sicher mit: ./start.sh"
