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

Das Modul liegt in `server/ics-calendar-sync.mjs`. API- und UI-Anbindung folgen
in Release 86; Release 85 wird dadurch nicht verändert.
