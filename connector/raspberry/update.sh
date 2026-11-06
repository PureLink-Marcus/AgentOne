#!/usr/bin/env sh
set -eu

BASE_URL="${AGENTONE_UPDATE_URL:-https://guenni.mwart.solutions/agentone/downloads}"
WORK_DIR="$(mktemp -d)"
BACKUP_DIR=".update-backup"
trap 'rm -rf "$WORK_DIR"' EXIT

command -v openssl >/dev/null 2>&1 || { echo "OpenSSL fehlt."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "unzip fehlt."; exit 1; }
test -f update-public.pem || { echo "Öffentlicher Update-Schlüssel fehlt."; exit 1; }
curl --fail --silent --show-error "$BASE_URL/home-connector-release.json" -o "$WORK_DIR/release.json"
PACKAGE_URL="$(sed -n 's/.*"packageUrl":"\([^"]*\)".*/\1/p' "$WORK_DIR/release.json")"
SIGNATURE_URL="$(sed -n 's/.*"signatureUrl":"\([^"]*\)".*/\1/p' "$WORK_DIR/release.json")"
EXPECTED_SHA="$(sed -n 's/.*"sha256":"\([a-fA-F0-9]*\)".*/\1/p' "$WORK_DIR/release.json")"
test -n "$PACKAGE_URL" && test -n "$SIGNATURE_URL" && test "${#EXPECTED_SHA}" -eq 64 || { echo "Release-Manifest ungültig."; exit 1; }
curl --fail --silent --show-error "$PACKAGE_URL" -o "$WORK_DIR/connector.zip"
curl --fail --silent --show-error "$SIGNATURE_URL" -o "$WORK_DIR/connector.sig"
ACTUAL_SHA="$(sha256sum "$WORK_DIR/connector.zip" | awk '{print $1}')"
test "$ACTUAL_SHA" = "$EXPECTED_SHA" || { echo "SHA-256-Prüfung fehlgeschlagen."; exit 1; }
openssl pkeyutl -verify -pubin -inkey update-public.pem -rawin -in "$WORK_DIR/connector.zip" -sigfile "$WORK_DIR/connector.sig" >/dev/null || { echo "Ed25519-Signatur ungültig."; exit 1; }
rm -rf "$WORK_DIR/new" "$BACKUP_DIR"
mkdir -p "$WORK_DIR/new" "$BACKUP_DIR"
unzip -q "$WORK_DIR/connector.zip" -d "$WORK_DIR/new"
for file in compose.yaml Dockerfile package.json README.md server.mjs server.test.mjs install.sh start.sh status.sh verify.sh update.sh update-public.pem; do
  test -f "$WORK_DIR/new/$file" || { echo "Paketdatei fehlt: $file"; exit 1; }
  test ! -e "$file" || cp -p "$file" "$BACKUP_DIR/$file"
  cp -p "$WORK_DIR/new/$file" "$file"
done
chmod +x install.sh start.sh status.sh verify.sh update.sh
if ./start.sh; then
  rm -rf "$BACKUP_DIR"
  echo "AgentOne Home Connector wurde signiert aktualisiert."
else
  echo "Healthcheck fehlgeschlagen; vorheriger Stand wird wiederhergestellt."
  for file in "$BACKUP_DIR"/*; do test -e "$file" && cp -p "$file" "$(basename "$file")"; done
  ./start.sh
  exit 1
fi
