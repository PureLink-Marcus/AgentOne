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
echte WebKit-, Safari- oder native HealthKit-Abnahme. Der Live-Rollout von
Release 95 wird erst nach Container-, PWA- und Domainprüfung als abgeschlossen
markiert.

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

