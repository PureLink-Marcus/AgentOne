# AgentOne Personal – Gesundheitsdaten

Stand: 7. November 2026

## Umsetzungsstatus

| Baustein | Status | Heute nutzbar |
| --- | --- | --- |
| Gemeinsames Health-Metrik-Schema | `IMPLEMENTED` | Apple- und WHOOP-Daten werden mit Quelle, Consent-ID, Einheit, Zeitzone und stabiler Deduplizierungs-ID normalisiert. |
| Apple-Health-Export | `LIVE (SMALL)` | `export.xml` und das originale Apple-ZIP können bis 32 MiB importiert werden. ZIP-Pfade, Verschlüsselung, Größe, Kompressionsrate und CRC werden geprüft; größere Archive bleiben bis zu einem isolierten Worker `PREPARED`. |
| Quellenvergleich | `IMPLEMENTED` | Schritte, Schlaf und weitere deckungsgleiche Tageswerte werden Apple gegen WHOOP verglichen; Unterschiede bleiben deskriptiv. |
| Health-Digest | `IMPLEMENTED` | Datenabdeckung und Quellenabweichungen werden als Hinweise ausgegeben – ausdrücklich ohne Diagnose. |
| Health & Recovery UI | `IMPLEMENTED / LOCAL VERIFIED` | Release 95 zeigt Apple Health und WHOOP getrennt, einschließlich 14-Tage-Abdeckung, kompatibler Tagesvergleiche, inkompatibler Methoden, Datenqualität und rein datenbasierter Konfidenz. Ohne Daten bleibt der Zustand ehrlich `EMPTY` beziehungsweise `NOT_CONFIGURED`. |
| WHOOP V2 | `IMPLEMENTED CORE / PREPARED ACTIVATION` | Authorization-Code-Austausch, rotierender Refresh, vollständige V2-Pagination, Retention, idempotente Normalisierung, Teilerfolg und signatur-/zeit-/replaygeprüfte Webhook-Envelopes sind implementiert. Öffentliche OAuth-/Webhook-Routen bleiben bis zur registrierten WHOOP-App, verschlüsselten Tokenpersistenz und Queue bewusst aus. |
| Native HealthKit-Synchronisation | `PREPARED` | Benötigt die separate iOS-Companion-App, Apple-Entitlement, App-Signierung und Freigabe je Datentyp. Ein Server oder eine PWA kann HealthKit nicht direkt lesen. |

Implementierung: `server/personal-health.mjs`, `server/whoop-live-sync.mjs`
Tests: `server/personal-health.test.mjs`, `server/whoop-live-sync.test.mjs`

## Gemeinsames Datenmodell

Jeder Messwert enthält mindestens:

- stabile ID und Anbieter-ID zur idempotenten Wiederholung;
- Quelle `apple_health` oder `whoop`;
- kanonischen Metriknamen, Wert, Einheit und Aggregation;
- Beginn, Ende und bekannten UTC-Offset;
- Consent-ID, Eingangszeit und originalen Datentyp;
- Kennzeichnung `health` und `descriptive_not_medical`.

Die Freigabebereiche `activity`, `sleep`, `vitals`, `body` und `workouts` werden serverseitig pro kanonischer Metrik erzwungen. Nicht freigegebene Messwerte werden vor der Persistenz verworfen; die Antwort nennt nur Anzahl und kanonische Typen der Ausschlüsse. In der UI ist kein Bereich vorausgewählt.

Es werden keine Chat-Erinnerungen aus Rohdaten erzeugt. Ein späteres Memory darf nur zusammengefasste, ausdrücklich freigegebene Aussagen übernehmen. Klinische Akten, Medikamente und Diagnosen sind nicht Bestandteil dieser Stufe.

## Apple Health

Apple beschreibt HealthKit als lokalen Datenspeicher auf iPhone und Apple Watch. Eine App muss die HealthKit-Capability aktivieren und für jeden Datentyp eine feingranulare Lesefreigabe anfragen. Nutzer können nur ein begrenztes Zeitfenster freigeben und die Berechtigung später widerrufen. Eine Webanwendung besitzt diesen Zugriff nicht.

Der sofort nutzbare Weg lautet daher:

1. iPhone → Health → Profilbild → **Alle Gesundheitsdaten exportieren**;
2. das erzeugte ZIP in AgentOne Personal auswählen;
3. Vorschau der enthaltenen Kategorien, Zeitspanne und Zielinstanz anzeigen;
4. Import ausdrücklich bestätigen;
5. normalisierte Werte speichern; das originale Archiv standardmäßig verwerfen.

Der direkte Import ist auf 32 MiB begrenzt, weil ZIP-Dekompression und XML-Normalisierung in dieser Stufe noch synchron erfolgen. Größere Apple-Archive werden nicht teilweise verarbeitet, sondern benötigen den geplanten isolierten Worker-Import. Persistierte Nutzdaten und Freigaben werden mit `AGENTONE_HEALTH_MASTER_KEY` verschlüsselt; ein Graph-/OAuth-Secret wird niemals als Health-Schlüssel verwendet.

Ein explizit bestätigter Export ist eine sensible **Klartext-JSON-Datei**. Er ist auf 10.000 Datensätze und 16 MiB begrenzt, wird nicht gecacht und muss lokal sicher aufbewahrt werden.

Der Parser übernimmt aktuell Aktivität, Energie, Geh-/Laufstrecke, Herzfrequenz, Ruhepuls, HRV-SDNN, Atemfrequenz, Sauerstoffsättigung, Körpergewicht, Körpertemperatur, Trainingszeit, Schlafphasen und Workouts. Unbekannte Datentypen werden gezählt, aber nicht stillschweigend gespeichert.

Offizielle Quellen:

- [Apple HealthKit](https://developer.apple.com/documentation/healthkit/)
- [HealthKit-Zugriff autorisieren](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [HealthKit einrichten](https://developer.apple.com/documentation/healthkit/setting-up-healthkit)
- [Gesundheitsdaten auf dem iPhone als XML exportieren](https://support.apple.com/en-ca/guide/iphone/iph5ede58c3d/ios)

## WHOOP

WHOOP V2 verwendet OAuth 2.0. AgentOne fordert nur diese Lesebereiche an:

- `read:cycles`;
- `read:recovery`;
- `read:sleep`;
- `read:workout`;
- optional `read:body_measurement`;
- `offline`, damit die ausdrücklich erlaubte Synchronisation per rotierendem Refresh-Token fortgesetzt werden kann.

Profil und E-Mail werden nicht benötigt und daher standardmäßig nicht angefordert. Tokens gehören verschlüsselt in die persönliche Instanz und niemals in Browserlogs, Chat, Screenshots oder Audit-Inhalte. Trennen/Widerrufen muss den WHOOP-Zugriff serverseitig widerrufen und gespeicherte Tokens löschen.

Das eigenständige Onboarding-Modul `server/whoop-onboarding.mjs` bereitet die spätere öffentliche Verdrahtung vor, schaltet aber selbst keine Route frei. Es leitet die exakte HTTPS-Callback-URL `/agentone/whoop/callback` aus `PUBLIC_ORIGIN` ab oder prüft `WHOOP_REDIRECT_URI` strikt. Das UI darf ausschließlich das Public-View-Model mit Status, fehlenden ENV-Namen, Redirect, read-only Scopes und CTA erhalten; Client-Secret, State-Secret und Tokens sind nicht serialisierbar.

Die Zustände sind absichtlich streng: `NOT_CONFIGURED` bedeutet fehlende oder ungültige Serverkonfiguration, `READY` bedeutet konfiguriert, aber noch ohne nachgewiesenen erfolgreichen Live-Sync, und `LIVE` setzt sowohl eine persönliche Autorisierung als auch einen erfolgreichen Sync mit Zeitstempel voraus. OAuth-State wird serverseitig signiert, benutzer- und redirectgebunden, kurzlebig und in einem Single-Use-Replay-Speicher verbraucht. WHOOP dokumentiert für den Standard-Nutzerflow Authorization Code mit Client-Secret und `state`, derzeit aber keine PKCE-Parameter; deshalb behauptet oder sendet AgentOne kein PKCE. Falls WHOOP dies offiziell ergänzt, wird es erst nach separater Abnahme aktiviert.

Der isolierte Live-Sync tauscht Autorisierungscodes aus, rotiert Refresh-Tokens vor jedem Lauf und liest nur die tatsächlich freigegebenen Collections. Sammlungen werden bis zum letzten `next_token` verarbeitet; Seiten- und Datensatzlimits brechen mit einem wiederholbaren Fehler ab, ohne den Cursor vorzustellen. Ein Teilfehler erhält erfolgreiche Quellen, markiert den Lauf aber `PARTIAL`. Zugriffsschlüssel sind nicht serialisierbar und erscheinen weder in Rückgaben noch in Fehlern.

Webhook-Nachrichten werden anhand der offiziellen Header `X-WHOOP-Signature` und `X-WHOOP-Signature-Timestamp` als HMAC-SHA256 über `timestamp + raw_body` geprüft. Das Kernmodul validiert zusätzlich Zeitfenster, V2-Ereignistypen und `trace_id`-Replay. Es erzeugt nur ein minimiertes Queue-Envelope und speichert keinen Rohbody. Eine öffentliche Route darf erst nach einer dauerhaften Queue, benutzergebundener WHOOP-ID-Zuordnung und schneller `2XX`-Bestätigung aktiviert werden.

Offizielle Quellen:

- [WHOOP API und Scopes](https://developer.whoop.com/api/)
- [WHOOP OAuth 2.0](https://developer.whoop.com/docs/developing/oauth/)
- [WHOOP Webhooks und Signaturprüfung](https://developer.whoop.com/docs/developing/webhooks/)
- [WHOOP Recovery-Datenmodell](https://developer.whoop.com/docs/developing/user-data/recovery/)
- [WHOOP Sleep-Datenmodell](https://developer.whoop.com/docs/developing/user-data/sleep/)

## Vergleich und Hinweise

Release `2026.11.07-94` stellt den geprüften Vergleich intern unter
`GET /api/internal/personal/health/comparison` bereit; der authentifizierte
Personal-Gateway-Pfad lautet `GET /agentone/health/comparison`. Er akzeptiert
nur `periodDays` (1–90), `minimumCoverageDays` und `timeZone` (`Europe/Berlin`
oder `UTC`). Unbekannte oder doppelte Parameter werden ohne Wertreflexion
abgewiesen. Ohne konfigurierten Health-Master-Key bleibt der Pfad fail-closed.

Die Antwort enthält getrennte Serien je Quelle, Tagesabdeckung,
vergleichbare Tageswerte, Methodendifferenzen, datenbasierte Konfidenz und
minimierte Provenienz. Sie enthält weder Rohdatensatz-/Consent-IDs noch Secrets
oder medizinische Empfehlungen.

Release `2026.11.07-95` veröffentlicht diesen Vergleich in der persönlichen
Oberfläche als **Health & Recovery**. Die Oberfläche liest ausschließlich die
authentifizierten, benutzergebundenen Health-, Digest-, Comparison- und
WHOOP-Statuspfade. Sie berechnet keine zweite Browserwahrheit und zeigt keine
erfundenen Scores. Apple-Freigaben werden nur gezählt, wenn der Consent aktiv
ist und `apple_health` tatsächlich enthält; WHOOP-Freigaben werden nicht in die
Apple-Zahl eingerechnet.

Der lokale 390-px-Chrome-Smoke importiert eine kleine synthetische, PII-freie
Apple-XML-Datei mit drei Messwerten und vergleicht sie mit drei synthetischen
WHOOP-Werten. Erwartet werden zwei kompatible Vergleiche und eine explizite
HRV-Methodentrennung. Der Test löscht anschließend Messwerte und Freigaben und
verifiziert den Zustand `EMPTY`. Der Gesamtlauf für Release 95 umfasst 198/198
Node-Tests und einen erfolgreichen Production-Build. Persönliche Apple- oder
WHOOP-Daten wurden dabei nicht verwendet; die Live-Anbieterabnahme bleibt von
Benutzerfreigabe und WHOOP-Credentials abhängig.

Apple und WHOOP messen nicht zwingend denselben Zeitraum oder dieselbe physiologische Definition. Insbesondere WHOOP-Zyklen folgen Schlaf-Wach-Zyklen statt Kalendertagen. AgentOne zeigt deshalb immer beide Quellen, deren Zeitgrenzen und die prozentuale Abweichung an. Es überschreibt niemals einen Wert mit dem anderen.

Erlaubte Hinweise:

- Daten fehlen seit mehreren Tagen;
- Tragezeit beziehungsweise Quellenabdeckung ist unvollständig;
- Schlaf- oder Schrittwerte unterscheiden sich deutlich zwischen Quellen;
- persönlicher Trend hat sich gegenüber dem eigenen vorherigen Zeitraum verändert;
- Terminplanung könnte auf Wunsch einen ruhigeren Tag berücksichtigen.

Nicht erlaubt:

- Diagnose einer Erkrankung;
- Therapie-, Medikamenten- oder Notfallentscheidung;
- Bewertung anhand versteckter allgemeiner Grenzwerte;
- Weitergabe an eine Unternehmensinstanz oder andere Benutzer;
- automatisches Erzeugen dauerhafter Memory-Einträge ohne Freigabe.

## Nächste produktive Schritte

1. Große Apple-Archive in einem isolierten Worker streaming-fähig verarbeiten; bis dahin bleibt die 32-MiB-Grenze hart.
2. Den verschlüsselten benutzergebundenen SQLite-Store mit geplanter Key-Rotation und Re-Verschlüsselung betrieblich abnehmen; eine PostgreSQL-Migration ist separat.
3. WHOOP-App registrieren, Redirect-URL konfigurieren, Client-Credentials verschlüsselt setzen und den vorhandenen OAuth-/Sync-Kern mit einem Testkonto abnehmen.
4. Webhook-Queue, dauerhaften Replay-Speicher und Benutzerzuordnung anbinden; erst danach die öffentliche WHOOP-Webhook-Route aktivieren.
5. iOS-Companion-Projekt für kontinuierlichen HealthKit-Sync signieren; jeder Datentyp bleibt einzeln schaltbar.
