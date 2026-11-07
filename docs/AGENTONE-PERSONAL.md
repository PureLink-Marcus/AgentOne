# AgentOne Personal

AgentOne Personal ist das eigenständige persönliche Assistenzprojekt innerhalb der AgentOne-Struktur. Die sichtbare Produktidentität bleibt **AgentOne**; Repository und Service heißen **AgentOne-Personal**.

Release `2026.11.07-110` schließt die sichtbare Lernschleife des Assistenten:
quellenübergreifende Muster sind filterbar, öffnen den passenden Arbeitsbereich
und nehmen differenziertes Feedback an. Die Antwort wird usergebunden im
Nudge-/Pattern-Ledger gespeichert und danach aus dem Serverzustand neu
gerendert. Provider-IDs, Rohbelege, Inhalte und Secrets bleiben außerhalb der
Browserprojektion. Der Stand ist auf Fressi und Günni live.

Release `2026.11.07-111` ergänzt den Fokus-Kompass und eine neue
Planungsregel. Mehrere kurze Terminwechsel werden als Fragmentierung erkannt,
ohne Betreff, Ort oder Teilnehmer zu projizieren. Der Kompass priorisiert
aktive Attention-Muster vor Information, zeigt unterdrückte Muster transparent
und führt in den echten Tagesplan. Es bleibt ein Vorschlag: keine automatische
Kalender- oder Mailmutation.

Release `2026.11.07-112` ergänzt ein sichtbares Source Sync Center. Es zeigt
für Postfächer, Google und Kalender-Feeds den letzten sicheren Stand,
Freshness, Backoff und degradierte Zustände. Der Statuspfad ist
nebenwirkungsfrei; die manuelle Aktion führt nur freigegebene read-only
Providerabrufe aus und schreibt den Ablauf in den Command Stream.

## Verantwortungsgrenzen

- AgentOne Platform verwaltet Projekte, Welten, Workflows und zentrale Richtlinien.
- Jede Workflow-Welt besitzt genau einen `world-orchestrator` namens AgentOne.
- AgentOne Personal ist der `personal-agent` eines Benutzers. Er sammelt berechtigte Ergebnisse aus mehreren Welten, führt persönliche Quellen und Memory und verteilt Aufgaben an die zuständigen Welt-Orchestratoren.
- Interne PureLink-Ressourcen werden ausschließlich über den AgentOne Connector angesprochen.

## Benutzer und Isolation

Nach einem zulässigen Microsoft-Entra-Login wird idempotent ein eigenes Personal Gateway provisioniert. Jeder Benutzer erhält eine eigene Runtime, ein eigenes Netzwerk, ein eigenes verschlüsseltes Volume, eigene Quellen, Sessions, Secrets und Kanalverbindungen. Die stabile Entra-`oid` ist die technische Benutzerkennung; `@purelink.de` und `@purelink.com` bilden zusammen mit der Tenant-Prüfung die Zulassungsgrenze.

## Kanäle

V1 stellt Web, Microsoft Teams, Outlook, WhatsApp, Telegram, Slack und Discord als Adapter bereit. Nicht konfigurierte Kanäle verwenden im lokalen Demomodus schemaidentische Simulatoren.

## Dienste, Connectoren und OpenClaw-Plugins

Die Oberfläche trennt zwei technisch unterschiedliche Ebenen:

- **Konten und Geräte** verbinden externe Benutzerquellen wie Gmail, Kalender, Home Assistant, Spotify oder iPhone-Companions. Sie besitzen je Instanz eigene Zugangsdaten, Freigaben und Zustände `LIVE`, `PREPARED`, `DEGRADED` oder `DISABLED`.
- **OpenClaw-Plugins** stellen Werkzeuge, Provider und Kanäle innerhalb der persönlichen Agent-Runtime bereit. Der Katalog wird serverseitig aus der installierten OpenClaw-Registry bereitgestellt; Secret-Werte gelangen dabei nie in den Browser.

Release `2026.11.07-85` betreibt Fressi und Günni mit getrennten Apps, Datenbanken, OpenClaw-Runtimes, Access-Proxys und Volumes. Günni besitzt Command Center, Live-Inbox, Routinen, persistentes Memory, Jarvis Core für Text und Sprache, Home-Assistant-Steuerung, Connector-Governance, sichere Mail-Antwortentwürfe, echten Google-Mail-/Kalender-Sync, Apple-Health-Import sowie einen automatischen, deduplizierten Pulse mit wirksamem Benutzerfeedback. Externe Konten und Geräte benötigen trotz geladener Plugins weiterhin eigene Zugangsdaten beziehungsweise Benutzerfreigaben.

Ein externer Dienst gilt erst nach erfolgreichem Healthcheck als `LIVE`. Das bloße Vorhandensein eines OpenClaw-Plugins oder einer gespeicherten Connector-Freigabe reicht dafür nicht aus.

## Konto und persönlicher Chat

Der öffentliche Einzelbenutzer-Testzugang verwendet ein normales AgentOne-Formular statt Browser-Basic-Auth. Zugangsdaten werden konstant verglichen, Fehlversuche begrenzt und erfolgreiche Anmeldungen als opaque, serverseitig gehashte Secure-/HttpOnly-Session gespeichert. Entra Authorization Code + PKCE bleibt für die spätere Mehrbenutzerfreigabe vorbereitet.

Der persönliche Webchat verwendet serverseitig die OpenAI Responses API. `gpt-6-luna` ist der kostengünstige Standard für Chat, Mail-Triage und häufige Routinen, `gpt-6.1-terra` ist die bewusste Auswahl für Bilder und Dokumente und `gpt-6.1-sol` bleibt komplexen Aufgaben vorbehalten. Deterministische Mail-Gruppierung und Connector-Synchronisation benötigen kein Sprachmodell. Ohne konfigurierten Schlüssel bleibt derselbe Endpoint als sichtbar markierter Simulator verfügbar. Schlüssel, Prompts und Antworten werden nicht im Audit protokolliert; dort erscheinen nur Modus und Modell.

Jarvis Core ist die schnelle Kommunikationsoberfläche von Günni, nicht eine dritte Instanz. Release 98 liefert einen live abgenommenen Push-to-talk-Pfad: Mikrofonzugriff erst nach bewusstem Klick, mindestens eine Sekunde Aufnahme, `gpt-transcribe`, standardmäßig aktives Auto-Send und eine progressive NDJSON-Modellantwort. Vollständige Sätze werden optional über eine lokale Gerätestimme ausgegeben; Stimmen mit dem Namen `Anna` werden nicht angeboten. Nur diese Browser-Ausgabe selbst ist lokal und ohne zusätzliche Sprachsynthese-API-Kosten, während Transkription und Modellantwort nach dem gewählten Modelltarif abgerechnet werden können. Audio wird nicht in Memory oder Browser-Storage persistiert. Clientabbruch, unvollständige Streams und Providerfehler liefern redigierte Zustände statt eines falschen Abschlusses. Live bestätigt sind eine synthetische WAV-Transkription, Chat über Luna, der Antwortstream und die erneute Freigabe der Mikrofontaste; dies ersetzt keinen echten Mikrofon-, Safari-/WebKit- oder nativen iOS-Test und ist kein Full-Duplex-Realtime- oder Wake-Word-System.

Release 99 macht die persönliche Mailquelle zu einem dauerhaften Assistenten-Signal statt zu einer Demo-Kachel. IMAP läuft ausschließlich read-only und speichert pro Benutzer und Konto nur UID, UIDVALIDITY, Thread, Absender, Betreff, Empfangszeit, Flags und erklärbare Klassifikation. Bodies, Snippets, Anhänge und Roh-Header bleiben außerhalb von Fetch, Datenbank, API und Audit. Günni zeigt diesen Bestand im Mail Review Center mit Filtern, Suche, Thread-Detail und Antwortentwurf; der Entwurf bleibt bis zu einer gesonderten Freigabe ungesendet. Der 15-Minuten-Hintergrundlauf nutzt begrenzten Backoff und bewahrt bei Fehlern den letzten gültigen Bestand. Live bestätigt sind 500 reale Metadatensätze, ein unmittelbar leerer Folgelauf, unveränderte Deduplizierung und vollständige Wiederherstellung nach Containerrotation.

Release 100 bereitet das **Learning Lab** als kontrollierte Jarvis-Skill-Schicht
vor. Der erste und bislang einzige ausführbare Built-in-Skill ist
`personal-briefing.v1`; seine feste Read-only-Allowlist umfasst
`mail.read`, `calendar.read` und `health.summary`. Draft, deterministische
serverseitige Evaluation, Exact-Hash-Freigabe, Aktivierung, Ausführung und
Rollback werden benutzerisoliert persistiert. Approve, Activate und Rollback
verlangen jeweils die authentifizierte Benutzer-Session als Human Gate; kein
Agent darf diese Rolle übernehmen. Die aktive Revision verarbeitet echte,
berechtigte persönliche Signale ohne Quellmutation und erscheint als
nachvollziehbarer Command-Stream-Lauf.

Browser und Audit erhalten ausschließlich sichere Governance-Metadaten sowie
die redigierte, für den angemeldeten Benutzer bestimmte Briefing-Antwort.
Verfahren, Prompts, Payloads, Evidence, Mail-/Health-Rohdaten und Secrets werden
nicht öffentlich projiziert oder als Ausführungsnachweis gespeichert.
Lifecycle- und Testattestierung werden auch nach einem Neustart erneut geprüft;
direkt manipulierte Datenbankzustände führen zu einem fail-closed Fehler.
Release 100 ist auf Fressi und Günni live; Günni hat den Skill mit echten
minimierten Mail-Signalen ausgeführt und den Zustand über zwei vollständige
Containerrotationen behalten.

Release 101 entfernt die irrtümliche Standalone-Zwangssperre des iPhone-
Companions. Ein iPhone kann nun direkt in Safari koppeln, wenn HTTPS,
WebCrypto und IndexedDB verfügbar sind. Die Home-Bildschirm-App bleibt für
einen eigenen Startpunkt und getrennten Gerätespeicher empfohlen, ist aber
keine technische Voraussetzung mehr. Pairing-Code und Geräteschlüssel werden
weiterhin nicht in Query, QR, Audit oder sichtbarer Oberfläche persistiert;
der Gerätetoken liegt AES-GCM-verschlüsselt in IndexedDB und wird beim
Self-Revoke erst nach bestätigtem Serverwiderruf entfernt.

Release 102 macht große Apple-Health-Exporte zu restartfesten, persistenten
Importjobs. XML und ZIP werden bis 512 MiB mit Backpressure gestreamt; auf
Datenträger liegt ausschließlich AES-256-GCM-Ciphertext mit benutzer- und
jobgebundenem AAD. Ein eigener, zeit- und speicherbegrenzter Child-Prozess
entschlüsselt und prüft die Quelle außerhalb des HTTP-Eventloops. Aktive
Freigabe, Benutzeridentität und ein serverbestätigtes Human Gate werden vor
dem Import gebunden; der Lauf erscheint im Command Stream, ohne Rohwerte,
Consent, Hash, Dateipfad oder Kryptometadaten öffentlich zu projizieren.

Nach einem Neustart werden nur strukturell intakte Jobs fortgesetzt.
Abbruch und Datencommit konkurrieren über einen atomaren Job-State-CAS: Entweder
der Abbruch gewinnt und es wird kein Messwert gespeichert, oder der Import
committet vollständig und bleibt `COMPLETED`. Die Oberfläche zeigt Upload-
Fortschritt, serverseitige Phasen, Reload-Persistenz und Abbruch. Ergebnisse
enthalten nur sichere Zähler; alle Health-Auswertungen bleiben ausdrücklich
deskriptiv und nicht medizinisch. Lokal verifiziert sind 273/273 Tests, der
Production-Build, `verify:local`, der npm-Produktionsaudit mit 0 bekannten Schwachstellen
und ein Chrome-Mobile-Flow mit 35.652.165 Bytes, zwei Messwerten, Reload und
vollständigem Testdaten-Cleanup. Release 102 ist auf Fressi und Günni live. Ein
isolierter Günni-Testuser importierte 35.652.207 Bytes und zwei Messwerte; sein
Cleanup endete mit null Messwerten und null Freigaben. Alle vier privaten
Container, die PWA-Flows und das direkte iPhone-Pairing sind live grün.

Release 103 ergänzt eine echte WHOOP-Verbindung und härtet den iPhone-
Pairingpfad. WHOOP verwendet einen persistenten, benutzer- und
Redirect-gebundenen OAuth-State, der atomar nur einmal einlösbar ist. Der
Refresh-Token liegt AES-256-GCM-verschlüsselt mit Benutzer-AAD in SQLite;
Access-Tokens und Provider-Rohantworten werden nicht gespeichert. Der
read-only Sync ist hinsichtlich Zeit, Seiten und Datensatzmenge begrenzt,
behandelt Teilerfolg und Rate-Limits ohne falschen globalen Fortschritt und
hält Apple Health und WHOOP als getrennte Quellen. Trennen behauptet einen
Providerwiderruf nur nach bestätigter WHOOP-Antwort. Ohne registrierte
WHOOP-App zeigt die Oberfläche ehrlich `NOT_CONFIGURED`; Webhooks bleiben bis
zu dauerhafter Queue und Reconciliation deaktiviert.

Vor dem iPhone-Confirm wird nun nicht nur die Existenz von Browser-APIs
geprüft. Der Companion erzeugt einen nicht exportierbaren AES-GCM-Schlüssel,
schreibt eine verschlüsselte Probe nach IndexedDB und liest sie wieder zurück.
Erst danach wird der Einmalcode an den Server gesendet. Safari und die
installierte PWA werden als getrennte Speicherbereiche erklärt; der passende
Direktlink erscheint nur auf iOS. Codefragmente verschwinden vor jeder
Netzwerkanfrage, Zeitüberschreitungen sind begrenzt und der Gerätetoken besitzt
keinen Kopierpfad mehr. Live-Smokes arbeiten standardmäßig read-only und
ersetzen deshalb keinen offenen Benutzer-Code. 296/296 Node-Tests sind im
letzten vollständigen lokalen Lauf grün; automatisierte WebKit-/Chrome-
Regression und Pairing-Security prüfen die Browserlogik. Release 103 ist auf
Fressi und Günni live; WHOOP bleibt ohne registrierte Provider-App ehrlich
`NOT_CONFIGURED`, und die echte iPhone-Hardwareabnahme bleibt separat offen.

Release 104 erweitert Personal um drei bewusst begrenzte, vom Benutzer
steuerbare Funktionen. Eine einzelne, exakt an Konto, UID und UIDVALIDITY
gebundene Mail kann auf Klick lokal analysiert werden; der Body wird weder in
der Mail-Datenbank noch im Audit gespeichert. Die Health-Ansicht zeigt
quellengetrennte 7-Tage-Trends gegen die vorherige 28-Tage-Basis, ohne
medizinische Aussage. Hermes Memory Review erzeugt ADD-/PATCH-/REMOVE-
Kandidaten mit Provenienz und exaktem Content-Hash; nur ein Mensch kann den
unveränderten Kandidaten freigeben. Der mobile Pairing-Pfad heißt durchgehend
**Günni Companion · Web-App** und ist direkt in Safari nutzbar. Sein ZIP ist
nur eine optionale Anleitung; direkter HealthKit-, EventKit- und
Hintergrundstandort-Zugriff bleibt Aufgabe einer künftigen signierten iOS-App.
Release 104 ist auf Günni und Fressi live: 321/321 Tests, mobiler Chrome- und
WebKit-Smoke, Pairing-Security, drei neue Read-Endpunkte und vier healthy
Container sind verifiziert. Ein realer Health-Trend erscheint erst bei
ausreichender 7/28-Tage-Datenbasis.

Release 105 ergänzt eine persistente Briefing-Inbox und einen echten
serverseitigen Scheduler. Fällige Routinen werden atomar genau einmal
beansprucht, am selben Berliner Kalendertag nachgeholt und nach einem Neustart
aus einem hängenden Zustand wiederaufgenommen. Ein manueller Lauf nutzt exakt
denselben read-only Personal-Intelligence-Pfad und schreibt seine sichtbare
Ausführung zusätzlich in den Command Stream. Ergebnisse enthalten nur
freigegebene Zähler, Quellenstatus und statische Hinweise; Mailtexte,
Roh-Gesundheitswerte, PII und Secrets werden verworfen. `NEW`, `READ`,
`SNOOZED` und `DISMISSED` bleiben benutzergebunden und über Neustarts erhalten.
338/338 Tests und die produktive Günni-Abnahme einschließlich Lauf, Inbox,
Command Stream und Cleanup sind grün; vier Release-105-Container sind healthy.

Die zum Pairing sichtbare **Companion-App** ist aktuell die installierbare
AgentOne-Companion-Web-App, keine App-Store-App. Sie wird auf dem iPhone direkt
unter `https://<instanz>/iphone` in Safari geöffnet und kann über „Zum
Home-Bildschirm“ installiert werden. Für Günni ist das
`https://guenni.mwart.solutions/iphone`. Das angebotene ZIP enthält nur
Anleitung und Shortcuts; eine signierte native HealthKit-/EventKit-App ist noch
nicht als Download vorhanden.

## Administration

Autorisierte Administratoren können Instanzen und Sessions vollständig analysieren, neu starten, sperren, neu aufbauen, in Quarantäne verschieben und wiederherstellen. Jeder Zugriff auf Sessioninhalte und jede administrative Aktion wird unveränderbar auditiert. Secret-Werte bleiben maskiert.

Eine Löschung sperrt die Instanz sofort. Daten bleiben 30 Tage verschlüsselt in Quarantäne und werden anschließend endgültig entfernt.

## Entwicklungs- und Hauptlinien

| Projekt | Hauptlinie | Entwicklung |
|---|---|---|
| AgentOne Platform | `agentone-main` | `agentone-dev` |
| AgentOne Personal | `agentone-personal-main` | `agentone-personal-dev` |

Der lokale Hybrid-Demomodus arbeitet standardmäßig mit den beiden Entwicklungsumgebungen. Hauptlinien werden nur lesend visualisiert.

## Open-Source-Basis

Für das spätere separate Repository ist ein privater Mirror von [OpenClaw](https://github.com/openclaw/openclaw) vorgesehen. OpenJarvis bleibt Referenz für lokale Inferenz, Hardwareprofile und Evaluation. Upstream-Änderungen werden als geprüfte Update-PRs übernommen und nie automatisch in eine Hauptlinie deployt.

## Release 106 · Freshness-aware Briefings

Geplante und manuelle Briefings sind an einen sicheren Quellen-Datenstand
gekoppelt. IMAP, Google und verschlüsselte ICS-Feeds werden nur bei Bedarf
read-only aktualisiert. Teilfehler stoppen das Briefing nicht, sondern werden
als `STALE_FALLBACK` oder `DEGRADED` mit letztem Erfolgszeitpunkt persistiert.
Die Inbox zeigt diese Zustände als eigene klickbare Karten und führt direkt zu
Postfach oder Tagesplanung. Rohinhalte, Zugangsdaten und Providerantworten sind
weder Teil der Run-Persistenz noch des DOM.

Der Master-Release 106 ist auf Fressi und Günni live. Der produktive
Günni-Smoke bestätigte einen frischen IMAP-Datenstand, ehrliche nicht
verbundene Google-/ICS-Zustände, beide Command-Tools, mobile Darstellung und
vollständigen Cleanup. PWA, Mail-Mobilansicht und WebKit/iPhone bleiben grün.

## Release 107 · PWA-Hinweise mit Geräte-Opt-in

Personal Pulse kann geplante Hinweise an einzeln freigegebene PWA-Geräte
zustellen. Die mobile Einstellung zeigt Browserfreigabe, Zustand des aktuellen
Geräts und die Anzahl registrierter Geräte; Aktivierung, Test und Widerruf sind
direkt ausführbar. Push-Abos werden pro Benutzer AES-256-GCM-verschlüsselt und
niemals als Endpoint oder Schlüssel an den Browser zurückprojiziert.

Die Serverkonfiguration verwendet ausschließlich die Namen
`AGENTONE_VAPID_PUBLIC_KEY`, `AGENTONE_VAPID_PRIVATE_KEY`,
`AGENTONE_VAPID_SUBJECT` und `AGENTONE_PUSH_MASTER_KEY`. Werte liegen nur in
der gitignorierten Master-ENV und werden nicht dokumentiert. Der
Sperrbildschirm erhält keine Mail-, Termin-, Gesundheits-, Personen- oder
Secret-Daten, sondern nur einen generischen Hinweis und eine relative URL zur
authentifizierten PWA. Ruhezeit, Tagesbudget, Feedback, Benutzertrennung und
Widerruf bleiben serverseitig verbindlich.

## Release 108 · Kontrollierte Ausführung statt Doppelklick

Das persönliche Tagesbild läuft über ein persistentes Effect Ledger. Jeder
Lauf wird atomar beansprucht, an Benutzer, Run, Eingabehash und stabilen
Idempotenzschlüssel gebunden und endet in `COMPLETED`, `FAILED` oder
`CANCELLED`. Ein Browser-Doppelklick oder ein erneut zugestellter Request kann
einen abgeschlossenen Effect deshalb nicht nochmals ausführen.

Die sichtbare Run-Control-Karte zeigt ausschließlich sichere Metadaten:
Zustand, Versuch und Zeitpunkte. Ein Retry erscheint nur bei einem
fehlgeschlagenen, idempotenten read-only Briefing-Tool. Ein Abbruch erscheint
nur während eines aktiven Claims und benötigt die authentifizierte
Benutzersitzung. Claim-Token, Idempotenz-, Input- und Result-Hash sowie das
eigentliche Ergebnis bleiben außerhalb der Browserprojektion. Schreibaktionen
werden über diesen Pfad grundsätzlich nicht wiederholt.

## Release 109 · Persönlicher Pattern Feed

AgentOne Personal besitzt jetzt einen persistenten, erklärbaren Musterverlauf.
Die Analyse kann Mail, Kalender und Health regelbasiert verbinden, projiziert
aber ausschließlich minimierte Kennzahlen. Jede Karte zeigt:

- das erkannte Muster und eine sichere Zusammenfassung;
- Regel und betrachteten Zeitraum;
- aggregierte Quellen samt Beleganzahl;
- Konfidenz sowie erstes und letztes Auftreten;
- den aktuellen Zustand aus dem persönlichen Feedback.

Provider-IDs, einzelne Event-Zeitstempel, Nachrichteninhalte,
Gesundheitsrohwerte und Secrets werden weder in der Pattern-Tabelle noch in
der öffentlichen API gespeichert. `not_helpful` senkt die Priorität;
`wrong`, `later` und `never` blenden ein Muster nach serverseitiger Regel aus,
ohne den historischen Nachweis zu verlieren. Der Feed ist strikt
benutzergebunden, `no-store`, read-only und auf 50 Einträge begrenzt.

Die erste neue Quellenkombination erkennt, wenn wichtige Personenpost auf
mindestens drei geplante Stunden der nächsten 24 Stunden trifft. Sie öffnet
nur die betroffenen read-only Ansichten. Termine, E-Mails oder Health-Daten
werden dadurch niemals automatisch verändert.

Release 111 erweitert diese Regel um Kalenderfragmentierung: Schon drei
Termine mit mindestens zwei Wechseln unter 30 Minuten können in Verbindung mit
dringender Personenpost einen Planungsbedarf auslösen. Eine Gegenprüfung weist
sichtbar darauf hin, wenn die reine Terminzeit unter drei Stunden liegt.
