# AgentOne Personal – Gesundheitsdaten

Stand: 7. November 2026

## Umsetzungsstatus

| Baustein | Status | Heute nutzbar |
| --- | --- | --- |
| Gemeinsames Health-Metrik-Schema | `IMPLEMENTED` | Apple- und WHOOP-Daten werden mit Quelle, Consent-ID, Einheit, Zeitzone und stabiler Deduplizierungs-ID normalisiert. |
| Apple-Health-Export | `LIVE (SMALL)` | `export.xml` und das originale Apple-ZIP können bis 32 MiB importiert werden. ZIP-Pfade, Verschlüsselung, Größe, Kompressionsrate und CRC werden geprüft; größere Archive bleiben bis zu einem isolierten Worker `PREPARED`. |
| Quellenvergleich | `IMPLEMENTED` | Schritte, Schlaf und weitere deckungsgleiche Tageswerte werden Apple gegen WHOOP verglichen; Unterschiede bleiben deskriptiv. |
| Health-Digest | `IMPLEMENTED` | Datenabdeckung und Quellenabweichungen werden als Hinweise ausgegeben – ausdrücklich ohne Diagnose. |
| WHOOP V2 | `PREPARED` | OAuth-URL, minimale Scope-Allowlist, V2-Normalisierung und eine Signatur-Prüffunktion sind implementiert. Ein produktiver OAuth-/Webhook-Endpunkt existiert ohne registrierte WHOOP-App und Benutzerzustimmung noch nicht. |
| Native HealthKit-Synchronisation | `PREPARED` | Benötigt die separate iOS-Companion-App, Apple-Entitlement, App-Signierung und Freigabe je Datentyp. Ein Server oder eine PWA kann HealthKit nicht direkt lesen. |

Implementierung: `server/personal-health.mjs`  
Tests: `server/personal-health.test.mjs`

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

Für eine spätere Webhook-Annahme liegt eine isoliert getestete Signatur- und Zeitfensterprüfung vor. HTTP-Endpunkt, schnelle Bestätigung, Queue, Wiederholschutz und periodischer Abgleich sind noch zu implementieren und dürfen bis dahin nicht als `LIVE` angezeigt werden.

Offizielle Quellen:

- [WHOOP API und Scopes](https://developer.whoop.com/api/)
- [WHOOP OAuth 2.0](https://developer.whoop.com/docs/developing/oauth/)
- [WHOOP Webhooks und Signaturprüfung](https://developer.whoop.com/docs/developing/webhooks/)
- [WHOOP Recovery-Datenmodell](https://developer.whoop.com/docs/developing/user-data/recovery/)
- [WHOOP Sleep-Datenmodell](https://developer.whoop.com/docs/developing/user-data/sleep/)

## Vergleich und Hinweise

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
3. WHOOP-App registrieren, Redirect-URL konfigurieren und OAuth mit einem Testkonto abnehmen.
4. WHOOP-Webhook-Endpunkt, Queue, Replay-Schutz und periodischen Abgleich implementieren und testen.
5. iOS-Companion-Projekt für kontinuierlichen HealthKit-Sync signieren; jeder Datentyp bleibt einzeln schaltbar.
