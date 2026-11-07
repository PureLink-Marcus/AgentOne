# AgentOne Personal – Google Live Sync

Stand: 7. November 2026

`server/google-live-sync.mjs` implementiert den fehlenden read-only Datenpfad
zwischen einem bereits per OAuth verbundenen Google-Konto und AgentOne
Personal. Das Modul führt keine Sende-, Lösch- oder Kalender-Schreiboperation
aus.

## Integrationsvertrag

1. Der Server entschlüsselt den gespeicherten Refresh-Token nur für den Lauf.
2. `refreshGoogleAccessToken()` tauscht ihn gegen einen kurzlebigen Access-Token.
   Falls Google dabei einen rotierten Refresh-Token liefert, wird er ausschließlich
   über einen injizierten serverseitigen Persistenz-Callback gespeichert und nie
   zurückgegeben.
3. `syncGmailReadOnly()` nutzt beim ersten Lauf eine begrenzte Nachrichtenliste
   und danach die Gmail-History-ID. Eine abgelaufene History-ID (`404`) löst
   einen sicheren Vollabgleich aus.
4. Nachrichten werden ausschließlich mit `format=metadata` geladen. AgentOne
   speichert keine Bodies und verwirft den von Gmail gelieferten Snippettext.
5. `syncGoogleCalendarReadOnly()` lädt die CalendarList, synchronisiert aber nur
   explizit ausgewählte Kalender. Pro Kalender wird ein `nextSyncToken`
   gespeichert; ein abgelaufener Token (`410`) löst für genau diesen Kalender
   einen Vollabgleich aus.
   Die Ereignis-Idempotenz bleibt über Revisionen stabil; eine getrennte
   `revisionKey` erkennt inhaltliche Provideränderungen.
6. Access- und Refresh-Token sind nie Teil des Rückgabewerts. Providerfehler
   werden in stabile, redigierte Fehlercodes übersetzt.

## Laufzeit-Integration

- Der OAuth-Callback startet unmittelbar den ersten Gmail-Metadaten- und
  Kalender-Event-Sync. Ohne gespeicherte Auswahl wird genau der Primärkalender
  ausgewählt; eine später bewusst leere oder geänderte Auswahl bleibt erhalten.
- `POST /api/internal/personal/google/sync` ist der benutzerisolierte interne
  Endpunkt. Der angemeldete Zugriff läuft ausschließlich über
  `POST /agentone/google/sync` und Same-Origin-Prüfung.
- Der verschlüsselte Refresh-Token liegt ausschließlich im Service-Vault. Eine
  Rotation wird auch dann gespeichert, wenn ein nachfolgender Datenabruf
  fehlschlägt. Audit-Einträge enthalten nur Status, Zähler und Fehlercode.
- `personal_service_accounts.last_test.sync` hält den begrenzten Snapshot sowie
  Gmail- und Kalender-Cursor. `settings.selectedCalendarIds` hält die explizite,
  benutzergebundene Kalenderauswahl.
- Die Zustände unterscheiden `CONNECTED`/`SYNCED_EMPTY` von `LIVE_DATA`.
  Eine erfolgreiche CalendarList allein gilt nicht als Live-Eventquelle.
- `/api/internal/personal/services` liefert für Google nur eine Zusammenfassung
  mit Zählern. Persistierte Nachrichten- und Terminmetadaten werden nicht als
  allgemeine Service-Antwort an den Browser ausgegeben.

Das persistierende Kontoobjekt hält getrennte Cursor:

```json
{
  "gmail": { "historyId": "..." },
  "calendars": {
    "calendar-id": { "syncToken": "...", "mode": "incremental" }
  }
}
```

## Grenzen

- Gmail: maximal 500 Metadaten-Nachrichten pro Lauf; Standard 200.
- Der persistierte Gmail-Snapshot ist standardmäßig auf 5.000 Metadaten und
  90 Tage begrenzt. Ein abgelaufener Cursor ersetzt den Kontosnapshot statt
  veraltete Einträge unbemerkt zu behalten.
- Calendar: maximal 5.000 Ereignisse je ausgewähltem Kalender; Standard 1.000.
- Kalenderereignisse speichern standardmäßig nur ID, Revision, Titel, Status,
  Beginn, Ende und Serien-ID. Beschreibung, Ort und Teilnehmer werden nicht
  angefordert. Abgewählte Kalender verlieren Snapshot und Cursor sofort.
- Parallelität beim Laden von Gmail-Metadaten ist auf zwölf begrenzt.
- `429` und `5xx` liefern `retryable=true` sowie, falls vorhanden, eine
  redigierte `Retry-After`-Angabe. Das Scheduling des Wiederholungszeitpunkts
  gehört in den AgentOne-Worker.
- Serientermine werden von Google mit `singleEvents=true` expandiert.
- Schreibrechte werden weder angefordert noch implementiert.

## Offizielle Grundlagen

- [Gmail synchronisieren](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail History API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Gmail Message Metadaten](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Google Calendar CalendarList](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Google Calendar Events und Sync-Token](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google OAuth 2.0 für Webserver](https://developers.google.com/identity/protocols/oauth2/web-server)

