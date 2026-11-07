# AgentOne Personal · Command Stream

Stand: 7. November 2026

Der Command Stream ist der überprüfbare Arbeitslauf hinter Günni und Fressi. Er
ersetzt lose Aktionskarten durch eine geordnete Timeline:

```text
OBSERVE -> DECIDE -> TOOL -> [APPROVAL] -> RESULT
                                |             |
                                +---------- ERROR -> RETRY oder CANCEL
```

Das Kernmodul liegt in `server/personal-command-stream.mjs`. Es speichert Runs
und Schritte benutzerisoliert in SQLite und stellt Cursor-Replay für UI, PWA und
Voice bereit. Jeder Schritt trägt Modus, Quelle, Tool, Operation, Rechtebereich,
Scopes, Latenz, Payload-Hash und Status.

## Sicherheitsgrenzen

- Schreibende Tools wechseln vor Ausführung zwingend in `WAITING_APPROVAL`.
- Die Freigabe ist an den exakten Payload-Hash gebunden und benötigt eine vom
  Server bestätigte menschliche Sitzung; ein Agent kann sie nicht selbst setzen.
- Verdeckte oder geheime Werte sind in schreibenden Tool-Eingaben unzulässig.
- Eingaben und Ergebnisse werden rekursiv redigiert und größenbegrenzt.
- Audit-Ansichten enthalten weder Prompts noch Ein-/Ausgabepayloads oder
  Secret-Werte.
- Nur als idempotent markierte Tools mit ausdrücklich retryable Fehler dürfen
  wiederholt werden. Eine schreibende Wiederholung benötigt eine neue Freigabe.
- Cancel ist terminal; abgeschlossene, fehlgeschlagene oder abgebrochene Runs
  können nicht still fortgesetzt werden.

## Status

Der Kern ist implementiert und getestet, aber noch nicht an die Personal-API
oder Oberfläche gebunden. Für die Integration muss der Access-Proxy die
menschliche Identität aus der verifizierten Session ableiten und als
`verifyHuman`-Grenze injizieren. Erst dann darf die UI Toolschritte freigeben.

