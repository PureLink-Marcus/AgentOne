# AgentOne Release Readiness

Stand: 7. November 2026
Release: `2026.11.07-109` (**MASTER · PASS LIVE**)
Deployment: Release 109 ist gestuft Günni → Fressi ausgerollt; alle vier App-/Access-Container sind healthy. Der Rollout besitzt einen automatischen Rückfall auf das exakte Preflight-Image. WHOOP bleibt ohne registrierte Provider-Credentials `NOT_CONFIGURED`; ein echter iPhone-Safari-/PWA-Hardwaretest bleibt offen.

## Abgenommen

| Bereich | Status | Nachweis |
|---|---|---|
| Lokale Anwendung | PASS LOCAL + LIVE | Release 109: 375/375 Node-Tests, Produktions-Build, npm-Audit, lokaler Pattern-Feed-Chrome-Smoke und read-only Günni-Live-Smoke grün; Effect Ledger und PWA-Push bleiben als Regression erhalten. |
| Personal-Startwelten | PASS | Companion, Jarvis HUD und Home & Life besitzen getrennte DOM-Strukturen, Prioritäten, Navigation und mobile Layouts; drei Chrome-Screenshots unter `output/playwright/` |
| Persönliche Live-Inbox | PASS | Postfächer, aktuell 345 Home-Entitäten, iPhone-Ereignisse, offene Freigaben und Connector-Audit werden aus echten APIs zusammengeführt; Filter, Detailnavigation, Desktop und Mobile in Chrome geprüft |
| Apple-Schnellstart | PASS LIVE WEB-FLOW | Release 104 benennt das Produkt eindeutig als Companion-Web-App, macht Safari-Pairing und optionale Home-Bildschirm-Installation sichtbar und trennt das Anleitungspaket ehrlich von der noch nicht vorhandenen nativen iOS-App. HTTPS, WebKit, Vault-Preflight, 54-px-Touchziele und 0 Konsolenfehler sind live geprüft; automatisiertes WebKit ersetzt keinen echten iPhone-Hardwaretest. |
| Gmail ohne OAuth-Client | PASS LIVE | Release 99: Günni hält 500 reale IMAP-Metadaten mit persistentem UID-/UIDVALIDITY-Cursor. Zwei direkte inkrementelle Läufe endeten im zweiten Lauf mit 0 Fetches und 0 neuen Datensätzen; nach vollständiger Containerrotation waren alle 500 Datensätze ohne neuen Sync verfügbar. Bodies, Snippets, Anhänge und Roh-Header werden weder geladen noch gespeichert. |
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
| Command-Stream Center | PASS LIVE | Release 92 persistiert echte Runs für Personal Briefing, IMAP-Test/-Scan, Google-Read-only-Sync und Apple-Health-Import. Günnis echter IMAP-Scan erzeugte live `OBSERVE → TOOL → RESULT`; die öffentliche Timeline enthält ausschließlich freigegebene Run-/Step-Metadaten. Desktop und 390-px-Mobilansicht wurden in Google Chrome geprüft. |
| Heute & Planung | PASS LIVE | Release 94: serverseitiger Berliner Tagesplan aus minimiertem Google-/ICS-Ledger, Upcoming Events, echte Überschneidungen und freie Arbeitsfenster. Günni wurde in Chrome bei 390 px mit zwei temporären Live-Terminen, einem Konflikt, zwei freien Fenstern und acht echten Mail-Aktionen geprüft; die ICS-Testdaten wurden danach wieder entfernt. |
| Privates Kalender-Abo | PASS LIVE / NOT_CONNECTED | Release 96 speichert `https://`- oder `webcal://`-Feeds AES-256-GCM-verschlüsselt und benutzerisoliert. Manueller Sync, 15-Minuten-Hintergrundlauf, Backoff, DNS-Pinning/SSRF-Schutz und der letzte gültige Snapshot bei Providerfehlern sind live ausgerollt. API, Audit, DOM und Screenshot enthalten keinen Feed-Link. Günni zeigt ehrlich `NOT_CONNECTED`, bis der Benutzer seinen privaten Link eingibt. |
| Bedienbarer AI Core | PASS | Luna-Standard, Terra für Dokumente/Bilder und Sol für komplexe Aufgaben synchronisieren sich persistent mit dem HUD; Ollama bleibt bis zum Connector-Healthcheck ehrlich gesperrt. |
| Lokaler Modellpfad | READY | Connector v4 und App-Pfad sind getestet, allowlist-begrenzt und signiert. Live-Status, `LOCAL`-Datenschutz und Latenz werden sichtbar; ein reales Ollama-Modell auf dem Pi fehlt noch. |
| Chat-/Voice-Trace | PASS LIVE | Release 98: Eine synthetische 5,297-Sekunden-WAV wurde live über `gpt-transcribe` mit vier semantischen Treffern in 1319 ms verarbeitet; Logprüfung ohne Audio-, Transkript- oder Secret-Leak. Echte Chrome-Abnahme: Chat HTTP 200 über Luna, NDJSON-Voice-Stream, Mikrofontaste danach erneut aktiv, Stefan gewählt, `Anna` ausgeschlossen, 0 Konsolenfehler. |
| Mikrofonwahl | PASS | persistente Geräteauswahl, automatische `devicechange`-Aktualisierung und sicherer Fallback auf den Systemstandard im Browser geprüft |
| Proaktive Hinweise | PASS LIVE | Automatisch geladener Personal Pulse mit echten Mail-/Kalender-/Health-Signalen, maximal drei neue Hinweise pro Tag, Ruhezeit, persistenter kanalgetrennter Deduplizierung und wirksamem Feedback (`hilfreich`, `nicht hilfreich`, `falsch`, `später`, `nie wieder`). Release 107 ergänzt den explizit aktivierten PWA-Kanal. |
| PWA-Benachrichtigungen | PASS LIVE | Release 107: explizites Geräte-Opt-in, verschlüsselte benutzergebundene Push-Abos, sichere VAPID-Grenze, Ruhezeit, Tagesbudget, kanalgetrennte Deduplizierung, generischer Sperrbildschirmtext, Testsendung und Widerruf. Lokale und Live-Abnahme bei 390×844 sind grün; ein reales Endgerät muss die Browserberechtigung selbst erteilen. |
| Personal Event Ledger | PASS | Immutable, idempotent, user-isoliert, Retention/Export/Löschung; Mail-Bodies und Secret-Felder werden an der Speichergrenze abgewiesen. |
| Google Live Sync | PREPARED | OAuth-, Gmail-Metadaten- und Kalender-Sync inklusive Paging, Cursor, Retention, Kalenderauswahl und Teilerfolg ist implementiert und getestet. Auf Günni fehlt noch die serverseitige Google-OAuth-Konfiguration; das vorhandene App-Passwort bleibt bewusst nur IMAP. |
| Health Ledger | PASS LIVE | Release 102 verarbeitet Apple-Health-XML/ZIP bis 512 MiB als persistente Jobs: Streaming-Upload, AES-256-GCM-Ciphertext-Staging, begrenzter Child-Worker, User-/Consent-Isolation, Human Gate, Command Stream, Restart-Recovery und atomarer Cancel-/Commit-CAS. Browser und Audit sehen nur Status, Fortschritt und sichere Zähler; medizinische Diagnosen bleiben ausgeschlossen. Der lokale Chrome-Mobile-Smoke importierte 35.652.165 Bytes; der isolierte Günni-Live-Smoke importierte 35.652.207 Bytes und zwei Messwerte und endete nach Cleanup bei null Messwerten und null Freigaben. Der frühere Health-&-Recovery-Vergleich bleibt unverändert verfügbar; persönliche Günni-Daten und WHOOP-Credentials fehlen weiterhin. |
| WHOOP | PASS LOCAL · NOT CONFIGURED LIVE | Persistenter atomar einmaliger OAuth-State, AES-256-GCM-Refresh-Token, begrenzter v2-Sync, Teilerfolg/Rate-Limit, Rotation und Trennung sind implementiert und getestet. Ohne Developer-App bleibt der Status ehrlich `NOT_CONFIGURED`; Webhooks bleiben bis zu Queue und Reconciliation deaktiviert. |
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
| Persistenz | PASS LIVE | PostgreSQL-, App-, OpenClaw-Konfigurations- und Workspace-Volumes bleiben bei Containerrotation erhalten. Release 99 ergänzt atomare Mail-Metadaten-/Cursor-Tabellen mit 180 Tagen beziehungsweise 2.500 Datensätzen je Konto; Restart-Abnahme mit 500/500 Datensätzen bestanden. |

## Bewusst noch nicht produktiv freigegeben

| Bereich | Grund / Abschlusskriterium |
|---|---|
| Produktive Schreibadapter | Bleiben technisch blockiert, bis Zielsystem, Testlauf, Audit und Human Gate je Adapter freigegeben sind. |
| Generisches Command-Retry/-Cancel | Wird in Release 92 nicht öffentlich angeboten. Erst ein persistentes Effect-Ledger mit atomarem Claim, Idempotency-Key sowie vollständig verdrahtetem Abort-/Cancel-Pfad darf Retry oder Cancel für reale Seiteneffekte freigeben. |
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
| Voice Chat | PASS LIVE Release 98: authentifizierte Push-to-talk-Transkription mit `gpt-transcribe`, gestreamte persönliche Modellantwort und lokale Browser-Sprachausgabe sind ausgerollt und in Chrome live geprüft. Dies ist weiterhin kein Full-Duplex-Realtime- oder Wake-Word-Chat; ein echter Mikrofon-, Safari-/WebKit- oder nativer iOS-Gerätetest ist nicht behauptet. |
| Private Access | PASS für IMAP/Gmail, Home Connector und iPhone-Web-Pairing; Google Kalender ist als getrennter OAuth-Connector mit Kalenderauswahl vorbereitet, aber auf Günni noch nicht autorisiert. Spotify, Twitch und weitere Dienste bleiben einzeln freigabepflichtig. |
| Native iOS Companion | Web-Pairing und Kurzbefehle sind nutzbar. Direkter HealthKit-, EventKit- und Hintergrundstandort-Zugriff erfordert weiterhin eine signierte iOS-App, Apple-Entitlements und einen echten Gerätetest. Die Oberfläche kennzeichnet das ausdrücklich und meldet dafür kein Fake-`LIVE`. |
| Raspberry Connector | PASS: signiertes ARM64-/AMD64-Dockerpaket, Tailscale-Sidecar, 176 echte Home-Assistant-Entitäten und Installation unter `output/connector/`. Der Server ist LIVE/read-only; `./update.sh && ./enable-home-control.sh` aktiviert Lichtfarben, Medien und weitere erlaubte Komfortfunktionen. |
| Ein Gateway je Benutzer | Die Demo nutzt ein isoliertes Personal-Gateway. Multiuser-Produktion benötigt automatisierte, idempotente Gateway-/Volume-Provisionierung je Entra-`oid`. |
| Interner Connector | Architektur und Sicherheitsgrenzen sind festgelegt; Deployment erfordert den vorgesehenen internen Coolify-Host, Ziel-Allowlist und mTLS-Identität. |
| Backups/PITR | Isolierter Custom-Dump-Restore mit 7/7 Tabellen ist bestanden. Externes Backupziel, Aufbewahrung und kontinuierliches PostgreSQL-PITR müssen organisatorisch freigegeben werden. |
| Git-basierte Lieferung | Das Deployment verwendet ein auf dem Host gebautes, gehashtes Release-Archiv. Der private Git-Workflow benötigt befüllte Haupt-/Entwicklungszweige und CI-Zugang. |

## Reproduzierbare Prüfung

### Release 92 · Abnahme

| Prüfung | Status | Nachweis |
|---|---|---|
| Command-Stream Unit-/API-Tests einschließlich Benutzertrennung und payloadfreier öffentlicher Projektion | PASS | 177/177 Gesamttests; fokussierte Command-Stream-, Proxy- und Health-API-Tests grün |
| Echte Runs für Briefing, IMAP-Test/-Scan und Google-Read-only-Sync | PASS IMPLEMENTIERT | Briefing in Chrome ausgeführt; IMAP- und Google-Pfade sind serverseitig verdrahtet und regressionsgetestet. Live-Provider-Nachweis folgt nach Deployment. |
| Apple-Health-Import mit serverbestätigtem Exact-Payload-Gate | PASS | Browserimport mit `OBSERVE → TOOL → APPROVAL → RESULT`; falsche/fehlende Human-Attestierung wird mit HTTP 403 abgewiesen |
| Chrome Desktop/Mobil: Center öffnen, Run-Details aufrufen und Statuswechsel prüfen | PASS | `output/playwright/command-stream-release-92-desktop.png` und `command-stream-release-92-mobile.png`; kein Root-Horizontalscroll bei 390 px |
| Production-Build | PASS | Vite-Production-Build erfolgreich |
| Deployment, PWA-Cachewechsel und Remote-Smoke | PASS | Vier Personal-Container healthy auf Image `purelink/agentone:2026.11.07-92`; PWA, Günni Command Stream, Jarvis/Kommunikation, Connectoren und echter Gmail-IMAP-Scan live bestanden |

### Release 93 · iPhone-Pairing

| Prüfung | Status | Nachweis |
|---|---|---|
| Reverse-Proxy-Clienttrennung und `Retry-After` | PASS LOKAL | Zwei Mobilclients hinter derselben vertrauenswürdigen Proxy-IP besitzen getrennte, operationsbezogene Buckets |
| Persistentes Pairing-Limit, atomarer Einmalcode und Benutzertrennung | PASS LOKAL | Cross-User-, Replay-, Scope-, Revoke- und Log-Redaction-Smoke bestanden; Code und Token werden nie erneut ausgegeben |
| Einheitlicher Apple-Assistent und iPhone-PWA-Diagnose | PASS LOKAL | 4 Schritte, explizite Rechte, Code/Fragment-Link/Share, Status, Erneuern und Widerruf; 390 px ohne horizontale Überbreite |
| Stable Companion-Server-Secret | PASS LIVE | Ein geschützter 256-Bit-Pepper liegt im Coolify-Serviceverzeichnis und wird nur in die beiden App-Container injiziert; beide melden `READY`, Werte erscheinen weder in Logs noch im Browser |
| Gesamttests und Production-Build | PASS | 182/182 Node-Tests, Pairing-Security-Smoke und Vite-Production-Build grün |
| Deployment und Live-iPhone-Smoke | PASS | Vier Container healthy auf Image `purelink/agentone:2026.11.07-93`; PWA-Cache 93 aktiv; Günni Chrome 390 px: `Pair → Status → Ingest → Revoke`, HTTPS/WebCrypto/IndexedDB bereit, 0 Konsolenfehler, keine Secrets |

### Release 94 · Tagesplanung und Quellenvergleich

| Prüfung | Status | Nachweis |
|---|---|---|
| Kalenderplan, Google-/ICS-Projektion und Feed-Schutz | PASS | DST-/IANA-Tagesgrenzen, Konflikte, freie Fenster, Benutzertrennung, SSRF-Schutz und PII-/Secret-Redaktion in 195/195 Gesamttests enthalten |
| Health-/WHOOP-Vergleich | PASS READY | Normalisierte Quellen bleiben getrennt; Abdeckung und Konfidenz sind datenbasiert; HRV-SDNN/RMSSD und Körper-/Hauttemperatur werden nicht falsch zusammengeführt |
| Echter Chrome-Datenflow bei 390 px | PASS LIVE | Zwei temporäre ICS-Termine → zwei sichtbare Termine, ein Serverkonflikt, zwei freie Arbeitsfenster; Touchziele mindestens 44 px, keine Konsolenfehler, anschließende Entfernung bestätigt |
| Mail, Home, Kommunikation und iPhone-Regression | PASS LIVE | 50 IMAP-Nachrichten, acht aktuelle Mail-Aktionen, Home Connector v3 mit 345 Entitäten, Chat HTTP 200 über Luna sowie `Pair → Status → Ingest → Revoke` auf Günni bestanden |
| Deployment | PASS | Secret-freies Archiv SHA-256 `a1478420a5356340648c10decb3dbab470550c8cbbd027ca95fb89eb1f46cc86`; Image `sha256:67d7b590b3394231ad1dd82e52e345e529324524bb131296570b71a896bf68c3`; vier private Container healthy auf `purelink/agentone:2026.11.07-94` |

### Release 95 · Health & Recovery und belastbares iPhone-Pairing

| Prüfung | Status | Nachweis |
|---|---|---|
| Health-&-Recovery-Zentrale | PASS DEPLOYED | Apple Health und WHOOP werden als getrennte Quellen mit Messwertzahl, 14-Tage-Abdeckung, aktiven Freigaben beziehungsweise Sync-Status dargestellt. Kompatible Tageswerte und inkompatible Messmethoden bleiben getrennt; Konfidenz beschreibt nur Datenabdeckung. Der Datenflow ist lokal synthetisch geprüft; persönliche Live-Daten fehlen weiterhin. |
| Health-Browserflow bei 390 px | PASS LOKAL | Synthetischer Apple-XML-Import: drei Apple- plus drei WHOOP-Werte, zwei kompatible Vergleiche, eine explizite HRV-Methodentrennung, Touchziele mindestens 44 px; anschließender Cleanup endet in `EMPTY`. |
| Zweites und erneutes iPhone-Pairing | PASS LOKAL | Ein gültiger offener Code priorisiert `PAIRING`, auch wenn bereits ein Gerät verbunden ist. Nach Bestätigung bleiben beide Geräte aktiv; Codes sind weiterhin einmalig und benutzergebunden. |
| iOS-Installationsgrenze und Recovery | PASS LIVE WEB-FLOW | Auf Günni wurden Installationssperre, Standalone-Pairing, AES-GCM-Reload, Status, Ingest, Widerruf, Recovery, Service-Worker-Aktualisierung und Vault-Rollback über HTTPS bestanden. Die Prüfung nutzte echten Chrome mit iPhone-UA und simuliertem `navigator.standalone`; sie ist keine reale Safari-/WebKit-Abnahme. |
| Pairing-Security | PASS LOKAL | 26/26 fokussierte Companion-/API-/Proxy-Tests sowie Cross-User-, Replay-, Scope-, Self-Revoke- und Redaction-Smoke bestanden; der Gesamtlauf steht bei 198/198 Tests. |
| Native iOS/WebKit und HealthKit | OFFEN | Die Chrome-Abnahme simuliert iOS-Standalone, ist aber keine reale Safari-/WebKit-Geräteabnahme. Direkter HealthKit-, EventKit- und Hintergrundzugriff benötigt weiterhin die signierte native App, Apple-Entitlements und einen echten iPhone-Test. |
| Deployment | PASS LIVE | Commit `88439fa`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-95.tgz`, SHA-256 `7d3dbe324ccea0737d4b22dceb4736e74568e26f897d607ba523eb643e3c5922`; Image `purelink/agentone:2026.11.07-95`, Digest `sha256:91d03e09837cdaaf6153efdb9d9197f769ffa010ad849dd01827c1b3c552f8a8`; vier private Container healthy. |
| Live-Regression | PASS LIVE | PWA auf PureLink/Fressi/Günni; Connectoren 7/7 HTTP 200, OpenClaw-Plugins 68/68, Home 345 Entitäten/15 Domains/275 Controls, Mail mobil, Command Stream, Jarvis, Chat/Voice-Text über `gpt-6-luna` und Planung mit zwei ICS-Terminen/einem Konflikt. Keine Secrets oder Inhalte exponiert. |

### Release 96 · verschlüsseltes privates Kalender-Abo

| Prüfung | Status | Nachweis |
|---|---|---|
| Persistenter Feed-Zugang | PASS LOKAL | Privater `https://`- oder `webcal://`-Link wird benutzergebunden mit AES-256-GCM und zweckgebundenem AAD gespeichert; öffentliche Statusantworten enthalten nur Status, Hash, Zähler und Zeitpunkte. |
| Synchronisation und Fehlerfall | PASS LOKAL | Manueller Lauf und 15-Minuten-Scheduler verwenden Backoff. Providerfehler, fehlender/rotierter Schlüssel oder beschädigtes Ciphertext führen zu `DEGRADED`; der letzte gültige Kalender-Snapshot bleibt erhalten. |
| Netzwerkgrenze | PASS LOKAL | Lokale, private und nicht öffentliche IPv4-/IPv6-Ziele werden nach einmaliger DNS-Auflösung verworfen; die geprüfte öffentliche IP wird für TLS gepinnt, Redirects sind deaktiviert und Fehler werden redigiert. |
| Mobile Oberfläche | PASS LOKAL | Echter Chrome-Smoke bei 390 × 844 px: Webcal/HTTPS, sofort geleertes Secret-Feld, Status/Hash/Terminzahl/letzter und nächster Lauf, manueller Sync sowie iCloud-/Google-/Outlook-Hilfe; 0 relevante Konsolenfehler, keine Überbreite, mindestens 44 px Touchhöhe. |
| Geheimnisfreiheit | PASS LOKAL | Feed-Link erscheint weder in API-Status und Audit noch in DOM, Local-/Session-Storage oder Screenshot. |
| Gesamtabnahme | PASS LIVE | 207/207 Tests und Production-Build grün. Source-Commit `a45b299`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-96.tgz`, SHA-256 `4ad57121ad71c3f567ff0ca92fb2ec2c80cefcbec1285bfdce57ae4ad3499dfd`; Image `purelink/agentone:2026.11.07-96`, Digest `sha256:4373daf420933e06715a602d0059ac7d297adf1b5ff57b1a05ca6b614ccd0463`; vier private Container healthy. |
| Apple-Nativgrenze | OFFEN | Die Kalenderfunktion ist ein read-only ICS-Abo. Sie behauptet weder EventKit-/HealthKit-Zugriff noch eine Safari-/WebKit-Geräteabnahme; dafür bleiben signierte native App, Apple-Entitlements und echter iPhone-Test erforderlich. |
| Live-Regression | PASS LIVE | PWA auf PureLink/Fressi/Günni; kompletter iPhone-Webflow `INSTALL-GATE → PAIR → STATUS → INGEST → RELOAD → REVOKE → RECOVER → VAULT-ROLLBACK`; ICS-Oberfläche bei 390 × 844 px mit mindestens 44 px Touchhöhe, ohne Überbreite oder Konsolenfehler; Connectoren HTTP 200, OpenClaw-Plugins 68/68, Home 345 Entitäten/15 Domains/275 Controls, Mail mobil, Command Stream, Kommunikation, Planung mit zwei temporären Terminen/einem Konflikt samt Cleanup und Jarvis bestanden. Keine echten Benutzer-ICS-Daten verbunden. |

### Release 97 · fail-safe iPhone trennen und Scan-Einstieg

| Prüfung | Status | Nachweis |
|---|---|---|
| Self-Revoke-Reihenfolge | PASS LIVE | „Auf diesem iPhone trennen“ ruft zuerst den authentifizierten serverseitigen Self-Revoke auf. Erst nach bestätigtem Erfolg werden Geräteschlüssel und lokaler Tresor gelöscht; Gerätefreigabe und zugehörige Ereignisse sind anschließend entfernt. |
| Fehler-Recovery | PASS LIVE WEB-FLOW | Bei Netzfehler oder HTTP 503 bleibt der AES-GCM-geschützte Gerätetoken lokal erhalten und die Oberfläche bietet einen sicheren Retry statt eine nur lokal getrennte Scheinbereinigung. Ein bereits serverseitig widerrufener Schlüssel darf lokal bereinigt werden. |
| Secret-freier QR | PASS LIVE | Der authentifizierte, `no-store` ausgelieferte SVG-QR kodiert ausschließlich den normalisierten `PUBLIC_ORIGIN` plus `/iphone`; Query, Fragment, Pairing-Code und Token sind technisch ausgeschlossen. CSP und Cross-Origin-Resource-Policy begrenzen die Antwort. |
| iOS-Anleitung | PASS LIVE | Oberfläche, README und Download-ZIP nennen die zwingende Reihenfolge: Basis-Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“ → installierte App öffnen → sechsstelligen Code manuell eingeben. |
| Browserabnahme | PASS LIVE | 210/210 Tests, Production-Build sowie Günni-Chrome-Flow grün; 390-px-Ansicht mit mindestens 54 px Touchhöhe, 0 relevante Konsolenfehler und kein Code-/Token-Leak in URL, QR, DOM, Storage, Screenshot oder Logs. |
| Deployment | PASS LIVE | Source-Commit `754faf5`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-97.tgz`, SHA-256 `972cc4e432eed59ab03170b7a6945969d37e27aad362d97e8ed14670743d0762`; Image `purelink/agentone:2026.11.07-97`, Digest `sha256:1e1256033cd9d8d2dc7bd09a4f2bd7feed8e2df08e5ad642383cdb6ebd2d75ac`; vier private Container healthy. |
| Apple-Nativgrenze | OFFEN | Die lokale und Live-Web-Abnahme simuliert den Standalone-Modus in Chrome. Reales Safari/WebKit sowie direkter EventKit-/HealthKit-Zugriff benötigen weiterhin echten iPhone-Test, signierte native App und Apple-Entitlements. |
| Live-Regression | PASS LIVE | PWA auf PureLink/Fressi/Günni; iPhone-Flow einschließlich QR, Installationsgrenze, Self-Revoke-Retry und Cleanup; Connectoren HTTP 200, OpenClaw-Plugins 68/68, Home 345 Entitäten/15 Domains/275 Controls, Mail, Command Stream, Kommunikation, ICS ehrlich `NOT_CONNECTED`, Jarvis und Planung mit temporärem Cleanup bestanden. Runtime-Konfiguration und redigierter Audit sind healthy. |

### Release 98 · belastbares Push-to-talk und Antwortstream (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Audioaufnahme und Transkription | PASS LIVE | Browser und Server verlangen mindestens 1000 ms Aufnahme. Die deterministische synthetische WAV-Fixture (5297 ms, SHA-256 `943a7a2e410e0dfb8e22b01cb2f1c49e59a9cea76d930425cf40374146067681`) wurde live über `gpt-transcribe` verarbeitet: vier semantische Treffer, 1319 ms. Bericht und Access-Log enthalten weder Audio noch Transkript oder Schlüssel. |
| Auto-Send und Streaming | PASS LIVE | „Nach Aufnahme direkt senden“ ist sichtbar, standardmäßig aktiv und persistent. Der live geprüfte NDJSON-Stream wird progressiv angezeigt und in vollständigen Sätzen lokal gesprochen; die Mikrofontaste wird anschließend wieder freigegeben. |
| Fehler-, Abbruch- und Geheimnisgrenze | PASS LOKAL | Providerfehler werden auf stabile öffentliche Codes abgebildet. Clientabbruch beendet den Upstream; fehlendes Terminalereignis, leerer Stream und Providerfehler erzeugen keinen falschen `done`-Status. Audit enthält nur Modell, Modus, Sprache, Status und Latenz. |
| Mobile Browserabnahme | PASS LOKAL | Headless Chrome bei 430 × 932 px: eine Transkription führt exakt zu einem Auto-Send; Doppelklick erzeugt nur einen weiteren Stream; während der Antwort wird kein zweiter Mikrofonzugriff gestartet. Screenshot: `output/playwright/release-98-voice-mobile.png`. |
| Produktgrenze | KLAR | Release 98 ist dateibasierter Push-to-talk mit gestreamter Text-/Sprachantwort. Er behauptet weder Full-Duplex-Realtime-Audio noch Wake Word, echten Mikrofon-Hardwaretest oder native iOS-/Safari-Abnahme. |
| Deployment und Live-Abnahme | PASS LIVE | Source-Commit `f15d1ac`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-98.tgz`, SHA-256 `bac50692186f3fe835bb202b6fff0c62554dab9f451560b28e1f9a93f7d85ce0`; Image `purelink/agentone:2026.11.07-98`, Digest `sha256:35a93b83bdfba82439ebbebfd3e4804a9309e02f7c7d1b2827066cb6676ae4e4`; vier private Container healthy. PWA auf drei Domains, iPhone-Vollflow, 7/7 Connector-APIs, 68/68 Plugins, Home 345 Entitäten/15 Domains/275 Controls, Mail 1 Konto/50 Datensätze, Command Stream, Jarvis, Planung mit Cleanup und ICS ehrlich `NOT_CONNECTED` bestanden. |

### Release 99 · persistenter IMAP-Sync und Mail Review Center (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| UID-/UIDVALIDITY-Synchronisation | PASS LIVE | Begrenzter Erstimport, inkrementeller UID-Lauf, No-New-Mail-Pfad, UIDVALIDITY-Reset, sicher beobachtete UID-Lücken und Backlog-Grenze sind deterministisch getestet. Günnis direkt wiederholter Lauf endete mit `fetched=0`, `newCount=0` und unverändert 500 gespeicherten Datensätzen. |
| Datenminimierung | PASS LIVE | Fetch-Allowlist enthält Envelope, Flags, Größe, Thread-ID und Klassifikationsheader. Body, Source, Snippet und Anhänge werden nicht angefordert; der Live-DB-Audit findet 0 verbotene Inhaltsspalten und 0 cursorlose Datensätze. |
| Persistenz und Betrieb | PASS LIVE | Atomarer Full-/Incremental-Upsert, Deduplizierung, 180 Tage/2.500 Datensätze je Konto, 15-Minuten-Lauf und 15–360 Minuten Backoff. Nach vollständiger Rotation aller vier Container blieben 500 Datensätze, Cursor und `LIVE`-Status erhalten. |
| Mail Review Center | PASS LIVE | Konto-/Kategorie-/Suchfilter, Paging bis 200, Thread-Detail, Unread/Review/Confidence/Gründe, Antwortentwurf und sichtbarer Sync-/Cursorstatus; echter Chrome bei 430 × 932 px, 0 Konsolenfehler, Screenshot `output/playwright/guenni-mail-review-release-99-mobile.png`. |
| Gesamtabnahme | PASS LIVE | 229/229 Tests, Production-Build, lokaler API-Smoke, zwei echte Günni-Syncs, Restart-Persistenz und breite Live-Regression grün. PWA auf drei Domains, iPhone-Vollflow, Home 345/15/275, 68/68 Plugins, sieben Connector-APIs, Command Stream, Jarvis, Planung, ICS und Voice bestanden. |
| Produktgrenze | KLAR | IMAP bleibt vollständig read-only; SMTP wird nur verifiziert. Es gibt keinen automatischen Versand, keine Löschung oder Provider-Mutation. Google Kalender bleibt eine getrennte OAuth-/ICS-Freigabe. |
| Deployment | PASS LIVE | Source-Commit `c955ae0`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-99.tgz`, SHA-256 `c591f0551f4eef66c30c168fb549421e526a9605acab2b1728676b7921fd4315`; Image `purelink/agentone:2026.11.07-99`, Digest `sha256:5966bd5e7158961f994d8c2e377ee7e8f8fdd9480348bf902ba6f623cc594d15`; vier private Container healthy und redigierter 20-Minuten-Logaudit ohne Fehler. |

### Release 100 · kontrolliertes Learning Lab (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Skill-Lifecycle | PASS LIVE | `personal-briefing.v1` durchläuft serverdefinierten Draft, deterministische Evaluation, Exact-Hash-Human-Approval, getrennte Aktivierung, read-only Ausführung und kontrollierten Rollback. Die Tool-Allowlist ist fest auf `mail.read`, `calendar.read` und `health.summary` begrenzt. |
| Sicherheitsgrenzen | PASS LIVE | Public API und Audit enthalten keine Procedures, Prompts, Payloads, Evidence, Rohdaten oder Secrets. Benutzertrennung, Restart-Persistenz und fail-closed Prüfung manipulierter Lifecycle-/Evaluationsdaten sind abgenommen. |
| Ergebnisansicht | PASS LIVE | Günni führte den aktiven Skill mit echten minimierten Mail-Signalen aus. Desktop und 390-px-Mobilansicht zeigen das redigierte Ergebnis; 0 Konsolenfehler. |
| Deployment | PASS LIVE | 257/257 Tests; Source-Commit `6a19ff4`; Archiv SHA-256 `2d1288f280ac88875828714e036292cfb2767a9486545e58fb52156c025f2f10`; Image-ID `sha256:174f4e2409797336524f9f922989288c231d55449496cd32b8248350f3ee1516`; zwei vollständige Rotationen, vier private Container healthy. |

### Release 101 · direktes Safari-Pairing (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Ursachenbehebung | PASS LIVE | Der reale Nutzerpfad erzeugte zuvor nur Seitenaufrufe und keinen Confirm-Request, weil die UI Safari bis zur PWA-Installation hart sperrte. HTTPS, WebCrypto und IndexedDB genügen nun; Installation ist eine sichtbare Empfehlung statt Voraussetzung. |
| Sicherer Handoff | PASS LIVE | Fragmentcode wird übernommen und vor dem ersten API-Aufruf aus der URL entfernt. Der QR enthält nur `PUBLIC_ORIGIN+/iphone`; Code und Gerätetoken erscheinen weder in QR, Query, Audit, DOM noch Screenshots. |
| Safari- und PWA-Flow | PASS LIVE WEB-FLOW | `QR → Safari-Pair → PWA-Pair → Status → Ingest → Reload → Self-Revoke-Retry → Recover → Vault-Rollback`; AES-GCM-IndexedDB, 54-px-Touchziele, keine Überbreite, 0 Konsolenfehler. Ein echter Safari-/WebKit-Gerätetest bleibt offen. |
| Regression | PASS LIVE | 257/257 Tests, lokale Release-Verifikation, Production-Build, API-Smoke, Pairing-Security-Smoke, PWA auf PureLink/Fressi/Günni und redigierter Container-/Auditcheck grün; 0 bekannte Produktions-Schwachstellen. |
| Deployment | PASS LIVE | Source-Commit `aa1a481`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-101.tgz`, SHA-256 `af8a5c4a4b25b981128ef70cc7a3d23e7eaef094eda3cf47ec5399107d626f75`; Image `purelink/agentone:2026.11.07-101`, ID `sha256:6e20cd329733ae65a735c8a9e0a5aa20b6c1195f95560a784c3d5bbaefec16f1`; vier private Container healthy. |

### Release 102 · persistente Apple-Health-Importjobs (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Großer Importpfad | PASS LIVE | XML und ZIP bis 512 MiB werden mit Backpressure gestreamt. Auf Datenträger liegt ausschließlich AES-256-GCM-Ciphertext mit benutzer-/jobgebundenem AAD; ein separater Child-Worker besitzt Laufzeit-, Speicher-, Record- und Größenlimits. |
| Persistenz und Recovery | PASS LIVE | Jobs überleben Reload und Prozessneustart; `RUNNING` wird nur bei strukturell intaktem Ciphertext erneut `QUEUED`. Terminale Quellen werden sicher entfernt, auch nach vorübergehend fehlgeschlagenem Unlink. |
| Freigabe und Isolation | PASS LIVE | User und aktive Health-Freigabe werden serverseitig gebunden. Human Gate und Command Stream verwenden nur freigegebene Metadaten; fremde Benutzer erhalten 404. Public API enthält weder Rohwerte noch User-/Consent-ID, Hash, Pfad, AAD, IV, Tag oder Secret. Der Live-Smoke nutzte einen eigenen Testuser. |
| Abbruch und Atomizität | PASS LIVE | Abbruch beendet den Child-Worker. Job-State-CAS und Health-Persistenz liegen in derselben SQLite-Transaktion: Entweder `CANCELLED` ohne Messwerte oder `COMPLETED` mit vollständig committeten Daten. |
| Mobile Oberfläche | PASS LIVE | Chrome 390×844: 35.652.165-Byte-XML, sichtbarer Upload 100 %, derselbe Job nach Reload, `COMPLETED`, exakt zwei Messwerte, mindestens 44 px Touchziel und Cleanup auf 0. Fortschritt, Polling und Jobabbruch sind über die UI verfügbar. |
| Sicherheits- und Regressionssuite | PASS LIVE | 273/273 Tests, Production-Build, `verify:local`, npm-Produktionsaudit mit 0 bekannten Schwachstellen sowie lokale und live ausgeführte iPhone-Browser-/Pairing-Security-Regression grün. Health-Ausgaben bleiben deskriptiv und nicht medizinisch. |
| Deployment | PASS LIVE | Source-Commit `ae1c47b`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-102.tgz`, SHA-256 `a86e200f2250264150e178a81a9eff4ddf84aa46f0799e3f47465d6fc0352395`; Image `purelink/agentone:2026.11.07-102`, ID `sha256:28346c687f8ddcff7d4cc08b37aea5e54d71761cf2f5f979539b2a7718dc8826`; vier private Container healthy. Der isolierte Günni-Smoke importierte 35.652.207 Bytes und zwei Messwerte; Cleanup: 0 Messwerte, 0 Freigaben, keine Secrets exponiert. PWA- und iPhone-Pairing-Live-Smokes bestanden. |

### Release 103 · WHOOP und iPhone-Pairing-Härtung (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| WHOOP OAuth und Token-Lebenszyklus | PASS DEPLOYED | Persistenter, benutzer-/redirectgebundener und atomar einmaliger State; AES-256-GCM-Refresh-Token mit Benutzer-AAD; kein persistierter Access-Token; Callback wird auf allen Pfaden per `303` von Code/State bereinigt. Ohne registrierte WHOOP-App bleibt der Live-Status ehrlich `NOT_CONFIGURED`. |
| WHOOP Sync und Disconnect | PASS DEPLOYED | Begrenzte Pagination, Mengen und Laufzeit; Teilerfolg und Rate-Limit ohne falschen Cursorfortschritt; lokale Trennung bleibt auch bei verlorener Providerkonfiguration möglich und behauptet Providerwiderruf nur nach Bestätigung. Der echte Providerroundtrip ist mangels Credentials offen. |
| iPhone Vault-Preflight | PASS LIVE WEB-FLOW | Vor Confirm: nicht exportierbarer AES-GCM-Schlüssel, verschlüsselte IndexedDB-Schreib-/Leseprobe und Entschlüsselung. Fragmentbereinigung erfolgt vor Netzwerk; Gerätetoken besitzt keinen Kopierpfad. |
| Safari/PWA-Handoff | PASS LIVE WEB-FLOW | Kontextgerechter iOS-Direktlink, Desktop zeigt nur secret-freien Basis-QR plus manuellen Code. Der read-only WebKit-Smoke auf Günni ist grün und kann keinen Benutzer-Code überschreiben. Ein echtes iPhone bleibt als Hardwareabnahme offen. |
| Regression | PASS LIVE | 296/296 Node-Tests, Production-Build, Local-Smoke, npm-Audit mit 0 bekannten Produktionsschwachstellen sowie automatisierte WebKit-/Chrome- und Pairing-Security-Prüfung. PWA-Abnahme auf PureLink, Fressi und Günni; Günni-iPhone read-only mit HTTPS, Vault-Preflight, 54-px-Touchzielen, 0 Konsolenfehlern und ohne Secrets bestanden. |
| Deployment | PASS LIVE | Feature-Commit `46c6e0e`; finaler Rollout-Stand `3379cda`; secret-freies Archiv SHA-256 `a12b0b02d9e261c95d858ea98dca8d05b8ce5cd949f6695895132ac81321da8e`; Image `purelink/agentone:2026.11.07-103`, ID `sha256:e7661fa2e8c0cd0bd7e346f2c6b5b97fe6e26fb2a9fdd3eecb054fe0a7bf845e`; vier private Container healthy. Der gestufte Rollout Günni → Fressi besitzt einen verifizierten automatischen Rollback auf das exakte Preflight-Image. |

### Release 104 · Mail Insight, Health Trends und Memory Review (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Mail Insight | PASS DEPLOYED / LOCAL FUNCTIONAL | Benutzer-, Konto-, UID- und UIDVALIDITY-gebundener Einzelfetch; begrenzter Textteil ohne Anhänge oder Remote-Bilder; lokale deterministische Analyse; weder Body noch Analyseinput werden persistiert oder auditiert. Live ist das Steuerelement vorhanden, der Metadaten-Endpunkt antwortet 200; ein reales Benutzer-Mailbody wurde im read-only Live-Smoke bewusst nicht geöffnet. |
| Health Trends | PASS LIVE | 7 Tage gegen vorherige 28 Tage; Quellen und Metriken bleiben getrennt, HRV wird nicht vermischt. Endpunkt und mobile Karte sind live; Günni zeigt mangels ausreichender realer Basis ehrlich `0 TRENDS`. |
| Hermes Memory Review | PASS LIVE | ADD-/PATCH-/REMOVE-Kandidaten mit Provenienz und exaktem Content-Hash; Freigabe und Ablehnung bleiben menschliche Aktionen. Live-Endpunkt und Oberfläche sind erreichbar, der vollständige Stage-/Approve-/Persistenzpfad ist im isolierten Browsertest grün. |
| Companion-Klarheit | PASS LIVE | Produktname **Günni Companion · Web-App**; direktes Safari-Pairing und optionale Home-Bildschirm-Installation. Das ZIP ist als optionale Anleitung gekennzeichnet; eine native iOS-App wird nicht als Download behauptet. |
| Deployment und Live-Abnahme | PASS LIVE | Feature-Commit `91baf6b`; secret-freies Archiv SHA-256 `5346d85c50673e0081dc0428563b84f19f5187d3b8eeabb7aa815c6249c75a4a`; Image `purelink/agentone:2026.11.07-104`, ID `sha256:7a1b0085144829c7e0ccc825375baed1fbb812f83ac81f187008f11b8002b689`; vier Container healthy. Domain-, PWA-, WebKit-, Mail-/Companion- und Release-104-Chrome-Smokes sind live grün. |

### Release 105 · Scheduled Briefing Inbox (**PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Scheduler und Persistenz | PASS DEPLOYED | Atomarer Exactly-once-Claim pro Benutzer/Routine/Berliner Fälligkeit, Same-day-Catch-up, Stale-Run-Recovery, 30-Tage-Inbox und usergebundene `NEW`/`READ`/`SNOOZED`/`DISMISSED`-Zustände. |
| Echte Briefing-Ausführung | PASS LIVE | Manuell und geplant teilen Personal Intelligence, read-only Command Stream, Audit und sichere Ergebnisprojektion. Der Live-Smoke erzeugte auf Günni einen echten `COMPLETED`-Lauf, wechselte die Inbox `NEW → READ` und entfernte Routine und Verlauf anschließend vollständig. |
| Ergebnis- und Datenqualität | PASS | Keine Mailtexte, Roh-Health-Werte, PII oder Secrets in Run, API, Audit oder DOM. Ungelesene Personenpost bedeutet Review statt Antwortpflicht; HRV SDNN/RMSSD bleiben getrennt; Apple-/Companion-Termine fließen in den Tagesplan. |
| Mobile Oberfläche | PASS LIVE | 390×844, kein horizontaler Overflow, mindestens 44-px-Touchziele, Reload-Persistenz und sichere `textContent`-Darstellung. Screenshots: `output/playwright/release105-briefing-inbox-mobile.png` und `output/playwright/guenni-release105-briefing-inbox-live-mobile.png`. |
| Deployment und Live-Abnahme | PASS LIVE | Feature-Commit `4703575`; secret-freies Archiv SHA-256 `e2201d9133324f4643ca010cdb55e67ab112bfb9e6e62b7aba46ce6ede3d3769`; Image `purelink/agentone:2026.11.07-105`, ID `sha256:ce582ce92c254bb3ed290d442ff127a6b23df5136ddfe0a3787e32f3f0d9e087`; vier Container healthy. PWA auf PureLink/Fressi/Günni, Mail-Mobilansicht, Release-105-Chrome und WebKit/iPhone mit 0 Konsolenfehlern sind live grün. |

### Release 106 · Freshness-aware Briefing Sync (**MASTER · PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Quellen-Orchestrierung | PASS | IMAP, Google und ICS werden usergebunden, parallelitätsbegrenzt und nur bei Fälligkeit/Alter aktualisiert; Timeout, Busy, Teilfehler und letzter gültiger Snapshot sind getestet. |
| Command Stream und Persistenz | PASS | Jeder Lauf weist `OBSERVE → source.refresh → RESULT → briefing.build → RESULT` nach. Die sichere Projektion persistiert ausschließlich Quelle, Zustand, Zeitpunkte, Ergebniscode und Kontenzahl. |
| Sichtbares Frontend | PASS LIVE | Drei klickbare Datenstand-Karten mit Alter, Fallback und Zielnavigation; 390×844, kein horizontaler Overflow, mindestens 44-px-Touchziele, Reload-Persistenz, 0 Konsolenfehler. Screenshots: `output/playwright/release106-source-freshness-mobile.png` und `output/playwright/guenni-release106-source-freshness-live-mobile.png`. |
| Regression | PASS LIVE | 352/352 Node-Tests, Produktions-Build, PWA auf PureLink/Fressi/Günni, beide privaten TLS-/Login-Grenzen, Günni-Mail mobil und WebKit/iPhone sind grün. Der Live-Lauf meldete Mail `FRESH`, ICS/Google ehrlich `NOT_CONNECTED` und entfernte alle Smoke-Daten. |
| Deployment | PASS LIVE | Feature-Commit `8f2dc7e`; secret-freies Archiv SHA-256 `5cee97d175f3ded72256456a828252c2e05f76c332bd3776927a48cda468dc58`; Image `purelink/agentone:2026.11.07-106`, ID `sha256:af6707bb5d1df9f57600f63c488a860bd005bf9762e90cd0f470a074b5b3a93f`; vier Container healthy. |

### Release 107 · Kontrollierte PWA-Benachrichtigungen (**MASTER · PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Push-Grenze und Persistenz | PASS LIVE | Web-Push mit VAPID; Subscriptions sind benutzergebunden und AES-256-GCM-verschlüsselt. Browser, öffentliche API und Audit erhalten weder Endpoint noch `p256dh`/`auth`; 404/410 entfernen unbrauchbare Abos. Live-Audit: App-Container konfiguriert, Access-Container ohne Push-Secrets. |
| Pulse-Steuerung | PASS | PWA ist ein explizit gewählter Kanal. Ruhezeit, Tagesbudget, Feedback und Deduplizierung bleiben wirksam; In-App- und PWA-Zustellung werden getrennt genau einmal protokolliert. Nur geplante Läufe versenden proaktiv. |
| Sichtbares Frontend | PASS LIVE | Mobile Einstellungskarte mit Browserstatus, Gerätezahl, Aktivieren, Testnachricht und Widerruf. 390×844, 48-px-Touchziele, kein horizontaler Overflow, 0 Konsolenfehler. Screenshots: `output/playwright/release107-pwa-push-mobile.png` und `output/playwright/guenni-release107-pwa-push-live-mobile.png`. |
| Datenschutz | PASS LIVE | Push-Inhalt ist schemafest und generisch, `sensitive:false`, URL nur same-origin relativ. Mail-, Kalender-, Health-, Personen- und Secret-Daten werden erst nach authentifiziertem Öffnen der PWA geladen. |
| Regression | PASS LIVE | 360/360 Node-Tests, Produktions-Build, npm-Produktionsaudit mit 0 Schwachstellen, zwei lokale Chrome-Läufe, Günni-Live-Chrome, PWA auf PureLink/Fressi/Günni, private TLS-/Login-Grenzen, Mail-Mobile und WebKit/iPhone grün. |
| Deployment und Live-Abnahme | PASS LIVE | Feature-Commit `9c584b3`, Deployment-Härtung `863bacb`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-107.tgz`, 9.331.882 Bytes, SHA-256 `37a2250bc86fd9e158d6edd806e99bf74ed44eb1ed9803904498341946ca16cb`; Image `purelink/agentone:2026.11.07-107`, ID `sha256:3bd2b00ce9e348d8c2eb5403a8b0976b4e202c79b6e642fa3b4bd26fa34748da`, 494.283.624 Bytes; vier Container healthy. |

### Release 108 · Persistentes Effect Ledger (**MASTER · PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Atomarer Ausführungsschutz | PASS | SQLite-Ledger mit `BEGIN IMMEDIATE`, stabiler benutzergebundener Idempotenz, Claim-Token nur als Hash, Lease-Recovery und genau einem erfolgreichen Abschluss. Ergebnisse werden nur gehasht, nicht als Payload persistiert. |
| Retry und Cancel | PASS | Retry ist ausschließlich für fehlgeschlagene, retryfähige, idempotente read-only Briefing-Tools erlaubt und behält Effect-ID sowie Idempotenzschlüssel. Cancel benötigt eine bestätigte Benutzersitzung und erreicht die laufende Operation über `AbortSignal`. Schreibtools bleiben ausgeschlossen. |
| API- und Secret-Grenze | PASS | Listen und Details projizieren nur Zustand, Versuch und Zeitpunkte; Claim-Token, Idempotenz-, Input- und Result-Hash sowie Ergebnisdaten bleiben intern. User-Isolation, Neustartpersistenz, Same-Origin und serverseitig gesetzte Human-Header sind getestet. |
| Sichtbares Frontend | PASS LIVE | Neue mobile Run-Control-Karte im Command Center mit Effect-Zustand, Versuch, atomarem Claim, stabiler Idempotenz und zustandsabhängigen Retry-/Cancel-Aktionen. Chrome 390×844: kein Overflow, mindestens 44-px-Touchziele, 0 Konsolenfehler. Screenshots: `output/playwright/release108-effect-ledger-mobile.png` und `output/playwright/guenni-release108-effect-ledger-live-mobile.png`. |
| Regression | PASS LIVE | 368/368 Node-Tests, Produktions-Build, npm-Produktionsaudit mit 0 Schwachstellen, lokaler und Günni-Live-Chrome-Lauf, PWA auf PureLink/Fressi/Günni, private TLS-/Login-Grenzen, Mail-Mobile und WebKit/iPhone grün. |
| Deployment und Live-Abnahme | PASS LIVE | Feature-Commit `7be9db6`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-108.tgz`, 9.343.306 Bytes, SHA-256 `f9dc0bf354a476bc919ba91b4bf3ba426170c79bc902f301fecfd03241be50ed`; Image `purelink/agentone:2026.11.07-108`, ID `sha256:82c61c409869b04ce30b12945ebfb6ab0b321c23a956df042857ac7fd9632bb5`, 494.406.763 Bytes; vier Container healthy. |

### Release 109 · Erklärbarer Pattern Feed (**MASTER · PASS LIVE**)

| Prüfung | Status | Nachweis |
|---|---|---|
| Persistenz und Feedback | PASS | Benutzergebundene SQLite-Historie mit 400-Tage-Retention, stabiler Notification-Key-Deduplizierung und Neustartpersistenz. `helpful`, `not_helpful`, `wrong`, `later` und `never` verändern die nächste Auswertung; versteckte und zurückgestellte Muster bleiben im Verlauf transparent sichtbar. |
| Erklärbarkeit und Datenschutz | PASS | Öffentliche Projektion enthält nur Regel, Zeitraum, aggregierte Quellenanzahl, Beleganzahl und Konfidenz. Provider-/Event-IDs, Rohzeitstempel, Mailtexte, Health-Rohwerte und Secrets bleiben intern. API und Proxy sind usergebunden, query-allowlisted und `no-store`. |
| Quellenübergreifende Analyse | PASS LIVE | Neue Regel verbindet dringende Personenpost mit mindestens drei geplanten Stunden in den nächsten 24 Stunden. Das Ergebnis bleibt read-only und öffnet nur Post/Tagesplan. Günni liefert live das persistierte Muster `Posteingang ausgewertet` aus realen Gmail-Metadaten. |
| Sichtbares Frontend | PASS LIVE | Mobile Karte **Was Günni für dich erkannt hat** mit Status, Zusammenfassung, Warum-Zeile, Quellenchips, erstem/letztem Auftreten und Feedback. 390×844, 48-px-Touchziel, kein horizontaler Overflow, 0 Konsolenfehler. Screenshots: `output/playwright/release109-pattern-feed-mobile.png` und `output/playwright/guenni-release109-pattern-feed-live-mobile.png`. |
| Regression | PASS LIVE | 375/375 Node-Tests, Produktions-Build, npm-Produktionsaudit mit 0 Schwachstellen, lokaler und Günni-Live-Chrome-Lauf, PWA auf PureLink/Fressi/Günni, Mail-Mobile und WebKit/iPhone grün. |
| Deployment und Live-Abnahme | PASS LIVE | Feature-Commit `7daa993`; secret-freies Archiv `output/demo/agentone-release-2026.11.07-109.tgz`, 9.352.783 Bytes, SHA-256 `479ea6fef01defa2a5048383af7f0fdf5d78db046539b2a931d6003dc48e515d`; Image `purelink/agentone:2026.11.07-109`, ID `sha256:5699b37efd5bf4ffc76daf0b541119b19af66dbd3d1007a5b430521fd4676869`, 494.486.654 Bytes; vier Container healthy. Push-Secrets liegen ausschließlich in den beiden App-Containern. |

```powershell
npm run verify:local
npm run verify:health-recovery
npm run verify:health-import
npm run verify:iphone-browser
npm run verify:iphone-security
npm run screenshots
npm run verify:remote
```

Die mobilen Assistant-Nachweise liegen unter `output/demo/mobile/agentone-login-mobile.png` und `output/demo/mobile/agentone-assistant-mobile.png`. Die öffentlichen Personal-Domains `fressi.mwart.solutions` und `guenni.mwart.solutions` sowie `agentone.purelink.de` wurden mit gültigem TLS und echtem Login geprüft. `PASS` bezeichnet den implementierten und live verifizierten Release. Es ist keine pauschale Freigabe für produktive Mutationen oder noch nicht eingerichtete externe Systeme.
