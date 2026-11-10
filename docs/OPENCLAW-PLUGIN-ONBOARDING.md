# OpenClaw-Plugins in AgentOne Personal

Diese Anleitung gilt für Günni und Fressi. Die Plugin-Verwaltung läuft in der
jeweiligen OpenClaw-Runtime der Instanz. Dadurch bleiben installierte Pakete,
Konfiguration und Berechtigungen zwischen AgentOne-Releases erhalten.

## Schnellstart in der App

1. AgentOne Personal öffnen und **Integrationen** wählen.
2. Zum Bereich **OpenClaw Plugin Center** scrollen.
3. **Plugin-Katalog öffnen** wählen, um ClawHub- und offizielle Plugins zu
   durchsuchen.
4. Beim gewünschten Plugin **Installieren** wählen.
5. Angeforderte Fähigkeiten lesen. Nur passende Fähigkeiten bestätigen.
6. Falls nötig im Plugin-Detail Zugang oder Konfiguration einrichten.
7. **Aktivieren** wählen und danach den Runtime-Status prüfen.

Bereits enthaltene Plugins zeigen statt *Installieren* direkt *Aktivieren*,
*Deaktivieren* oder *Konfigurieren*. AgentOne verlinkt jede Karte direkt auf
die zugehörige OpenClaw-Detailseite.

## Welche Quelle verwenden?

- **ClawHub / offizieller Katalog:** bevorzugter Weg für normale Installation.
- **npm:** nur mit dem ausdrücklichen Präfix `npm:` und nach Prüfung des Pakets.
- **Git:** nur mit festem Tag oder Commit, nicht blind vom wechselnden Hauptzweig.
- **lokaler Pfad:** nur für Entwicklung auf demselben Gateway-Host.

Beliebige npm-, Git- oder lokale Quellen führen Code im persönlichen Gateway
aus. Deshalb werden sie in AgentOne nicht automatisch bestätigt. Nutze möglichst
offizielle beziehungsweise verifizierte Pakete und feste Versionen.

## Installation über OpenClaw-CLI

Die gleichen Vorgänge sind auf dem Gateway möglich:

```text
openclaw plugins search "calendar"
openclaw plugins install <paket>
openclaw plugins list --json
openclaw plugins enable <plugin-id>
openclaw plugins disable <plugin-id>
openclaw plugins inspect <plugin-id> --runtime --json
```

Wenn OpenClaw eine Capability-Freigabe verlangt, zuerst die Fähigkeiten lesen
und anschließend bewusst mit `--accept-capabilities` wiederholen. Für fremde
npm- oder Git-Quellen ist zusätzlich eine ausdrückliche Vertrauensentscheidung
nötig. `--force` umgeht keine Sicherheitsrichtlinie.

## Verbinden und konfigurieren

Ein installiertes Plugin ist nicht automatisch mit einem Konto verbunden.
Je nach Plugin folgt danach einer dieser Schritte:

- OAuth-Anmeldung, zum Beispiel Google oder GitHub;
- API-Key im geheimen OpenClaw-Konfigurationsbereich;
- Kanal-Einrichtung, zum Beispiel Telegram oder Discord;
- lokaler Dienst, zum Beispiel Ollama oder Home Assistant;
- Auswahl eines exklusiven Providers oder Memory-Slots.

Secrets gehören ausschließlich in die dafür vorgesehenen OpenClaw- oder
AgentOne-Eingabefelder. Sie werden nicht in Chat, E-Mail, Screenshots oder diese
Anleitung kopiert.

## Zustände

- `LOADED`: aktiviert und von der Runtime geladen.
- `DISABLED`: vorhanden, aber nicht freigegeben.
- `SETUP`: installiert, Konfiguration oder Anmeldung fehlt.
- `DEGRADED`: Aktivierung fehlgeschlagen; Detailseite und Diagnose öffnen.

Nach einer korrigierten Konfiguration genügt normalerweise **Reload**. Eine
erneute Installation ist nicht erforderlich. Bei beschädigter oder veralteter
Konfiguration zeigt `openclaw doctor` die sichere Reparatur an.

## Empfohlene persönliche Auswahl

- `browser`, `web-readability`: Recherche und lesbare Webseiten;
- `imap`, `google`: E-Mail und Kalender;
- `active-memory`, `memory-core`: persönliche Erinnerung und Kontext;
- `talk-voice`: Sprachdialog;
- `geolocation`: freigegebene Standortkontexte;
- `ollama`, `openai`: lokale beziehungsweise Cloud-Modelle;
- `a2a`: Zusammenarbeit zwischen Agenten;
- `telegram`: optionaler persönlicher Kanal.

Nicht benötigte Provider bleiben deaktiviert. Ein Plugin wird nicht allein
deshalb aktiviert, weil es im Katalog vorhanden ist.

