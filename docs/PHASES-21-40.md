# AgentOne – Betriebsphasen 21–40

Stand: 31. Oktober 2026. Diese Phasen setzen auf dem abgeschlossenen Hybrid-Demopaket 01–20 auf. `COMPLETE` bedeutet durch Tests und Live-Abnahme belegt; `READY` bedeutet implementiert, aber mangels externer Zugangsdaten noch nicht gegen das Benutzerkonto geprüft; `PLANNED` ist noch nicht umgesetzt.

| Phase | Status | Ergebnis / Abnahme |
| ---: | --- | --- |
| 21 | COMPLETE | Persönliche Mailkonten werden pro Instanz in PostgreSQL gehalten; Passwörter liegen ausschließlich AES-256-GCM-verschlüsselt vor und erscheinen nicht in Antworten oder Logs. |
| 22 | READY | 1blu, Gmail-App-Passwort und öffentliche IMAP/SMTP-Anbieter besitzen mobile Voreinstellungen und echte IMAP-/SMTP-Anmeldung ohne Testversand. Der letzte externe Kontotest wartet auf Benutzerdaten. |
| 23 | COMPLETE | Read-only Scan der letzten 50 INBOX-Nachrichten mit MIME-/Headeranalyse und Gruppen Personen, Newsletter, Transaktionen und Spam-Verdacht; keine Mailboxmutation. |
| 24 | COMPLETE | Mobile PWA-Einrichtung bei 390 Pixel Breite, Kontoübersicht, Test, Gruppierung, Vorschau und OpenClaw-IMAP-Status; Chrome-Abnahme bestanden. |
| 25 | READY | Gmail OAuth Web-Server-Flow mit PKCE, `gmail.readonly` und `calendar.readonly`, serverseitigem Tokenaustausch und verschlüsseltem Refresh-Token ist ausgerollt. Google Client-ID/Secret fehlen noch für den externen LIVE-Test. |
| 26 | READY | OpenClaw-IMAP ist geladen; `mail_reader` besitzt eigene Identität, Session-Sandbox, keinen Workspacezugriff und nur `session_status`. Die erste echte Mailzustellung wartet auf ein verbundenes Konto. |
| 27 | COMPLETE | Bestätigbare Sortierregeln besitzen Vorschau, Version, Payload-Hash und unveränderliche Freigabegrenze; die PWA erzeugt zunächst ausschließlich Regelvorschauen. |
| 28 | READY | Move-/Label-Regeln können nur hashgebunden freigegeben werden; ohne erfolgreich getestetes Postfach werden keine Mutationen ausgeführt. Rückgängig-Livetest wartet auf Testpostfach und Zielordner. |
| 29 | READY | Antwortentwürfe und Versandfreigabe sind getrennte, hashgebundene Zustände. Ein echter Versand bleibt bis zum Testkonto und einer expliziten Benutzeraktion blockiert. |
| 30 | COMPLETE | Persönliches Mailbriefing aggregiert Personen, Transaktionen, Newsletter- und Spam-Prüfungen; `automaticActions` bleibt technisch leer. |
| 31 | READY | CalDAV/CardDAV besitzt verschlüsselte mobile Einrichtung und read-only PROPFIND-Healthcheck; Google Calendar ist Teil des OAuth-Flows. Externe Konten fehlen noch. |
| 32 | READY | Paperless-ngx besitzt verschlüsseltes Token, öffentliche HTTPS-/SSRF-Prüfung und read-only Dokument-Healthcheck. Lokale Installationen werden erst über Connector v2 freigeschaltet. |
| 33 | COMPLETE | Connector v2 läuft auf dem Raspberry Pi LIVE über Tailscale; Ed25519-signierte Updates, SHA-256, Staging, Healthcheck und automatisches Rollback sind bereit. Hetzner und Pi sind online im selben Tailnet. |
| 34 | READY | Mealie besitzt verschlüsseltes Token und read-only Healthcheck; Home-Assistant-To-do bleibt über die bestehende `todo`-Domain sichtbar. Externer Diensttest fehlt. |
| 35 | READY | Immich besitzt verschlüsselten API-Key, read-only Ping und minimale Asset-/Album-/Metadatenfähigkeiten; Gesicht und Standort bleiben außerhalb der Standardfreigabe. Externer Diensttest fehlt. |
| 36 | READY | Actual Budget ist als Finanzdatenklasse mit Budget-, Konto- und Transaktions-Leserechten eingebaut; `payments.none` schließt Zahlungsfunktionen technisch aus. Der externe Sync-Server fehlt für den LIVE-Test. |
| 37 | READY | ntfy und Telegram besitzen verschlüsselte Tokens, Ruhezeiten, Telegram-Benutzer-Allowlist und ausschließlich freigabepflichtige Publish-/Sendefähigkeiten. Externe Tokens fehlen. |
| 38 | READY | One-Time-Pairing, gehashte Gerätetokens, Kalender-/Erinnerungs-Summaries, minimale Health-Summaries und Standort-TTL von maximal 60 Minuten sind ausgerollt. Die native iOS-App bleibt als separates Paket offen. |
| 39 | COMPLETE | Connector-weites Audit, Secret-Re-Encryption/Rotation, Metadatenexport ohne Secrets, Quarantäne, Restore und Widerruf sind pro Benutzer und Connector implementiert und getestet. |
| 40 | READY | Mobile Chrome-Abnahme prüft Mail, sieben private Dienste, PWA, OpenClaw-Plugins, signierten Connector-Download, iPhone-Pairing und Governance. Vollständige LIVE-Abnahme wartet auf die externen Benutzerkonten und den Pi-v2-Basiswechsel. |

## Nächster Arbeitsblock

Die Phasen 21–40 sind technisch umgesetzt. Externe Konten, die native iOS-App und lokale Heimdienste bleiben bis zum realen Healthcheck sichtbar `READY` oder `DEGRADED`, niemals fälschlich `LIVE`.
