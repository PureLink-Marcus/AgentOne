# AgentOne – Abschlussprotokoll Phasen 01–20

Stand: 29. Oktober 2026. Alle Phasen dieses lokalen Hybrid-Demopakets sind umgesetzt und durch automatisierte Prüfungen abgedeckt. `LIVE` bedeutet ausschließlich einen erfolgreichen, erlaubten Lesezugriff; jeder unsichere oder nicht erreichbare Pfad fällt auf `SIMULATED` beziehungsweise `DEGRADED` zurück.

| Phase | Ergebnis | Abnahmekriterium |
|---:|---|---|
| 01 | Demo-Grundgerüst | React/TypeScript, Vite, Node-API und SQLite starten gemeinsam auf `127.0.0.1:4173`; der Serverbetrieb ergänzt getrennte PostgreSQL-17-Datenbanken. |
| 02 | Master-ENV | Eindeutige Werte sind in `master/env/.env.master` konsolidiert; Quellen bleiben erhalten und ignoriert. |
| 03 | Secret-Grenze | Browser und öffentliche API erhalten nur Variablennamen und Konfigurationsstatus, nie Werte. |
| 04 | Verschlüsselter Demo-Vault | AES-256-GCM mit zufälligem IV und Authentifizierungstag; Roundtrip ist getestet. |
| 05 | Microsoft Entra/OIDC | Authorization-Code-Flow mit serverseitigem Tokenaustausch ist implementiert. |
| 06 | PKCE, State und Nonce | Verifier/Challenge sowie kurzlebiger State und Nonce werden serverseitig geprüft. |
| 07 | Token- und Mandantenprüfung | Signatur, Issuer, Audience, Tenant und PureLink-Maildomain werden validiert. |
| 08 | Sichere Sessions | Opaque Tokens, SHA-256-Hash im lokalen Session-Store, HttpOnly, SameSite=Lax und Secure-Cookies im HTTPS-Deployment. |
| 09 | Rollen und Administration | Admin-Routen erzwingen eine gültige `Platform Admin`-Session. |
| 10 | Browser-Ursprungsgrenze | Mutationen akzeptieren ausschließlich die lokale Demo-Origin. |
| 11 | Idempotente Provisionierung | Wiederholter Login erzeugt keinen doppelten Benutzer- oder Instanzbestand. |
| 12 | Persönliche Instanzen | Persistenter Status pro Benutzer in `agentone-personal-dev`. |
| 13 | Quarantäne-Lebenszyklus | Sperren, Rebuild, 30-Tage-Quarantäne und Restore sind modelliert und auditiert. |
| 14 | Ereignisbus | Welt-Ergebnisse tragen User, World, Workflow, Run, Sensitivity und Trace-ID. |
| 15 | Adaptervertrag | Alle Integrationen verwenden Status, Fähigkeiten, Anforderungen und denselben Fallback. |
| 16 | Sicherer Hybridmodus | Live nur bei Konfiguration und erlaubtem Healthcheck; Schreibpfade bleiben blockiert. |
| 17 | Agentenzusammenarbeit | Welt-AgentOne visualisiert parallele Agenten, Handoffs, Gates, Merge, Push und Report. |
| 18 | Personal- und Admin-Oberfläche | Inbox, Chat, Quellen, Kanäle, Instanzen, Sessions, Audit und Secret Registry sind klickbar. |
| 19 | Observability und Audit | Health-Latenz, Status, Traces und administrative Inhaltszugriffe werden sichtbar protokolliert. |
| 20 | Automatisierte Abnahme | Unit-, Build- und Chrome-Smoke-Test prüfen Login, Navigation, Admin, Adapter und Secret-Leaks. |

## Sicherheitsgrenzen

- Produktionsschreibzugriffe sind im Demomodus technisch blockiert.
- Das Secret-Inventar liefert ausschließlich Metadaten; `valueVisible` ist immer `false`.
- Microsoft-Anmeldung benötigt eine in Entra registrierte lokale Callback-URL. Ohne erfolgreiche externe Anmeldung bleibt die Demo-Anmeldung vollständig nutzbar.
- Echte Healthchecks können aufgrund lokaler Netzgrenzen `DEGRADED` anzeigen; das ist ein erwarteter, isolierter Zustand.

## Reproduzierbare Abnahme

```powershell
npm install
npm test
npm run build
npm run demo
npm run smoke
```

Die visuelle Abnahme und Screenshots liegen unter `output/demo/`.

Die ursprünglichen Demo-Phasen wurden anschließend betrieblich weiterentwickelt. Der aktuelle Serverstand ist Release `2026.10.30-33` mit persistenter Plattform-Engine, Live-Event-Bus, PWA-Mehrinstanzverwaltung, benannten Personal-Assistenten, drei Personal-Oberflächen, Voice Chat, Private Access, iPhone-/Health-Konzept, PERSONAL-/BUSINESS-Profilen und individuellen Themes. Die lokale Phasenabnahme und die betriebliche Coolify-Abnahme bleiben getrennt dokumentiert, damit ein erfolgreicher Simulatorlauf nicht mit einer produktiven Integrationsfreigabe verwechselt wird.
