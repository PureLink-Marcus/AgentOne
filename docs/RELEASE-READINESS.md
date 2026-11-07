# AgentOne Release Readiness

Stand: 7. November 2026
Release: `2026.11.07-85`
Deployment: Release 85 läuft auf Günni und Fressi; alle vier App-/Access-Container sind healthy. Pulse, Intelligence, Feedback, Google-Auswahl und Health-Status wurden live in Google Chrome geprüft.

## Abgenommen

| Bereich | Status | Nachweis |
|---|---|---|
| Lokale Anwendung | PASS | 128/128 Node-Tests, Vite-Production-Build und Chrome-Smoke |
| Personal-Startwelten | PASS | Companion, Jarvis HUD und Home & Life besitzen getrennte DOM-Strukturen, Prioritäten, Navigation und mobile Layouts; drei Chrome-Screenshots unter `output/playwright/` |
| Persönliche Live-Inbox | PASS | Postfächer, 343 Home-Entitäten, iPhone-Ereignisse, offene Freigaben und Connector-Audit werden aus echten APIs zusammengeführt; Filter, Detailnavigation, Desktop und Mobile in Chrome geprüft |
| Apple-Schnellstart | PASS | Vier mobile Schritte für Pairing, Companion-Paket, getrennte Health-/Standortrechte und Siri-Vorlage; Serverstatus und Downloads auf Günni Release 71 öffentlich geprüft |
| Gmail ohne OAuth-Client | PASS | Release 81: echtes Günni-Konto verbunden; 50 Nachrichten read-only geladen und persistent in Personen, Newsletter, Transaktionen und Spam-Verdacht gruppiert. SMTP bleibt optional. |
| Mail-Antwortentwurf | PASS | Release 84: Entwurf live speichern, Inhalt anzeigen und unverändert hashgebunden freigeben; der Status nennt ausdrücklich `NOCH NICHT GESENDET`. Es existiert kein impliziter Sendepfad. |
| Google-Konto-Connectoren | PASS | Release 83: Mail und Kalender sind am vorhandenen Gmail-Konto getrennt wählbar; Kalender wurde aktiviert und zeigt bis zur separaten OAuth-Freigabe ehrlich `FREIGABE NÖTIG`. Das App-Passwort wird nicht an Kalender weitergegeben. |
| Home-Live-Schreibpfad | PASS (zustandserhaltend) | RGB-Licht und Media-Player-Lautstärke wurden live auf ihre jeweiligen Istwerte geschrieben; HTTP 200, persistenter Audit, Testwert redigiert, 0 Browserfehler |
| Screendesign | PASS | neun reproduzierbare Hell-/Dunkel-Screenshots unter `output/demo/screenshots/` |
| Coolify-Stack | PASS | sechs AgentOne-Komponenten `running:healthy` |
| Datenbanken | PASS | zwei getrennte PostgreSQL-17-Instanzen, jeweils vier Runtime-Tabellen |
| Containerhärtung | PASS | non-root App-Image, read-only Root-FS, `cap_drop: ALL`, `no-new-privileges`, interne Datenbanken |
| Öffentliche Domain | PASS | `https://agentone.purelink.de`, gültiges TLS, anonym `303`, authentifiziert `200` |
| Mobiler Gateway-Login | PASS | AgentOne-Formular → signierte Session → Trusted Proxy → WebSocket; kein Gateway-Token-Dialog |
| Produktidentität | PASS | Auth-Realm, Agentenname und mobile Chatoberfläche zeigen `AgentOne` |
| Command Center | PASS | eigene AgentOne-Hülle mit AI Core, Aufgaben, Freigaben, Zeitplan, Systemstatus, Tools und Schnellaktionen; keine sichtbare OpenClaw-Navigation |
| Bedienbarer AI Core | PASS | Luna-Standard, Terra für Dokumente/Bilder und Sol für komplexe Aufgaben synchronisieren sich persistent mit dem HUD; Ollama bleibt bis zum Connector-Healthcheck ehrlich gesperrt. |
| Lokaler Modellpfad | READY | Connector v4 und App-Pfad sind getestet, allowlist-begrenzt und signiert. Live-Status, `LOCAL`-Datenschutz und Latenz werden sichtbar; ein reales Ollama-Modell auf dem Pi fehlt noch. |
| Chat-/Voice-Trace | PASS | Release 83: echter Browserchat und Voice-Texteingabe antworten über Luna mit HTTP 200; PWA-Erststart bleibt stabil, keine Konsolenfehler. Jarvis Core wählt Stefan, Gerätestimme `Anna` ist ausgeschlossen. |
| Mikrofonwahl | PASS | persistente Geräteauswahl, automatische `devicechange`-Aktualisierung und sicherer Fallback auf den Systemstandard im Browser geprüft |
| Proaktive Hinweise | PASS | Release 85: automatisch geladener Personal Pulse mit echten Mail-/Kalender-/Health-Signalen, maximal drei neue Hinweise pro Tag, Ruhezeit, persistente Deduplizierung und wirksames Feedback (`hilfreich`, `nicht hilfreich`, `falsch`, `später`, `nie wieder`). Live in Chrome ohne Secret-Leak geprüft. |
| Personal Event Ledger | PASS | Immutable, idempotent, user-isoliert, Retention/Export/Löschung; Mail-Bodies und Secret-Felder werden an der Speichergrenze abgewiesen. |
| Google Live Sync | PREPARED | OAuth-, Gmail-Metadaten- und Kalender-Sync inklusive Paging, Cursor, Retention, Kalenderauswahl und Teilerfolg ist implementiert und getestet. Auf Günni fehlt noch die serverseitige Google-OAuth-Konfiguration; das vorhandene App-Passwort bleibt bewusst nur IMAP. |
| Health Ledger | READY | Verschlüsselte, benutzerisolierte Apple-Health-XML/ZIP-Imports mit Consent, Deduplizierung, Digest, Export und Löschung sind live bereit; auf Günni sind noch keine persönlichen Health-Daten importiert. WHOOP bleibt bis Client-Credentials und Nutzerfreigabe `PREPARED`. |
| Persönliches Memory | PASS | persistente, benutzerisolierte Einträge mit Herkunft, Quellenreferenz, Bereich, Schutzklasse, Ablaufdatum, Suche und gezieltem Vergessen; Server- und Browsertests bestanden |
| Persönliche Routinen | PASS | Read-only-Routinen mit Aktion, Berliner Zeitplan, Wochentagen, Simulation, payloadgebundenem Freigabe-Hash, Aktivieren/Pausieren, täglicher Einmallauf-Garantie und sicherem Löschen |
| Live-Chat-Theme | PASS | eingebettete Runtime in AgentOne-Farben, dunkle Composer-/Verlaufskanten und aktive WebSocket-Verbindung |
| Plattform-Engine | PASS | vier versionierte Workflows und vier persistente Runs; Pause/Resume, Checkpoints, Budgetstopp und Events geprüft |
| Human Gates | PASS | WRITE/DEPLOY bleiben ohne exakt zum Payload-Hash passende Freigabe technisch gesperrt |
| Live Operations | PASS | authentifiziertes SSE mit Benutzer-/Welttrennung, Replay, Sequenz, Heartbeat und Secret-Redaction |
| Kostenrouting | PASS | GPT‑6 Luna Standard, GPT‑6.1 Sol Fallback, GPT‑6 Astra nur als Premiumauswahl; Luna und Sol real getestet |
| Secret-Grenze | PASS | keine Werte in Browser/API/Testausgaben; Fehlerausgaben werden redigiert |
| OpenAI | PASS | serverseitige OpenClaw-Inferenz über den günstigen Standard `gpt-6-luna` liefert `smoke-ok` |
| Personal-Konto-Login | PASS | eigenes Formular, konstante Credential-Prüfung, Fehlversuchslimit, Secure/HttpOnly-Session und Live-Server-Smoke |
| Personal-Chat | PASS | serverseitige Responses API, GPT‑6 Luna Standard, GPT‑6.1 Sol Fallback und echte Live-Antwort `personal-smoke-ok` |
| Persistenz | PASS | PostgreSQL-, App-, OpenClaw-Konfigurations- und Workspace-Volumes bleiben bei Containerrotation erhalten |

## Bewusst noch nicht produktiv freigegeben

| Bereich | Grund / Abschlusskriterium |
|---|---|
| Produktive Schreibadapter | Bleiben technisch blockiert, bis Zielsystem, Testlauf, Audit und Human Gate je Adapter freigegeben sind. |
| Self-Service-Anmeldung | Das normale Einzelkonto-Formular ist aktiv. Vor breiter Benutzerfreigabe folgen Einmal-Einladung, Passwortwechsel/-Reset und optional Passkeys/TOTP; Entra/PKCE ist vorbereitet. |
| PureLink Platform Domain | `agentone-platform.purelink.de` ist eingetragen, aber öffentlich noch nicht auflösbar. Route und TLS folgen nach DNS-Propagation. |
| Private Domains | PASS: `fressi.mwart.solutions` und `guenni.mwart.solutions` sind mit gültigem TLS, AgentOne-Login und getrennten Apps, Datenbanken, Gateways und Volumes im Projekt `agentone-private` online. |
| PWA | PASS: Manifest, maskierbares AgentOne-Icon, Standalone-Modus, versionsgebundener Service Worker, automatischer Cachewechsel und Instanzwechsel auf PureLink, Fressi und Günni geprüft; Private Access, Voice und Workspace-Icon zusätzlich auf beiden Personal-Instanzen. |
| Mehrinstanzverwaltung | PASS: Hinzufügen, Wechseln, Aktivieren und Deaktivieren im echten Chromium getestet; Browserkonsole 0 Fehler/0 Warnungen. |
| Instanzprofile | PASS: PureLink läuft als `BUSINESS`; Fressi und Günni als `PERSONAL` ohne Shopware-, ERP- oder Coolify-Oberflächen. |
| Unternehmensbranding | PASS: PureLink-Name, `PL`-Marke, Primär-/Akzentfarben, Login und PWA-Manifest online geprüft. |
| Private Farbwelten | PASS: Fressi nutzt Korall/Amber, Günni Violett/Mint; Login, PWA-Verzeichnis und Browserkonsole online geprüft. |
| Private Module | Konzept für Alltag, Inbox, Kalender, Dokumente, Zuhause, Haushalt, Fotos, Finanzen und Reisen in `docs/PERSONAL-INSTANCE-CONCEPT.md`. |
| Benannte Assistenten | PASS: PWA, Login, Command Center, Voice und OpenClaw-Runtime verwenden `Fressi` beziehungsweise `Günni`; AgentOne bleibt Plattformabdruck. |
| Voice Chat | PASS: authentifizierte Audio-Transkription mit `gpt-transcribe`, persönlicher Modellantwort und Browser-Sprachausgabe online geprüft. |
| Private Access | PASS für IMAP/Gmail und Home Connector; Google Kalender ist als getrennter OAuth-Connector mit Kalenderauswahl vorbereitet, aber auf Günni noch nicht autorisiert. Spotify, Twitch, iPhone und weitere Dienste bleiben einzeln freigabepflichtig. |
| Raspberry Connector | PASS: signiertes ARM64-/AMD64-Dockerpaket, Tailscale-Sidecar, 176 echte Home-Assistant-Entitäten und Installation unter `output/connector/`. Der Server ist LIVE/read-only; `./update.sh && ./enable-home-control.sh` aktiviert Lichtfarben, Medien und weitere erlaubte Komfortfunktionen. |
| Ein Gateway je Benutzer | Die Demo nutzt ein isoliertes Personal-Gateway. Multiuser-Produktion benötigt automatisierte, idempotente Gateway-/Volume-Provisionierung je Entra-`oid`. |
| Interner Connector | Architektur und Sicherheitsgrenzen sind festgelegt; Deployment erfordert den vorgesehenen internen Coolify-Host, Ziel-Allowlist und mTLS-Identität. |
| Backups/PITR | Isolierter Custom-Dump-Restore mit 7/7 Tabellen ist bestanden. Externes Backupziel, Aufbewahrung und kontinuierliches PostgreSQL-PITR müssen organisatorisch freigegeben werden. |
| Git-basierte Lieferung | Das Deployment verwendet ein auf dem Host gebautes, gehashtes Release-Archiv. Der private Git-Workflow benötigt befüllte Haupt-/Entwicklungszweige und CI-Zugang. |

## Reproduzierbare Prüfung

```powershell
npm run verify:local
npm run screenshots
npm run verify:remote
```

Die mobilen Assistant-Nachweise liegen unter `output/demo/mobile/agentone-login-mobile.png` und `output/demo/mobile/agentone-assistant-mobile.png`. Die öffentlichen Personal-Domains `fressi.mwart.solutions` und `guenni.mwart.solutions` sowie `agentone.purelink.de` wurden mit gültigem TLS und echtem Login geprüft. `PASS` bezeichnet den implementierten und live verifizierten Release. Es ist keine pauschale Freigabe für produktive Mutationen oder noch nicht eingerichtete externe Systeme.
