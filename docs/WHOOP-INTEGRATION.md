# WHOOP-Integration

Stand: 7. November 2026 · Release `2026.11.07-103`

## Ziel und ehrlicher Betriebszustand

AgentOne Personal bindet WHOOP als persönliche, ausschließlich lesende
Gesundheitsquelle an. Die Anwendung kann den vollständigen OAuth-, Sync- und
Trennungsablauf ausführen. Ohne eine im WHOOP Developer Dashboard registrierte
App bleibt die Oberfläche bewusst `NOT_CONFIGURED`; sie erzeugt weder
Beispieldaten noch einen falschen Live-Status.

Benötigte Konfigurationsnamen:

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_OAUTH_STATE_SECRET` mit mindestens 32 Byte
- optional `WHOOP_TOKEN_MASTER_KEY` mit mindestens 32 Byte; andernfalls wird
  ausschließlich der ebenfalls mindestens 32 Byte lange
  `AGENTONE_HEALTH_MASTER_KEY` verwendet
- `PUBLIC_ORIGIN` oder `WHOOP_PUBLIC_ORIGIN`; daraus wird exakt
  `/agentone/whoop/callback` abgeleitet
- optional `WHOOP_REDIRECT_URI`, wenn sie exakt demselben HTTPS-Ursprung und
  Callbackpfad entspricht
- optional `WHOOP_SCOPES`

Secret-Werte werden nicht an den Browser übertragen, nicht auditiert und nicht
in dieser Dokumentation abgelegt.

## Freigaben und Datenumfang

Der Standard fordert nur die offiziellen Leserechte `read:cycles`,
`read:recovery`, `read:sleep`, `read:workout` sowie `offline` für die
Token-Erneuerung an. `read:body_measurement` ist optional. Profilname und
E-Mail werden nicht benötigt. WHOOP-Rohantworten werden nicht dauerhaft
gespeichert; AgentOne übernimmt ausschließlich normalisierte, vom persönlichen
Health-Consent erlaubte Messwerte.

Apple Health und WHOOP bleiben getrennte Quellen. Vergleiche setzen dieselbe
Metrik, kompatible Messmethoden und ausreichende zeitliche Abdeckung voraus.
Alle Ausgaben sind deskriptiv und enthalten keine Diagnose, Therapie- oder
Behandlungsempfehlung.

## OAuth- und Token-Lebenszyklus

1. Die angemeldete Person bestätigt den Start in der WHOOP-Karte.
2. AgentOne erzeugt einen signierten, benutzer- und redirectgebundenen State.
   Der Datensatz liegt persistent in SQLite, ist zeitlich begrenzt und atomar
   nur einmal verwendbar. Parallele Starts bleiben mengenbegrenzt; ein
   erfolgreicher Callback schließt andere offene States desselben Benutzers.
3. Der öffentliche Callback validiert ausschließlich die freigegebenen
   Parameter. Intern werden Code und State im geschützten Request-Body und
   nicht in einer internen URL transportiert.
4. Die öffentliche Callback-URL wird bei Erfolg, Ablehnung, Fehlformat,
   fehlender Konfiguration und Netzwerkfehler immer durch einen festen
   `303`-Redirect bereinigt.
5. Der Refresh-Token liegt AES-256-GCM-verschlüsselt mit benutzergebundenem AAD
   in SQLite. Access-Tokens werden nicht gespeichert.
6. WHOOP rotiert Access- und Refresh-Token. AgentOne persistiert den neuen
   Refresh-Token unter einer benutzerspezifischen Lease. Fehlt er in einer
   Refresh-Antwort, stoppt die Verbindung fail-closed und verlangt eine neue
   Freigabe; der alte Token wird nicht erneut benutzt.

OAuth-Austausch, Refresh, Sync und Revoke besitzen eigene Zeitgrenzen im
App-Prozess. Ein Proxy-Timeout allein gilt nicht als Provider-Abbruch.

## Synchronisation

Der Sync verwendet die WHOOP-v2-Endpunkte für Zyklen, Recovery, Schlaf und
Workouts sowie optional Körpermaße. Collection-Seiten sind auf das offizielle
Maximum von 25 Elementen begrenzt. Seitenzahl, Datensatzmenge, Zeitfenster und
Gesamtlaufzeit sind zusätzlich begrenzt. Ein Cursor mit kleinem Überlappungs-
fenster ermöglicht inkrementelle, idempotente Läufe.

Providerfehler werden komponentenweise ausgewertet. Ein teilweiser Erfolg
speichert nur erfolgreiche normalisierte Quellen und rückt den globalen Cursor
nicht fälschlich vor. `429` und die WHOOP-Rate-Limit-Header werden in sichere
Retry-Metadaten übersetzt. Providertexte, Tokens und Rohpayloads erscheinen
weder in API noch Audit oder Command Stream.

## Trennung

Bei einer gültigen Sitzung erneuert AgentOne den Token, ruft offiziell
`DELETE /developer/v2/user/access` auf und entfernt danach lokal Connection und
Consent. Die UI sagt nur dann „bei WHOOP widerrufen“, wenn der Provider dies
bestätigt hat.

Ist die Freigabe bereits ungültig, der Token nicht mehr entschlüsselbar oder
die Providerkonfiguration nicht mehr verfügbar, kann die Person trotzdem
lokal trennen. In diesem Fall lautet das Ergebnis ausdrücklich
`REVOCATION_UNCONFIRMED`; die Oberfläche fordert zur Kontrolle im WHOOP-
Dashboard auf. Bereits importierte normalisierte Messwerte bleiben bis zu
einer eigenen, ausdrücklich bestätigten Health-Löschung erhalten.

## Öffentliche Zustände und Aktionen

- `NOT_CONFIGURED`: Serverkonfiguration oder starker Schlüssel fehlt
- `READY`: konfiguriert, persönliche Freigabe steht aus
- `CONNECTING`: OAuth-Rücksprung oder Sync läuft
- `LIVE`: letzter vollständiger Sync war erfolgreich
- `DEGRADED`: verbunden, aber letzter Lauf war teilweise oder vorübergehend
  fehlerhaft
- `RECONNECT_REQUIRED`: Tokenrotation oder Autorisierung ist nicht mehr
  verwendbar

Start, Sync und Disconnect sind an die authentifizierte Personal-Session,
denselben Benutzer und Same-Origin-Anforderungen gebunden. Mutationen benötigen
die jeweilige explizite Human-Action-Kennung.

## Webhooks und offene Provider-Abnahme

WHOOP-Webhooks bleiben deaktiviert, bis eine dauerhafte Queue, persistente
`trace_id`-Deduplizierung und Reconciliation bereitstehen. Der vorhandene
Signaturprüfer allein wird nicht als produktive Webhook-Integration ausgegeben.

Für den ersten echten Live-Test fehlen derzeit die im WHOOP Developer Dashboard
zu registrierenden Client-Credentials. Nach deren Eintragung müssen mindestens
Authorization, Redirect-Akzeptanz des längeren signierten State, initialer
Sync, Tokenrotation und Provider-Widerruf einmal gegen WHOOP selbst bestätigt
werden.

Der Release-103-Kandidat ist im letzten vollständigen lokalen Lauf Bestandteil
von 296/296 grünen Node-Tests. Diese Abnahme umfasst State-Lebenszyklus,
Callback-Bereinigung, Tokenverschlüsselung, Rotation, Sync-Grenzen,
Teilergebnisse, Rate-Limits, Consent, Trennung, Proxy und mobile UI. Sie ersetzt
weder eine registrierte WHOOP-App noch den ersten Provider-Roundtrip und wird
deshalb nicht als `LIVE` ausgewiesen.

Offizielle Grundlagen:

- [WHOOP OAuth](https://developer.whoop.com/docs/developing/oauth/)
- [WHOOP API v2](https://developer.whoop.com/api/)
- [WHOOP Pagination](https://developer.whoop.com/docs/developing/pagination/)
- [WHOOP Rate Limits](https://developer.whoop.com/docs/developing/rate-limiting/)
- [WHOOP Webhooks](https://developer.whoop.com/docs/developing/webhooks/)
