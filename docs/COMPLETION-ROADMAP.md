# AgentOne Personal · Abschlussplan

Stand: 7. November 2026

Ziel ist kein Portal mit vorbereiteten Kacheln, sondern ein Assistent mit einem
geschlossenen Kreislauf aus echten Quellen, erklärbaren Mustern, Rückmeldung,
Freigabe und nachvollziehbarer Ausführung.

## Ehrlicher Ausgangspunkt

Release `2026.11.07-95` ist auf Fressi und Günni live; Release-Kandidat `2026.11.07-96` ist lokal mit 207/207 Tests, Production-Build und mobilem Chrome-Smoke vollständig verifiziert, aber noch nicht ausgerollt. Das Command-Stream Center bindet Briefing, IMAP-Test/-Scan, Google-Read-only-Sync und Apple-Health-Import an echte persistente Runs. **Heute & Planung** liest den serverseitigen Tagesplan; **Health & Recovery** zeigt Apple Health und WHOOP strikt getrennt. Release 96 ergänzt einen dauerhaft gespeicherten, AES-256-GCM-verschlüsselten privaten Kalenderlink mit manuellem und 15-minütigem Sync, Backoff und Last-good-Snapshot. Auf Günni sind aktuell:

- 50 reale Gmail-Nachrichten per IMAP read-only synchronisiert und gruppiert;
- acht aktuelle Mail-Vorgänge mit Handlungsbedarf im Tagesplan sichtbar;
- ein echtes Mail-Signal sowie der automatische Personal Pulse aktiv;
- Feedback pro Signal wirksam und benutzerisoliert;
- Apple-Health-Import, Verschlüsselung, Consent, Export und Löschung bereit;
- der Kalenderplan produktiv über ICS-Datei nutzbar; der neue persistente `https://`-/`webcal://`-Feed ist lokal abgenommen und wird erst nach Release-96-Rollout sowie Eingabe eines persönlichen Links `LIVE`;
- Health noch ohne persönliche Messwerte; der Apple-/WHOOP-Vergleich und seine sichtbare Release-95-Zentrale sind implementiert und warten auf echte Daten;
- Google OAuth und WHOOP ohne registrierte Anbieter-Credentials nicht live.
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
4. WHOOP-OAuth-/Sync-Kern einbinden und ohne Credentials ehrlich `SETUP`
   anzeigen.
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
9. **Release 96 lokal bestanden, Deployment ausstehend:** Der private
   Kalenderlink wird verschlüsselt gespeichert, nie zurückgegeben und manuell
   oder alle 15 Minuten synchronisiert. DNS-Pinning, SSRF-Schutz, Backoff und
   der letzte gültige Snapshot verhindern Secret-Leaks und Datenverlust bei
   Feedfehlern. Ein echter Benutzerfeed bleibt bis zur Linkeingabe
   `NOT_CONNECTED`; EventKit, HealthKit und echte Safari/WebKit-Abnahme sind
   nicht Bestandteil dieses Releases.

### Abschlussblock 2 · reale Datenabnahme (1–2 Tage)

1. Google OAuth-App registrieren oder privaten ICS-Link verwenden; ausgewählte
   Kalender synchronisieren und Konflikte im Tagesbild prüfen.
2. Einen echten Apple-Health-Export importieren; Dedupe, Einheiten, Zeitzonen,
   Herkunft, Export und Löschung abnehmen.
3. WHOOP-App registrieren; minimale Scopes, Tokenrotation, initialen Pull,
   Webhook-Signatur und periodischen Abgleich mit einem Testkonto abnehmen.
4. Mindestens sieben Tage Health-Verlauf einlesen, damit persönliche Baselines
   und Apple-/WHOOP-Vergleiche belastbar werden.
5. Rückmeldungen `falsch`, `später` und `nie wieder` im nächsten Tagesbild und
   nach Neustart verifizieren.

### Abschlussblock 3 · Betriebsreife (1–2 Tage)

1. Jobs für Sync, Retention, Reconciliation und Health-Import mit Laufzeit-,
   Kosten- und Fehlergrenzen betreiben.
2. Restore, Backup, Schlüsselrotation, Connector-Widerruf und Löschung pro
   Benutzer testen.
3. PWA-Push nur nach Opt-in; Ruhezeiten, Dedupe und Tagesbudget verifizieren.
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
| WHOOP | WHOOP Developer App, Client-ID/Secret, Redirect- und Webhook-URL, Benutzerconsent | OAuth-/Sync-/Webhook-Code und Mock-Abnahme |
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
