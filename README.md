# AgentOne – eigenständige Agentenplattform

Stand: 07.11.2026
Status: Release `2026.11.07-110` (**MASTER · LIVE auf Fressi und Günni**) mit bedienbarem, erklärbarem Pattern Feed und dauerhafter Feedback-Schleife

## 1. Zweck

AgentOne ist eine eigenständige, intern betriebene Plattform für KI-gestützte und deterministische Arbeitsabläufe. Sie verbindet Projekte mit APIs, MCP-Servern, Datenbanken, Dateisystemen und externen Plattformen. Menschen steuern Aufträge, Freigaben, Budgets und Rechte; Agenten und Tools führen klar begrenzte Schritte aus.

AgentOne läuft auf `container2.purelink.de`. Marcus' geschäftlicher AgentOne ist unter [https://agentone.purelink.de](https://agentone.purelink.de) per HTTPS und normalem AgentOne-Konto-Login erreichbar. Die sichtbare Anwendung ist ein eigenes AgentOne Command Center mit AI Core, Aufgaben, Freigaben, Zeitplan, Systemstatus, Tools, Schnellaktionen und einem durchgängig dunkel gestalteten Live-Chat. OpenClaw bleibt ausschließlich die intern eingebettete Runtime für Chat, Tools, Memory und Sessions. [Fressi](https://fressi.mwart.solutions) und [Günni](https://guenni.mwart.solutions) laufen im getrennten Coolify-Projekt `agentone-private` als vollständig isolierte Instanzen mit eigenen Apps, Datenbanken, Gateways, Sessions, Quellen und Memory-Daten. Release 110 läuft dort auf vier gesunden Containern; der gestufte Rollout Günni → Fressi besitzt einen automatischen Rückfall auf das exakte Preflight-Image. Release 101 behob die reale iPhone-Blockade: HTTPS, WebCrypto und IndexedDB genügen für direktes Safari-Pairing; die Home-Bildschirm-PWA ist eine Empfehlung statt einer Voraussetzung. Release 102 ersetzt den 32-MiB-Direktpfad für große Apple-Health-Exporte durch persistente, verschlüsselt gestagte Importjobs bis 512 MiB. Der genaue Abnahmezustand steht in [`docs/RELEASE-READINESS.md`](docs/RELEASE-READINESS.md).

Release 110 schließt die Rückkopplung des persönlichen Assistenten im Frontend:
erkannte Muster lassen sich nach aktiv oder ausgeblendet filtern, ihre Quelle
gezielt öffnen und mit `hilfreich`, `weniger`, `falsch`, `später` oder `nie`
bewerten. Feedback wird benutzerisoliert serverseitig gespeichert; die UI lädt
anschließend den autoritativen Zustand neu. Der produktive Günni-Smoke zeigte
ein echtes Gmail-Muster bei 390 × 844 Pixeln, 48-Pixel-Touchzielen, ohne
horizontales Überlaufen, Konsolenfehler oder Secret-Leak.

Release 103 härtet den iPhone-Pfad dort, wo ein sichtbarer Browsercheck allein
nicht ausreicht: Vor dem serverseitigen Confirm führt die gewählte Safari-
beziehungsweise PWA-Ansicht eine echte AES-GCM-/IndexedDB-Probe mit einem
nicht exportierbaren Schlüssel aus. Codefragmente werden vor jeder
Netzwerkanfrage entfernt; ein direkter Handoff ist nur auf iOS sichtbar. Die
Live-Regression liest standardmäßig nur Status und Laufzeitdaten und erzeugt
keinen Pairing-Code mehr. Dadurch kann ein Test einen gerade vom Benutzer
geöffneten Einmalcode nicht mehr still ersetzen. Ein realer iPhone-
Safari-/PWA-Hardwaretest bleibt trotz automatisierter WebKit-Abnahme offen.

Parallel ergänzt Release 103 WHOOP als echte read-only Gesundheitsquelle mit
persistentem, atomar einmaligem OAuth-State, verschlüsseltem Refresh-Token,
begrenztem inkrementellem Sync, sauberer Trennung und ehrlichen Zuständen. Ohne
registrierte WHOOP-App bleibt die Oberfläche `NOT_CONFIGURED`; Webhooks bleiben
bis zu dauerhafter Queue und Reconciliation deaktiviert. Details stehen in
[`docs/WHOOP-INTEGRATION.md`](docs/WHOOP-INTEGRATION.md). Der letzte vollständige
Lauf umfasst 296/296 grüne Node-Tests, Build, Local-Smoke sowie Chrome-, WebKit-
und Pairing-Security-Abnahme. Der private Rollout und der read-only Günni-
WebKit-Smoke sind live bestanden; mangels registrierter WHOOP-App bleibt nur die
externe Provider-Abnahme ehrlich offen.

Release 104 ergänzt drei kontrollierte Auswertungspfade: einzelne IMAP-
Nachrichten können auf ausdrücklichen Klick einmalig, lokal und ohne
Body-Persistenz analysiert werden; Health-Trends vergleichen sieben Tage mit
der vorherigen 28-Tage-Basis und halten Quellen getrennt; Memory-Änderungen
laufen über exakte Hash-Kandidaten und menschliche Freigabe. Gleichzeitig wird
die mobile Oberfläche eindeutig als **Günni Companion · Web-App** bezeichnet.
Das optionale ZIP ist nur eine Anleitung; eine native iOS-App wird nicht als
vorhandener Download dargestellt. 321/321 Node-Tests, Produktions-Build,
mobile Chrome-/WebKit-/Security-Abnahme und der gestufte Rollout Günni →
Fressi sind grün. Vier private Container laufen healthy mit Release 104; die
öffentlichen Read-Endpunkte für Mail-Metadaten, Health-Trends und Memory Review
antworten live ohne Secret-Leak.

Release 105 macht persönliche Routinen zu echter serverseitiger Arbeit. Ein
Scheduler beansprucht fällige Läufe genau einmal, holt verpasste Läufe am
gleichen Berliner Kalendertag nach und übernimmt hängende Claims nach einem
Neustart sicher. Manuelle und geplante Läufe benutzen denselben read-only
Personal-Intelligence- und Command-Stream-Pfad. Die mobile Inbox **Seit deinem
letzten Besuch** speichert minimierte Ergebnisse mit `NEW`, `READ`, `SNOOZED`
und `DISMISSED`; Mailtexte, Roh-Health-Werte, PII und Secrets werden nicht
persistiert. Release 105 korrigiert außerdem ungelesene Personenpost zu
„prüfen“ statt „Antwort nötig“, hält HRV SDNN/RMSSD strikt getrennt und nimmt
Apple-/Companion-Kalender in den Tagesplan auf. 338/338 Tests, Build, lokaler
390-px-Chrome-Smoke und ein produktiver Günni-Lauf mit anschließendem Cleanup
sind grün. Alle vier privaten Container laufen healthy.

Release 106 aktualisiert verbundene Mail- und Kalenderquellen unmittelbar vor
einem manuellen oder geplanten Briefing, sofern ihr Datenstand fällig oder
älter als 15 Minuten ist. IMAP, Google und verschlüsselte ICS-Feeds laufen über
eine begrenzte, usergebundene Orchestrierung mit Timeout, Lock-Erkennung und
quellenspezifischem Fallback auf den letzten gültigen Snapshot. Der Command
Stream weist `source.refresh` und `briefing.build` getrennt nach. In der Inbox
zeigt eine neue klickbare **Datenstand**-Leiste `AKTUELL`, `LETZTER STAND`,
`NICHT VERBUNDEN` oder `EINGESCHRÄNKT` samt letzter erfolgreicher
Synchronisierung. 352/352 Tests, Produktions-Build und der 390×844-Chrome-
Smoke sind lokal grün. Der produktive Günni-Lauf bestätigte `mail · FRESH`,
den getrennten Command Stream, drei Datenstand-Karten, vollständigen Cleanup
und 0 Browserfehler; alle vier privaten Container laufen healthy.

Release 107 ergänzt kontrollierte PWA-Benachrichtigungen als echten zweiten
Ausgabekanal des Personal Pulse. Jedes Gerät muss die Funktion ausdrücklich
aktivieren und die Browserfreigabe erteilen. Push-Abos werden benutzergebunden
und AES-256-GCM-verschlüsselt gespeichert; Endpoint und Schlüssel erscheinen
weder in API-Projektionen noch im Audit. Ruhezeit, Tagesbudget, Feedback und
kanalgetrennte Deduplizierung bleiben serverseitig wirksam. Auf dem
Sperrbildschirm erscheinen ausschließlich generische Hinweise ohne Mail-,
Kalender- oder Gesundheitsdetails; Einzelheiten werden erst nach Anmeldung in
der PWA geladen. Die neue mobile Einstellungskarte erlaubt Aktivieren,
Testnachricht und Widerruf je Gerät. Die vier VAPID-/Verschlüsselungswerte
liegen ausschließlich in der gitignorierten Master-ENV.
360/360 Node-Tests, Produktions-Build, npm-Audit, lokaler und Live-Chrome-
Smoke, PWA auf drei Domains, private TLS-/Login-Grenzen, Mail-Mobile sowie
WebKit/iPhone sind grün. Vier private Container laufen healthy; das Live-Audit
bestätigt die Push-Secret-Grenze ausschließlich in den beiden App-Containern.

Release 108 macht die Ausführung eines persönlichen Tagesbilds dauerhaft
nachvollziehbar und wiederholbar. Ein persistentes Effect Ledger beansprucht
jeden read-only Lauf atomar, bindet ihn an einen stabilen Idempotenzschlüssel
und speichert ausschließlich sichere Zustandsmetadaten. Ein bereits
abgeschlossener Effect wird nicht doppelt ausgeführt. Fehlgeschlagene,
ausdrücklich retryfähige read-only Tools können kontrolliert wiederholt und
laufende Effects nach bestätigter Benutzersitzung abgebrochen werden;
Schreibwerkzeuge bleiben von diesen öffentlichen Aktionen ausgeschlossen.
Das Command Center zeigt Zustand, Versuch, atomaren Claim und stabile
Idempotenz als neue mobile Run-Control-Karte. 368/368 Node-Tests,
Produktions-Build, npm-Produktionsaudit sowie lokale und produktive
Chrome-Abnahmen bei 390×844 sind grün. Der gestufte Rollout Günni → Fressi,
vier healthy Container, PWA/TLS/Login, Mail-Mobile und WebKit/iPhone sind live
bestanden.

Release 109 führt den persistenten **Pattern Feed** ein. Er verbindet Mail,
Kalender und Health ausschließlich über minimierte Kennzahlen und zeigt je
Muster Regel, Zeitraum, aggregierte Quellenanteile, Beleganzahl, Konfidenz,
erstes/letztes Auftreten und den aktuellen Feedback-Zustand. Provider-IDs,
Rohzeitstempel und Nachrichtentexte werden nicht in die öffentliche Projektion
übernommen. Rückmeldungen wie „nicht hilfreich“, „falsch“, „später“ oder „nie
wieder“ beeinflussen die nächste Auswertung und bleiben über Neustarts hinweg
wirksam. Zusätzlich erkennt AgentOne, wenn wichtige Personenpost auf einen
vollen Kalendertag trifft, ohne Termine oder Nachrichten zu verändern.
375/375 Node-Tests, Produktions-Build, npm-Produktionsaudit sowie lokale und
produktive Chrome-Abnahmen bei 390×844 sind grün. Das Live-Audit bestätigt vier
healthy Container und weiterhin die App-only-Grenze der Push-Secrets; PWA,
Mail-Mobile und WebKit/iPhone sind als Regression bestanden.

Release 102 streamt Apple-Health-XML/ZIP mit Backpressure und legt nur
AES-256-GCM-Ciphertext ab. Ein begrenzter Child-Worker verarbeitet die Quelle
außerhalb des HTTP-Eventloops; User, Consent, Human Gate und Command Stream
bleiben gebunden. Restart-Recovery und atomarer Cancel-/Commit-CAS verhindern
halbe Imports. Im Browser sind Upload, Jobphase, Reload-Persistenz und Abbruch
sichtbar, während API und Audit nur sichere Zähler projizieren. Der lokale
390×844-Chrome-Smoke importierte 35.652.165 Bytes und zwei Messwerte und
entfernte die Testdaten vollständig. Der isolierte Live-Smoke auf Günni
importierte 35.652.207 Bytes und zwei Messwerte unter einem eigenen Testuser;
anschließend standen Messwerte und Freigaben dieses Testusers wieder auf null.
Health-Ausgaben bleiben nicht medizinisch.

Der Funktions- und UX-Abgleich mit Jarvis ist in [`docs/JARVIS-FEATURE-ALIGNMENT.md`](docs/JARVIS-FEATURE-ALIGNMENT.md) festgehalten. Der konkrete Gap-, Architektur- und Lieferplan steht in [`docs/JARVIS-PRODUCT-PLAN.md`](docs/JARVIS-PRODUCT-PLAN.md), der belastbare Restaufwand mit Fertig-Definition in [`docs/COMPLETION-ROADMAP.md`](docs/COMPLETION-ROADMAP.md). AgentOne Personal übernimmt daraus die Prinzipien sichtbare Tool-Ausführung, ein gemeinsames Command Center, Feedback, Memory, kontrolliertes Lernen, Modell-Routing, Voice und persönliche Datenfusion, bleibt aber ein eigenes Produkt auf Basis der AgentOne-/OpenClaw-Architektur.

Alle AgentOne-Zugänge werden als installierbare PWA ausgeliefert. Die gemeinsame Instanzverwaltung kann HTTPS-Instanzen hinzufügen, zwischen ihnen wechseln und sie lokal aktivieren oder deaktivieren. Die Instanzliste wird beim Domainwechsel mitgeführt; Zugangsdaten, Sessions, Chats und API-Antworten werden weder übertragen noch offline gecacht.

Die **Günni Companion · Web-App** ist eine PWA, keine native App-Store-App:
Auf dem iPhone
[https://guenni.mwart.solutions/iphone](https://guenni.mwart.solutions/iphone)
in Safari öffnen und den sechsstelligen Einmalcode eingeben. **Teilen → Zum
Home-Bildschirm** ist für das App-Gefühl empfohlen, aber keine Voraussetzung.
Safari und installierte PWA besitzen getrennte verschlüsselte Speicher und
benötigen daher jeweils einen eigenen frischen Einmalcode. Das angebotene ZIP
ist nur eine optionale Anleitung mit Shortcut-Konfiguration, keine
installierbare App. Eine native iOS-App für direkten HealthKit-, EventKit- und
Hintergrundstandort-Zugriff existiert derzeit noch nicht.

Jede Instanz besitzt verpflichtend das Profil `PERSONAL` oder `BUSINESS`. Personal zeigt ausschließlich persönliche Werkzeuge; Business aktiviert Organisationsworkflows und validiertes Unternehmensbranding. Das verbindliche Modell steht in [`docs/INSTANCE-PROFILES-AND-BRANDING.md`](docs/INSTANCE-PROFILES-AND-BRANDING.md).

Das private Modul- und Schnittstellenkonzept mit CalDAV/CardDAV, WebDAV, Mail, Home Assistant, Paperless-ngx, Immich, Mealie, Actual Budget und Benachrichtigungskanälen steht in [`docs/PERSONAL-INSTANCE-CONCEPT.md`](docs/PERSONAL-INSTANCE-CONCEPT.md).

Der installierbare Linux-/Raspberry-Pi-Connector für das Heimnetz ist in [`docs/RASPBERRY-HOME-CONNECTOR.md`](docs/RASPBERRY-HOME-CONNECTOR.md) beschrieben; entpackter Ordner und ZIP-Pakete liegen unter `output/connector/` bereit.

Die Plattformseite arbeitet seit Release 21 nicht mehr ausschließlich mit statischen Run-Karten. Versionierte Workflow-Vorlagen, Runs, Schritte, Checkpoints, Budgets und hashgebundene Human Gates werden persistent in der deterministischen Engine geführt. Authentifizierte Live-Ereignisse sind strikt nach Benutzer und Welt isoliert. Details und nächste Ausbauschritte stehen in [`docs/PLATFORM-ENGINE.md`](docs/PLATFORM-ENGINE.md).

TechHub ist **kein Bestandteil des AgentOne-Kerns**. Es ist lediglich eine mögliche Anbindung beziehungsweise ein Projekt – auf derselben Ebene wie Shopware, ERP, PIM, GitHub, Coolify, E-Mail, Datenbanken oder beliebige REST-/MCP-Dienste.

## 2. Leitprinzipien

1. **Anbindungen statt Sonderfälle:** Jedes externe System wird über eine einheitliche Schnittstelle angebunden.
2. **Deterministische Engine als Rückgrat:** Queue, Schritte, Sperren, Checkpoints, Budgets und Freigaben werden nicht einem frei planenden Agenten überlassen.
3. **Agenten nur dort, wo Urteil nötig ist:** Planung, Extraktion, Textarbeit, Prüfung und Codeänderungen.
4. **Menschen geben Freigaben:** Agenten dürfen Freigaben beantragen, aber niemals selbst erteilen.
5. **Freigaben sind Datensätze:** Person, Rolle, Zeitpunkt, Kommentar und Hash des freigegebenen Gegenstands werden gespeichert.
6. **Änderungen machen Freigaben ungültig:** Ändert sich Umfang, Inhalt oder Ziel, ist eine neue Freigabe erforderlich.
7. **Dry-Run → Sample → Audit → Vollauf:** Schreibende Massenläufe folgen dieser Reihenfolge.
8. **Prüfer und Ersteller sind getrennt:** Ein Ergebnis wird von einem anderen Profil oder Menschen geprüft.
9. **Jeder Lauf ist fortsetzbar:** Deploys oder Neustarts dürfen Arbeit nicht dauerhaft abbrechen.
10. **Jeder Lauf zählt vollständig:** Erwartet, erfolgreich, übersprungen und fehlerhaft – jeweils mit Grund.
11. **Secrets gelangen nie in Prompts oder Logs:** Agenten sehen nur freigegebene Tool-Ein- und -Ausgaben.
12. **Quellen und Belege vor Behauptungen:** Fachliche Aussagen müssen auf konfigurierten Quellen beruhen.

## 3. Zielbild

```text
AgentOne-Plattform (container2.purelink.de, Hetzner)
  Web/API · Workflow-Engine · PostgreSQL · Artefakte
                         │ ausgehende mTLS-Verbindung
AgentOne-Connector (internes PureLink-Netz, Docker/Coolify)
  Capability-Gateway · lokale Secrets · Netzwerk-Policies
                         │
  NFS/SMB · GraphQL/REST · PostgreSQL/SQL · interne Dienste

Plattform-UI (M365-Login)
  Galaxy-Dashboard · Projekte · Aufträge · Board · Läufe · Artefakte
  Anbindungen · Workflows · Budgets · Rollen · Verwaltung
                         │ REST/SSE
AgentOne-Kern
  Orchestrator · Workflow-Engine · Tool-Registry
  Queue · Sperren · Freigaben · Budget · Audit · Scheduler
                         │
Worker (getrennte Container, Checkpoints, Tool-Whitelists)
                         │
Anbindungen
  APIs · MCP · SQL · ERP · PIM · Shopware · TechHub
  Git/GitHub · Coolify · SMB/SFTP/S3 · E-Mail · HTTP
```

Der AgentOne-Kern wird als Coolify-Projekt auf `container2.purelink.de` bei Hetzner geplant. Dort laufen Web/API, Engine, Worker und eine eigene PostgreSQL-Datenbank. Der Quellcode liegt im Repository [`PureLink-Marcus/AgentOne`](https://github.com/PureLink-Marcus/AgentOne). Interne PureLink-Systeme werden ausschließlich über einen gesonderten AgentOne-Connector erreicht; sie werden nicht direkt im Internet veröffentlicht.

## 4. Kernbegriffe

| Begriff | Bedeutung |
|---|---|
| Mandant | Unternehmen und oberste Budget-/Rechtegrenze |
| Abteilung | Zuordnung von Menschen, Rollen und optionalen Teilbudgets |
| Projekt | Fachlicher Arbeitsbereich mit eigenen Anbindungen, Regeln und Workflows |
| Anbindung | Konfigurierte Verbindung zu einem System oder Protokoll |
| Datenquelle/-ziel | Freigegebener Ausschnitt einer Anbindung, pro Workflow oder Lauf gewählt |
| Tool/Fähigkeit | Typisierte Funktion, die über eine Anbindung arbeitet |
| Workflow-Vorlage | Versionierte Schrittfolge mit Parametern, Gates und Budgetregeln |
| Auftrag | Originalanweisung eines Menschen, Zeitplans oder Webhooks |
| Lauf | Konkrete Ausführung eines Auftrags mit eingefrorenem Umfang |
| Freigabe | Menschliche Entscheidung, gebunden an Rolle und Hash |
| Änderungssatz | Prüfbarer Diff aus altem Wert, neuem Wert und Beleg |
| Artefakt | Ergebnis wie Bericht, CSV, HTML, PDF, Diff, Screenshot oder PR |
| Befund | Prüfproblem mit Schwere, Besitzer, Beleg und Lebenszyklus |

## 5. Rollen und Rechte

| Rolle | Befugnisse |
|---|---|
| Admin | Plattform, Anbindungen, Secrets, Rollen, Budgets und produktive Freigaben |
| Redakteur | Aufträge, Samples, Inhaltsentscheidungen und freigegebene Veröffentlichungen |
| Prüfer | Unabhängige Audits, Findings und Go/No-Go vor Voll- oder Produktivläufen |
| Leser | Status, Berichte und Artefakte lesen |
| Agent-Service-Identität | Nur freigegebene Tools; keine menschlichen Entscheidungen oder direkten Secrets |

Anmeldung erfolgt über Microsoft 365. Rechte werden manuell je Abteilung vergeben. Eine Agentenaktion bleibt dem auslösenden Menschen, Auftrag und Lauf zugeordnet.

## 6. Anbindungen

### 6.1 Einheitliche Schnittstelle

Jede Anbindung implementiert:

- `describe()` – Objekte, Felder und Möglichkeiten für die UI auflisten.
- `read(query)` – ausschließlich im gewährten Lesebereich lesen.
- `write(changeSet)` – nur freigegebene Änderungssätze anwenden.
- `snapshot(keys)` – Zustand unmittelbar vor einem Schreibvorgang sichern.
- `revert(changeLogId)` – einen protokollierten Schreibvorgang rückgängig machen.
- `health()` – Erreichbarkeit, Berechtigungen und Limits prüfen.

Eine Instanz erhält einen minimalen Scope: `read`, `write-draft`, `write-publish` oder `write-prod`. Erlaubte Objekte, Felder, Pfade und Umgebungen gehören zur Konfiguration und zum Freigabe-Hash.

### 6.2 Geplante Typen

| Typ | Beispiele und Grenzen |
|---|---|
| MCP | Bestehende MCP-Server als typisierte Tools nutzen; Tool-Liste und Schemas übernehmen |
| REST/GraphQL | Generische APIs, ERP, PIM, TechHub oder andere Plattformen |
| SQL | PostgreSQL, MySQL, MSSQL; standardmäßig Read-only und Abfragevorlagen |
| Shopware 6 | Produkte, Kategorien, Medien und CMS; getrennte Test-/Staging-/Prod-Instanzen |
| Dateien | SMB/CIFS, SFTP, S3 und freigegebene Ordner mit Pfad-Whitelist |
| E-Mail | Microsoft Graph oder IMAP/SMTP; Senden nur nach Freigabe |
| Git/GitHub | Lesen, Branch und Pull Request; kein Direkt-Push auf geschützte Branches |
| Coolify | Status und kontrollierte Deployments über ein Admin-Gate |
| TechHub | API-/Datenanbindung wie jedes andere Projekt, ohne Sonderrechte im Kern |
| Dateiformate | PDF, DOCX, XLSX, CSV und Bilder lesen oder erzeugen |

### 6.3 Zielhosting auf `container2.purelink.de`

Geplante Coolify-Ressourcen:

| Ressource | Aufgabe | Erreichbarkeit |
|---|---|---|
| `agentone-web` | React-UI und statische Assets | HTTPS über Reverse Proxy |
| `agentone-api` | REST/SSE, Authentifizierung, Board und Steuerung | HTTPS; keine direkten internen Netzwerkzugriffe |
| `agentone-worker` | Workflow- und Agentenschritte ohne interne Anbindungen | nur internes Projektnetz |
| `agentone-postgres` | Zustände, Audit, Freigaben, Budgets und Metadaten | ausschließlich internes Docker-Netz |
| `agentone-artifacts` | Artefakte und Vorschauen; anfangs Volume, später optional S3-kompatibel | nur über API/zeitlich begrenzte Links |

Die Datenbank wird erst in der Implementierungsphase erstellt. Vorgesehen sind PostgreSQL mit verschlüsselten Backups, Point-in-Time-Recovery, getrennten Rollen für Migration/API/Worker, `SCRAM-SHA-256`, restriktivem `pg_hba.conf` und TLS für jede Verbindung außerhalb des lokalen Docker-Netzes. PostgreSQL unterstützt dafür `hostssl`, Zertifikatsprüfung und rollenbezogene Zugriffsregeln ([PostgreSQL TLS](https://www.postgresql.org/docs/current/ssl-tcp.html), [`pg_hba.conf`](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)).

### 6.4 AgentOne-Connector im internen Netzwerk

Der **AgentOne-Connector** ist ein eigenes, versioniertes Docker-Image und wird als Coolify-Projekt auf einem internen PureLink-Server betrieben. Er verbindet ausgewählte interne Ressourcen mit AgentOne, ohne das interne Netz pauschal freizugeben.

```text
AgentOne API / Job Broker (Hetzner)
              ▲
              │ HTTPS/mTLS, nur vom Connector ausgehend
              │ kurzlebige, signierte Aufträge + Ergebnisse
              ▼
AgentOne-Connector (intern, eigene Security Zone)
  ├─ Capability: files.read/write   → fest freigegebene NFS-/SMB-Pfade
  ├─ Capability: graphql.request    → fest freigegebene GraphQL-Endpunkte
  ├─ Capability: postgres.query     → Query-Vorlagen / definierte DB-Rollen
  ├─ Capability: http.request       → feste Hosts, Ports und Methoden
  └─ Capability: health.inventory   → Erreichbarkeit und Metadaten
```

#### Verbindungsmodell

- Der Connector baut ausschließlich **ausgehende** Verbindungen zu einem fest gepinnten AgentOne-Endpunkt auf; kein Port-Forwarding und kein öffentliches Inbound-API im Firmennetz.
- Transport über TLS 1.3 mit gegenseitiger Zertifikatsprüfung; jede Connector-Instanz besitzt eine eigene, rotierbare Identität.
- Aufträge sind kurzlebig, signiert, gegen Wiederholung geschützt und enthalten Connector-ID, Capability, Zielreferenz, Umfang, Ablaufzeit und Freigabe-Hash.
- Die Plattform übermittelt keine freie Shell, kein freies SQL und keine beliebige URL. Der Connector löst nur versionierte Capability-Schemas aus.
- Secrets für interne Ziele bleiben lokal im Connector/Secret-Store. AgentOne speichert nur eine Secret-Referenz und erhält niemals das Passwort zurück.
- Antworten werden nach Schema gefiltert, begrenzt und vor dem Versand auf Secrets beziehungsweise personenbezogene Daten geprüft.
- Fällt die Verbindung aus, bleiben Jobs persistent wartend; es gibt keinen unsicheren Fallback-Pfad.

#### Ressourcen und Sicherheitsgrenzen

- **NFS:** bevorzugt NFSv4 mit Kerberos; `krb5p` bietet Authentifizierung, Integrität und Verschlüsselung. Exporte, Pfade, Dateitypen, Dateigröße und Read/Write werden pro Capability beschränkt ([Red Hat NFS-Sicherheit](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/configuring_and_using_network_file_services/nfs-security-with-auth_gss_securing-nfs)).
- **SMB:** SMB 3.1.1, Signierung und – soweit unterstützt – erzwungene Verschlüsselung; kein Gastzugriff, kein SMB1, eigene technische Identität und Share-Allowlist ([Microsoft SMB Hardening](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security-hardening)).
- **PostgreSQL/SQL:** eigener Benutzer je Datenquelle und Capability; standardmäßig Read-only, feste Views oder parametrisierte Query-Vorlagen, Zeit-/Zeilenlimits und keine Multi-Statements. Schreiben ausschließlich als freigegebener Änderungssatz.
- **GraphQL/REST:** feste Origin-Allowlist, Methoden-, Pfad- und Schema-Allowlist, Größen-/Zeitlimits sowie validierte Ziel-IP auch nach DNS-Auflösung. Dadurch darf der Connector nicht als SSRF-Proxy missbraucht werden ([OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)).
- **Container:** non-root/rootless, read-only Root-Filesystem, alle Linux-Capabilities entfernt, `no-new-privileges`, Standard-Seccomp/AppArmor, Ressourcenlimits und kein Docker-Socket. Docker empfiehlt Rootless Mode und das Beibehalten des Seccomp-Standardprofils ([Docker Rootless](https://docs.docker.com/engine/security/rootless/), [Docker Seccomp](https://docs.docker.com/engine/security/seccomp)).
- **Netzsegmentierung:** ausgehende Ziele werden per Firewall/Egress-Allowlist eingeschränkt. Eine Capability darf nur den exakt benötigten Zielhost und Port erreichen.
- **Audit:** jede Anforderung, Freigabe, lokale Zielreferenz, Menge, Laufzeit und Ergebniszählung wird manipulationsgeschützt protokolliert; sensible Nutzdaten und Secrets nicht.

Das Modell folgt Zero Trust: weder das interne Netz noch der Hetzner-Host erzeugen implizites Vertrauen; Identität, Gerät/Instanz, Capability und einzelne Anfrage werden geprüft ([NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final), [NIST SP 1800-35](https://csrc.nist.gov/pubs/sp/1800/35/final)). Die API- und Connector-Grenzen werden außerdem gegen die Risiken des [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x00-header/) entworfen.

## 7. Fähigkeiten

- Datenabgleich, Inventur, Mapping, Dubletten- und Qualitätsprüfung
- Dokumentenimport mit PDF/OCR/Vision, Struktur- und Bildprüfung
- Faktengebundene Texte, FAQ, Zusammenfassungen, Übersetzungen und Glossare
- Compliance-Klassifizierung und Dokumentzuordnung
- Bildverarbeitung und Medienprüfung
- HTML-/Landingpage-Erzeugung aus festen, bereinigten Bausteinen
- Veröffentlichung in Zielsysteme oder als Pull Request
- Mail-Entwürfe und Benachrichtigungen
- Unabhängige Quellen-, Ergebnis- und Live-Audits

Tools werden versioniert und einer Risikoklasse zugeordnet. Agentenprofile erhalten ausschließlich die für ihren Schritt erforderliche Tool-Whitelist.

## 8. Workflow-Modell

Ein Workflow besteht aus Tool-, Agenten- und Freigabeschritten. Sein Umfang enthält Quellen, Ziele, Filter, Felder, Sprachen, Regeln, Budget und Freigabeanforderungen. Dieser Umfang wird zu Beginn eingefroren und gehasht.

### 8.1 Ein AgentOne pro Welt

Jede **Welt** besitzt genau einen eigenen, dauerhaft sichtbaren **AgentOne**. Eine Welt ist standardmäßig ein Workflow-Planet innerhalb eines Projekts. Ihr AgentOne kennt und steuert ausschließlich diesen abgegrenzten Kontext; es gibt keinen allmächtigen Super-AgentOne mit pauschalem Zugriff auf alle Welten.

Der AgentOne einer Welt:

- nimmt Aufträge und Rückfragen im Chat entgegen,
- wählt beziehungsweise plant den Workflow,
- zerlegt Arbeit in Teilaufgaben und weist sie Agenten zu,
- startet Connector- und Tool-Schritte innerhalb der freigegebenen Rechte,
- überwacht Abhängigkeiten, Budgets, Sperren und Fortschritt,
- führt parallele Ergebnisse zusammen und löst Merge-Konflikte,
- bereitet Push, Veröffentlichung oder Deployment vor,
- fordert notwendige menschliche Freigaben an,
- prüft Abschlusszählungen und erstellt Ergebnisberichte.

AgentOne ersetzt keinen Fachagenten. Er darf menschliche Gates nicht umgehen und besitzt keine pauschalen Connector-Rechte. Jeder ausgelöste Schritt läuft mit dem Tool- und Capability-Scope seiner Welt.

Welten sind technisch und fachlich isoliert: eigener Kontext, eigener Chat, eigenes Agent Team, freigegebene Connectoren, Artefakte, Budgets und Audit-Trail. Projektübergreifende Arbeit erfolgt nur als explizite, protokollierte Übergabe zwischen zwei Welten; beide AgentOne-Instanzen prüfen ihre jeweiligen Rechte und Gates.

#### Räumliche Hierarchie im Dashboard

| Ebene | Darstellung | Inhalt |
|---|---|---|
| Unternehmen/Mandant | Universum | Übersicht und Navigation; kein übergeordneter Super-Agent |
| Projekt | Sternsystem/Cluster | gemeinsames Ziel, Budget, Regeln, Rollen und seine Welten |
| Workflow/Welt | Planet | eigener AgentOne, Chat, Aufgaben, Agent Team und freigegebene Connectoren |
| Aufgabe/Schritt | Mond, Pixel oder Orbitsegment | atomare Arbeit, Status, Abhängigkeit und Artefakt |
| Agent | Schwarmobjekt | Rolle, aktuelle Aufgabe, Übergaben und Tool-Scope |
| Connector | Satellit/Gateway | konkrete Datenquelle oder Zielanbindung des Workflows |

Ein Klick auf ein Projekt zeigt seine Workflow-Welten. In jedem Planeten ist dessen AgentOne als Kern sichtbar. Ein Klick öffnet die Welt: AgentOne, Aufgaben, Agenten und Connectoren werden mitsamt ihren tatsächlichen Abhängigkeiten aufgefaltet.

#### Chat mit AgentOne innerhalb jeder Welt

- Jede Workflow-Welt besitzt ihren eigenen dauerhaften Chat mit ihrem AgentOne.
- Der Kontext enthält ausschließlich diese Welt, ihre Workflow-Version, Aufgaben, Agenten, Connectoren, Artefakte, Entscheidungen und Ereignisse.
- Ein konkreter Lauf kann innerhalb des Welt-Chats fokussiert werden, ohne einen zweiten unabhängigen AgentOne zu erzeugen.
- Chat-Nachrichten können Fragen beantworten, Aufgaben anlegen, Prioritäten ändern oder Berichte anfordern; risikoreiche Änderungen erzeugen weiterhin ein formales Gate.
- Der AgentOne der Welt berichtet, welcher Agent gerade woran arbeitet, welche Übergabe erfolgt ist, warum ein Schritt wartet und was zusammengeführt oder veröffentlicht wurde.
- Die Universumsansicht besitzt lediglich eine Welt-/Projektauswahl und zusammengefasste Statusberichte; ein Chat beginnt erst nach Auswahl einer Welt.

### 8.2 Zusammenarbeit mehrerer Agenten

Ein Lauf kann ein versioniertes **Agent Team** erhalten. Die Agenten arbeiten nicht als isolierte Chats, sondern über einen gemeinsamen Aufgaben- und Artefaktraum:

- **Coordinator:** zerlegt den bestätigten Workflow-Schritt in Teilaufgaben, verfolgt Abhängigkeiten und führt Ergebnisse zusammen.
- **Specialists:** arbeiten parallel mit unterschiedlichen Profilen, Modellen, Werkzeugen und Datenrechten.
- **Reviewer/Audit:** prüft Ergebnisse unabhängig; Reviewer und Ersteller dürfen nicht dieselbe Agenteninstanz sein.
- **Resolver:** behandelt widersprüchliche Ergebnisse anhand fester Regeln oder legt dem Menschen eine Entscheidung mit Belegen vor.

| Muster | Einsatz |
|---|---|
| Fan-out/Fan-in | Viele Datensätze parallel bearbeiten und anschließend deterministisch zusammenführen |
| Pipeline/Handoff | Recherche → Entwurf → Prüfung → Veröffentlichung mit versionierter Übergabe |
| Peer Review | Ein Agent erstellt, ein zweiter kommentiert, der erste überarbeitet |
| Debate/Compare | Mehrere Agenten liefern begründete Alternativen; Resolver oder Mensch entscheidet |
| Shared Swarm | Worker beanspruchen atomare Aufgaben aus derselben Queue ohne Doppelarbeit |

Jede Agent-zu-Agent-Übergabe ist eine typisierte Nachricht mit Auftrag, Eingabe-Artefakt, erwarteter Ausgabe, Frist und Hash. Gemeinsame Artefakte sind versioniert; Agenten schreiben nicht gleichzeitig unkontrolliert in dieselbe Datei oder denselben Datensatz. Sperren beziehungsweise optimistische Versionierung erkennen Konflikte. Freigaben bleiben ausschließlich Menschen vorbehalten, auch wenn mehrere Agenten übereinstimmen.

Im Dashboard werden Team, aktuelle Teilaufgabe, Übergaben, Wartezustände, Konflikte und gemeinsame Artefakte sichtbar. Ein Klick auf eine Schwarmverbindung zeigt Absender, Empfänger, übergebenes Artefakt und Prüfstatus.

Beispiel:

```yaml
projekt: shop-content
quellen:
  - anbindung: erp-prod
    objekt: artikel
    scope: read
    felder: [artnr, bez, kurztext]
ziele:
  - anbindung: shopware-staging
    objekt: product
    felder: [description, metaDescription]
regeln:
  quellprioritaet: [erp, datenblatt, handbuch, pim]
budget_eur: 40
freigaben:
  - nach: sample
    rolle: pruefer
  - vor: ziel-schreiben
    rolle: redakteur
  - vor: prod
    rolle: admin
    zwei_personen: true
```

### Beispiel-Workflows

- **Produkttexte:** Quellen lesen → Texte mit Belegen → Audit → Mensch → Staging schreiben → Rücklesen → Prod-Gate → Live-Check.
- **Dokumente:** Datei erkennen → importieren → Qualität prüfen → Audit → Mensch → Zielanbindung veröffentlichen.
- **Datenqualität:** mehrere Quellen lesen → Abweichungen → Befunde/Änderungssätze → Freigabe → anwenden → nachprüfen.
- **Support zu FAQ:** Mails lesen → personenbezogene Daten maskieren → clustern → Entwurf mit Belegen → Mensch → Zielsystem.
- **Landingpage:** Briefing → Inhalte aus Quellen → feste Designbausteine → technische Prüfung → Vorschau → Mensch → CMS, statisches Ziel oder PR.
- **Codeänderung:** Auftrag → Sandbox-Branch → Build/Tests → PR/Preview → unabhängige Prüfung → menschlicher Merge → Deployment.
- **Deployment:** exklusive Sperre → Tests → All-Clear → Admin-Freigabe → Deploy → Healthcheck → bei Fehler Rollback.

## 9. Engine und Betrieb

- PostgreSQL-Queue, beispielsweise mit `FOR UPDATE SKIP LOCKED` oder `pg-boss`.
- Separate Worker-Container, damit UI-/API-Deployments laufende Jobs nicht beenden.
- Checkpoints und idempotente Schlüssel je Datensatz, Datei, Sprache und Quell-Hash.
- Ressourcen-Sperren wie `connector:{id}`, `product:{id}` oder `deploy:{project}`.
- Wiederholungen nur für als sicher klassifizierte Schritte.
- SSE für Status und strukturierte Ereignisse; Logs werden gekürzt und von Secrets bereinigt.
- Budget vor dem Start schätzen, bei 80 % warnen, bei 100 % pausieren und nach Erhöhung fortsetzen.
- Veröffentlichung und Erzeugung bleiben getrennte Schritte.
- Scheduler für wiederkehrende, versionierte Abläufe.

## 10. Board und Zusammenarbeit

Das Board ist die verbindliche Schnittstelle zwischen Menschen und laufenden Workflows.

### Fragen

- Fortlaufende Nummer je Mandant, Projekt, Bereich, Kontext, Optionen und Empfehlung.
- Optionen füllen das Antwortfeld; sie senden nicht sofort ab.
- Freitext ist immer möglich, Entwürfe bleiben beim Live-Update erhalten.
- Lebenszyklus: `offen → beantwortet → erledigt`, außerdem `zurückgestellt` und `wieder geöffnet`.
- Der Originalwortlaut einer Antwort wird unverändert an den wartenden Schritt übergeben.
- Nur der betroffene Schritt wartet; unabhängige Arbeit darf weiterlaufen.
- `erledigt` erfordert einen geprüften Ergebnistext mit Lauf-, Artefakt- oder Commit-Verweis.

### Agentenstatus

Agentenkarten zeigen `arbeitet`, `wartet auf dich` oder `bereit`, dazu den aktuellen und nächsten Schritt. Der Zustand wird aus Läufen abgeleitet und nicht manuell gepflegt.

### Freigaben und Befunde

Freigaben zeigen Gegenstand, Hash, erforderliche Rolle, Entscheidungen und Verlauf. Befunde besitzen Schwere, Besitzer, Objekt, Beleg und den Status `open`, `in_progress`, `fixed`, `verified` oder `wontfix`.

## 11. Sicherheit bei Schreibzugriffen

1. Agenten erzeugen Änderungssätze und schreiben nicht direkt.
2. Produktive oder besonders sensible Änderungen benötigen zwei verschiedene Menschen.
3. Direkt vor dem Schreiben wird ein Snapshot erstellt.
4. Weicht der aktuelle Wert vom erwarteten alten Wert ab, bricht der Schritt ab.
5. Das Schreibtool nutzt eine minimal berechtigte technische Identität.
6. Sample und Größenlimit begrenzen den ersten Schreibvorgang.
7. Nach dem Schreiben werden Werte zurückgelesen und verglichen.
8. Undo und Redo sind eigene, freigabepflichtige Läufe.
9. Ein globaler und ein anbindungsspezifischer Not-Aus sperren Schreibtools sofort.

## 12. UI-Seiten

| Seite | Inhalt |
|---|---|
| **Galaxy-Dashboard** | Räumliche Gesamtsicht auf Projekte, Anbindungen, Agenten und Läufe mit Zoom und Detailklick |
| Projektstart | Fokussierte Sicht eines Projekts mit Status, Agenten, Anweisung/Chat und offenen Fragen |
| Board | Fragen, Freigaben und Befunde über alle Projekte |
| Aufträge & Läufe | Schritte, Live-Log, Kosten, Zählungen, Stop/Fortsetzen und Artefakte |
| Workflows | Vorlagen, Umfang, Kostenschätzung und Testlauf |
| Anbindungen | Konfiguration, Objekt-Browser, Healthcheck, Scope und Not-Aus |
| Änderungssätze | Diff, Belege, Freigaben, Anwenden, Undo und Redo |
| Artefakte | Vorschauen und erzeugte Dateien/PRs |
| Verwaltung | Mandanten, Abteilungen, Benutzer, Rollen, Budgets, Modelle und Zeitpläne |

## 13. Designidee: AgentOne Galaxy

### Leitidee

Das Dashboard wird keine gewöhnliche Kartenwand, sondern eine interaktive **Operations-Galaxie**. Sie verbindet drei Bildsprachen zu einem konsistenten Interface:

- **Galaxie für Orientierung:** Projekte bilden Sternsysteme; darin liegen Workflow-Welten, jeweils mit einem eigenen AgentOne, Agent Team und freigegebenen Connectoren.
- **Pixel für Informationsdichte:** Kleine, scharf lesbare Raster, Statuspunkte und Mini-Charts zeigen viele Daten ohne große Kacheln.
- **Schwarm für Aktivität:** Agenten und Worker bewegen sich als dezente Partikel zwischen Aufgaben. Dauerhafte Worker wirken wie Bienen im Stock; kurzfristige Ad-hoc-Agenten springen wie Grashüpfer zu einem Ziel. Die Metapher bleibt unterstützend – Status und Bedienung funktionieren immer auch ohne Animation.

Der Arbeitstitel für die Startansicht ist **AgentOne Living Galaxy**. Die Grundwirkung ist dunkel, räumlich und kontrastreich; eine helle, gleichwertige Darstellung bleibt Teil des Designsystems. Eine spätere reine „Hive/Swarm“-Ansicht kann folgen, der erste Release verwendet jedoch nur eine gemeinsame visuelle Sprache.

### Visuelle Zuordnung

| Element in AgentOne | Darstellung im Dashboard |
|---|---|
| Mandant | gesamte Galaxie |
| Projekt | Sternsystem beziehungsweise Cluster |
| Workflow/Welt | Planet mit eigenem AgentOne im Zentrum |
| Anbindung | Satellit/Gateway innerhalb der zugehörigen Welt |
| Lauf | wandernder Lichtpunkt auf dem Workflow-Pfad |
| Agent/Worker | kleines Schwarmobjekt mit Profil-Symbol |
| Freigabe | geschlossenes Tor beziehungsweise pulsierender Beacon |
| Befund/Fehler | sichtbare Störung am betroffenen Knoten, nicht nur eine Farbe |
| Budget | Halo/Ring; Füllgrad zeigt den Verbrauch |
| Datenfluss | gerichtete, nur bei Aktivität animierte Verbindung |

Jede Welt besitzt ihren eigenen AgentOne als stabiles Zentrum. Die Galaxie selbst ist nur Navigation und Statusübersicht. Entfernung zeigt fachliche oder technische Zugehörigkeit, Verbindungen zeigen reale Abhängigkeiten und Datenwege. Positionen werden deterministisch gespeichert, damit die mentale Karte beim Neuladen nicht springt. Größe darf ausschließlich eine benannte Größe wie Aktivität, Warteschlangenlänge oder Datenumfang darstellen.

### Aufbau der Hauptansicht

1. **Statusleiste oben:** offene Freigaben, kritische Befunde, aktive Läufe, Budget und globale Suche.
2. **Zentrale Galaxy-Fläche:** zoombare Systemkarte als dominantes Element; keine Kachelwand über der Visualisierung.
3. **Projekt-/Ebenen-Navigation links:** Mandant → Projekt → Workflow → Lauf sowie gespeicherte Ansichten.
4. **Detail-Drawer rechts:** erscheint nach einem Klick und zeigt Zustand, letzten Schritt, Kosten, Besitzer, Belege, Artefakte und erlaubte Aktionen.
5. **Ereignisband unten:** zeitlicher Strom der letzten Starts, Freigaben, Fehler und Abschlüsse; Klick fokussiert den zugehörigen Knoten.

### Zoom und Detailklick

- **Galaxie-Ebene:** Gesundheit und Aktivität aller Projekte vergleichen.
- **Projekt-Ebene:** Workflow-Welten samt jeweiligem AgentOne, Status und Engpässen sehen.
- **Welt-Ebene:** AgentOne, Aufgaben, Agenten, Connectoren, Gates, Übergaben und Datenfluss verfolgen.
- **Lauf-Ebene:** Log, Zählungen, Kosten, Artefakte und Entscheidungen prüfen.
- Einfacher Klick oder `Enter` selektiert ein Objekt und öffnet den Drawer; „Öffnen“ zoomt eine Ebene tiefer.
- Ein Klick auf eine Verbindung zeigt Quelle, Ziel, Datenart, Berechtigung und letzten Transfer.
- Breadcrumb und Zurück-Aktion verhindern, dass Nutzer sich in der räumlichen Ansicht verlieren.
- Filter blenden nichts still aus: aktive Filter und ausgeblendete Objektzahlen bleiben sichtbar.
- Jede grafische Auswahl besitzt zusätzlich eine direkte Listen-/Tabellenansicht.
- Mobil startet AgentOne in einer fokussierten Projekt-/Schwarmansicht statt in der vollständigen Galaxie.
- Agent-zu-Agent-Verbindungen zeigen echte Teilaufgaben und Übergaben; dekorative Bewegung ohne fachliches Ereignis ist unzulässig.

### Zustände und Bewegung

| Zustand | Signal |
|---|---|
| aktiv | ruhiger Lichtfluss und eindeutiges Aktiv-Symbol |
| wartet auf Mensch | pulsierender Beacon plus Text/Badge |
| pausiert/Budget | unterbrochener Pfad und Budget-Symbol |
| erfolgreich | stabiler Knoten mit Abschlussmarke |
| Fehler | Störsymbol, klarer Text und Ereigniseintrag |
| offline | entsättigter Knoten mit getrenntem Verbindungssymbol |

Animation zeigt nur echte Aktivität und läuft langsam, nicht dekorativ in Endlosschleifen. `prefers-reduced-motion`, ein Bewegungs-Schalter, Tastaturbedienung, hohe Kontraste und nicht-farbgebundene Symbole sind Pflicht.

### Technischer Ansatz

- Canvas/WebGL für viele Knoten und Partikel; HTML/SVG für Beschriftungen, Drawer und zugängliche Bedienelemente.
- Level of Detail: weiter Zoom zeigt Cluster und Summen, naher Zoom einzelne Läufe und Agenten.
- Live-Daten über SSE; die Darstellung interpoliert zwischen Ereignissen, ohne fachlichen Zustand zu erfinden.
- Serverseitige Aggregation und ein festes Partikel-Limit halten die Ansicht auch bei vielen Läufen flüssig.
- Zielwert für die Abnahme: mindestens 1.000 sichtbare Objekte bei flüssiger Auswahl, Zoom und Drawer-Öffnung auf der definierten Referenzhardware.
- Parallel gepflegtes semantisches DOM stellt dieselben Inhalte für Tastatur und Screenreader bereit.
- Tabellenmodus ist vollständiger Fallback und keine reduzierte Nebenansicht.

### Umsetzung in Stufen

1. **Visual Foundation:** Design-Tokens, Statussprache, Icons, Typografie, Raster und statischer Galaxy-Prototyp.
2. **Interactive Map:** Pan/Zoom, Auswahl, Detail-Drawer, Breadcrumb, Suche und Tabellenfallback.
3. **Live Operations:** SSE-Ereignisse, Laufpfade, Gates, Budgets und Ereignisband.
4. **Swarm Layer:** Agentenbewegung, Arbeitsübergaben und Lastdarstellung mit Bewegungsreduktion.
5. **Polish:** gespeicherte Ansichten, Präsentationsmodus, Performance- und Accessibility-Abnahme.

### Aktueller Screendesign-Stand

Das konsolidierte Designpaket liegt vollständig unter [`design/agentone-design-package/`](design/agentone-design-package/). Es enthält die interaktive Präsentation, eine Projektbeschreibung, lokale PureLink-Fonts und zwölf geprüfte Screenshots.

- [Interaktive Präsentation](design/agentone-design-package/index.html)
- [Projektbeschreibung](design/agentone-design-package/PROJECT-DESCRIPTION.md)
- [Screenshot-Galerie](design/agentone-design-package/screenshots/index.html)

Die drei Arbeitsrichtungen sind **Celestial Cartography**, **Pixel Hive OS** und die kombinierte Richtung **PureLink Orbit Grid**. Für jede Richtung existieren eine helle und dunkle Darstellung sowie eine Projekt-Außenansicht und eine Welt-Innenansicht. Unverändert bleiben: ein AgentOne je Welt, Welt-gebundener Chat, sichtbare Agent-zu-Agent-Übergaben, getrennte Connectoren und menschliche Gates vor schreibenden Aktionen.

Frühere Entwurfsquellen und Screenshots wurden ohne Löschung nach [`design/archive/2026-10-29-pre-consolidation/`](design/archive/2026-10-29-pre-consolidation/) verschoben und können nach manueller Prüfung entfernt werden.

## 14. Datenmodell

| Tabelle | Zweck |
|---|---|
| `tenants`, `departments`, `users` | Organisation, Rollen und Budgets |
| `projects` | Projektregeln, Bereiche, Quellenpriorität und KPIs |
| `connectors`, `secrets` | Anbindungen und verschlüsselte Secret-Referenzen |
| `connector_nodes` | Registrierte interne Connector-Instanzen, Zertifikatsidentität, Version und Health |
| `connector_capabilities` | Versionierte Ziel-, Methoden-, Pfad-, Schema- und Rechte-Allowlisten |
| `connector_jobs` | Kurzlebige signierte Aufträge, Lease, Ergebniszählung und Wiederholungsschutz |
| `tools`, `agent_profiles` | Tool-Schemas, Risikoklassen, Modelle und Whitelists |
| `agent_teams`, `agent_team_members` | Rollen, Profile und Tool-Rechte eines Teams pro Vorlage oder Lauf |
| `agent_tasks`, `agent_messages`, `agent_handoffs` | Teilaufgaben, typisierte Kommunikation und versionierte Übergaben |
| `worlds`, `world_agentone` | Isolierter Workflow-Kontext und genau eine AgentOne-Instanz pro Welt |
| `orchestrator_threads`, `orchestrator_messages` | Weltbezogener Chat mit dem zuständigen AgentOne |
| `workflow_templates` | Versionierte Schritte, Umfangs- und Freigaberegeln |
| `tasks`, `runs`, `run_steps`, `run_events` | Auftrag, Ausführung, Checkpoints, Kosten und Audit-Trail |
| `questions`, `approvals`, `findings`, `messages` | Zusammenarbeit und Entscheidungen |
| `change_sets`, `change_log` | Diffs, Snapshots, Anwendung und Rücknahme |
| `artifacts` | Berichte, Dateien, Vorschauen, Diffs und PRs |
| `locks`, `schedules`, `budget_usage` | Sperren, Zeitpläne und Verbrauch |
| `dashboard_views` | Gespeicherte Kamera, Filter, Layoutpositionen und persönliche Ansichten |

## 15. Technik

- Monorepo in Node.js/TypeScript mit React und PostgreSQL.
- API und UI getrennt von persistenten Worker-Prozessen.
- Agenten über konfigurierbare Modellprovider; Modellwahl je Profil und Schritt, nicht hart codiert.
- Eigene Anbindungen als Plugin-Pakete mit versionierten Schemas.
- MCP sowohl als Eingangs-Anbindung als auch optional zur Bereitstellung ausgewählter AgentOne-Tools.
- Container-Sandbox für Code- und HTML-Agenten ohne Produktions-Secrets.
- Zentrales Hosting als Coolify-Projekt auf `container2.purelink.de`; interne Ressourcen nur über ausgehende Connector-Kanäle.
- GitHub Actions optional für isolierte PR-Arbeit; interne Datenworkflows bleiben im internen Worker.
- Secret-Tresor verschlüsselt in der Plattform-Datenbank oder über einen vorhandenen externen Tresor.

## 16. Umsetzungsphasen

| Phase | Ergebnis | Grobe Schätzung |
|---|---|---:|
| S0 Design | Informationsarchitektur, Living-Galaxy-Screens, Connector-Bedrohungsmodell und technische Entscheidungen | 3–5 PT |
| S1 Kern | Repo, Login, Mandant/Abteilung/Projekt, Rollen, Board, Audit, Budgetbasis und Visual Foundation | 10–13 PT |
| S2 Engine | Queue, Worker, Sperren, Checkpoints, Gates, Zählungen, Scheduler, Budgetstopp und Live-Events | 10–12 PT |
| S3 Anbindungen I | Connector-Protokoll und Docker-Image, Secret-Tresor, REST/GraphQL, MCP, SQL, NFS/SMB und erste Plattformanbindungen | 15–20 PT |
| S4 Agenten | Orchestrator, Profile, Audit-Agent, produktive Vorlagen und Swarm Layer | 10–14 PT |
| S5 Web/Content | Bausteine, Vorschau, CMS/statische Ausgabe und PR-Flow | 10–14 PT |
| S6 Sicheres Schreiben | Änderungssätze, Vier-Augen-Prinzip, Snapshot, Undo/Redo und Prod-Gates | 8–10 PT |
| S7 Ausbau | E-Mail, weitere Datenbanken/APIs, zusätzliche Projekte und Berichte | laufend |

Die Phasen bauen aufeinander auf. S1 beginnt unabhängig von einer konkreten Fachanbindung; TechHub kann später als eine der ersten Referenzanbindungen dienen.

## 17. Abnahmekriterien

- Ein neues Projekt lässt sich ohne Änderung am AgentOne-Kern anbinden.
- Eine Frage aus einem Lauf erscheint im Board und ihre Antwort setzt den Schritt ohne Chat-Weiterleitung fort.
- Schreiben oder Deployen ist ohne gültige, zum aktuellen Hash passende Freigabe technisch unmöglich.
- Ein Neustart setzt einen Lauf am letzten sicheren Checkpoint fort.
- Jeder Lauf zeigt erwartet, erfolgreich, übersprungen und fehlerhaft mit Gründen.
- Der Budgetstopp pausiert bei 100 % und der Lauf kann nach einer Erhöhung weiterlaufen.
- Undo stellt einen angewandten Änderungssatz nachweislich wieder her.
- Agenten sehen keine Zugangsdaten; Logs und Artefakte bestehen einen Secret-Scan.
- Mindestens zwei unterschiedliche Projekte und mehrere Anbindungstypen laufen über dieselbe Engine.
- TechHub kann entfernt oder ersetzt werden, ohne Kernfunktionen zu beeinträchtigen.
- Die Galaxy-Ansicht zeigt denselben fachlichen Zustand wie Listen und Details, ohne erfundene Aktivität.
- Jeder sichtbare Knoten ist per Klick und Tastatur erreichbar und besitzt eine vollständige Detailansicht.
- Die Ansicht bleibt bei vielen parallelen Läufen flüssig und ist mit reduzierter Bewegung vollständig nutzbar.
- Der interne Connector benötigt keinen eingehenden Internet-Port und akzeptiert nur signierte, nicht abgelaufene Capability-Aufträge.
- Eine kompromittierte Capability kann weder andere Zielhosts noch andere Pfade, Tabellen oder Methoden erreichen.
- Das Trennen oder Sperren eines Connectors beendet dessen Zugriff sofort, ohne andere Projekte zu beeinträchtigen.
- Wiederanlauf, Zertifikatsrotation, Secret-Rotation und ein Offline-Szenario sind getestet und auditiert.
- Mindestens drei Agenten können parallel an einem Lauf arbeiten, Artefakte versioniert übergeben und anschließend durch einen getrennten Audit-Agenten zusammengeführt werden.
- Widersprüchliche Agentenergebnisse erzeugen einen sichtbaren Konflikt und werden nicht still überschrieben.
- Jede Workflow-Welt zeigt ihren eigenen AgentOne als Kern; außerhalb einer gewählten Welt gibt es keinen AgentOne mit pauschalem Zugriff.
- Ein Workflow-Chat zeigt konsistent Aufgaben, Agenten, Connectoren, Übergaben, Gates, Merge, Push und Abschlussbericht desselben Workflow-Kontexts.

## 18. Offene Entscheidungen

1. Name und interne Adresse der Plattform.
2. Externer Secret-Tresor oder verschlüsselte Ablage in PostgreSQL.
3. Budgetzeitraum und Verteilung auf Abteilungen/Projekte.
4. Erste Referenzprojekte und Reihenfolge der Anbindungen.
5. Umfang der E-Mail-Anbindung und Datenschutz-/Maskierungsregeln.
6. Welche AgentOne-Tools zusätzlich als MCP-Server angeboten werden.
7. Primäres Ziel für Web-Inhalte: CMS, statische Seiten oder Git-PR.
8. Markenstil der Galaxy: technisch-kosmisch, organischer Schwarm oder eine Mischung mit Pixel-Ästhetik.
9. Interner Host und Coolify-Projekt für den ersten AgentOne-Connector.
10. Erste freizugebende NFS-/SMB-Pfade, Datenbanken, GraphQL-Hosts und jeweilige Read/Write-Rechte.
11. Zertifikats-/Geräteidentität: eigene interne CA, vorhandene PKI oder verwalteter Identity-Provider.
12. Backup-Ziel, Aufbewahrungszeit und Wiederherstellungsziel für PostgreSQL und Artefakte.

## 19. Konfigurationsdateien

Die lokale Master-Konfiguration liegt in `master/env/.env.master`. Sie enthält sämtliche eindeutigen Werte aus den vorhandenen ENV-Dateien, logisch gruppiert und ohne identische Duplikate. Abweichende Werte mit demselben ursprünglichen Namen werden als gekennzeichnete Quellvarianten erhalten. Die ursprünglichen Dateien bleiben unter `master/env/sources/` erhalten. Alle echten ENV-Dateien und Schlüsseldateien sind über `.gitignore` ausgeschlossen und dürfen nicht committed werden.

## 20. AgentOne Personal

**AgentOne Personal** ist ein eigenständiges Projekt und die persönliche Ergebnis-, Wissens- und Kommunikationsschicht jedes Benutzers. Es ersetzt nicht die Welt-Orchestratoren: Jede Workflow-Welt behält ihren eigenen AgentOne, während der persönliche AgentOne berechtigte Ergebnisse weltübergreifend zusammenführt und Folgeaufträge an die zuständige Welt übergibt.

Die technische Trennung verwendet vier eindeutige Linien:

- `agentone-main` und `agentone-dev` für die Plattform.
- `agentone-personal-main` und `agentone-personal-dev` für den persönlichen Assistenten.

Das ausführliche Konzept steht in [`docs/AGENTONE-PERSONAL.md`](docs/AGENTONE-PERSONAL.md).

## 21. Lokaler Hybrid-Demomodus

Die React-Demo verbindet das PureLink Orbit Grid mit einer Node-API. Lokaler Demo-, Session- und Auditstatus liegt in SQLite; das Coolify-Deployment besitzt zusätzlich je Dienst eine getrennte PostgreSQL-17-Datenbank für Runtime- und Plattformdaten. Vorhandene Integrationen können sichere Lese-/Healthchecks ausführen; fehlende oder gesperrte Dienste werden schemaidentisch simuliert. Jeder Adapter zeigt `LIVE`, `SIMULATED`, `DEGRADED` oder `DISABLED`. Production-Schreibzugriffe sind technisch blockiert.

Start:

```bash
npm install
npm run demo
```

Lokal ist die Anwendung ausschließlich unter `http://127.0.0.1:4173` erreichbar. Der separat geschützte Hetzner-Release wird über Coolify betrieben. Der Funktionsvergleich der untersuchten Open-Source-Projekte steht in [`docs/OPEN-SOURCE-FEATURE-CATALOG.md`](docs/OPEN-SOURCE-FEATURE-CATALOG.md).

Der nachprüfbare Abschluss der ersten 20 Implementierungsphasen steht in [`docs/PHASES-01-20.md`](docs/PHASES-01-20.md). Die Anmeldung unterstützt lokale Demo-Personas sowie Microsoft Entra Authorization Code + PKCE. Sessions sind HttpOnly, administrative Routen rollenbasiert geschützt und das Secret-Inventar gibt ausschließlich Namen und Status zurück.

Die anschließenden Betriebs- und Personal-Connector-Phasen werden fortlaufend in [`docs/PHASES-21-40.md`](docs/PHASES-21-40.md) abgenommen. Mailkonto-Vault, Anbieter-Onboarding, read-only Headerklassifikation und mobile Mailzentrale bilden die abgeschlossenen Phasen 21–24.

Der aktuelle Personal-Ausbau mit VOLLGAS/SAFE, RGB-Licht, Spotify/Sonos, Gmail-App-Passwort, Apple-Companion, persistentem Audit und Live-PWA-Abnahme steht in [`docs/PHASES-41-60.md`](docs/PHASES-41-60.md).

Der verifizierte Hetzner-/Coolify-Deploy mit getrennten PostgreSQL-Datenbanken und dem eigenständigen OpenClaw-basierten Personal-Gateway ist in [`docs/DEPLOYMENT-HETZNER.md`](docs/DEPLOYMENT-HETZNER.md) dokumentiert.

## 22. Konfigurationsdateien

Die konsolidierte lokale Master-Konfiguration liegt unter `master/env/.env.master`. Frühere ENV-Dateien bleiben unverändert unter `master/env/sources/` erhalten. Beide Bereiche sind von Git ausgeschlossen; `master/env/.env.example` dokumentiert ausschließlich Namen ohne Werte.

