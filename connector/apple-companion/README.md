# Günni Companion · Web-App

Dieses Paket ist die **optionale Anleitung** für Günnis sofort nutzbare Web-App. Es ist keine App-Datei und muss nicht installiert oder entpackt werden. Die Companion-Web-App läuft direkt unter:

`https://guenni.mwart.solutions/iphone`

Sie benötigt weder ein iCloud-Passwort noch Google OAuth.

> Wichtig: Dieses ZIP ist keine signierte native iOS-App. Direkter HealthKit-, EventKit- und Hintergrundstandort-Zugriff benötigt weiterhin die separate, signierte AgentOne-iOS-App mit Apple-Entitlements. Der Web-Companion behauptet dafür kein `LIVE`.

## Pairing

1. In Günni **Private Access → Apple Schnellstart** die gewünschten Rechte auswählen.
2. **Pairing-Code erzeugen** wählen.
3. Die Basis-Seite am iPhone ausdrücklich in **Safari** öffnen:

   `https://guenni.mwart.solutions/iphone`

4. Den sechsstelligen Code innerhalb von zehn Minuten direkt in Safari eingeben
   und das Gerät benennen. Das Pairing funktioniert sofort – eine Installation
   ist dafür nicht erforderlich.
5. Empfohlen: In Safari **Teilen → Zum Home-Bildschirm** wählen. Dadurch erscheint
   **Günni Companion** wie eine App auf dem iPhone und öffnet sich im eigenen Fenster.
6. Der Web-Companion speichert den Geräteschlüssel AES-GCM-verschlüsselt in
   IndexedDB auf diesem iPhone und prüft sofort den Status.
7. Der Geräteschlüssel wird nicht als Klartext zum Kopieren angeboten. Siri- und
   Shortcut-Aktionen verwenden die sichere Companion-Sitzung beziehungsweise
   separat freigegebene Shortcut-Zugangsdaten.

Die Aktion **Auf diesem iPhone trennen** widerruft zuerst die Serverfreigabe
und löscht die zugehörigen Companion-Ereignisse. Erst nach erfolgreicher
Serverantwort wird der lokale Geräteschlüssel entfernt. Bei einem Netz- oder
Serverfehler bleibt er ausschließlich für einen sicheren erneuten Versuch im
verschlüsselten lokalen Tresor erhalten.

## Direkte Shortcut-API

Wer den Kurzbefehl manuell erstellt, sendet per `POST` an:

   `https://guenni.mwart.solutions/agentone/companion/confirm`

   JSON:

   ```json
   {"code":"123456","deviceName":"Marcus iPhone"}
   ```

`device.deviceToken` aus der Antwort wird einmalig sicher auf dem iPhone gespeichert. Günni speichert serverseitig nur dessen Hash.

Die Kopplung ohne erneute Anmeldung prüfen:

   `GET https://guenni.mwart.solutions/agentone/companion/status`

   Header: `X-AgentOne-Device-Token: <lokal gespeicherter Geräteschlüssel>`

   Eine erfolgreiche Antwort meldet `CONNECTED`, Gerätename und freigegebene Bereiche. Der Geräteschlüssel wird nie zurückgegeben. Die frühere Route `/redeem` bleibt als kompatibler Alias bestehen.

## Zusammenfassungen senden

Endpoint:

`https://guenni.mwart.solutions/agentone/companion/ingest`

Header:

- `X-AgentOne-Device-Token: <Gerätetoken>`
- `Content-Type: application/json`

Health-Zusammenfassung:

```json
{"kind":"health","data":{"date":"2026-10-31","steps":0,"sleepMinutes":0,"activeEnergyKcal":0,"workouts":0}}
```

Temporärer Standort:

```json
{"kind":"location","data":{"label":"Unterwegs","latitude":0,"longitude":0,"accuracyMeters":100,"ttlMinutes":15}}
```

Kalender oder Erinnerungen:

```json
{"kind":"calendar","data":{"count":0,"nextTitle":"","nextAt":null}}
```

## Datenschutz

- HealthKit-Rohdaten bleiben auf dem iPhone; übertragen werden nur die gewählten Summen.
- Standortdaten laufen nach spätestens 60 Minuten ab.
- Dauertracking ist deaktiviert.
- Der Gerätetoken wird nur einmal angezeigt und kann in Günni widerrufen werden.
- Health und Standort sind beim Pairing standardmäßig aus und müssen ausdrücklich gewählt werden.
- Beim Widerruf werden auch die zu diesem Gerät gespeicherten Companion-Ereignisse gelöscht.
