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

Implementierung: `server/personal-learning-lab.mjs`  
Tests: `server/personal-learning-lab.test.mjs`

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

Das Modul führt keinen vorgeschlagenen Code aus. Spätere Replay-Ausführung
gehört in eine getrennte Sandbox mit fester Tool-Allowlist, Test-Fixtures,
Zeit-, Kosten- und Netzwerkgrenzen.
