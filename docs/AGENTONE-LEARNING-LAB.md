# AgentOne Learning Lab

Stand: 7. November 2026

Das Learning Lab übernimmt den nützlichen Teil der Hermes-Lernschleife, ohne
einen zweiten Agenten- oder Memory-Stack einzuführen. Ein erfolgreicher oder
korrigierter Lauf kann ein wiederverwendbares Verfahren vorschlagen. Der Agent
darf diesen Vorschlag jedoch weder selbst freigeben noch produktiv aktivieren.

```text
Run + Feedback
  -> STAGED
  -> statischer Secret-/Tool-/Gefahrenscan
  -> isolierter Replay-Test
  -> TESTED
  -> menschliche Hash-Freigabe
  -> APPROVED
  -> Release-Worker
  -> ACTIVE
```

Alternativ endet ein Kandidat als `REJECTED`. Eine aktive Version kann durch
eine menschliche Entscheidung auf eine ältere Version zurückgerollt werden und
erhält dann den Status `ROLLED_BACK`.

Kern: `server/personal-learning-lab.mjs`

Persistenz und ausführbarer Built-in-Skill:
`server/personal-learning-lab-store.mjs`

Tests: `server/personal-learning-lab.test.mjs`,
`server/personal-learning-lab-store.test.mjs` und
`server/personal-learning-lab-security.test.mjs`

## Release 100 · kontrollierter Jarvis-Skill

Release 100 bindet als ersten produktnahen Skill ausschließlich
`personal-briefing.v1` an. Der Skill ist serverseitig definiert und besitzt die
unveränderliche Read-only-Allowlist `mail.read`, `calendar.read` und
`health.summary`. Ein Browser oder Agent kann weder Verfahren noch Toolumfang,
Testbericht oder Freigabe-Actor vorgeben.

Der benutzerisolierte Store persistiert Draft, Testattestierung, menschliche
Exact-Hash-Freigabe, Aktivierung, Ausführungsnachweise und Rollback-Zustand. Die
Evaluation läuft deterministisch mit einer internen Fixture und wird
serverseitig an Kandidat, Skill-ID und Content-Hash gebunden. Freigabe,
Aktivierung und Rollback sind getrennte Human Gates; die technische
Statusänderung zur aktiven Revision schreibt ausschließlich der
`learning-release-worker`.

Eine aktive Revision liest echte, bereits berechtigte Mail-, Kalender- und
Health-Signale, erzeugt daraus ein deterministisches persönliches Briefing und
schreibt keine Daten zu den Quellsystemen zurück. Der Command Stream zeigt den
kontrollierten Ablauf. In der Ausführungsablage bleiben nur Hashes, Zähler,
Version und Zeitstempel; die benutzerseitige Antwort darf die für diesen
Benutzer bestimmten redigierten Briefing-Hinweise enthalten.

Die öffentliche Learning-Lab-Projektion zeigt Lifecycle, gekürzte
Attestierungsdaten, Provenienz und Ausführungsstatus. Verfahren, Prompts,
Payloads, Evidence, Rohdaten und Secrets werden weder dort noch im Audit
ausgegeben. Beim Laden und vor jeder Ausführung werden Lifecycle,
`is_active`, Guard, Testattestierung und menschliche Freigabe erneut geprüft.
Manipulierte Status- oder Evaluationszeilen werden daher fail-closed
abgewiesen. Skill und sichere Ausführungsnachweise überleben einen
Serverneustart.

**Status:** Release 100 ist produktiv ausgerollt und live verifiziert. Günni
führte `personal-briefing.v1` nach Draft, serverseitigem Test, Exact-Hash-
Freigabe und Aktivierung mit echten minimierten Mail-Signalen aus. Zwei
vollständige Containerrotationen bestätigten Persistenz und Benutzertrennung;
alle vier privaten App-/Access-Container blieben healthy. Source-Commit
`6a19ff4`, secret-freies Archiv SHA-256
`2d1288f280ac88875828714e036292cfb2767a9486545e58fb52156c025f2f10`
und Image-ID
`sha256:174f4e2409797336524f9f922989288c231d55449496cd32b8248350f3ee1516`
sind der abgenommene Release-Stand.

## Durchgesetzte Grenzen

- Der Inhalts-Hash bindet Name, Verfahren, Tool-Allowlist, Herkunft, Benutzer,
  Quelllauf, Version und Vorgängerversion unveränderlich zusammen.
- Secrets, private Schlüssel, destruktive Shellmuster, dynamische
  Codeausführung, Credential-Zugriffe und Sicherheitsumgehungen blockieren die
  Prüfung.
- Unbeschränkte Shell-, Secret- und Admin-Tools sind nicht zulässig.
- Ein Test gilt nur als bestanden, wenn alle Fälle isoliert und erfolgreich
  liefen.
- Freigabe, Ablehnung, Sperre und Rollback verlangen einen Actor vom Typ
  `human`; ein Agent kann diese Rollen nicht übernehmen.
- Eine Freigabe gilt nur für exakt den geprüften SHA-256-Inhalt.
- Gesperrte kuratierte Skills können nicht als Basis einer stillen Änderung
  dienen.
- Die Auditansicht enthält keine Verfahrensschritte, Belege oder beschreibenden
  Inhalte und eignet sich damit für redigierte Betriebsprotokolle.

Der neue Built-in-Skill führt weiterhin keinen vorgeschlagenen Fremdcode aus.
Er verarbeitet nur das fest implementierte, deterministische Briefing mit
fester Tool-Allowlist. Frei programmierbare Skills benötigen später zusätzlich
eine getrennte Prozess- oder Container-Sandbox mit Zeit-, Kosten- und
Netzwerkgrenzen sowie serverseitig signierten Attestierungen.
