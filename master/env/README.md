# AgentOne Master-ENV

Die lokale Master-Konfiguration liegt in `.env.master`. Sie wird nicht committed und enthält die logisch zusammengeführten Werte der bisherigen ENV-Dateien.

Die Vorlage enthält außerdem die Namen der vorinstallierten PERSONAL-Connectoren für Google Kalender, Home Assistant, Spotify, Apple/iPhone Companion, DAV, private Mail, ntfy, Paperless-ngx, Immich, Mealie, Actual Budget und den Raspberry-Pi-Home-Connector. Leere Werte bedeuten `SETUP` und aktivieren niemals automatisch einen Live-Zugriff. Der Bring!-Bridge-Slot bleibt mangels offizieller Consumer-API standardmäßig deaktiviert.

## Regeln

- Keys, Passwörter und abweichende Quellwerte bleiben erhalten.
- Nur exakt identische Duplikate dürfen entfallen.
- Frühere Dateien liegen unverändert unter `sources/`.
- `.env.example` enthält ausschließlich Namen und leere Beispielwerte.
- Browser-Code erhält niemals ENV-Werte. Die lokale API meldet nur, ob erforderliche Namen konfiguriert sind.
- Production-Schreibzugriffe bleiben im Demomodus unabhängig von vorhandenen Zugangsdaten blockiert.
- Gesundheitsdaten werden nur aktiviert, wenn `AGENTONE_HEALTH_MASTER_KEY` gesetzt ist. Als kontrollierter Entwicklungs-Fallback ist `AGENTONE_DEMO_MASTER_KEY` zulässig; Microsoft-/Graph-Secrets werden dafür niemals verwendet.
- Der Health-Master-Key muss zufällig, instanzspezifisch und außerhalb des Browsers verwaltet werden. Ein späterer Keywechsel benötigt eine geplante Re-Verschlüsselung bestehender Datensätze.

## Umgebungen

- `agentone-main`: Plattform-Hauptlinie, in der Demo Read-only.
- `agentone-dev`: Plattform-Entwicklung und sichere Simulation.
- `agentone-personal-main`: Personal-Hauptlinie, in der Demo Read-only.
- `agentone-personal-dev`: Personal-Entwicklung und sichere Simulation.

Neue Integrationen werden zuerst in den beiden `*-dev`-Linien geprüft und erst nach dokumentierter Abnahme nach `*-main` übernommen.
