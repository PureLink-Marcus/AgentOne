# Private Kalender über iCal/ICS

Stand: 7. November 2026

AgentOne kann einen persönlichen Kalender auch ohne eigenen Google-OAuth-Client
read-only einlesen. Dafür dient eine private HTTPS-iCal-URL oder eine direkt
hochgeladene `.ics`-Datei. Dieser Pfad ist für Apple-, Google- und andere
Kalender geeignet, die einen privaten iCal-Freigabelink anbieten.

## Sicherheitsgrenzen

- nur öffentliche HTTPS-Ziele auf Port 443 oder 8443;
- keine lokalen IPs, `.local`-Hosts, eingebetteten Zugangsdaten oder Redirects;
- DNS-Auflösung wird vor dem Abruf gegen private Netze geprüft;
- 12 Sekunden Timeout und 4 MiB harte Eingangsgrenze;
- URLs und darin enthaltene Freigabetokens erscheinen weder in Ergebnis,
  Fehler noch Auditdaten; gespeichert wird nur ein Hash aus Origin und Pfad;
- `DESCRIPTION`, `LOCATION` und Teilnehmer werden standardmäßig nicht
  übernommen;
- der Pfad ist vollständig read-only und kann keine Termine verändern.

## Normalisierte Daten

Übernommen werden UID, Titel, Beginn, Ende, Zeitzone, Ganztagsstatus, Status,
Sequenz, Aktualisierungszeit sowie eine begrenzte RRULE-Grundlage für täglich,
wöchentlich, monatlich und jährlich. Ereignisse werden anhand von UID und
Wiederholungsinstanz dedupliziert. Standardmäßig bleiben maximal 10.000 Termine
und 400 Tage Historie erhalten.

Das Modul liegt in `server/ics-calendar-sync.mjs`.

## Produktiver Upload in AgentOne Personal

Im persönlichen Bereich steht die mobile Karte **Privater iCal-Kalender** bereit. Nach der Anmeldung kann dort ein Apple-, Google- oder anderer iCal-Export hochgeladen werden. Der Import ist read-only, auf 4 MiB begrenzt und ersetzt ausschließlich den vorherigen iCal-Snapshot desselben Benutzers.

- `GET /agentone/calendar/ics` liefert `LIVE`, `NOT_CONNECTED` oder `ERROR` sowie Terminanzahl und Importzeit.
- `POST /agentone/calendar/ics/import` akzeptiert den rohen Dateiinhalt als `text/calendar`, `text/plain` oder `application/octet-stream`.
- `DELETE /agentone/calendar/ics` benötigt `{ "confirm": "REMOVE_ICS_CALENDAR" }`.
- Der Gateway verlangt eine angemeldete AgentOne-Personal-Sitzung und Same-Origin für Import/Löschung.
- Termine landen minimiert und benutzergebunden als Quelle `calendar.ics` im Personal Event Ledger und fließen damit in Tagesbild und Kalenderzählung ein.
- `DESCRIPTION`, `LOCATION` und `ATTENDEE` werden weder im Ledger noch in Antworten gespeichert.
- Ein fehlerhafter neuer Upload lässt den bisherigen erfolgreichen Snapshot unverändert. Snapshot, Status und Audit werden bei erfolgreichem Ersatz in derselben SQLite-Transaktion geschrieben.
