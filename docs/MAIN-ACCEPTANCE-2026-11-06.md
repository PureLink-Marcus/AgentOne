# AgentOne Personal – Main-Abnahmeprotokoll

Stand: 6. November 2026
Kandidat: `2026.11.06-79`
Ziel: Günni und Fressi / AgentOne Personal

## Ergebnis

Der technische Releasekandidat ist reproduzierbar gebaut, auf beiden privaten Instanzen ausgerollt und gegen Browser, PWA, Datenbank, Connector-Download und Sicherheitsgrenzen geprüft. Der Arbeitsordner ist als lokales Git-Repository mit `agentone-main` vorbereitet; die vier vereinbarten Branches werden aus demselben geprüften Commit angelegt. Für die Veröffentlichung auf GitHub fehlt nur eine gültige Anmeldung, weil das vorhandene `gh`-Token abgelaufen ist. Externe Benutzerkonten und Hardwarefreigaben bleiben bewusst getrennte Abnahmepunkte.

## Verifizierte Anforderungen

| Bereich | Evidenz | Ergebnis |
|---|---|---|
| Release | Günni/Fressi melden `2026.11.06-79`; vier App-/Access-Container healthy | PASS |
| Serverlogik | `npm test` | 60/60 PASS |
| Home Connector | `node --test connector/raspberry/server.test.mjs` | 4/4 PASS |
| Production-Build | `npm run build` | PASS |
| Browser | drei Startwelten, AI Core, Inbox, Home, Apple, Gmail und Mobilansicht | PASS, 0 Konsolenfehler |
| PWA | Manifest, Service Worker, Pull-to-Refresh, Fokus-/60s-Update, Instanzwechsel | PASS auf Günni und Fressi |
| Routinen | Anlegen, read-only Simulation, hashgebundene Aktivierung, Pause und Löschen | PASS live |
| Lokales Modell | Connector-v4-Allowlist, Limits, lokaler Chatpfad und gesperrte UI ohne Healthcheck | READY |
| Connector-Update | öffentlicher ZIP-Download, SHA-256 und Ed25519 | PASS |
| Restore | PostgreSQL-Custom-Dump in isolierte Testdatenbank; 7/7 Public-Tabellen | PASS, automatisch bereinigt |
| Secret-Grenze | keine Secrets in API-, Audit-, Browser- oder Prüfausgaben | PASS |

## Offene externe Abnahmen

Diese Punkte sind keine versteckten Softwarefehler und dürfen ohne Benutzer- oder Gerätefreigabe nicht als bestanden markiert werden:

1. Gmail und 1blu: echtes Konto mit App-Passwort beziehungsweise IMAP/SMTP-Zugang; danach Lesetest, Gruppierung, Entwurf und ausdrücklich freigegebener Testversand.
2. Home Assistant: Spotify-URI, Szene und echter Sonos-Player als bewusst ausgelöste Benutzeraktion.
3. iPhone: HealthKit-/Standortdaten und native Signierung benötigen Apple-Gerät und Entwicklerzugang.
4. Ollama: Connector v4 auf dem Pi aktualisieren, Modell installieren und in `OLLAMA_MODELS` erlauben; erst dann wird `STRICT · lokal` aktiv.
5. Betrieb: externes Backupziel, Aufbewahrungsregeln und PostgreSQL-PITR organisatorisch festlegen.
6. Git/Main: GitHub erneut authentifizieren und die lokal vorbereiteten Branches `agentone-main`, `agentone-dev`, `agentone-personal-main`, `agentone-personal-dev` zu `PureLink-Marcus/AgentOne` pushen.

## Reproduzierbares Protokoll

```powershell
npm test
node --test connector\raspberry\server.test.mjs
npm run build
node scripts\local-chat-browser-smoke.mjs
node scripts\guenni-layout-browser-smoke.mjs
$env:PWA_SCOPE='private'; node scripts\pwa-online-smoke.mjs
node scripts\postgres-restore-smoke.mjs
```

Releaseartefakte:

- `output/demo/agentone-release-2026.11.06-79.tgz`
- SHA-256 `6C92C19D9FEB20F1B26396DD80B94084ED266FDA6B686F98E106E43BB02FC5A5`
- `output/connector/agentone-home-connector-raspberry.zip`
- `output/connector/agentone-home-connector-raspberry.zip.sig`
- `output/connector/home-connector-release.json`

## Promotionsentscheidung

Technischer Kandidat: **PASS**.
Git-Main-Promotion: **READY / lokaler Checkout vorbereitet, wartet auf GitHub-Authentifizierung**.
Externe Konten und Geräte: **READY / wartet auf Benutzerfreigabe**.
