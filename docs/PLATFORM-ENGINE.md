# AgentOne Platform Engine

Stand: 30. Oktober 2026 · Release `2026.10.30-33`

## Produktiv im Release Candidate

- unveränderliche, versionierte Workflow-Vorlagen;
- persistente Runs und Einzelschritte;
- sichere Checkpoints sowie Pause/Resume;
- harte Budgetgrenzen mit expliziter Erhöhung;
- READ-, WRITE- und DEPLOY-Risikoklassen;
- Human Gates, die exakt an den aktuellen Payload-Hash gebunden sind;
- persistente Engine-Ereignisse und vollständige Control-Plane-Snapshots;
- authentifizierte SSE-Live-Events mit Benutzer-/Welt-Isolation, Replay, Heartbeats und Secret-Redaction;
- Orbit- und Listenansicht, Run-Drawer, Schritte, Ereignisse, Gates, Handoffs und Connector-Grenzen.

Ein Browser darf ausschließlich READ-Schritte der Demo-Engine fortschalten. WRITE- und DEPLOY-Schritte werden nicht aus der Browserroute ausgeführt. Dafür ist später ein isolierter Worker erforderlich, der zusätzlich Ziel-Allowlist, gültiges Gate, Payload-Hash und Connector-Rechte prüft.

## Weitere Ausbaufolge

1. PostgreSQL als alleinige Engine-Persistenz und transaktionale Queue mit Leases.
2. Worker-Prozess mit Wiederholungsschutz, Timeout, Retry und Dead-Letter-Zustand.
3. Connector-Gateway-Protokoll mit mTLS, kurzlebigen signierten Jobs und Capability-Manifesten.
4. Agententeams, typisierte Handoffs, Artefakte und Merge-Konfliktbehandlung.
5. Änderungssätze, Snapshot, Vier-Augen-Prinzip, Apply und nachweisbares Undo.
6. Scheduler, Kostenbuchung, Benachrichtigungen und gespeicherte Dashboard-Ansichten.
7. Mandanten-/Abteilungsgrenzen, feinere Rollen und automatisierte Personal-Gateway-Provisionierung.
8. Backup/PITR, Restore-Abnahme, Lasttest, Accessibility- und 1.000-Knoten-Performanceprüfung.

Diese Reihenfolge folgt den Phasen S2 bis S7 des Hauptplans. Produktive Mutationen bleiben gesperrt, bis Worker, Connector-Gateway, Gate-Prüfung und Undo gemeinsam abgenommen sind.
