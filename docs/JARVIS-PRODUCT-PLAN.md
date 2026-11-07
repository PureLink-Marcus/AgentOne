# AgentOne Personal · JARVIS-Produktplan

Stand: 7. November 2026

Dieses Dokument macht aus den bisherigen Einzelfunktionen einen persönlichen
Assistenten mit einem geschlossenen Arbeitskreislauf:

```text
beobachten -> einordnen -> erklären -> vorschlagen -> freigeben -> ausführen
      ^                                                        |
      +---------------- Feedback und Lernen -------------------+
```

**JARVIS ist das Nutzungserlebnis von Günni oder Fressi, kein zusätzlicher
Server und kein weiterer Produktname.** AgentOne bleibt Produkt und Control
Plane. OpenClaw bleibt die persönliche Runtime für Kanäle, Sitzungen, Tools und
Plugins. Hermes- und OpenJarvis-Ideen werden nur dort übernommen, wo sie eine
nachweisbare Lücke schließen.

## Warum es so viele Jarvis-Projekte gibt

`Jarvis` ist ein popkultureller Gattungsname und kein technischer Standard.
Gleichnamige Projekte haben deshalb weder einen gemeinsamen Quellcode noch ein
gemeinsames Plugin- oder Datenmodell. Ein Vergleich nur nach Namen oder
GitHub-Sternen wäre irreführend. Für AgentOne zählen stattdessen:

- aktive Wartung und nachvollziehbare Lizenz;
- klare Sicherheits- und Berechtigungsgrenzen;
- nutzbare Architektur statt einer langen Feature-Liste;
- lokaler Betrieb und Datenhoheit;
- reproduzierbare Tests für Tools, Memory und Lernschleifen.

GitHub-Sterne sind lediglich ein Sichtbarkeitsindikator. Am 7. November 2026
zeigt GitHub ungefähr 394.000 Sterne für OpenClaw, 261.000 für Hermes Agent,
17.600 für Leon und 13.700 für OpenJarvis. Daraus folgt **keine** Aussage über
aktive Installationen oder Produktionsreife.

## Architekturentscheidung

| Ebene | Produkt/Komponente | Verantwortlich für | Nicht verantwortlich für |
|---|---|---|---|
| Produkt und Policy | AgentOne Platform | Benutzer, Welten, Workflows, Rechte, Audit, Freigaben und Deployment | persönliche Kanal-Sessions |
| persönlicher Assistent | AgentOne Personal | Günni/Fressi, Inbox, Tagesbild, Signale, Memory, Feedback und Freigaben | beliebige autonome Selbständerung |
| Runtime | OpenClaw | Sessions, Channels, Voice, Tools, Plugins, Skills und Modellprovider | kanonische fachliche Datenhaltung |
| Lernschleife | AgentOne Learning Lab nach Hermes-Muster | Skill-Kandidaten, Evaluation, Diff, Review, Freigabe und Versionierung | ungeprüftes Schreiben in produktive Skills |
| Local-AI-Sidecar | optional OpenJarvis/Ollama | lokale Inferenz sowie Kosten-, Latenz- und Energieevaluation | zweites Benutzer- oder Memory-System |
| Geräte-/Voice-Referenz | Leon | Wake-Word-, Controlled-/Smart-/Agent-Modi und begrenzter Proactive Pulse | zusätzliche dauerhafte Runtime |

Es wird **kein kompletter Hermes-, Leon- oder OpenJarvis-Stack parallel zu
OpenClaw installiert**. Doppelte Gateways würden Sessions, Secrets, Memory,
Fehleranalyse und Updates vervielfachen.

## Gap-Matrix: Was übernommen wird

| Quelle und Idee | Entscheidung | AgentOne-Modul | Sicherheitsgrenze | Abnahmekriterium |
|---|---|---|---|---|
| Jarvis Institute: ein Agent erledigt Aufgaben, sichtbare Toolkette, Text und Voice teilen Kontext | übernehmen | `Jarvis Command Stream` | jeder Toolschritt zeigt Ziel, Recht, Modus und redigiertes Ergebnis | eine Mail-/Kalenderanfrage erscheint als zusammenhängender Lauf mit Ergebnis statt als tote Kachel |
| OpenClaw: Tool-, Skill- und Plugintrennung mit Policyfiltern | beibehalten | `Runtime Capability Registry` | Tools werden nach Instanzprofil, Konto, Scope und SAFE/VOLLGAS gefiltert | nicht eingerichtete oder verbotene Tools sind nicht ausführbar und erklären den Grund |
| Hermes: kleine dauerhafte Fakten in Memory, längere Verfahren als bedarfsgeladene Skills | übernehmen | `Memory & Skill Boundary` | Herkunft, Scope, Sensitivität, Ablaufdatum und Löschbarkeit sind Pflicht | ein Verfahren bläht den Chatkontext nicht auf; ein Fakt ist such- und löschbar |
| Hermes: Agent schlägt Skills vor, zeigt Diff, Benutzer genehmigt; Locks schützen kuratierte Skills | angepasst übernehmen | `AgentOne Learning Lab` | kein Agent darf eigene Skill-Änderungen selbst genehmigen; signierte Versionen und Rollback | erfolgreicher Lauf erzeugt Kandidat, Test und Diff; erst Human Gate aktiviert ihn |
| Hermes: Nutzungsdaten für aktiv/veraltet/archiviert und Curator-Backups | übernehmen | `Skill Lifecycle` | Telemetrie enthält keine Nutzdaten oder Prompts | ungenutzter Skill wird vorgeschlagen, aber nie automatisch gelöscht |
| OpenJarvis: Morning Digest aus Mail, Kalender, Gesundheit und Nachrichten | übernehmen | `Personal Briefing` | Quellen pro Abschnitt sichtbar; Health nie als Diagnose | Tagesbriefing enthält neue relevante Mails, Termine, Erholung/Belastung und Konflikte mit Zeitstempel |
| OpenJarvis: on-demand, scheduled und continuous agents | angepasst übernehmen | `Personal Jobs` | feste Laufzeit-, Kosten- und Quellenlimits; ruhige Zeiten; abschaltbar | Monitor überlebt Neustart, dedupliziert Hinweise und lässt sich sofort pausieren |
| OpenJarvis: lokale/Cloud-Routen nach Qualität, Kosten, Latenz und Energie bewerten | übernehmen | `Model Router & Eval` | sensible Rohdaten bleiben lokal, sofern keine explizite Cloudfreigabe besteht | Routerentscheidung und Messwerte sind sichtbar; deterministische Triage braucht kein LLM |
| OpenJarvis: Skills aus mehreren Ökosystemen importieren und benchmarken | nur als geprüfter Import | `Skill Intake` | Lizenz, Herkunft, statischer Scan, Tool-Allowlist, Sandbox und Tests vor Installation | unbekannte oder unlizenzierte Pakete werden blockiert; Import erzeugt SBOM/Provenienz |
| Leon: `controlled`, `smart`, `agent` als Ausführungsmodi | übernehmen | `Execution Mode` | `controlled` nur deterministisch; `smart` darf nur risikoarm wählen; `agent` braucht Gates für Schreiben | derselbe Wunsch zeigt gewählten Modus und wechselt bei Risiko automatisch in Freigabe |
| Leon: geschichtetes Memory und begrenzter Proactive Pulse | übernehmen | `Context Layers` und `Pulse` | Tageskontext verfällt; dauerhafte Fakten benötigen Herkunft; Benachrichtigungsbudget | keine Hinweisflut, kein Cross-User-Leak, Ruhezeiten und negative Rückmeldung wirken |
| Leon: Computer-/Browserwerkzeuge erst bei Bedarf laden | übernehmen | `Progressive Tool Surface` | kein permanenter Vollzugriff; sichtbare Session und Zielbindung | Browsertool ist außerhalb eines bestätigten Laufs nicht verfügbar |
| Jarvis Institute: proprietäre UI, Texte und Assets | nicht übernehmen | nur UX-Referenz | keine Marken- oder Codeübernahme | eigenes AgentOne-Branding und eigene Implementierung |
| autonome Selbstmodifikation oder stilles Dauer-Memory | ablehnen | — | kein ungeprüftes produktives Schreiben | Sicherheits- und Löschtests beweisen die Grenze |

## Die produktiven Kernmodule

### 1. Personal Event Ledger

Alle Connectoren schreiben dasselbe unveränderliche Ereignisschema. Das Ledger
ist die gemeinsame Zeitachse für Mail, Kalender, Gesundheit, Standort, Home
Assistant, Aufgaben und Agentenergebnisse.

Pflichtfelder:

```text
event_id · user_id · source · source_account · source_event_id
occurred_at · ingested_at · type · summary · structured_payload
provenance · sensitivity · consent_id · confidence · dedupe_key
```

Rohdaten bleiben in ihrem geschützten Quellspeicher. Das Ledger enthält nur die
für Analyse und Anzeige nötigen normalisierten Felder. Erneuter Import derselben
Quelle darf kein zweites Ereignis erzeugen.

Implementierungsstand: `server/personal-event-ledger.mjs` stellt den isolierten
SQLite-Kern bereit. Er erzwingt Benutzertrennung, unveränderliche/idempotente
Ereignisse, Größenlimits, Retention sowie Export und Löschung je Quelle.
Mail-Bodies, HTML, Auth-Header, Cookies, Tokens, Passwörter und Rohinhalte werden
bereits an der Ledger-Grenze abgewiesen. Die produktive Connector-Verkabelung
folgt erst nach dem Google-Sync, damit genau ein kanonischer Schreibpfad entsteht.

### 2. Personal Signal Engine

Die Signal Engine verbindet Ereignisse deterministisch, bevor ein Modell sie
sprachlich zusammenfasst. Beispiele:

- wichtige Mail einer echten Person kollidiert mit einem Termin;
- Termin beginnt früher als anhand von Standort und Fahrzeit sinnvoll;
- WHOOP meldet niedrige Recovery und der Kalender enthält einen belastenden Tag;
- Schlafdauer, Ruhepuls oder HRV weichen vom persönlichen rollenden Basiswert ab;
- wiederkehrender Newsletter wird zuverlässig gebündelt statt einzeln gemeldet;
- Home Assistant erkennt Anwesenheit, aber ein geplanter Außer-Haus-Termin läuft.

Jedes Signal enthält Regel, Zeitfenster, verwendete Quellen, Konfidenz,
Gegenbelege und den Grund seiner Priorität. Gesundheitssignale sind Hinweise und
keine Diagnose oder Therapieempfehlung.

### 3. Feedback Loop

Jeder Bericht und jedes Signal bietet mindestens:

- `hilfreich`, `nicht hilfreich`, `falsch`, `später`, `nie wieder so`;
- optionalen Grund und Korrektur;
- sichtbare Auswirkung auf Regel, Priorität oder Memory;
- vollständiges Zurücksetzen erlernter Präferenzen.

Feedback ändert zunächst Profile und deterministische Gewichtungen. Erst ein
wiederholt erfolgreicher Ablauf darf einen **Skill-Kandidaten** erzeugen.

### 4. AgentOne Learning Lab

```text
beobachteter Lauf
  -> Kandidat mit Herkunft
  -> Secret-/PII-/Lizenz-/Toolscan
  -> isolierter Replay-Test
  -> Qualitäts-, Kosten- und Latenzvergleich
  -> lesbarer Diff
  -> Human Gate
  -> versionierter Skill oder Ablehnung
```

Produktive Skills sind signiert, versioniert, sperrbar und zurückrollbar. Ein
Skill darf nur die geprüften Tools und Datenklassen sehen. Der Agent kann keinen
Test, Scan oder Human Gate selbst als bestanden markieren.

### 5. Personal Briefing und Command Stream

Die Startseite ist kein Klickportal. Sie beantwortet direkt:

1. Was hat sich seit dem letzten Besuch geändert?
2. Was ist heute wichtig und warum?
3. Welche Konflikte oder Muster wurden erkannt?
4. Was kann Günni jetzt erledigen?
5. Welche Freigabe oder Information fehlt?

Jeder unterstützte Vorschlag startet denselben Command Stream für Text und
Voice. Er zeigt Status, Toolschritte, Quellen, Ergebnis und Fehler. Ein
Rückgängig-, Retry- oder Abbruchpfad wird nur angezeigt, wenn die konkrete
Operation ihn technisch und nachweisbar unterstützt.

#### Release 2026.11.07-92 · Command-Stream Center

Der erste produktnahe vertikale Schnitt umfasst echte, pro Benutzer
persistierte Runs für:

- Personal Briefing;
- IMAP-Verbindungstest und read-only Postfachscan;
- Google Mail-/Kalender-Synchronisation im Read-only-Modus;
- Apple-Health-Import als schreibende Operation.

Der Apple-Health-Import darf erst nach einem serverbestätigten Human Gate
laufen. Die Freigabe ist kryptografisch an den exakten, unveränderten
Payload-Hash gebunden. Die öffentliche Timeline ist eine explizite Allowlist:
Sie enthält Run- und Step-Status, Zeitstempel, Tool, Operation, Rechte, Scopes
sowie retrybezogene Fehlermetadaten, aber niemals Input, Output, Prompts,
Mailinhalte, Gesundheitsrohwerte oder sonstige Rohpayloads.

Release 92 stellt bewusst keine generische Retry-/Cancel-API bereit. Dafür
fehlen noch ein persistentes Effect-Ledger mit atomarem Claim und
Idempotency-Key sowie ein bis zum jeweiligen Connector durchgereichter
Abort-Pfad. Ohne diese Grenzen könnte eine Oberfläche einen Lauf als
abgebrochen anzeigen, obwohl ein externer Seiteneffekt weiterläuft, oder einen
Seiteneffekt beim Retry doppelt auslösen.

**Abnahmestand:** 177/177 automatisierte Tests, Production-Build sowie Chrome
Desktop/Mobil sind bestanden. Die Screenshots liegen unter
`output/playwright/command-stream-release-92-*.png`. Release 92 ist auf beiden
Personal-Instanzen live; Günnis echter IMAP-Scan wurde als sicherer
`OBSERVE → TOOL → RESULT`-Lauf nachgewiesen.

#### Release 2026.11.07-93 · iPhone-Gerätepfad

Der iPhone-Pfad ist kein weiterer Kachel-Platzhalter, sondern ein geschlossener
Pairing-Lebenszyklus: Berechtigungen wählen, Einmalcode erzeugen, Code oder
Fragment-Link ans iPhone übergeben, sicheren Speicher prüfen, Gerät bestätigen,
Status lesen und bei Bedarf widerrufen. Der mobile Companion zeigt HTTPS,
WebCrypto und IndexedDB sichtbar an und erklärt die Installation auf dem
Home-Bildschirm.

Die Infrastruktur trennt reale Client-Adressen auch hinter Coolify/Traefik,
führt zusätzlich ein persistentes benutzergebundenes Fehlversuchslimit und
liefert ein korrektes `Retry-After`. Code-Einlösung, Ablauf und Widerruf sind
atomar; Code und Gerätetoken werden nur einmal ausgegeben. Ein stabiler
Companion-Pepper bleibt ausschließlich in der geschützten Serverumgebung.
HealthKit, EventKit und Hintergrundstandort bleiben bis zur signierten nativen
iOS-App weiterhin ehrlich `PREPARED`.

**Abnahmestand:** 182/182 Tests, Production-Build und Cross-User-Security-Smoke
sind grün. Release 93 läuft auf vier healthy Personal-Containern. Der echte
Günni-Chrome-Smoke bestätigt bei 390 px HTTPS, sicheren Browser-Speicher,
Fragment-Übergabe, Ingest und Widerruf ohne horizontale Überbreite,
Konsolenfehler oder Secret-Leak.

#### Release 2026.11.07-96 · privates Kalender-Abo

Der Kalenderpfad erhält einen dauerhaft nutzbaren read-only Zugang ohne eigene
OAuth-App. Benutzer können einen privaten `https://`- oder `webcal://`-Link
verbinden, sofort manuell synchronisieren und den letzten beziehungsweise
nächsten Lauf sehen. Der Server speichert den Link ausschließlich
benutzergebunden und AES-256-GCM-verschlüsselt; Browser, öffentliche API,
Audit, Logs und Screenshots erhalten nur Status, gekürzten Endpoint-Hash,
Zähler und Zeitpunkte.

Der Hintergrundlauf prüft fällige Feeds alle fünf Minuten und synchronisiert
im Normalfall alle 15 Minuten. Fehler führen zu exponentiellem Backoff und
`DEGRADED`, ohne den letzten gültigen Kalenderstand zu verwerfen. DNS wird
einmal öffentlich validiert und die geprüfte IP für TLS gepinnt; interne,
lokale und sonstige nicht öffentliche Ziele, Redirects und übergroße Antworten
werden abgewiesen.

**Abnahmestand:** 207/207 Tests und Production-Build sind grün.
Der echte mobile Chrome-Smoke bei 390 × 844 px bestätigt Webcal/HTTPS, sofort
geleertes Secret-Feld, manuellen Sync, iCloud-/Google-/Outlook-Anleitungen,
mindestens 44 px Touchziele, keine Überbreite und 0 relevante
Konsolenfehler. Ein persönlicher Feed ist noch nicht `LIVE`, bis der Benutzer
seinen Link eingibt. Release 96 ist auf vier healthy Fressi-/Günni-App-/Access-
Containern live; PWA und Kalenderoberfläche sind auf den öffentlichen Domains
geprüft. Dieser Webpfad behauptet weder native
EventKit-/HealthKit-Funktionen noch eine Safari-/WebKit-Geräteabnahme.

#### Release 2026.11.07-97 · sicherer iPhone-Widerruf

Der mobile Companion schließt den Pairing-Lebenszyklus fail-safe. „Auf diesem
iPhone trennen“ widerruft zuerst die serverseitige Gerätefreigabe und ihre
Ereignisse. Nur nach bestätigtem Erfolg wird der lokale AES-GCM-Tresor
gelöscht. Bei Netz- oder 503-Fehler bleibt der verschlüsselte Token für einen
sicheren Retry erhalten; ein bereits serverseitig widerrufener Token kann
lokal bereinigt werden.

Für den Wechsel vom Desktop zum iPhone liefert die authentifizierte Instanz
einen `no-store` SVG-QR mit CSP/CORP. Er kodiert ausschließlich den
normalisierten `PUBLIC_ORIGIN` plus `/iphone`; Query, Fragment, Pairing-Code
und Gerätetoken sind ausgeschlossen. Die Einrichtung ist in Oberfläche,
README und Download-ZIP einheitlich: Safari öffnen, teilen, zum Home-Bildschirm
hinzufügen, die installierte App starten und den sechsstelligen Code manuell
eingeben.

**Abnahmestand:** 210/210 Tests, Production-Build sowie der vollständige lokale
und Günni-Live-Chrome-Pairing-Flow sind grün. Bei 390 px beträgt die kleinste
Touchhöhe 54 px; es gibt keine relevanten Konsolenfehler und keinen
Secret-Leak. Release 97 läuft auf vier healthy privaten Containern und die PWA
ist auf drei Domains bestätigt. Dies ist keine reale Safari-/WebKit- oder
native EventKit-/HealthKit-Abnahme.

## Priorisierte vertikale Lieferpakete

Die Reihenfolge maximiert echten Nutzen und hält externe Freigaben aus dem
kritischen Pfad.

### Paket A — Mail zu Tagesbild

- Gmail/IMAP inkrementell und idempotent synchronisieren;
- echte Personen, Newsletter, Transaktionen, Systemmeldungen und Spamverdacht
  deterministisch unterscheiden;
- Threads, Absenderbeziehungen, Handlungsbedarf und Fristen normalisieren;
- Tagesbriefing und Feedback speichern;
- Entwurf getrennt vom Versand und hashgebunden freigeben.

**Fertig**, wenn ein reales Postfach nach erneutem Sync keine Duplikate erzeugt,
Fehler eine konkrete Ursache zeigen und das Tagesbild auf jede Quelle verlinkt.

### Paket B — Kalender und realistische Planung

- pro Google-/CalDAV-/Apple-Konto auswählbare Mail-, Kalender- und Aufgabenrechte;
- inkrementeller Kalender-Sync, Zeitzonen und Serienereignisse;
- freie Fokusblöcke, Konflikte, Fahr-/Vorbereitungszeit und Mailfristen;
- nur Vorschläge; Verschieben oder Erstellen erst nach hashgebundener Freigabe.

**Fertig**, wenn derselbe Termin nach Zeitzonen-/Serien-Sync identisch bleibt und
ein Konflikt mit belegtem Grund angezeigt wird.

### Paket C — Health Ledger

- Apple-Health-Export beziehungsweise iOS-Companion als Importpfad;
- WHOOP per OAuth, ausgewählten Scopes und Webhook/Poll-Sync;
- normalisierte Schlaf-, Recovery-, Belastungs-, Aktivitäts-, HRV- und
  Ruhepulsmetriken mit Einheit, Zeitzone, Gerät und Herkunft;
- persönliche Basiswerte und Trends ohne medizinische Diagnose;
- Einwilligung, Export, Löschung und Connector-Widerruf.

**Fertig**, wenn erneuter Import dedupliziert, Einheiten korrekt normalisiert,
Quellen nicht vermischt und jede angezeigte Zahl bis zum Ursprung prüfbar ist.

### Paket D — Muster, Mitteilungen und Pulse

- Regeln über Mail, Kalender und Health Ledger;
- Priorität, Ruhezeiten, Deduplizierung, Abklingzeit und Tagesbudget;
- „Warum sehe ich das?“, Feedback und dauerhaftes Abschalten je Muster;
- PWA-Inbox zuerst; externe Push-/Voice-Kanäle erst nach Opt-in.

**Fertig**, wenn ein Signal nur einmal erscheint, Feedback die nächste
Auswertung beeinflusst und Ruhezeiten in automatisierten Tests halten.

Der isolierte Kern `server/personal-pulse.mjs` setzt diese Zustellgrenzen bereits
serverseitig um: pro Benutzer und Kanal idempotente Notification-Keys, maximal
drei neue Signale je lokalem Tag, Attention-vor-Info-Priorisierung und
Ruhezeiten. In-App-Hinweise bleiben während der Ruhezeit sichtbar; PWA, ntfy
und Telegram werden nur außerhalb der Ruhezeit und nach explizitem Kanal-Opt-in
eingeplant. Verlauf und Reset sind strikt benutzerisoliert. Die API-/UI-Bindung
erfolgt erst nach dem laufenden Google-Sync, damit keine parallelen Änderungen
am Demo-Server kollidieren.

### Paket E — kontrolliertes Lernen und lokale Modelle

- Hermes-inspirierter Skill-Kandidat-, Diff-, Lock- und Rollback-Prozess;
- OpenJarvis-inspirierte Benchmarks für Qualität, Kosten, Latenz und Energie;
- lokale Health-/Mail-Klassifikation ohne Cloud als bevorzugter Pfad;
- Cloud-Fallback nur mit sichtbarer Datenklasse und Freigabe.

**Fertig**, wenn ein Kandidat ohne Human Gate nicht aktiv werden kann und ein
Regressionstest eine schlechtere Skill-/Modellversion zuverlässig blockiert.

## Datenschutz und Gesundheit

- Gesundheitsdaten bilden eine eigene höchste Schutzklasse.
- Connectorfreigaben erfolgen getrennt nach Quelle und Datentyp; „alles“ ist
  kein zulässiger Default.
- Rohdaten, Tokens und Mailinhalte gelangen weder in Auditlogs noch in
  Benachrichtigungstexte auf dem Sperrbildschirm.
- Modelle erhalten nur die minimal nötigen Ausschnitte und niemals pauschal das
  vollständige Health- oder Mailarchiv.
- Jede Zusammenfassung nennt Zeitraum, Quelle, fehlende Daten und Unsicherheit.
- Der Assistent erkennt keine Krankheiten und ersetzt keine medizinische
  Beratung. Auffälligkeiten werden neutral beschrieben; bei akuten Beschwerden
  verweist die UI auf professionelle beziehungsweise Notfallhilfe.
- Nutzer können einzelne Ereignisse, einen Zeitraum oder eine komplette Quelle
  exportieren und löschen. Abgeleitete Signale werden dabei ebenfalls entfernt
  oder neu berechnet.

## Was zuerst sichtbar werden muss

1. Ein gemeinsames Tagesbild aus echten Mail- und Kalenderdaten.
2. Ein Command Stream, der Ausführung und Fehler verständlich zeigt.
3. Feedback auf jedes Ergebnis und nachweisbare Wirkung dieses Feedbacks.
4. Ein Health-Import mit Herkunft, Basiswerten und Trends.
5. Ein Pattern Feed mit wenigen, begründeten und abschaltbaren Hinweisen.

Damit wird AgentOne Personal nicht durch mehr Kacheln zu JARVIS, sondern durch
einen überprüfbaren Kreislauf aus Daten, Kontext, Handlung und Lernen.

### Release 2026.11.07-94 · Heute & Planung

Der erste Punkt ist jetzt als produktiver Kreislauf sichtbar: **Heute &
Planung** verbindet den minimierten Kalenderbestand mit dem bestehenden
Mail-Briefing. Konflikte und freie Arbeitsfenster werden ausschließlich auf dem
Server berechnet; die PWA übernimmt keine eigene Schattenlogik. Jede Karte
führt zur zuständigen Quelle. `NOT_CONNECTED`, `DEGRADED` und Fehler bleiben
sichtbar und erzeugen keine erfundenen Termine oder freien Zeiten.

Google-Synchronisation ersetzt ihren eigenen Ledger-Snapshot benutzergebunden.
ICS kann als Datei oder über einen SSRF-geschützten öffentlichen HTTPS-Feed
eingelesen werden. Feed-URL und Freigabetoken werden nicht gespeichert oder
zurückgegeben; nur ein Endpoint-Hash bleibt als Provenienz.

Parallel ist der nicht-medizinische Apple-Health-/WHOOP-Vergleich verdrahtet.
Er hält Quellen und inkompatible Messmethoden getrennt, nennt Abdeckung und
Konfidenz und liefert keine Diagnose, Therapie- oder Medikamentenempfehlung.
Ohne persönliche Daten zeigt die Oberfläche weiterhin nur `READY`.

### Release 2026.11.07-95 · Health & Recovery und iPhone-Recovery

Der Quellenvergleich ist jetzt als sichtbare **Health-&-Recovery-Zentrale**
verdrahtet. Apple Health und WHOOP besitzen getrennte Karten, Messwertzahlen,
Abdeckung und Status. Nur gleicher Tag, gleiche Einheit und gleiche Methode
werden verglichen. HRV-SDNN/RMSSD und Körper-/Hauttemperatur erscheinen als
bewusst getrennte Verfahren. Die Konfidenz ist ausschließlich eine Aussage zur
Datenabdeckung und ausdrücklich kein Gesundheitswert. Ein synthetischer,
personenfreier Chrome-Flow importiert Apple-Daten, zeigt den Vergleich und
löscht Testwerte und Freigaben anschließend wieder.

Der Web-Companion behandelt nun auch den realen Lebenszyklus mehrerer Geräte.
Ein neuer gültiger Code bleibt als `PAIRING` sichtbar, selbst wenn ein älteres
iPhone verbunden ist. Auf iOS darf nur die installierte Home-Screen-PWA einen
Code bestätigen; eine gewöhnliche Safari-/In-App-Ansicht entfernt das
URL-Fragment sofort und verbraucht den Code nicht. Gerätetokens bleiben
AES-GCM-verschlüsselt, ein fehlender Wrap-Key ist fail-closed, und ein Fehler
beim lokalen Speichern widerruft die gerade erzeugte Serverfreigabe soweit
möglich sofort über einen tokengebundenen Self-Revoke-Pfad.

**Abnahmestand:** 198/198 Gesamttests, 26/26 fokussierte
Companion-/API-/Proxy-Tests, Pairing-Security-Smoke, Production-Build sowie
lokale Google-Chrome-Smokes bei 390 px sind bestanden. Die iOS-Grenze wurde in
Chrome mit iPhone-UA und simuliertem Standalone-Modus geprüft; dies ist keine
echte WebKit-, Safari- oder native HealthKit-Abnahme. Release 95 ist inzwischen
auf vier healthy Fressi-/Günni-App-/Access-Containern ausgerollt. Die PWA ist auf
PureLink, Fressi und Günni verifiziert; Günnis HTTPS-iPhone-Webflow einschließlich
Vault-Rollback und Cleanup sowie Connectoren, Home, Mail, Command Stream,
Planung, Jarvis und Chat/Voice-Text sind live ohne Secret- oder Inhaltsleck
bestanden.

### Release 2026.11.07-96 · verschlüsseltes Kalender-Abo

**Heute & Planung** kann einen privaten Kalender nun dauerhaft read-only
beziehen, ohne den Feed-Link an die PWA zurückzugeben. Die Oberfläche trennt
Kalenderlink und Dateiimport, zeigt iCloud-/Google-/Outlook-Hilfe und erlaubt
manuellen Sync sowie vollständiges Entfernen. Im Hintergrund sichern
AES-256-GCM, Zweckbindung, Benutzertrennung, DNS-Pinning, SSRF-Schutz,
15-Minuten-Takt und Backoff den Datenweg. Bei Fehlern bleibt der letzte
erfolgreiche Snapshot verfügbar und wird ehrlich als `DEGRADED` markiert.

Release 96 ist mit 207/207 Tests, Production-Build und echtem Chrome bei
390 × 844 px abgenommen und auf vier healthy Fressi-/Günni-App-/Access-
Containern live. Der Source-Commit ist `a45b299`; das secret-freie Archiv hat
SHA-256 `4ad57121ad71c3f567ff0ca92fb2ec2c80cefcbec1285bfdce57ae4ad3499dfd`,
das Image den Digest
`sha256:4373daf420933e06715a602d0059ac7d297adf1b5ff57b1a05ca6b614ccd0463`.
PWA auf drei Domains, kompletter iPhone-Webflow, Kalenderoberfläche,
Connectoren, Home, Mail, Command Stream, Kommunikation, Planung und Jarvis
sind live geprüft. Bis zur Eingabe eines persönlichen Links bleibt Günni
ehrlich `NOT_CONNECTED`. EventKit, HealthKit und native Safari-/WebKit-Abnahme
bleiben separate Apple-Arbeitspakete.

### Release 2026.11.07-97 · Self-Revoke und iPhone-Scan

Der Web-Companion kann eine Geräteverbindung nun ohne verwaiste
Serverfreigabe trennen: Server-Widerruf und Ereignislöschung kommen vor dem
lokalen Vault-Cleanup, während temporäre Provider-/Netzfehler den Token für
einen Retry erhalten. Der Instanz-QR enthält ausschließlich die secret-freie
Basis-Seite `/iphone`; CSP, CORP, Authentifizierung und `no-store` schützen den
SVG-Pfad. Die iOS-Anleitung beschreibt die zwingende Home-Screen-Installation
vor der manuellen Codeeingabe.

Release 97 ist lokal und live mit 210/210 Tests, Production-Build und echtem
Chrome bei 390 px abgenommen: QR-Base, Installationsgrenze, Pairing, Status,
Ingest, Reload, Self-Revoke-Retry, Recovery und Vault-Rollback; mindestens 54 px
Touchhöhe, 0 relevante Konsolenfehler und keine Secrets in QR, URL, DOM,
Storage, Screenshot oder Logs. Source-Commit `754faf5`; secret-freies Archiv
`output/demo/agentone-release-2026.11.07-97.tgz`, SHA-256
`972cc4e432eed59ab03170b7a6945969d37e27aad362d97e8ed14670743d0762`;
Image-Digest
`sha256:1e1256033cd9d8d2dc7bd09a4f2bd7feed8e2df08e5ad642383cdb6ebd2d75ac`;
vier private Container healthy. PWA auf drei Domains, OpenClaw-Plugins 68/68,
Home 345/15/275, Mail, Command Stream, Kommunikation, ICS `NOT_CONNECTED`,
Jarvis und Planung samt Cleanup sind live geprüft; Runtime und redigierter
Audit sind healthy. Reales Safari/WebKit sowie EventKit/HealthKit bleiben
offen.

### Release 2026.11.07-98 · Push-to-talk mit gestreamter Antwort (**PASS LIVE**)

Jarvis Core erhält einen belastbaren vertikalen Sprachpfad: bewusste
Mikrofonaufnahme ab einer Sekunde, `gpt-transcribe`, sichtbares und standardmäßig
aktives Auto-Send sowie eine progressive NDJSON-Modellantwort. Vollständige
Sätze werden während des Streams über die lokale Gerätestimme ausgegeben;
Transkription und KI-Nutzung bleiben dagegen abhängig vom gewählten
Modelltarif. Audio wird nicht in Memory oder Browser-Storage übernommen.

Der Pfad ist gegen Doppel-Senden, erneute Aufnahme während einer laufenden
Antwort, Clientabbruch, leere beziehungsweise vorzeitig beendete Streams und
rohe Providerfehler gehärtet. Der Audit speichert nur Betriebsmetadaten. Eine
synthetische, reproduzierbare WAV-Fixture wurde vor dem Rollout zweimal gegen
Release 97 und nach dem Rollout erfolgreich gegen Release 98 verarbeitet. Die
Live-Abnahme meldet vier semantische Treffer in 1319 ms, ohne Audio, Transkript
oder Schlüssel in Bericht und Access-Log zu schreiben. Chrome bestätigt Chat
HTTP 200 über Luna, den NDJSON-Antwortstream, die erneute Freigabe des
Mikrofonbuttons, Stefan als lokale Stimme, den Ausschluss von `Anna` und
0 Konsolenfehler.

**Abnahme:** 211/211 Tests, vollständige lokale Verifikation, Build, PWA auf drei
Domains, vier healthy private Container und breite Live-Regression sind grün.
Source-Commit `f15d1ac`, secret-freies Release-Archiv mit SHA-256
`bac50692186f3fe835bb202b6fff0c62554dab9f451560b28e1f9a93f7d85ce0` und Image
`purelink/agentone:2026.11.07-98` mit Digest
`sha256:35a93b83bdfba82439ebbebfd3e4804a9309e02f7c7d1b2827066cb6676ae4e4`
sind dokumentiert. Der Funktionsumfang bleibt Push-to-talk mit gestreamter
Antwort, nicht Full-Duplex-Realtime-Audio oder Wake Word. Echtes Mikrofon,
Safari/WebKit und native iOS-Funktionen bleiben separat abzunehmen.

### Release 2026.11.07-99 · Mail als dauerhafte Jarvis-Quelle (**PASS LIVE**)

Jarvis Core verarbeitet IMAP nicht mehr als vergänglichen 50er-Snapshot. Ein
UID-/UIDVALIDITY-Cursor, atomare Metadatenablage, Deduplizierung,
15-Minuten-Scheduler, begrenzter Backoff und Retention liefern eine restartfeste
Quelle für Tagesbild, Pulse und Briefing. Der Fetch fordert nur Envelope,
Flags, Größe, Thread-ID und allowlistete Klassifikationsheader an; Bodies,
Snippets, Anhänge und Roh-Header bleiben technisch ausgeschlossen.

Das neue Mail Review Center ist eine echte Ergebnisansicht: Konto- und
Kategoriefilter, Suche, Paging, Thread-Detail, Unread-/Prüfstatus, Konfidenz,
erklärbare Signale und der vorhandene hashgebundene Antwortentwurf. Es zeigt
Cursor, neue und deduplizierte Datensätze sowie letzten und nächsten Lauf. Bei
einem Syncfehler bleibt der letzte gültige Bestand sichtbar. SMTP wird nur
verifiziert; Senden, Verschieben und Löschen bleiben ohne gesonderten
freigegebenen Ausführungspfad unmöglich.

**Abnahme:** 229/229 Tests, Production-Build und API-Smoke sind grün. Günni
hält 500 reale Metadatensätze; der direkt folgende inkrementelle Lauf holte
0 neue Datensätze, und nach vollständiger Containerrotation blieb der Bestand
unverändert verfügbar. Mobile Chrome-Abnahme, redigierter Hetzner-DB-/Logaudit,
PWA, iPhone, Home, Command Stream, Planung, ICS, Voice und Jarvis sind grün.
Source-Commit `c955ae0`, secret-freies Archiv mit SHA-256
`c591f0551f4eef66c30c168fb549421e526a9605acab2b1728676b7921fd4315` und
Image-Digest `sha256:5966bd5e7158961f994d8c2e377ee7e8f8fdd9480348bf902ba6f623cc594d15`
sind dokumentiert.

### Release 2026.11.07-100 · Learning Lab und kontrollierte Jarvis-Skills (**PASS LIVE**)

Das Learning Lab macht aus der Hermes-inspirierten Lernschleife erstmals einen
bedienbaren, aber eng begrenzten Skill-Lebenszyklus. Als einziger ausführbarer
Skill ist `personal-briefing.v1` zugelassen. Mail, Kalender und Health werden
ausschließlich über `mail.read`, `calendar.read` und `health.summary` gelesen;
der Client kann weder zusätzliche Tools noch Verfahren oder Testresultate
einschleusen.

Der Ablauf ist persistent und benutzerisoliert: serverkontrollierter Draft,
deterministische interne Evaluation, Human-Approval des exakten Content-Hash,
separates Human-Gate zur Aktivierung durch den Release Worker, read-only
Ausführung sowie Human-Rollback auf eine nachweislich vorhandene ältere aktive
Version. Die Ausführung wird im Command Stream sichtbar und kann echte,
berechtigte Mail-, Kalender- und Health-Signale kombinieren. Sie verändert
keine Quelle.

Die neue Oberfläche zeigt Lifecycle, Content-Hash, Testattestierung,
Provenienz, letzte Ausführung und ein redigiertes Briefing-Ergebnis. Version 1
weist ehrlich darauf hin, dass noch keine Rollback-Vorversion existiert.
Public API und Audit enthalten keine Procedures, Prompts, Payloads, Evidence,
Rohdaten oder Secrets. Persistierte Guard-, Test-, Approval- und Aktivzustände
werden bei jedem Laden und Ausführen gegeneinander geprüft; manipulierte
Lifecycle- oder Evaluationsdaten werden abgewiesen. Restart-Persistenz,
Benutzertrennung und der vollständige HTTP-Lebenszyklus sind lokal verifiziert.

**Abnahme:** 257/257 Tests, Production-Build, lokaler API-Smoke und Audit mit
0 bekannten Produktions-Schwachstellen sind grün. Günni führte den Skill mit
echten minimierten Mail-Signalen aus; zwei vollständige Containerrotationen
bestätigten Persistenz. Desktop und 390-px-Mobilansicht liefen in Chrome ohne
Konsolenfehler. Source-Commit `6a19ff4`, secret-freies Archiv SHA-256
`2d1288f280ac88875828714e036292cfb2767a9486545e58fb52156c025f2f10`
und Image-ID
`sha256:174f4e2409797336524f9f922989288c231d55449496cd32b8248350f3ee1516`
sind dokumentiert. Frei programmierbare Skills bleiben außerhalb dieses
Releases und benötigen später eine echte Prozess-/Container-Sandbox sowie
serverseitig signierte Attestierungen.

### Release 2026.11.07-101 · direktes iPhone-Safari-Pairing (**PASS LIVE**)

Der reale Pairing-Fehler lag nicht im Companion-Backend, sondern in einer
harten UI-Sperre: normaler iPhone-Safari durfte trotz HTTPS, WebCrypto und
IndexedDB keinen Pairing-Request senden. Release 101 entfernt diese
Standalone-Pflicht. Pairing funktioniert sofort in Safari; die installierbare
Home-Bildschirm-App bleibt als optionaler dauerhafter Startpunkt sichtbar.

Der sechsstellige Code kann aus der Zwischenablage übernommen werden. Ein
Fragmentcode wird vor dem ersten API-Aufruf aus der URL entfernt. Der
Gerätetoken bleibt AES-GCM-verschlüsselt in IndexedDB; Reload, Status,
Self-Revoke, Fehler-Retry, Recovery und Vault-Rollback behalten ihre
fail-safe Reihenfolge. Der QR enthält weiterhin nur die öffentliche
`/iphone`-Basisadresse und weder Code noch Token.

**Abnahme:** 257/257 Tests, lokale Release-Verifikation, Production-Build,
Pairing-Sicherheits-Smoke und echter HTTPS-Chrome-Flow auf Günni sind grün.
Der Ablauf `QR → Safari-Pair → PWA-Pair → Status → Ingest → Reload →
Self-Revoke-Retry → Recover → Vault-Rollback` endete mit 0 Konsolenfehlern,
54-px-Touchzielen und ohne Secret-Leak. Source-Commit `aa1a481`, Archiv
SHA-256 `af8a5c4a4b25b981128ef70cc7a3d23e7eaef094eda3cf47ec5399107d626f75`
und Image-ID
`sha256:6e20cd329733ae65a735c8a9e0a5aa20b6c1195f95560a784c3d5bbaefec16f1`
sind live auf vier healthy privaten Containern ausgerollt.

### Release 2026.11.07-102 · persistente Apple-Health-Importjobs (**PASS LIVE**)

Große Apple-Health-Exporte sind kein synchroner Browser-/HTTP-Block mehr.
XML und ZIP werden bis 512 MiB gestreamt und ausschließlich als AES-256-GCM-
Ciphertext mit benutzer- und jobgebundenem AAD gestagt. Ein getrennter,
zeit- und speicherbegrenzter Child-Worker übernimmt Entschlüsselung, Parser-
Grenzen, ZIP-Bomb-Prüfung, Normalisierung und atomare Persistenz außerhalb des
HTTP-Eventloops. Quelle, Freigabe und Benutzer bleiben strikt gebunden.

Jeder Import besitzt einen persistenten Zustand von `QUEUED` bis
`COMPLETED`, `FAILED` oder `CANCELLED`. Ein Neustart setzt nur nachweislich
intakte Quellen fort. Human Gate und Command Stream machen die Operation
sichtbar; die öffentliche Projektion enthält nur Status, Fortschritt und
sichere Zähler. Abbruch und Commit sind atomar gegeneinander abgesichert, so
dass niemals ein Job als abgebrochen erscheint, dessen Messwerte gespeichert
wurden. Rohwerte, Hash, Consent, Pfad, AAD, IV, Tag und Secrets bleiben
außerhalb von Browser und Audit. Die Analyse bleibt deskriptiv und stellt
keine medizinische Diagnose.

Die mobile Oberfläche zeigt XHR-Uploadfortschritt, Jobphasen, Polling,
Reload-Persistenz und Abbruch. **Lokale Abnahme:** 273/273 Tests,
Production-Build, `verify:local`, npm-Produktionsaudit mit 0 bekannten
Schwachstellen sowie iPhone-Browser- und Security-Regression sind grün. Ein
Chrome-Mobile-Lauf bei 390×844 importierte 35.652.165 Bytes, zeigte denselben
Job nach Reload als `COMPLETED`, speicherte exakt zwei Messwerte und endete
nach Cleanup mit null Testmesswerten. Der isolierte Live-Smoke auf Günni
verarbeitete 35.652.207 Bytes und zwei Messwerte; Cleanup endete bei null
Messwerten und null Freigaben. Source-Commit `ae1c47b`, secret-freies Archiv
`agentone-release-2026.11.07-102.tgz` mit SHA-256
`a86e200f2250264150e178a81a9eff4ddf84aa46f0799e3f47465d6fc0352395`
und Image `purelink/agentone:2026.11.07-102` mit ID
`sha256:28346c687f8ddcff7d4cc08b37aea5e54d71761cf2f5f979539b2a7718dc8826`
sind auf vier healthy privaten Containern ausgerollt. PWA, Voice und der
vollständige iPhone-Pairing-Flow bleiben live grün.

### Release 2026.11.07-103 · WHOOP und belastbarer iPhone-Tresor (**PASS LIVE**)

WHOOP ist als echte persönliche read-only Quelle statt als Demo-Karte
verdrahtet. Ein persistenter, benutzer- und Redirect-gebundener OAuth-State
wird atomar einmal eingelöst; parallele offene States sind begrenzt. Der
Refresh-Token liegt AES-256-GCM-verschlüsselt mit Benutzer-AAD in SQLite,
während Access-Token und Provider-Rohantworten flüchtig bleiben. Zyklen,
Recovery, Schlaf und Workouts werden inkrementell mit Seiten-, Mengen- und
Zeitgrenzen gelesen. Teilerfolg, `429`, Rotation und Providerwiderruf besitzen
ehrliche, öffentliche Zustände. Ohne registrierte WHOOP-App zeigt Jarvis
`NOT_CONFIGURED` und erzeugt keine Beispieldaten. Webhooks bleiben deaktiviert,
bis eine dauerhafte Queue, Deduplizierung und Reconciliation vorliegen.

Der iPhone-Companion blockiert den serverseitigen Confirm nun so lange, bis
der konkrete Browserkontext eine verschlüsselte Probe mit nicht exportierbarem
AES-GCM-Schlüssel nach IndexedDB geschrieben und wieder entschlüsselt hat.
Safari und Home-Screen-PWA sind sichtbar getrennte Tresore; ein Direktlink
erscheint nur auf iOS und bleibt auf derselben Ansicht. Das Codefragment wird
vor jeder Netzwerkanfrage entfernt. Browser- und Speicheroperationen besitzen
begrenzte Zeitüberschreitungen; der Gerätetoken kann nicht mehr kopiert
werden. Die produktive Regression ist standardmäßig read-only, sodass ein
Test keinen vom Benutzer gerade geöffneten Einmalcode mehr ersetzt.

Im letzten vollständigen lokalen Lauf sind 296/296 Node-Tests grün. Die
automatisierte WebKit-Prüfung bestätigt sicheren Kontext, Fragmentbereinigung,
AES-GCM-IndexedDB, nicht exportierbaren Schlüssel, Reload und Self-Revoke. Sie
ersetzt keinen realen iPhone-Safari-/PWA-Hardwaretest. Ebenso bleibt WHOOP bis
zur Registrierung und Autorisierung einer echten Developer App ausdrücklich
nicht `LIVE`. Der gestufte Rollout auf Fressi und Günni, vier healthy Container
sowie die produktive read-only Browserabnahme sind abgeschlossen. Der echte
WHOOP-Providerroundtrip und ein iPhone-Hardwaretest bleiben externe Abnahmen.

### Release 2026.11.07-104 · kontrollierte persönliche Auswertung (**PASS LIVE**)

Mail Insight führt ausschließlich nach einem expliziten Klick einen exakt an
Benutzer, Konto, UID und UIDVALIDITY gebundenen, begrenzten Nachrichtentext zu
einer lokalen deterministischen Analyse. Anhänge und Remote-Bilder werden nicht
geladen; Body und Analyseinput werden nicht persistiert und erscheinen nicht
im Audit. Daraus entstehende Kalenderhinweise bleiben Entwürfe.

Health Trends vergleicht sieben Tage mit der vorherigen 28-Tage-Basis. Quellen
und Metriken, insbesondere HRV, bleiben getrennt; Ergebnisse sind deskriptiv
und nicht medizinisch. Hermes Memory Review behandelt ADD, PATCH und REMOVE als
Provenienz- und Hash-gebundene Kandidaten. Nur ein Mensch darf den exakten
Kandidaten freigeben oder ablehnen.

Die mobile Pairing-Oberfläche heißt eindeutig **Günni Companion · Web-App**.
Sie funktioniert direkt in Safari und optional als Home-Bildschirm-PWA. Das
ZIP ist nur eine Anleitung; eine native HealthKit-/EventKit-/Hintergrund-App
existiert noch nicht. 321/321 Tests, Produktions-Build, mobile
Chrome-/WebKit-/Security-Abnahme und der gestufte Rollout Günni → Fressi sind
grün. Alle vier privaten Container laufen healthy; die neuen Read-Endpunkte
antworten live. Günni zeigt bis zu ausreichenden Gesundheitsdaten ehrlich
`0 TRENDS` statt Beispielwerte zu erfinden.

### Release 2026.11.07-105 · proaktive Briefing-Inbox (**PASS LIVE**)

AgentOne Personal führt persönliche Briefing-Routinen jetzt auch ohne offenen
Browser aus. Der Scheduler besitzt Exactly-once-Claims, Same-day-Catch-up,
Restart-Recovery und einen gemeinsamen read-only Ausführungspfad für geplante
und manuelle Läufe. Jeder Lauf erscheint im Command Stream sowie in der
persistenten Inbox **Seit deinem letzten Besuch** und kann gelesen, zwölf
Stunden zurückgestellt oder ausgeblendet werden.

Die gespeicherte Projektion ist absichtlich kleiner als das Quellmaterial:
Zähler, Quellenstatus und statische freigegebene Hinweise statt Mailbody,
Termindetails, Roh-Health-Werten, PII oder Secrets. Genau das bildet die
Jarvis-Idee „proaktiv und erklärbar“ ab, ohne ein autonomes Klickportal oder
ungeprüfte Mutationen zu erzeugen. Der produktive Günni-Smoke hat einen echten
Lauf samt Command Stream und Inbox-Zustand erzeugt und anschließend vollständig
entfernt. 338/338 Tests und alle vier privaten Release-105-Container sind grün.

## Primärquellen und Lizenzgrenzen

- [Jarvis Institute – Features](https://jarvis.institute/features/) —
  proprietäre UX-Referenz; keine Code- oder Assetübernahme.
- [OpenClaw](https://github.com/openclaw/openclaw) und
  [Tool-/Plugin-Modell](https://github.com/openclaw/openclaw/blob/main/docs/tools/index.md)
  — MIT; Upstream-Code nur über geprüfte, versionierte Updates.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent),
  [Learning Loop](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/index.mdx)
  und [Skills System](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md)
  — MIT; Konzepte werden zunächst eigenständig implementiert, kein zweiter
  Runtime-Stack.
- [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) — Apache-2.0;
  Referenz für Local First, Morning Digest, Agentenmodi und Evaluation.
- [Leon](https://github.com/leon-ai/leon) — MIT; Referenz für Voice,
  geschichtetes Memory, kontrollierte Aktionen und begrenzte Proaktivität.

### Release 2026.11.07-106 · belastbarer Quellen-Datenstand (**MASTER · PASS LIVE**)

Jarvis-artige Proaktivität braucht nicht nur einen Scheduler, sondern einen
nachvollziehbaren Datenstand. Deshalb prüft AgentOne Personal vor jedem
Routine-Briefing IMAP, Google und ICS und aktualisiert nur verbundene,
fällige oder veraltete Quellen. Timeout, paralleler Lauf, User-Isolation und
Teilversagen sind begrenzt; ein Fehler bewahrt den letzten gültigen Snapshot,
statt das gesamte Briefing leer erscheinen zu lassen.

Die Inbox macht den Unterschied sichtbar: `AKTUELL`, `LETZTER STAND`, `NICHT
VERBUNDEN` und `EINGESCHRÄNKT` erscheinen mit letzter erfolgreicher
Synchronisierung und direkter Navigation. Der Command Stream trennt
`source.refresh` von `briefing.build`. Damit wird aus einer bloßen
Ergebnis-Kachel ein erklärbarer Assistentenlauf. 352/352 Tests, Build, mobiler
Chrome-Smoke, gestufter Rollout und produktiver Günni-Quellenlauf sind
bestanden. PWA auf allen drei Domains, private TLS-/Login-Grenzen,
Mail-Mobilansicht und WebKit/iPhone wurden nach dem Rollout erneut geprüft.

