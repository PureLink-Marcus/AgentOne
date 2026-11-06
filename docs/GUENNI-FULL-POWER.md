# Günni: VOLLGAS und SAFE

Günni startet auf jedem neuen Gerät im Modus **VOLLGAS**. Der Benutzer kann unter **Günni und Design → Günni Betriebsmodus** jederzeit **SAFE** einschalten.

## VOLLGAS

- alle sechs persönlichen Memory-Bereiche sind standardmäßig aktiv;
- neue Connector-Einrichtungen wählen alle angebotenen, nützlichen Berechtigungen vor;
- Home-Assistant-Komfortaktionen für Licht, Medien, Klima, Lüfter, Abdeckungen, Staubsauger, Helfer, Szenen, Skripte und Automationen laufen ohne zusätzlichen Browserdialog;
- Tagesbriefing ist standardmäßig morgens und abends aktiv;
- Standortzonen sind als gewünschter Modus vorausgewählt;
- Voice, Siri und freigegebene Tools bleiben direkt erreichbar.

Nur tatsächlich konfigurierte Dienste werden als `LIVE` dargestellt. Fehlende Konten, Tokens oder Geräte werden nicht simuliert und erhalten keine erfundenen Zugriffe.

## SAFE

SAFE aktiviert Bestätigungsdialoge für freigegebene Home-Assistant-Komfortaktionen. Der Zustand wird auf dem jeweiligen Gerät gespeichert und bleibt nach einem Neustart erhalten.

## Unveränderliche Schutzgrenzen

Diese Grenzen gelten auch in VOLLGAS:

- Schlösser, Alarmanlagen und Sirenen sind nicht steuerbar;
- Secret-Export und irreversible Verwaltungsaktionen bleiben geschützt;
- Connector-Allowlist, Entitätsfreigaben und Netzwerkgrenzen werden nicht erweitert;
- ein fehlender Dienst, Schlüssel oder Benutzerzugriff wird nicht umgangen;
- Produktionszugriffe erhalten durch VOLLGAS keine zusätzlichen Schreibrechte.

## Testabdeckung

Der Browser-Smoke-Test prüft:

1. Günni startet mit `VOLLGAS`;
2. eine freigegebene Lichtaktion wird ohne Dialog ausgeführt;
3. nach Aktivierung von SAFE erscheint genau ein Bestätigungsdialog;
4. alle sechs Memory-Bereiche sind aktiv;
5. der Request kennzeichnet den Modus als `full-power` beziehungsweise `safe`.
