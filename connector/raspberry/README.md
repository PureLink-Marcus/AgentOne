# AgentOne Home Connector für Raspberry Pi und Linux

Der Connector routet ausgewählte private Quellen aus dem Heimnetz zu AgentOne Personal. Er veröffentlicht keine Home-Assistant-Ports im Internet und besitzt in Version 1 ausschließlich Leserechte.

## Voraussetzungen

- Raspberry Pi mit 64-Bit Raspberry Pi OS oder Linux-Host mit Debian/Ubuntu auf ARM64 oder AMD64;
- Docker Engine und `docker compose` bereits installiert;
- Home Assistant im selben Netz;
- Tailscale-Konto und ein einmaliger Auth-Key.

## Installation

```sh
unzip agentone-home-connector-raspberry.zip
cd agentone-home-connector-raspberry
chmod +x install.sh start.sh status.sh verify.sh
./install.sh
nano .env
./start.sh
```

Nach der Ersteinrichtung oder einem Update aktiviert ein einzelner Befehl die freigegebenen Home-Assistant-Komfortfunktionen:

```sh
chmod +x enable-home-control.sh
./enable-home-control.sh
```

Das Skript sichert `.env`, aktiviert Licht, Farben, Medien, Klima, Szenen und Automationen und startet den Connector neu. Schlösser, Alarmanlagen und Sirenen bleiben technisch blockiert.

## Signierte Folgeupdates

Nach der einmaligen Installation von Connector v2 erfolgen Folgeupdates aus dem Installationsordner mit:

```sh
./update.sh
```

Das Skript lädt Manifest, ZIP und Ed25519-Signatur von Günni, prüft zusätzlich SHA-256, installiert in einem Staging-Schritt und startet den Connector neu. Schlägt Signatur, Paketprüfung oder Healthcheck fehl, bleibt beziehungsweise wird der vorherige Stand wieder aktiv. `.env`, Freigaben, Shared Root und das persistente Tailscale-Volume werden nicht ersetzt.

In `.env` werden nur lokal eingetragen:

1. einmaliger, nicht wiederverwendbarer und nicht ephemerer `TAILSCALE_AUTH_KEY` aus der Tailscale-Adminoberfläche;
2. `HOME_ASSISTANT_URL`, gewöhnlich `http://homeassistant.local:8123`;
3. `HOME_ASSISTANT_TOKEN`, erzeugt in Home Assistant unter Profil → Sicherheit → langlebige Zugriffstoken.

`CONNECTOR_TOKEN` erzeugt das Installationsskript automatisch. Die `.env` bleibt auf dem Raspberry Pi und darf nicht hochgeladen oder per Chat versendet werden.

Der Tailscale-Container verwendet persistente Zustandsdaten und `TS_AUTH_ONCE=true`. Nach dem ersten erfolgreichen Start ist der einmalige Key automatisch verbraucht und kann in der Admin-Konsole widerrufen werden. Der Connector benötigt ihn bei späteren Neustarts nicht erneut.

## AgentOne-Zielwerte

Für Günni werden die beiden Werte ausschließlich in `master/env/.env.master` auf dem Verwaltungsrechner hinterlegt:

```text
AGENTONE_GUENNI_HOME_CONNECTOR_URL=http://agentone-home-connector.tailbece5a.ts.net:8787
AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN=<Wert aus CONNECTOR_TOKEN auf dem Pi>
```

Für Fressi heißen die Variablen entsprechend `AGENTONE_FRESSI_HOME_CONNECTOR_URL` und `AGENTONE_FRESSI_HOME_CONNECTOR_TOKEN`. Sie werden beim nächsten privaten Coolify-Rollout serverseitig übernommen. Es gibt dafür bewusst kein Browserfeld.

## Lokales Ollama-Modell (optional)

Connector v4 kann ein auf dem Raspberry Pi oder einem festen Heimnetzrechner laufendes Ollama-Modell vollständig lokal ausführen. Ohne diese Werte bleibt der Pfad deaktiviert:

```text
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODELS=llama3.2:3b
```

Vor dem Start muss das Modell lokal vorhanden sein, zum Beispiel mit `ollama pull llama3.2:3b`. Nur exakt in `OLLAMA_MODELS` erlaubte Modellnamen sind ausführbar. Status und Chat laufen über den authentifizierten Connector; Prompttexte werden weder in Statusantworten noch im AgentOne-Audit gespeichert. Pro Anfrage gelten 4.000 Zeichen, 500 Ausgabetokens und 45 Sekunden Timeout. AgentOne zeigt `LOCAL`, Modellname und gemessene Latenz an. Der Ollama-Port wird nicht öffentlich oder im Tailnet veröffentlicht.

## Freigegebene Daten

Connector v4 übernimmt die freigegebenen Home-Assistant-Bereiche für Sensoren, Wetter, Kalender, Listen, Medien, Licht, Klima, Kameras, Automationen, Szenen, Skripte, Schalter, Ventilatoren, Abdeckungen, Staubsauger, Luftbefeuchter, Warmwasser, Helper, Personen und Geräte. Zustände, reduzierte Metadaten und freigegebene Kameras sind lesbar. Steuerungen bleiben standardmäßig aus. `lock`, `alarm_control_panel` und `siren` sind unabhängig von der Konfiguration blockiert.

### Home Assistant feiner begrenzen

`HOME_ASSISTANT_DOMAINS` erlaubt Domänen. Mit `HOME_ASSISTANT_ENTITIES` kann Günni zusätzlich auf konkrete Entity-IDs begrenzt werden:

```text
HOME_ASSISTANT_DOMAINS=sensor,weather,calendar,todo,light,media_player,camera,automation
HOME_ASSISTANT_ENTITIES=sensor.wohnzimmer_temperature,weather.home,calendar.privat,todo.einkauf,light.wohnzimmer,media_player.sonos,camera.blink_garten,automation.abend
```

Eine Entity muss beide Prüfungen bestehen. Kameras werden nur als nicht gecachter Snapshot auf ausdrücklichen Klick geladen.

### Sichere Steuerung aktivieren

Nach der Entity-Prüfung kann die feste Service-Allowlist aktiviert werden:

```text
HOME_ASSISTANT_CONTROL_ENABLED=true
```

Erlaubt sind Licht an/aus/Helligkeit, Sonos/Medien Play/Pause/Stop/Titel/Lautstärke/Quelle/Shuffle/Repeat, Spotify-URIs, Klima-Zieltemperatur, Schalter, Ventilatoren, Abdeckungen, Staubsauger, Luftbefeuchter, Warmwasser, sichere Helper, Szenen, Skripte und Automationen. Jede Aktion benötigt zusätzlich eine sichtbare Bestätigung in AgentOne. Spotify-Wiedergabe akzeptiert nur `spotify:track`, `spotify:album`, `spotify:playlist` oder `spotify:artist`. Freie Service-Namen, beliebige Payloads, Schlösser, Alarmanlagen und Sirenen werden abgewiesen.

Für den Siri-Kurzbefehl `Licht aus` verwendet Günni denselben bestätigten, allowlist-basierten Action-Endpunkt. Günni liest zuerst die freigegebenen Zustände und sendet anschließend `light.turn_off` parallel nur an eingeschaltete, durch `HOME_ASSISTANT_ENTITIES` erlaubte Lampen. Der separate Siri-Key liegt ausschließlich auf Günnis Server und im persönlichen Apple-Kurzbefehl; er wird nie auf dem Raspberry gespeichert.

### Ordner read-only freigeben

Es wird niemals das gesamte Dateisystem oder ein Docker-Socket eingebunden. `HOST_SHARED_ROOT` bezeichnet genau einen Hostordner; einzelne Unterordner werden anschließend als benannte Grants freigegeben:

```text
HOST_SHARED_ROOT=/mnt/agentone-share
FOLDER_GRANTS_JSON=[{"id":"documents","name":"Dokumente","path":"documents","extensions":[".pdf",".txt",".md",".docx"]},{"id":"photos","name":"Fotos","path":"photos","extensions":[".jpg",".jpeg",".png",".webp"]}]
FOLDER_MAX_BYTES=8388608
```

Der Mount ist im Container `read-only`. Pfadwechsel, Symlink-Ausbrüche, nicht erlaubte Dateitypen und Dateien über dem Größenlimit werden blockiert.

### Netzwerkgeräte gezielt freigeben

Der Connector ist bewusst **kein allgemeiner LAN-Proxy**. Jedes Gerät und jede lesbare Route muss einzeln benannt sein:

```text
NETWORK_TARGETS_JSON=[{"id":"nas","name":"NAS","baseUrl":"http://192.168.1.20:5000","routes":[{"id":"status","name":"Systemstatus","path":"/api/status","contentTypes":["application/json"]}]},{"id":"printer","name":"Drucker","baseUrl":"http://192.168.1.30","routes":[{"id":"status","name":"Status","path":"/status","contentTypes":["application/json","text/plain"]}]}]
NETWORK_TARGET_AUTH_JSON={"nas":"Bearer LOKALER_READ_ONLY_TOKEN"}
```

Nur `GET`, exakt konfigurierte Routen, feste Origins, begrenzte Antwortgrößen und JSON/Text sind zulässig. Zugangsdaten erscheinen nicht in Status- oder Capability-Antworten.

## Stabile Tailnet-Adresse

Der aktuelle Pi ist erreichbar unter:

```text
IPv4: 100.115.49.25
MagicDNS: agentone-home-connector.tailbece5a.ts.net
Connector: http://agentone-home-connector.tailbece5a.ts.net:8787
```

IP und MagicDNS-Name bleiben stabil, solange das persistente Volume `tailscale-state` nicht gelöscht und das Gerät nicht aus dem Tailnet entfernt wird. Bei einer vollständigen Neuanmeldung kann sich die IP ändern. Der Connector meldet IP, DNS, URL und Ablaufdatum über `/health` und authentifiziert über `/v1/status`.

Die aktuelle Geräteauthentisierung läuft am **28. April 2027** ab. Für einen dauerhaft wartungsarmen Betrieb muss in Tailscale für `agentone-home-connector` und `agentone-hetzner` die Schlüsselablauffrist deaktiviert werden. Der Connector-Token selbst ist statisch und läuft nicht ab.

## Sicherheitsgrenzen

- Zugriff ausschließlich über Tailscale und Bearer-Token;
- lokaler Host-Port nur an `127.0.0.1` gebunden;
- Container ohne zusätzliche Linux-Capabilities, read-only Root-Dateisystem;
- feste Home-Assistant-Zieladresse statt freiem Proxy;
- nur erlaubte Entity-Domains und reduzierte Attribute;
- keine Service-Aufrufe, Schlösser, Alarmanlagen oder Schreiboperationen.

Nach der lokalen Prüfung wird der Tailscale-Gerätename `agentone-home-connector` in AgentOne als URL samt Connector-Token hinterlegt. Der Hetzner-Server muss dafür Mitglied desselben Tailnets sein. Der aktuelle Hostcheck vom 30.10.2026 meldet `TAILSCALE_NOT_INSTALLED`; dieser zweite Tailnet-Beitritt ist daher noch offen.

## Bring!, Google, Spotify und iPhone

Google Kalender und Spotify werden direkt von AgentOne per OAuth verbunden. Apple Kalender und Erinnerungen benötigen einen späteren iPhone-Companion mit EventKit/Kurzbefehlen. Bring! besitzt keine dokumentierte öffentliche Consumer-API; der vorbereitete Bridge-Slot bleibt deaktiviert. Einkaufslisten können stabil über Home Assistant To-do oder Mealie laufen.
