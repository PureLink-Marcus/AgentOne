# AgentOne Personal · Jarvis-Funktionsabgleich

Stand: 6. November 2026

AgentOne Personal übernimmt nicht das Jarvis-Produkt oder dessen Branding. Die öffentlich dokumentierten Jarvis-Funktionsgruppen dienen als UX-Referenz für einen Assistenten, der Aufgaben sichtbar ausführt statt nur Antworten zu formulieren. OpenClaw bleibt die interne Agenten- und Werkzeugruntime; Günni und Fressi bleiben eigenständige AgentOne-Personal-Instanzen.

## Zielbild

Jede Oberfläche teilt dieselben fünf Laufzeitobjekte:

1. Gespräch: Text, Voice, Streaming und Rückfragen.
2. Arbeit: laufende Aufgaben, Werkzeugschritte, Ergebnisse und Fehler.
3. Kontext: Profil, Projekte, Quellen und kontrollierte Memory-Einträge.
4. Verbindungen: Konten, Geräte, Plugins, Berechtigungen und Healthchecks.
5. Kontrolle: Freigaben, Datenschutzmodus, Kosten, Audit und Widerruf.

## Funktionsmatrix

| Jarvis-Referenz | AgentOne-Personal-Ziel | Aktueller Stand | Nächster Ausbau |
|---|---|---|---|
| Command Center | Chatleiste, laufende Aufgaben, Freigaben, Termine, Geräte und Alerts | vorhanden | Tool-Schritte als durchgängige Live-Timeline zusammenführen |
| Agentic Tool Registry | OpenClaw-Plugins plus AgentOne-Connectoren mit Zuständen und Rechten | vorhanden | Fähigkeiten, benötigte Einrichtung und letztes Ergebnis pro Werkzeug vereinheitlichen |
| Think–Act–Observe | sichtbare Route, Modell, Streamingzustand, Ergebniszeit und Fehler | im Chat und Voice vorhanden | echte Toolaufrufe als einklappbare Schritte ergänzen |
| Multi-LLM-Routing | bedienbarer AI Core mit Luna als schnellem Standard, Sol als Fallback, persistentem HUD-Sync und ehrlichem Ollama/Strict-Status | implementiert | Kosten-/Latenzbudget je Aufgabe und manueller Modell-Prefix |
| Cross-Session Memory | persistente Einträge, Remember/Forget, Herkunft, Schutzklasse, Ablaufdatum und Suche | implementiert | optionale semantische Vektorsuche |
| Voice & Wake Word | Browser-Voice, Mikrofonwahl, Latenz, Siri-Fast-Path, später lokales Wake Word | Browserpfad vorhanden | lokaler Whisper/Kokoro-Pfad |
| Gmail/Email | IMAP read-only, Sortierung, Briefings, Entwürfe; SMTP getrennt | Release 71 korrigiert und live | echtes Benutzerkonto abnehmen, danach Entwurf-Freigabe ergänzen |
| Calendar | Google/CalDAV/Apple über getrennte Rechte | vorbereitet | mobile Kontoabnahme und gemeinsame Tagesansicht |
| Desktop/App Control | Home Connector und später Desktop-/Pi-Nodes | teilweise | Gerätefähigkeiten und Human Gates pro Node anzeigen |
| Browser Automation | kontrollierte Browser-Werkzeuge über OpenClaw | Plugin vorhanden | Session-Isolation und sichtbare Browser-Aktivität |
| Scheduling/Routines | persönlicher Editor, Simulation, hashgebundene Aktivierung, Pause und taggenauer Runner | implementiert | später zusätzliche schreibende Aktionen hinter Human Gates |
| Privacy Modes | VOLLGAS und SAFE, Secret-Redaction, Audit | vorhanden | Jarvis-ähnliche Stufen Lokal / Geschützt / Freigegeben |
| Mobile Companion | PWA, iPhone-Pairing, Health-/Standort-Summaries, Siri | vorhanden | Push, Hintergrund-Sync und Geräte-Health |
| Proactive Nudges | zustandsbasierte Hinweise, Prioritäten, Ruhezeiten, Kanäle und Feedback | implementiert | später optionale zeitgesteuerte externe Zustellung |

## Einheitliche Zustände

Jede Integration zeigt `BEREIT`, `EINRICHTUNG`, `LIVE`, `READ-ONLY`, `DEGRADED`, `GESPERRT` oder `AUS`. Ein Plugin gilt nicht automatisch als verbunden, nur weil es geladen ist. Die Oberfläche zeigt daher getrennt:

- Runtime: Plugin geladen oder deaktiviert;
- Konto: Zugang eingerichtet oder nicht;
- Health: letzte erfolgreiche Prüfung und Latenz;
- Rechte: lesen, entwerfen, schreiben oder steuern;
- Audit: letzter Lauf und redigierter Fehlercode.

## Command Center ab Release 72

Die Jarvis-Referenz wurde visuell und funktional ausgewertet. AgentOne übernimmt keine Bilder, Texte oder Markenassets, sondern diese Interaktionsmuster:

- zentraler, animierter Günni AI Core statt einer statischen Startkachel;
- dauerhaft sichtbarer Einstieg in Text- und Live-Voice;
- vier echte Cockpit-Spalten für Systeme, AI Core, Operationen/Freigaben und Schnellaktionen;
- Live-Werte aus Dashboard, Connectoren, Mail und Home Assistant statt dekorativer Beispieldaten;
- explizite Zustände und Fehler (`LIVE`, `READY`, `SETUP`, `OFFLINE`, `ERROR`);
- wählbares Modell: GPT-6 Luna für schnelle Alltagsarbeit oder GPT-6.1 Sol für komplexe Aufgaben;
- responsive Verdichtung für PWA und Mobilgeräte.

Die Modellwahl wird lokal pro Browserinstanz gespeichert, serverseitig gegen eine Allowlist geprüft und gilt sowohl für Text- als auch Sprachchat. Unbekannte Modellnamen werden ignoriert und auf den sicheren Standard zurückgesetzt.

## Gmail ab Release 71

- Gmail-Adresse und 16-stelliges Google-App-Passwort, keine eigene OAuth-Client-ID.
- Vorprüfung im Browser und erneut im Server.
- IMAP ist der notwendige read-only Zugriff.
- SMTP ist optional und blockiert ein lesbares Postfach nicht.
- Fehler werden als Stufe (`validation`, `imap`, `smtp`) und stabiler Code protokolliert.
- Logs enthalten weder Adresse noch Benutzername, Passwort oder Serverantworten.
- Die Oberfläche zeigt den offiziellen App-Passwort-Link und erklärt den Unterschied zum normalen Google-Passwort.

Quelle der Referenzfunktionen: <https://jarvis.institute/features/> (abgerufen am 6. November 2026).
