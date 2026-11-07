# AgentOne Personal · Abschlussplan

Stand: 7. November 2026

Ziel ist kein Portal mit vorbereiteten Kacheln, sondern ein Assistent mit einem
geschlossenen Kreislauf aus echten Quellen, erklärbaren Mustern, Rückmeldung,
Freigabe und nachvollziehbarer Ausführung.

## Ehrlicher Ausgangspunkt

Release `2026.11.07-103` ist auf Fressi und Günni live: vier private Container
sind healthy, die PWA-Abnahme auf PureLink/Fressi/Günni sowie der read-only
WebKit-Smoke auf Günni sind grün. 296/296 Node-Tests, Production-Build,
Local-Smoke, Chrome-, WebKit- und Pairing-Security-Prüfung sind bestanden. Der
WHOOP-OAuth-/Sync-/Disconnect-Kern und das iPhone-Pairing mit realer AES-GCM-
IndexedDB-Probe sind implementiert. Ein echter WHOOP-Providerlauf und ein
realer iPhone-Safari-/PWA-Hardwaretest bleiben weiterhin getrennt als offen
ausgewiesen. Der isolierte 35.652.207-Byte-Health-Live-Import aus Release 102
einschließlich vollständigem Cleanup bleibt produktiv verifiziert.
Release 99 liefert den persistenten read-only
IMAP-Bestand und das Mail Review Center. Release 100 ergänzt das kontrollierte
Learning Lab mit `personal-briefing.v1`; Günni führte es mit echten minimierten
Mail-Signalen aus und behielt den Zustand über zwei Containerrotationen.
Release 101 behebt die reale iPhone-Blockade: Safari darf bei HTTPS, WebCrypto
und IndexedDB direkt koppeln, die PWA-Installation ist optional. Das
Command-Stream Center bindet Briefing, IMAP-Test/-Scan, Google-Read-only-Sync
und Apple-Health-Import an echte persistente Runs. **Heute & Planung** liest
den serverseitigen Tagesplan; **Health & Recovery** zeigt Apple Health und
WHOOP strikt getrennt. Auf Günni sind aktuell:

- 500 reale Gmail-Metadaten per IMAP read-only, persistent und dedupliziert synchronisiert und gruppiert;
- acht aktuelle Mail-Vorgänge mit Handlungsbedarf im Tagesplan sichtbar;
- ein echtes Mail-Signal sowie der automatische Personal Pulse aktiv;
- Feedback pro Signal wirksam und benutzerisoliert;
- Apple-Health-Import, Verschlüsselung, Consent, Export und Löschung bereit;
  Release 102 verarbeitet XML/ZIP bis 512 MiB als restartfeste Jobs mit
  verschlüsseltem Staging, Fortschritt, Reload-Fortsetzung und Abbruch;
- der Kalenderplan produktiv über ICS-Datei nutzbar; der persistente `https://`-/`webcal://`-Feed ist live ausgerollt und bleibt mangels persönlichem Link ehrlich `NOT_CONNECTED`;
- Health noch ohne persönliche Messwerte; der Apple-/WHOOP-Vergleich und seine sichtbare Release-95-Zentrale sind implementiert und warten auf echte Daten;
- Google OAuth und WHOOP ohne registrierte Anbieter-Credentials nicht live;
  der WHOOP-Kern bleibt deshalb ehrlich `NOT_CONFIGURED`.
- das Web-Companion-Pairing und die Shortcut-API implementiert. Release 95 korrigiert Mehrgeräte-Pairing, iOS-Standalone-Grenze, Reload/Widerruf und Vault-Fehler-Recovery; direkte HealthKit-/EventKit-Hintergrunddaten benötigen weiterhin die signierte native iOS-App.

`BEREIT` bedeutet implementiert und lokal/live gegen die eigene Grenze geprüft.
`LIVE` wird ausschließlich bei erfolgreichem Zugriff auf reale Nutzerdaten
angezeigt.

## Reihenfolge bis „alles Angefangene abgeschlossen“

### Abschlussblock 1 · vorhandene Module verdrahten (4–8 Stunden)

1. Personal Event Ledger als einzige persistente Zeitachse für Mail, Kalender,
   Health und Connector-Ergebnisse an die API anbinden.
2. **Release 92 implementiert, deployed und live abgenommen:** Command Stream an Briefing,
   IMAP-Test/-Scan, Google-Read-only-Sync und Apple-Health-Import anbinden. Die
   öffentliche Timeline zeigt nur freigegebene Metadaten; Input, Output,
   Rohpayloads, Secrets und Gesundheitswerte bleiben serverseitig. Der
   Health-Write-Pfad verlangt ein serverbestätigtes Exact-Payload-Gate.
3. **Release 94 implementiert, deployed und live abgenommen:** ICS/iCal als
   einfacher Kalenderweg ohne eigene Google-OAuth-App, sicherer HTTPS-Feed,
   Google-Ledger-Projektion sowie serverseitige Konflikt-/Freizeitplanung.
4. **Release 103 implementiert und deployed:** WHOOP-OAuth-/Sync-/Disconnect-Kern
   einbinden und ohne Credentials ehrlich `NOT_CONFIGURED` anzeigen. OAuth-
   State ist persistent und atomar einmalig; Refresh-Tokens sind
   AES-256-GCM-verschlüsselt, Sync und Provideraufrufe begrenzt. Webhooks
   bleiben bis zu dauerhafter Queue und Reconciliation deaktiviert.
5. Learning Lab nur mit serverbestätigter Benutzerrolle und Test-Attestierung
   anbinden; keine autonome Selbstfreigabe.
6. Alle festen `LIVE`-Texte entfernen und Status ausschließlich aus
   Healthchecks oder gespeicherten Ergebnissen ableiten.
7. **Release 92 und 93 live bestanden:** Der PWA-Cachewechsel, der gehärtete
   iPhone-Assistent und ein stabiler, nur serverseitiger Companion-Pepper sind
   auf beiden Personal-Instanzen aktiv.
8. **Release 95 lokal und live bestanden:** Health & Recovery ist als
   Ergebnisansicht statt Setup-Kachel verdrahtet. Das iPhone-Pairing behandelt
   zweite Geräte, iOS-Speichertrennung und fehlgeschlagene lokale Tokenablage
   fail-closed. PWA, iPhone-Webflow, Connectoren, Home, Mail, Command Stream,
   Planung, Jarvis und Chat/Voice-Text sind live geprüft. Eine reale
   Safari-/WebKit-Geräteabnahme bleibt getrennt.
9. **Release 96 lokal und live bestanden:** Der private
   Kalenderlink wird verschlüsselt gespeichert, nie zurückgegeben und manuell
   oder alle 15 Minuten synchronisiert. DNS-Pinning, SSRF-Schutz, Backoff und
   der letzte gültige Snapshot verhindern Secret-Leaks und Datenverlust bei
   Feedfehlern. PWA, kompletter iPhone-Webflow, Kalenderoberfläche,
   Connectoren, Home, Mail, Command Stream, Kommunikation, Planung und Jarvis
   sind live geprüft. Ein echter Benutzerfeed bleibt bis zur Linkeingabe
   `NOT_CONNECTED`; EventKit, HealthKit und echte Safari/WebKit-Abnahme sind
   nicht Bestandteil dieses Releases.
10. **Release 97 lokal und live bestanden:** Das Trennen auf dem
    iPhone widerruft zuerst die Serverfreigabe und löscht danach Ereignisse und
    lokalen Tresor. Bei Netz-/503-Fehler bleibt der verschlüsselte Token für
    einen sicheren Retry erhalten. Der QR enthält ausschließlich die
    normalisierte Instanz-Basis-URL plus `/iphone`, niemals Code oder Token.
    Safari→Teilen→Zum Home-Bildschirm→App öffnen→Code manuell ist in UI,
    Anleitung und ZIP konsistent. 390-px-Chrome-Abnahme: mindestens 54 px
    Touchhöhe, keine Konsolenfehler und kein Secret-Leak. PWA auf drei Domains,
    Connectoren, Home, Mail, Command Stream, Kommunikation, ICS, Jarvis und
    Planung sind regressionsgeprüft; Runtime und redigierter Audit sind healthy.
    Reale Safari-/WebKit- und native EventKit-/HealthKit-Abnahme bleiben
    separat.
11. **Release 98 vollständig ausgerollt und live abgenommen:** Push-to-talk
    verlangt mindestens eine Sekunde Audio und sendet die Transkription auf
    Wunsch standardmäßig sofort genau einmal. Antworten laufen als NDJSON-Stream
    in die Oberfläche und werden satzweise über die lokale Gerätestimme
    ausgegeben. Doppelaufrufe, Clientabbruch, Providerfehler, leere und
    unvollständige Streams werden ohne rohe Providerdaten oder falschen
    Abschluss behandelt. Die synthetische WAV-Fixture wurde bereits gegen den
    live laufenden Release-97-Endpunkt transkribiert; der mobile lokale
    Chrome-Smoke sowie der vollständige lokale Lauf mit 211/211 Tests sind grün.
    Die echte synthetische WAV, Chat HTTP 200 über Luna, Antwortstream,
    Mikrofon-Reaktivierung, PWA, iPhone-Vollflow und die breite Connector-
    Regression sind live bestätigt. Source `f15d1ac`, secret-freies Archiv und
    Image `purelink/agentone:2026.11.07-98` sind nachvollziehbar dokumentiert;
    vier private Container sind healthy. Dies bleibt Push-to-talk und ist kein
    Full-Duplex-Realtime- oder Wake-Word-System; echtes Mikrofon, Safari/WebKit
    und native iOS-Funktionen bleiben separat abzunehmen.
12. **Release 99 vollständig ausgerollt und live abgenommen:** IMAP synchronisiert nur
    minimierte Metadaten mit persistentem UID-/UIDVALIDITY-Cursor. Ein
    15-Minuten-Scheduler, begrenzter Backoff, atomare Deduplizierung und
    180-Tage-/2.500er-Retention machen den Bestand restartfest. Das Mail Review
    Center ist vollständig klickbar und mobil bedienbar; echter Versand und
    Provider-Mutationen bleiben technisch ausgeschlossen. Zwei direkte Günni-
    Läufe endeten im zweiten Lauf mit 0 Fetches und 0 neuen Datensätzen; nach
    vollständiger Containerrotation waren alle 500 Datensätze sofort wieder
    verfügbar. Mobile Chrome-Abnahme, redigierter Log-/DB-Audit und breite
    Regression sind grün.
13. **Release 100 deployed und live verifiziert:** Das Learning
    Lab stellt ausschließlich `personal-briefing.v1` bereit. Evaluation und
    Attestierung entstehen serverseitig; Approve, Activate und Rollback sind
    Session-gebundene Human Gates und Freigaben gelten nur für den exakten
    Content-Hash. Die aktive Revision liest echte minimierte Mail-, Kalender-
    und Health-Signale, erzeugt ein deterministisches Briefing und erscheint im
    Command Stream, ohne eine Quelle zu verändern. Public API und Audit führen
    keine Procedures, Prompts, Payloads, Evidence, Rohdaten oder Secrets. Der
    Store ist restartfest und prüft Lifecycle, Testattestierung, Approval und
    Aktivstatus fail-closed gegen direkte Manipulation. Rollback ist erst bei
    einer persistierten älteren aktiven Revision verfügbar. Günnis echte
    Mail-Signale und zwei vollständige Containerrotationen sind live geprüft.
14. **Release 101 deployed und live verifiziert:** Direktes Pairing in normalem
    iPhone-Safari ist bei HTTPS, WebCrypto und IndexedDB freigegeben. Die
    Home-Bildschirm-App ist optional; Fragmentcodes werden vor dem API-Aufruf
    aus der URL entfernt. Safari- und PWA-Flow bestehen AES-GCM-Vault, Reload,
    Status, Ingest, Self-Revoke-Retry, Recovery und Rollback ohne Secret-Leak.
15. **Release 102 deployed und live verifiziert:** Apple-Health-
    XML/ZIP bis 512 MiB läuft als persistenter, benutzer- und consentgebundener
    Importjob. Streaming-Upload und AES-256-GCM-Staging halten Klartext aus dem
    Dateisystem; ein begrenzter Child-Worker verarbeitet außerhalb des HTTP-
    Eventloops. Restart-Recovery, Human Gate, Command Stream, atomarer Cancel-
    oder-Commit-CAS und sichere Ergebnisprojektion sind getestet. Chrome Mobile
    importierte 35.652.165 Bytes, zeigte Upload und Reload-Persistenz, speicherte
    exakt zwei Messwerte und entfernte die Testdaten anschließend vollständig.
    Der isolierte Live-Smoke wiederholte dies auf Günni mit 35.652.207 Bytes;
    der Testuser endete mit null Messwerten und null Freigaben.
16. **Release 103 deployed und live verifiziert:** Der iPhone-Companion
    validiert seinen tatsächlichen Tresor vor dem Confirm durch
    AES-GCM-Roundtrip und IndexedDB-Schreib-/Leseprobe mit nicht exportierbarem
    Schlüssel. Safari und installierte PWA werden getrennt erklärt; der direkte
    Handoff erscheint nur auf iOS. Live-Verifikation ist standardmäßig
    read-only und kann keinen offenen Pairing-Code mehr überschreiben. Der
    WHOOP-Kern besitzt vollständigen OAuth-, begrenzten Sync- und ehrlichen
    Disconnect-Lebenszyklus. 296/296 Node-Tests sind im letzten vollständigen
    Lauf grün. Vier private Container sind healthy; `LIVE` bei WHOOP folgt
    weiterhin erst nach registrierter App und echter Provider-Abnahme.
17. **Release 104 live abgeschlossen:** Einzelne IMAP-Nachrichten
    erhalten eine explizite, lokale Einmalanalyse ohne Body-Persistenz oder
    Anhang-/Remote-Image-Abruf. Health-Trends vergleichen 7 Tage mit der
    vorherigen 28-Tage-Basis und trennen Quellen und Metriken. Memory-
    Änderungen werden als exakte Hash-Kandidaten gestaged und nur durch einen
    Menschen freigegeben. Die Companion-Oberfläche benennt den aktuellen Stand
    ehrlich als Web-App; Anleitung und spätere native iOS-App sind getrennt.
    321/321 Tests, mobile Chrome-/WebKit-/Security-Abnahme und vier healthy
    Release-104-Container sind nach dem gestuften Rollout bestätigt.
18. **Release 105 live abgeschlossen:** Persönliche Routinen laufen
    serverseitig, atomar genau einmal und mit Catch-up am selben Berliner Tag.
    Manuelle und geplante Ausführung teilen Personal Intelligence, sichere
    Ergebnisprojektion, Command Stream und Audit. Die persistente mobile Inbox
    unterstützt Lesen, 12-Stunden-Snooze und Ausblenden. Ungelesene
    Personenpost wird nicht mehr als Antwortpflicht behauptet; Apple-Kalender
    fließt in den Tagesplan, HRV-Methoden bleiben getrennt. 338/338 Tests,
    Produktions-Build, lokaler und produktiver Chrome-Smoke, PWA-, Mail- und
    WebKit-Abnahme sowie vier healthy Release-105-Container sind bestätigt.

### Abschlussblock 2 · reale Datenabnahme (1–2 Tage)

1. Google OAuth-App registrieren oder privaten ICS-Link verwenden; ausgewählte
   Kalender synchronisieren und Konflikte im Tagesbild prüfen.
2. Einen echten Apple-Health-Export importieren; Dedupe, Einheiten, Zeitzonen,
   Herkunft, Export und Löschung abnehmen.
3. WHOOP-App registrieren; minimale Scopes, Tokenrotation, initialen Pull,
   periodischen Abgleich und Provider-Widerruf mit einem Testkonto abnehmen.
   Webhooks erst nach dauerhafter Queue, Deduplizierung und Reconciliation
   gesondert freigeben.
4. Mindestens sieben Tage Health-Verlauf einlesen, damit persönliche Baselines
   und Apple-/WHOOP-Vergleiche belastbar werden.
5. Rückmeldungen `falsch`, `später` und `nie wieder` im nächsten Tagesbild und
   nach Neustart verifizieren.

### Abschlussblock 3 · Betriebsreife (1–2 Tage)

1. Jobs für Sync, Retention, Reconciliation und Health-Import mit Laufzeit-,
   Kosten- und Fehlergrenzen betreiben.
2. Restore, Backup, Schlüsselrotation, Connector-Widerruf und Löschung pro
   Benutzer testen.
3. PWA-Push nur nach Opt-in; Ruhezeiten, Dedupe und Tagesbudget verifizieren. **Release 107 lokal abgeschlossen; Live-Abnahme läuft.**
4. Vor einem generischen Command-Retry/-Cancel ein persistentes Effect-Ledger
   mit atomarem Ausführungs-Claim, wiederverwendetem Idempotency-Key und
   vollständig verdrahtetem Abort-Pfad bauen und testen. Bis dahin bleiben
   Retry und Cancel für reale Operationen bewusst ohne öffentliche API; Human
   Gates und Fehlerdarstellung werden unabhängig davon vollständig geprüft.
5. Finales Security-/Secret-/PII-Review und mobile Drei-Stunden-Abnahme.

## Externe Freigaben, die Code nicht ersetzen kann

| Integration | Benötigte Benutzer-/Anbieteraktion | Ohne Aktion möglich |
|---|---|---|
| Google Kalender | Google-OAuth-App mit Client-ID, Secret und Redirect-URI oder privater ICS-Link | Modul, Auswahl, Tests und `SETUP` |
| WHOOP | WHOOP Developer App, Client-ID/Secret, Redirect-URL und Benutzerconsent | OAuth-/Sync-/Disconnect-Code und Mock-Abnahme; Webhooks bewusst deaktiviert bis Queue/Reconciliation |
| Apple Health | Health-Export auswählen oder native Companion-App installieren und HealthKit-Rechte vergeben | Importer, Store, Consent und UI |
| Push auf iPhone | PWA-Benachrichtigungen im Browser erlauben | In-App-Pulse |
| Lokales Modell | Ollama-Modell auf dem freigegebenen Pi installieren | Router und Healthcheck |

## Zeitschätzung

- Alle begonnenen Kernmodule technisch eingebunden: **4–8 Stunden**.
- Reale externe Konten und Daten mit Benutzerfreigaben abgenommen:
  **zusätzlich 1–2 Arbeitstage**.
- Betriebsreifer Gesamtstand: **insgesamt ungefähr 3–5 Arbeitstage**.
- Eine native iPhone-App mit HealthKit-Hintergrundsync statt Export/Companion:
  **zusätzlich ungefähr 5–10 Arbeitstage** einschließlich Apple-Signing und
  Gerätetest.

Die Prognose setzt voraus, dass die benötigten OAuth-Apps und Testfreigaben
zeitnah bereitstehen. Fehlende externe Credentials verlängern nicht die
Implementierung, verhindern aber den ehrlichen Status `LIVE`.

## Fertig-Definition

Eine Funktion ist erst abgeschlossen, wenn sie:

1. aus echter Quelle oder klar gekennzeichnetem Simulator stammt;
2. mobil und auf Desktop ausführbar ist;
3. Fehler, fehlende Rechte und letzten erfolgreichen Lauf zeigt;
4. keine Secrets oder Gesundheitsrohwerte in Browser, Audit oder Screenshot
   verliert;
5. automatisierte Tests und einen echten Chrome-Smoke besitzt;
6. deployed, versionsgebunden und per PWA-Refresh erreichbar ist;
7. exportiert, widerrufen oder gelöscht werden kann, sofern persönliche Daten
   betroffen sind.

## Release-Regel

Jeder neue Release muss mindestens ein sichtbar neues oder wesentlich
verbessertes Frontend-Element enthalten. Das Element muss echte Zustände und
Ergebnisse anzeigen, mobil bedienbar sein und im Chrome-Smoke angeklickt werden.
Reine Backend-, Versions- oder Dokumentations-Releases sind ausgeschlossen.

## Release 106 · Quellen-Datenstand

Vor Routine-Briefings werden verbundene IMAP-, Google- und ICS-Quellen
kontrolliert aktualisiert. Eine einzelne Störung degradiert nur die betroffene
Quelle und erhält den letzten gültigen Datenstand. Command Stream und
persistierte Inbox zeigen getrennte Refresh-/Build-Schritte; die mobile
Oberfläche besitzt klickbare Datenstand-Karten. 352/352 Tests, Build,
Chrome-Smoke, Vier-Container-Rollout, echter Günni-Quellenlauf, PWA,
Mail-Mobilansicht und WebKit/iPhone sind grün. Release 106 ist als Master auf
Fressi und Günni live; der Smoke-Lauf wurde vollständig bereinigt.

## Release 107 · Kontrollierter PWA-Push

Personal Pulse kann geplante, freigegebene Hinweise zusätzlich an ausdrücklich
registrierte PWA-Geräte senden. Subscription-Endpunkte und Schlüssel werden
benutzergebunden AES-256-GCM-verschlüsselt gespeichert und niemals öffentlich
projiziert. Sperrbildschirmtexte bleiben absichtlich generisch; Details sind
erst nach Login sichtbar. Die neue mobile Einstellungskarte zeigt Berechtigung
und Gerätezahl und bietet Aktivieren, Test und Widerruf. Ruhezeit, Tagesbudget,
Feedback und Deduplizierung gelten weiterhin serverseitig; In-App und PWA sind
getrennte, nachvollziehbare Zustellkanäle. Der lokale 390×844-Chrome-Smoke ist
grün. Archiv-, Image-, Rollout- und Live-Abnahme folgen im Masterrelease.
