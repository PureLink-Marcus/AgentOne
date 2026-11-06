# Siri mit Günni und Home Assistant

## Ziel

Der Kurzbefehl **Licht aus** verwendet einen besonders kurzen, deterministischen Pfad:

```text
Siri / HomePod / Apple Watch
  → Apple Kurzbefehle
  → https://guenni.mwart.solutions/agentone/siri/v1/execute
  → Günni (Schlüssel, Intent-Allowlist, Rate-Limit)
  → Raspberry-Pi-Connector über Tailscale
  → Home Assistant
  → alle für Günni freigegebenen light.*-Entitäten
```

Für diesen Befehl wird kein Sprachmodell aufgerufen. Das hält ihn schnell und verhindert, dass ein frei formulierter Modelltext als Gerätesteuerung interpretiert wird. Offene Fragen und komplexe Planungen laufen weiterhin über Günnis normalen Sprachchat.

## Voraussetzungen

1. Auf dem Raspberry läuft mindestens AgentOne Home Connector v4. Im Installationsordner kann er mit `./update.sh` signiert aktualisiert werden.
2. In der Raspberry-`.env` enthält `HOME_ASSISTANT_DOMAINS` den Wert `light`.
3. `HOME_ASSISTANT_CONTROL_ENABLED=true` ist gesetzt.
4. Optional begrenzt `HOME_ASSISTANT_ENTITIES` die für Günni sichtbaren Lampen. Nur dort freigegebene `light.*`-Entitäten werden geschaltet.
5. Günnis Server enthält `AGENTONE_GUENNI_SIRI_API_KEY`; der Schlüssel liegt lokal in `master/env/.env.master` und in der ignorierten Datei `output/demo/siri-private-access.txt`.

## Kurzbefehl auf dem iPhone erstellen

1. **Kurzbefehle** öffnen und mit **+** einen neuen Kurzbefehl anlegen.
2. Den Namen **Licht aus** vergeben. Falls Siri den Namen mit einer eigenen Funktion verwechselt, stattdessen **Günni Licht aus** verwenden.
3. Aktion **Inhalte von URL abrufen** hinzufügen.
4. URL: `https://guenni.mwart.solutions/agentone/siri/v1/execute`
5. Methode: **POST**.
6. Header hinzufügen:
   - `Authorization` → `Bearer <Günni-Siri-Key>`
   - `Content-Type` → `application/json`
7. Request Body als JSON/Dictionaries konfigurieren:
   - `intent` → `home.lights.off`
   - `requestId` → eine UUID oder `siri-light-off`
8. Aus der JSON-Antwort den Wert `speech` holen.
9. Aktion **Text sprechen** hinzufügen und `speech` übergeben.
10. Einmal direkt in Kurzbefehle testen und die Netzwerkfreigabe bestätigen. Danach sagen: **„Siri, Licht aus.“**

Apple führt einen Kurzbefehl über dessen Namen aus. Er kann anschließend auch über HomePod, Apple Watch oder andere Geräte derselben Apple-ID gestartet werden, sofern die verwendeten Aktionen dort ohne sichtbare App-Oberfläche laufen.

## Einstellungen in Günni

Unter **Günni und Design → Siri und Kurzbefehle** wird angezeigt, ob der Serverpfad vorbereitet ist. Unter **Verbindungen → Apple Kurzbefehle** werden zwei getrennte Rechte geführt:

- ausgewählte Inhalte an Günni übergeben;
- Siri darf alle freigegebenen Lichter ausschalten.

Diese UI-Freigabe dokumentiert die Benutzerentscheidung. Die technische Durchsetzung erfolgt zusätzlich durch den separaten Siri-Key, die feste Intent-Allowlist und die Entity-Allowlist auf dem Raspberry.

## Geschwindigkeit

- Keine Transkription und kein Modellaufruf innerhalb AgentOne.
- Eine HTTPS-Anfrage von Apple an Günni.
- Ein Zustandsabruf an Home Assistant, anschließend parallele `light.turn_off`-Aufrufe nur für eingeschaltete, freigegebene Lampen.
- Zielwert nach dem ersten Verbindungsaufbau: üblicherweise unter 1,5 Sekunden; Mobilfunk, HomePod-Relay und Tailnet-Latenz können den Wert erhöhen.

## Sicherheit

- Der Siri-Key ist nur für diese Personal-Instanz bestimmt und darf nicht in Screenshots, Chats oder iCloud-Notizen kopiert werden.
- Der Endpunkt akzeptiert aktuell ausschließlich `home.lights.off`.
- Schlösser, Alarmanlagen, Sirenen und freie Home-Assistant-Service-Namen sind ausgeschlossen.
- Maximal 30 Aufrufe pro Minute und Instanz/IP.
- Bei Verlust des iPhones wird der Key in `master/env/.env.master` ersetzt und Günni neu ausgerollt.
- Die Antwort enthält keine Secret-Werte.

## Diagnose

1. In Günni das Home-Dashboard öffnen und prüfen, ob der Raspberry `LIVE` meldet.
2. Den Kurzbefehl zuerst per Tippen ausführen.
3. Bei `401`: Bearer-Key oder Header prüfen.
4. Bei `503`: Günni hat noch keine Connector-Verbindung.
5. Bei `home_assistant_control_disabled`: auf dem Pi `HOME_ASSISTANT_CONTROL_ENABLED=true` setzen und den Connector neu starten.
6. Wenn einzelne Lampen nicht reagieren, `HOME_ASSISTANT_ENTITIES` und die Entity-ID in Home Assistant prüfen.

## Späterer nativer Ausbau

Eine AgentOne-iOS-App kann denselben API-Pfad als Apple **App Intent** veröffentlichen. Damit erscheinen Günni-Aktionen direkt in Siri, Spotlight, Kurzbefehle, Action Button und Apple Watch. Bis dahin ist der HTTPS-Kurzbefehl der schnellste ausrollbare Weg ohne eigene App-Installation.

Quellen: [Apple: Kurzbefehle mit Siri ausführen](https://support.apple.com/guide/shortcuts/run-shortcuts-with-siri-apd07c25bb38/ios), [Apple: App Intents](https://developer.apple.com/documentation/appintents/creating-your-first-app-intent), [Home Assistant Companion: Apple App Intents](https://companion.home-assistant.io/docs/integrations/siri-shortcuts/).
