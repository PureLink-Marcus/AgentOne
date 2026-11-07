# AgentOne Personal

AgentOne Personal ist das eigenständige persönliche Assistenzprojekt innerhalb der AgentOne-Struktur. Die sichtbare Produktidentität bleibt **AgentOne**; Repository und Service heißen **AgentOne-Personal**.

## Verantwortungsgrenzen

- AgentOne Platform verwaltet Projekte, Welten, Workflows und zentrale Richtlinien.
- Jede Workflow-Welt besitzt genau einen `world-orchestrator` namens AgentOne.
- AgentOne Personal ist der `personal-agent` eines Benutzers. Er sammelt berechtigte Ergebnisse aus mehreren Welten, führt persönliche Quellen und Memory und verteilt Aufgaben an die zuständigen Welt-Orchestratoren.
- Interne PureLink-Ressourcen werden ausschließlich über den AgentOne Connector angesprochen.

## Benutzer und Isolation

Nach einem zulässigen Microsoft-Entra-Login wird idempotent ein eigenes Personal Gateway provisioniert. Jeder Benutzer erhält eine eigene Runtime, ein eigenes Netzwerk, ein eigenes verschlüsseltes Volume, eigene Quellen, Sessions, Secrets und Kanalverbindungen. Die stabile Entra-`oid` ist die technische Benutzerkennung; `@purelink.de` und `@purelink.com` bilden zusammen mit der Tenant-Prüfung die Zulassungsgrenze.

## Kanäle

V1 stellt Web, Microsoft Teams, Outlook, WhatsApp, Telegram, Slack und Discord als Adapter bereit. Nicht konfigurierte Kanäle verwenden im lokalen Demomodus schemaidentische Simulatoren.

## Dienste, Connectoren und OpenClaw-Plugins

Die Oberfläche trennt zwei technisch unterschiedliche Ebenen:

- **Konten und Geräte** verbinden externe Benutzerquellen wie Gmail, Kalender, Home Assistant, Spotify oder iPhone-Companions. Sie besitzen je Instanz eigene Zugangsdaten, Freigaben und Zustände `LIVE`, `PREPARED`, `DEGRADED` oder `DISABLED`.
- **OpenClaw-Plugins** stellen Werkzeuge, Provider und Kanäle innerhalb der persönlichen Agent-Runtime bereit. Der Katalog wird serverseitig aus der installierten OpenClaw-Registry bereitgestellt; Secret-Werte gelangen dabei nie in den Browser.

Release `2026.11.07-85` betreibt Fressi und Günni mit getrennten Apps, Datenbanken, OpenClaw-Runtimes, Access-Proxys und Volumes. Günni besitzt Command Center, Live-Inbox, Routinen, persistentes Memory, Jarvis Core für Text und Sprache, Home-Assistant-Steuerung, Connector-Governance, sichere Mail-Antwortentwürfe, echten Google-Mail-/Kalender-Sync, Apple-Health-Import sowie einen automatischen, deduplizierten Pulse mit wirksamem Benutzerfeedback. Externe Konten und Geräte benötigen trotz geladener Plugins weiterhin eigene Zugangsdaten beziehungsweise Benutzerfreigaben.

Ein externer Dienst gilt erst nach erfolgreichem Healthcheck als `LIVE`. Das bloße Vorhandensein eines OpenClaw-Plugins oder einer gespeicherten Connector-Freigabe reicht dafür nicht aus.

## Konto und persönlicher Chat

Der öffentliche Einzelbenutzer-Testzugang verwendet ein normales AgentOne-Formular statt Browser-Basic-Auth. Zugangsdaten werden konstant verglichen, Fehlversuche begrenzt und erfolgreiche Anmeldungen als opaque, serverseitig gehashte Secure-/HttpOnly-Session gespeichert. Entra Authorization Code + PKCE bleibt für die spätere Mehrbenutzerfreigabe vorbereitet.

Der persönliche Webchat verwendet serverseitig die OpenAI Responses API. `gpt-6-luna` ist der kostengünstige Standard für Chat, Mail-Triage und häufige Routinen, `gpt-6.1-terra` ist die bewusste Auswahl für Bilder und Dokumente und `gpt-6.1-sol` bleibt komplexen Aufgaben vorbehalten. Deterministische Mail-Gruppierung und Connector-Synchronisation benötigen kein Sprachmodell. Ohne konfigurierten Schlüssel bleibt derselbe Endpoint als sichtbar markierter Simulator verfügbar. Schlüssel, Prompts und Antworten werden nicht im Audit protokolliert; dort erscheinen nur Modus und Modell.

Jarvis Core ist die schnelle Kommunikationsoberfläche von Günni, nicht eine dritte Instanz. Release 98 liefert einen live abgenommenen Push-to-talk-Pfad: Mikrofonzugriff erst nach bewusstem Klick, mindestens eine Sekunde Aufnahme, `gpt-transcribe`, standardmäßig aktives Auto-Send und eine progressive NDJSON-Modellantwort. Vollständige Sätze werden optional über eine lokale Gerätestimme ausgegeben; Stimmen mit dem Namen `Anna` werden nicht angeboten. Nur diese Browser-Ausgabe selbst ist lokal und ohne zusätzliche Sprachsynthese-API-Kosten, während Transkription und Modellantwort nach dem gewählten Modelltarif abgerechnet werden können. Audio wird nicht in Memory oder Browser-Storage persistiert. Clientabbruch, unvollständige Streams und Providerfehler liefern redigierte Zustände statt eines falschen Abschlusses. Live bestätigt sind eine synthetische WAV-Transkription, Chat über Luna, der Antwortstream und die erneute Freigabe der Mikrofontaste; dies ersetzt keinen echten Mikrofon-, Safari-/WebKit- oder nativen iOS-Test und ist kein Full-Duplex-Realtime- oder Wake-Word-System.

Release 99 macht die persönliche Mailquelle zu einem dauerhaften Assistenten-Signal statt zu einer Demo-Kachel. IMAP läuft ausschließlich read-only und speichert pro Benutzer und Konto nur UID, UIDVALIDITY, Thread, Absender, Betreff, Empfangszeit, Flags und erklärbare Klassifikation. Bodies, Snippets, Anhänge und Roh-Header bleiben außerhalb von Fetch, Datenbank, API und Audit. Günni zeigt diesen Bestand im Mail Review Center mit Filtern, Suche, Thread-Detail und Antwortentwurf; der Entwurf bleibt bis zu einer gesonderten Freigabe ungesendet. Der 15-Minuten-Hintergrundlauf nutzt begrenzten Backoff und bewahrt bei Fehlern den letzten gültigen Bestand. Live bestätigt sind 500 reale Metadatensätze, ein unmittelbar leerer Folgelauf, unveränderte Deduplizierung und vollständige Wiederherstellung nach Containerrotation.

Release 100 bereitet das **Learning Lab** als kontrollierte Jarvis-Skill-Schicht
vor. Der erste und bislang einzige ausführbare Built-in-Skill ist
`personal-briefing.v1`; seine feste Read-only-Allowlist umfasst
`mail.read`, `calendar.read` und `health.summary`. Draft, deterministische
serverseitige Evaluation, Exact-Hash-Freigabe, Aktivierung, Ausführung und
Rollback werden benutzerisoliert persistiert. Approve, Activate und Rollback
verlangen jeweils die authentifizierte Benutzer-Session als Human Gate; kein
Agent darf diese Rolle übernehmen. Die aktive Revision verarbeitet echte,
berechtigte persönliche Signale ohne Quellmutation und erscheint als
nachvollziehbarer Command-Stream-Lauf.

Browser und Audit erhalten ausschließlich sichere Governance-Metadaten sowie
die redigierte, für den angemeldeten Benutzer bestimmte Briefing-Antwort.
Verfahren, Prompts, Payloads, Evidence, Mail-/Health-Rohdaten und Secrets werden
nicht öffentlich projiziert oder als Ausführungsnachweis gespeichert.
Lifecycle- und Testattestierung werden auch nach einem Neustart erneut geprüft;
direkt manipulierte Datenbankzustände führen zu einem fail-closed Fehler. Der
Stand ist lokal verifiziert und für Release 100 vorbereitet, aber noch nicht
als Live-Rollout auf Fressi oder Günni dokumentiert.

## Administration

Autorisierte Administratoren können Instanzen und Sessions vollständig analysieren, neu starten, sperren, neu aufbauen, in Quarantäne verschieben und wiederherstellen. Jeder Zugriff auf Sessioninhalte und jede administrative Aktion wird unveränderbar auditiert. Secret-Werte bleiben maskiert.

Eine Löschung sperrt die Instanz sofort. Daten bleiben 30 Tage verschlüsselt in Quarantäne und werden anschließend endgültig entfernt.

## Entwicklungs- und Hauptlinien

| Projekt | Hauptlinie | Entwicklung |
|---|---|---|
| AgentOne Platform | `agentone-main` | `agentone-dev` |
| AgentOne Personal | `agentone-personal-main` | `agentone-personal-dev` |

Der lokale Hybrid-Demomodus arbeitet standardmäßig mit den beiden Entwicklungsumgebungen. Hauptlinien werden nur lesend visualisiert.

## Open-Source-Basis

Für das spätere separate Repository ist ein privater Mirror von [OpenClaw](https://github.com/openclaw/openclaw) vorgesehen. OpenJarvis bleibt Referenz für lokale Inferenz, Hardwareprofile und Evaluation. Upstream-Änderungen werden als geprüfte Update-PRs übernommen und nie automatisch in eine Hauptlinie deployt.
