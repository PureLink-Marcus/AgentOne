# Hetzner/Coolify Deployment

Stand: 6. November 2026

## Ergebnis

AgentOne wurde als neuer, isolierter Coolify-Service auf `container2.purelink.de` ausgerollt. Bestehende CrewAI- und TechHub-Ressourcen wurden nicht verändert.

| Ressource | Ausführung | Zustand |
|---|---|---|
| Coolify-Projekt | `agentone` · `w9vvisnubnvu2gfsv7qg3tws` | aktiv |
| Service | `agentone-platform-stack` · `sir37msobwojpocmdw3l6sbp` | `running:healthy` |
| AgentOne Platform | separater PureLink-Stack | healthy; eigener Release- und Abnahmepfad |
| AgentOne PostgreSQL | `postgres:17-alpine` | healthy, 4 Migrationstabellen |
| AgentOne Personal | `purelink/agentone:2026.11.06-79` | Günni/Fressi healthy, Jarvis-inspiriertes Command Center, Routinen, Memory und lokaler Modellpfad |
| Personal PostgreSQL | `postgres:17-alpine` | healthy, 4 Migrationstabellen |
| AgentOne Personal Gateway | `ghcr.io/openclaw/openclaw:2026.10.8` | healthy, Gateway-Health erfolgreich |
| AgentOne Access Proxy | `purelink/agentone:2026.11.06-79` | healthy, PWA, Modellrouting, Connector-Governance und LIVE Home Connector; Connector-v4-Update signiert bereit |

### Private Instanzen

Das separate Coolify-Projekt `agentone-private` (`wiffxsv356methmn4zhiqehd`) betreibt den Service `agentone-private-stack` (`gohudyegrv06p4jikisfk2x1`). Fressi und Günni besitzen jeweils eine eigene App, PostgreSQL-Datenbank, OpenClaw-Runtime, Access-Proxy, Login-Session und vier persistente Volumes. Es werden weder Datenbanken noch Memory-, Workspace- oder Konfigurationsvolumes geteilt.

| Instanz | URL | Komponenten | Abnahme |
|---|---|---|---|
| Fressi | `https://fressi.mwart.solutions` | `fressi-app`, `fressi-db`, `fressi-gateway`, `fressi-access` | TLS, Login und authentifizierte Oberfläche bestanden; alle Container healthy |
| Günni | `https://guenni.mwart.solutions` | `guenni-app`, `guenni-db`, `guenni-gateway`, `guenni-access` | TLS, Login und authentifizierte Oberfläche bestanden; alle Container healthy |

Die serverseitigen Zugangsdaten liegen ausschließlich im ignorierten Master-ENV und zusätzlich zur Übergabe in `output/demo/private-access.txt`. Die öffentliche Anwendung gibt weder Passwörter noch Gateway-Token oder OpenAI-Schlüssel aus.

### PWA und Instanzwechsel

PureLink, Fressi und Günni liefern dasselbe versionierte PWA-Grundgerüst. Das Instanzmenü erlaubt das Hinzufügen weiterer HTTPS-Instanzen, den Wechsel zwischen Domains sowie lokales Aktivieren, Deaktivieren und Entfernen. Beim Wechsel wird ausschließlich das nicht vertrauliche Instanzverzeichnis übergeben. Jede Zieldomain verlangt weiterhin ihre eigene Anmeldung und behält eigene Cookies, Daten, Memory- und Workspace-Volumes.

Der Service Worker cached nur versionierte UI-Dateien, Schriftarten und das AgentOne-Icon. Navigationen, Logins, Cookies, Chats, API-Antworten und persönliche Inhalte bleiben network-only. Ein lokales Deaktivieren stoppt keinen Container; betriebliche Stop-/Start-Aktionen bleiben dem auditierten Admin-Control-Center vorbehalten.

Installation: URL in Chrome oder Edge öffnen, anmelden und im Browsermenü **App installieren** beziehungsweise auf Mobilgeräten **Zum Startbildschirm hinzufügen** wählen.

Die OpenClaw-Basis folgt dem offiziellen, gepinnten Container und besitzt ein eigenes Konfigurations- und Workspace-Volume. Sie ist nicht die sichtbare Produktoberfläche: Der Access Proxy liefert das AgentOne Personal Command Center und bettet nur die benötigte Runtime als gleich-originigen, AgentOne-gestalteten Live-Chat ein. `gateway.mode=local`, Trusted-Proxy-Authentifizierung, deaktiviertes Bonjour, eingeschränkte Linux-Capabilities und `no-new-privileges` sind gesetzt. Beim Rollout wird ausschließlich die aktuelle interne IP des AgentOne-Proxys im gemeinsamen Service-Netz als vertrauenswürdig eingetragen; der Proxy entfernt fremde Identitäts- und Forwarded-Header und setzt die geprüfte AgentOne-Identität selbst.

## Funktionsprüfung

In beiden App-Containern wurden erfolgreich geprüft:

- anonymer Bootstrap ohne Welt-, Session- oder Auditdaten;
- AgentOne-Personal-Konto-Login und HttpOnly-/Secure-Session;
- vier Welten und drei Sessions nach Anmeldung;
- vier persönliche Ergebnisereignisse;
- Admin-Secret-Inventar ohne Secret-Werte;
- Verbindung zur jeweils eigenen PostgreSQL-Datenbank;
- vier angelegte Migrationstabellen und Runtime-Heartbeat.

OpenClaw meldet einen erfolgreichen Container-Healthcheck. Nach ausdrücklicher Freigabe wurde der vorhandene OpenAI-Zugang ausschließlich serverseitig als `OPENAI_API_KEY` eingebunden. GPT‑6 Luna und GPT‑6.1 Sol wurden mit echten Minimalaufrufen geprüft. Luna ist der günstige Standard, Sol der automatische Fallback und Astra bleibt als bewusst wählbare Premiumstufe sichtbar. Das Prüfskript redigiert Fehlerausgaben und gibt weder Schlüssel noch Passwörter aus.

## Sicherheits- und Netzwerkstatus

- AgentOne Personal ist unter `https://agentone-personal.178.105.207.219.sslip.io` erreichbar.
- Marcus' PureLink AgentOne ist produktiv unter `https://agentone.purelink.de` erreichbar. Frühere Jarvis-, `sslip.io`- und `agentone.mwart.solutions`-Namen werden nicht mehr als geschäftlicher Einstieg verwendet.
- AgentOne Assistant besitzt eine eigene responsive Anmeldeseite. Erfolgreiche Anmeldung erzeugt ein signiertes, zwölf Stunden gültiges `HttpOnly`-/`Secure`-/`SameSite=Lax`-Cookie; Fehlversuche werden begrenzt. Die Zugangsdaten liegen ausschließlich in der ignorierten Datei `output/demo/mobile-access.txt` und im Master-ENV.
- Nach erfolgreicher AgentOne-Anmeldung wird die geprüfte Benutzeridentität an den internen Gateway übergeben. Benutzer müssen keinen OpenClaw-Gateway-Token mehr eingeben.
- PostgreSQL ist ausschließlich im Coolify-Dockernetz erreichbar.
- Der OpenClaw-Gateway besitzt keinen direkten öffentlichen Host-Port; nur der vorgeschaltete AgentOne-Proxy erreicht ihn im internen Netz.
- Produktionsmutationen der AgentOne-Demo bleiben deaktiviert.
- Coolify redigiert Environment-Werte in Deploymentlogs.
- Daten liegen in sechs persistenten Volumes; Container können ohne Datenverlust ersetzt werden.
- Günnis PostgreSQL-17-Datenbank wurde am 6.11.2026 per Custom-Format-Dump in eine isolierte temporäre Datenbank restauriert; sieben Public-Tabellen und Dump-Liste wurden geprüft, anschließend Testdatenbank und Dump automatisch entfernt.
- Neue Deployment-Secrets wurden ohne Ausgabe in `master/env/.env.master` ergänzt.

Der aktuelle Formularzugang ist ein sicherer Einzelbenutzer-Bootstrap für die Testphase. Self-Service-Konten, Einmal-Einladungen, Passwortwechsel/-Reset, Passkeys oder TOTP sowie Entra-Anmeldung folgen vor einer breiteren Benutzerfreigabe.

### Öffentliche Domains und Vertrauensgrenzen

Die `sslip.io`-Übergangsadressen werden im PureLink-Netz von FortiGuard als Dynamic DNS blockiert. Der Zielaufbau trennt deshalb Geschäft und Privatbetrieb in zwei Coolify-Projekte und zwei Laufzeitgrenzen. OpenClaw bleibt in beiden Fällen nur die interne Runtime; öffentlich heißen alle Oberflächen AgentOne.

| Grenze | Öffentlicher Name | Zweck | DNS-Zustand am 30.10.2026 |
|---|---|---|---|
| PureLink | `agentone.purelink.de` | Marcus' geschäftlicher AgentOne | `A → 178.105.207.219` auflösbar |
| PureLink | `agentone-platform.purelink.de` | Plattform, Welten und Administration | Record eingetragen, öffentliche Auflösung noch ausstehend |
| Privat | `fressi.mwart.solutions` | privater AgentOne-Personal-Zugang Fressi | `A → 178.105.207.219` |
| Privat | `guenni.mwart.solutions` | privater AgentOne-Personal-Zugang Günni | `A → 178.105.207.219` |

Das Projekt `agentone-purelink` enthält nur PureLink-Identitäten, Quellen, Datenbanken und Connectoren. Das Projekt `agentone-private` enthält Fressi und Günni als getrennte Benutzerbereiche mit getrennten Sessions, Quellen und Memory-Daten. Zwischen beiden Projekten gibt es keine implizite Datenfreigabe. Gemeinsame Ergebnisse dürfen ausschließlich über explizite, auditierte Übergabeereignisse ausgetauscht werden.

`AGENTONE_ASSISTANT_ORIGIN` ist gesetzt; OpenClaw-Origin, Coolify-Route und Zugriffsschutz wurden erfolgreich geprüft. FortiGate sollte den Namen als normale Anwendung zulassen und von einer eventuell erzwungenen TLS-Inspektion ausnehmen.

## Release und Wiederholbarkeit

- Release-Archiv: `output/demo/agentone-release-2026.11.06-79.tgz`
- SHA-256: `6C92C19D9FEB20F1B26396DD80B94084ED266FDA6B686F98E106E43BB02FC5A5`
- Coolify-Manifest: `output/demo/coolify-deployment.json`
- Image: `purelink/agentone:2026.11.06-79`

Prüfskripte:

```powershell
node scripts/coolify-inspect.mjs
node scripts/hetzner-verify.mjs
node scripts/hetzner-app-smoke.mjs
node scripts/openclaw-openai-smoke.mjs
node scripts/mobile-online-smoke.mjs
node scripts/postgres-restore-smoke.mjs
npm run deploy:remote
npm run verify:remote
```

Das Deployment wird aktuell aus einem lokalen, secret-freien Release-Archiv als versioniertes Image direkt auf dem Hetzner-Host gebaut. Der Arbeitsordner ist inzwischen als Git-Checkout mit `origin` auf `PureLink-Marcus/AgentOne` vorbereitet. Die Branches `agentone-main`, `agentone-dev`, `agentone-personal-main` und `agentone-personal-dev` werden aus dem geprüften Release-79-Commit erzeugt; der Remote-Push benötigt eine erneuerte GitHub-Authentifizierung.
