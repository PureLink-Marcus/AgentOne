# Günni: Farben, Spotify, Sonos und Home Assistant

## Farben einstellen

In Günni **Einstellungen → Farben und Atmosphäre** öffnen. Primärfarbe, Akzent, Hintergrund und Kartenflächen können einzeln gewählt und live geprüft werden. Zusätzlich stehen Günni, PureLink, Warm und Hell als Vorlagen bereit. Die Wahl wird lokal auf dem jeweiligen Gerät gespeichert; **Instanzfarben verwenden** stellt die Servervorgabe wieder her.

## Home Assistant aktualisieren

Auf dem Raspberry im Connector-Ordner:

```sh
./update.sh
```

Danach in `.env` mindestens prüfen:

```text
HOME_ASSISTANT_DOMAINS=media_player,light,climate,camera,automation,scene,script,switch,fan,cover,vacuum,humidifier,water_heater,input_boolean,input_number,input_select,number,select,sensor,binary_sensor,weather,calendar,todo
HOME_ASSISTANT_CONTROL_ENABLED=true
```

Mit `HOME_ASSISTANT_ENTITIES` kann der Zugriff auf konkrete Entity-IDs begrenzt werden. Für Sonos und Spotify müssen die entsprechenden Integrationen bereits in Home Assistant eingerichtet und als `media_player.*` sichtbar sein.

## Medienzentrum

Unter **Zuhause → Musik, Spotify und Sonos** zeigt Günni:

- Playerstatus, Titel, Interpret, Album, App und Quelle;
- Sonos-Gruppenmitglieder;
- Play, Pause, Stop, vorheriger und nächster Titel;
- Lautstärke, lauter, leiser und stumm;
- Audioquelle;
- Shuffle und Repeat;
- Spotify Track-, Album-, Playlist- oder Artist-URI.

Jede Steuerung benötigt eine sichtbare Bestätigung. Spotify-Wiedergabe akzeptiert nur URIs wie `spotify:track:…`, `spotify:album:…`, `spotify:playlist:…` oder `spotify:artist:…`.

## Weitere Home-Assistant-Bereiche

Günni stellt freigegebene Lichter, Klima, Kameras, Sensoren, Wetter, Kalender, To-dos, Schalter, Ventilatoren, Abdeckungen, Staubsauger, Luftbefeuchter, Warmwasser, Zahlen-/Auswahl-Helfer, Personen, Geräte, Szenen, Skripte und Automationen gruppiert dar. Kritische Bereiche wie Schlösser, Alarmanlagen und Sirenen bleiben blockiert.
