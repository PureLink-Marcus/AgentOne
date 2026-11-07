# AgentOne Release Readiness

Stand: 7. November 2026
Release: `2026.11.07-95`
Deployment: Release 95 ist auf Fressi und Günni live. Alle vier App-/Access-Container sind healthy; PureLink, Fressi und Günni liefern den versionsgebundenen PWA-Stand 95. Der Release ergänzt die sichtbare Health-&-Recovery-Zentrale sowie einen belastbaren iPhone-Pairing-Lebenszyklus.

## Abgenommen

| Bereich | Status | Nachweis |
|---|---|---|
| Lokale Anwendung | PASS | Release 95: 198/198 Node-Tests, Vite-Production-Build, Plattform-, Pairing-, Command-Stream-, Planungs- und Health-Smokes sowie dedizierte Chrome-Abnahmen bestanden. |
| Personal-Startwelten | PASS | Companion, Jarvis HUD und Home & Life besitzen getrennte DOM-Strukturen, Prioritäten, Navigation und mobile Layouts; drei Chrome-Screenshots unter `output/playwright/` |
| Persönliche Live-Inbox | PASS | Postfächer, aktuell 345 Home-Entitäten, iPhone-Ereignisse, offene Freigaben und Connector-Audit werden aus echten APIs zusammengeführt; Filter, Detailnavigation, Desktop und Mobile in Chrome geprüft |
| Apple-Schnellstart | PASS LIVE für Web-Companion | Release 95: Der komplette HTTPS-Flow `INSTALL-GATE → PAIR → STATUS → INGEST → RELOAD → REVOKE → RECOVER → VAULT-ROLLBACK` ist auf Günni live bestanden; AES-GCM-IndexedDB, sicherer Kontext, Cleanup und 0 Konsolenfehler sind bestätigt. Offene Codes bleiben auch bei bereits verbundenen Geräten als `PAIRING` sichtbar. Die Abnahme lief in echtem Chrome mit iPhone-UA und simuliertem Standalone, nicht auf Safari/WebKit. Native HealthKit-Rechte bleiben bis zur signierten iOS-App `PREPARED`. |
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
| Command-Stream Center | PASS LIVE | Release 92 persistiert echte Runs für Personal Briefing, IMAP-Test/-Scan, Google-Read-only-Sync und Apple-Health-Import. Günnis echter IMAP-Scan erzeugte live `OBSERVE → TOOL → RESULT`; die öffentliche Timeline enthält ausschließlich freigegebene Run-/Step-Metadaten. Desktop und 390-px-Mobilansicht wurden in Google Chrome geprüft. |
| Heute & Planung | PASS LIVE | Release 94: serverseitiger Berliner Tagesplan aus minimiertem Google-/ICS-Ledger, Upcoming Events, echte Überschneidungen und freie Arbeitsfenster. Günni wurde in Chrome bei 390 px mit zwei temporären Live-Terminen, einem Konflikt, zwei freien Fenstern und acht echten Mail-Aktionen geprüft; die ICS-Testdaten wurden danach wieder entfernt. |
| Bedienbarer AI Core | PASS | Luna-Standard, Terra für Dokumente/Bilder und Sol für komplexe Aufgaben synchronisieren sich persistent mit dem HUD; Ollama bleibt bis zum Connector-Healthcheck ehrlich gesperrt. |
| Lokaler Modellpfad | READY | Connector v4 und App-Pfad sind getestet, allowlist-begrenzt und signiert. Live-Status, `LOCAL`-Datenschutz und Latenz werden sichtbar; ein reales Ollama-Modell auf dem Pi fehlt noch. |
| Chat-/Voice-Trace | PASS | Release 83: echter Browserchat und Voice-Texteingabe antworten über Luna mit HTTP 200; PWA-Erststart bleibt stabil, keine Konsolenfehler. Jarvis Core wählt Stefan, Gerätestimme `Anna` ist ausgeschlossen. |
| Mikrofonwahl | PASS | persistente Geräteauswahl, automatische `devicechange`-Aktualisierung und sicherer Fallback auf den Systemstandard im Browser geprüft |
| Proaktive Hinweise | PASS | Release 85: automatisch geladener Personal Pulse mit echten Mail-/Kalender-/Health-Signalen, maximal drei neue Hinweise pro Tag, Ruhezeit, persistente Deduplizierung und wirksames Feedback (`hilfreich`, `nicht hilfreich`, `falsch`, `später`, `nie wieder`). Live in Chrome ohne Secret-Leak geprüft. |
| Personal Event Ledger | PASS | Immutable, idempotent, user-isoliert, Retention/Export/Löschung; Mail-Bodies und Secret-Felder werden an der Speichergrenze abgewiesen. |
| Google Live Sync | PREPARED | OAuth-, Gmail-Metadaten- und Kalender-Sync inklusive Paging, Cursor, Retention, Kalenderauswahl und Teilerfolg ist implementiert und getestet. Auf Günni fehlt noch die serverseitige Google-OAuth-Konfiguration; das vorhandene App-Passwort bleibt bewusst nur IMAP. |
| Health Ledger | DEPLOYED / DATA READY | Verschlüsselte, benutzerisolierte Apple-Health-XML/ZIP-Imports mit Consent, Deduplizierung, Digest, Export und Löschung sind bereit. Release 95 macht den deterministischen Apple-Health-/WHOOP-Vergleich als **Health & Recovery** sichtbar: getrennte Quellkarten, 14-Tage-Abdeckung, ausschließlich datenbasierte Konfidenz, kompatible Vergleiche, Methodentrennung und Datenqualität. Der 390-px-Chrome-Smoke importierte drei synthetische Apple-Werte, verglich sie mit drei WHOOP-Werten und entfernte alle Testdaten wieder. Die Oberfläche ist ausgerollt; auf Günni fehlen weiterhin persönliche Health-Daten und WHOOP-Credentials. |
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
| Voice Chat | PASS: authentifizierte Audio-Transkription mit `gpt-transcribe`, persönlicher Modellantwort und Browser-Sprachausgabe online geprüft. |
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

```powershell
npm run verify:local
npm run verify:health-recovery
npm run verify:iphone-browser
npm run verify:iphone-security
npm run screenshots
npm run verify:remote
```

Die mobilen Assistant-Nachweise liegen unter `output/demo/mobile/agentone-login-mobile.png` und `output/demo/mobile/agentone-assistant-mobile.png`. Die öffentlichen Personal-Domains `fressi.mwart.solutions` und `guenni.mwart.solutions` sowie `agentone.purelink.de` wurden mit gültigem TLS und echtem Login geprüft. `PASS` bezeichnet den implementierten und live verifizierten Release. Es ist keine pauschale Freigabe für produktive Mutationen oder noch nicht eingerichtete externe Systeme.
