# AgentOne Apple Companion – Günni

Dieses Paket verbindet Apple Kurzbefehle mit Günnis bestehender Companion-API. Es benötigt weder ein iCloud-Passwort noch Google OAuth.

## Pairing

1. In Günni **Verbindungen → iPhone Companion → iPhone koppeln** öffnen.
2. Den einmaligen sechsstelligen Code innerhalb von zehn Minuten verwenden.
3. Ein Kurzbefehl sendet per `POST` an:

   `https://guenni.mwart.solutions/agentone/companion/redeem`

   JSON:

   ```json
   {"code":"123456","deviceName":"Marcus iPhone"}
   ```

4. `device.deviceToken` aus der Antwort einmalig sicher auf dem iPhone speichern. Günni speichert nur dessen Hash.

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
