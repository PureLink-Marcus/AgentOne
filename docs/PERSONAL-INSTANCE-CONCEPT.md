# AgentOne Personal – Module, Farben und private Schnittstellen

Stand: 30. Oktober 2026

## Ziel

AgentOne Personal ist kein verkleinertes Unternehmensdashboard. Es organisiert Alltag, persönliche Kommunikation, Familie, Dokumente, Zuhause und private Wissensquellen. Business-Connectoren wie ERP, Shopware, Coolify oder Unternehmens-PostgreSQL gehören nicht in das Personal-Profil und werden dort weder angezeigt noch automatisch bereitgestellt.

## Visuelle Identität

Personal-Instanzen nutzen eine weichere, individuell wählbare Farbwelt. Dies ist ein persönliches Theme, kein Unternehmensbranding.

| Instanz | Primär | Akzent | Hintergrund | Wirkung |
|---|---:|---:|---:|---|
| Fressi | `#d8654f` | `#f0b35b` | `#151116` | warm, freundlich, wohnlich |
| Günni | `#7357d9` | `#43c3a6` | `#11121a` | ruhig, technisch, eigenständig |
| PureLink Business | `#005ae5` | `#35d6c6` | `#070b12` | sachlich, betrieblich, markengeführt |

Neue Personal-Instanzen wählen bei der Einrichtung ein Theme. Business-Instanzen verwenden stattdessen das validierte Unternehmensbranding. Kontrast, Fokuszustände und Statusfarben bleiben unabhängig vom Theme barrierearm.

## Vorgeschlagene Personal-Module

### 1. Heute

- Tagesbriefing aus Kalender, Aufgaben, Wetter und wichtigen Nachrichten;
- Erinnerungen, Geburtstage, Fristen und anstehende Lieferungen;
- drei priorisierte nächste Schritte statt betrieblicher KPIs;
- ruhige Zusammenfassung ohne Kosten-, Deployment- oder Produktionsmetriken.

### 2. Persönliche Inbox

- Ergebnisse von AgentOne, E-Mails, Benachrichtigungen und geteilte Inhalte;
- zusammenfassen, später lesen, beantworten oder in Aufgabe umwandeln;
- sensible Absender und Inhalte standardmäßig nur lokal verarbeiten;
- jeder Versand benötigt eine Vorschau und Freigabe.

### 3. Kalender und Erinnerungen

- private und Familienkalender lesen;
- freie Zeiten, Wegezeiten und Konflikte ermitteln;
- Termine vorschlagen, aber erst nach Bestätigung anlegen;
- wiederkehrende Routinen und ortsbezogene Erinnerungen vorbereiten.

### 4. Dokumente und Papierkram

- Verträge, Rechnungen, Garantien und Schreiben suchen;
- Fristen und Kündigungsfenster erkennen;
- Dokumente verschlagworten und in persönliche Ordner ablegen;
- keine automatische Löschung und keine rechtsverbindliche Antwort ohne Freigabe.

### 5. Zuhause

- Home-Assistant-Zustände, Energie, Raumklima und Geräte anzeigen;
- Szenen vorschlagen und ungefährliche Aktionen ausführen;
- Schlösser, Alarm, Garagentore, Kameras und sicherheitskritische Aktoren immer mit zusätzlichem Gate;
- Ereignisse aus dem Heimnetz über einen privaten Connector statt über öffentliche Ports beziehen.

### 6. Haushalt, Einkauf und Essen

- Einkaufslisten, Vorräte, Rezepte und Wochenplan;
- Allergien und Vorlieben als private Memory-Daten;
- Rezept aus URL, Foto oder Notiz übernehmen;
- Bestellungen nur vorbereiten, niemals ungefragt abschließen.

### 7. Fotos und Erinnerungen

- private Fotos und Alben durchsuchen;
- Reisen, Personen und Ereignisse zu Erinnerungsalben zusammenstellen;
- Freigabelinks mit Ablaufdatum vorbereiten;
- Gesichtserkennung und Standortdaten nur nach ausdrücklicher Aktivierung.

### 8. Private Finanzen

- Budget, Kontostände und Kategorien lesend zusammenfassen;
- ungewöhnliche Ausgaben und wiederkehrende Kosten markieren;
- Kündigungs- oder Sparvorschläge erstellen;
- Überweisungen, Käufe und Kontenänderungen bleiben außerhalb der ersten Ausbaustufe.

### 9. Reisen und Mobilität

- Kalender, Tickets, Reservierungen, Wetter und Packlisten verbinden;
- Reiserouten und Erinnerungen offline verfügbar vorbereiten;
- Buchungen nur als Vorschlag und mit externer Bestätigung.

### 10. Gesundheit – optional und getrennt

- Medikamenten- und Termin-Erinnerungen ohne Diagnosen;
- Gesundheitsdaten nur in einem ausdrücklich aktivierten, besonders geschützten Bereich;
- keine Diagnose, Therapieentscheidung oder automatische Weitergabe;
- für V1 nicht erforderlich.

## Empfohlene Schnittstellen

### Priorität P0 – hoher Alltagsnutzen, überschaubares Risiko

| Schnittstelle | Nutzen | Betriebsmodus |
|---|---|---|
| CalDAV/CardDAV | Kalender, Aufgaben und Kontakte ohne Anbieterbindung | Lesen zuerst; Schreiben mit Vorschau |
| IMAP/SMTP | private Mail lesen, zusammenfassen und Antwortentwürfe erstellen | IMAP read-only; SMTP nur mit Freigabe |
| WebDAV/Nextcloud | persönliche Dateien, gemeinsame Ordner, Versionen | begrenzter Ordner-Scope; Löschen gesperrt |
| ntfy | Push-Nachrichten auf Mobilgeräte | eigene Topics, Auth und minimale Inhalte |
| Home Assistant | Smart Home und Energie | REST für Einzelabfragen, WebSocket für Ereignisse |

Nextcloud unterstützt Dateioperationen und Suche über WebDAV sowie CalDAV/CardDAV unter dem DAV-Endpunkt. Die offizielle Dokumentation empfiehlt bei externer Authentifizierung App-Passwörter: [Nextcloud WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/index.html). Home Assistant stellt eine REST-API bereit und empfiehlt für fortlaufende Zustandsänderungen die WebSocket-API: [Home Assistant REST API](https://contributors.home-assistant.io/core/internals/rest-api/). ntfy kann Ereignisse als HTTP-Stream, SSE oder WebSocket liefern und unterstützt geschützte Topics: [ntfy Subscribe API](https://docs.ntfy.sh/subscribe/api/).

### Priorität P1 – sehr nützlich, eigener Container empfohlen

| Schnittstelle | Nutzen | Besonderheit |
|---|---|---|
| Paperless-ngx REST API | OCR, Dokumentensuche, Tags, Fristen | objektbezogene Rechte; API-Version fest pinnen |
| Immich OpenAPI | Fotos, Alben, Suche und Freigaben | API-Key auf minimale Berechtigungen beschränken |
| Mealie API | Rezepte, Wochenplan, Einkaufslisten | eigener Haushalt-/Familienbereich |
| Actual Budget Node API | Budget und Transaktionen | kein REST; offizielles Node-Paket und lokaler Cache |
| Telegram Bot API | mobiler Chat, Sprache, Fotos und Dokumente | Webhook-Secret und feste Benutzer-Allowlist |

Paperless-ngx bietet eine versionierte REST-API mit Volltextsuche, Objektberechtigungen und Token/OIDC-Authentifizierung: [Paperless-ngx API](https://docs.paperless-ngx.com/api/). Immich veröffentlicht eine OpenAPI-Spezifikation und generierte SDKs: [Immich API](https://docs.immich.app/api/). Actual Budget stellt bewusst keine REST-Endpunkte bereit; die offizielle Integration erfolgt über `@actual-app/api` und arbeitet auf einer lokalen Budgetkopie: [Actual Budget API](https://actualbudget.org/docs/api/). Die Telegram Bot API ist HTTPS-basiert und unterstützt Webhooks mit zusätzlichem Secret-Header: [Telegram Bot API](https://core.telegram.org/bots/api).

### Priorität P2 – optional oder abhängig vom persönlichen Ökosystem

- Google Calendar mit minimalen OAuth-Scopes, bevorzugt `calendar.readonly` oder `freebusy`: [Google Calendar Scopes](https://developers.google.com/workspace/calendar/api/auth);
- Microsoft Graph Personal für Outlook.com, OneDrive und To Do;
- Apple/iCloud ausschließlich über offiziell verfügbare CalDAV-/CardDAV-/App-Passwort-Wege;
- lokale MQTT-Topics für Sensoren, niemals ungeschützt aus dem Internet;
- Jellyfin/Plex für Medienstatus und persönliche Empfehlungen;
- Wallbox, Photovoltaik und Energiezähler über Home Assistant statt vieler einzelner Cloud-Logins.

## Nicht als V1-Standard

- private WhatsApp-Konten: keine stabile allgemeine Bot-Schnittstelle für persönliche Accounts;
- Signal über inoffizielle Bridges: wartungs- und sicherheitskritisch;
- direktes Online-Banking oder PSD2-Schreibzugriffe;
- Gesundheitsakten und Diagnosedaten;
- automatische Käufe, Buchungen, Vertragskündigungen oder Tür-/Alarmaktionen.

## Connector-Architektur

```text
AgentOne Personal PWA
        │
        ▼
Personal Gateway ── Personal Memory / Sessions
        │
        ▼
Private Connector (ausgehend, mTLS)
   ├── DAV / Mail
   ├── Home Assistant / MQTT
   ├── Paperless / Immich / Mealie
   ├── Actual Budget Adapter
   └── Benachrichtigungskanäle
```

Der Connector läuft im Heimnetz oder in einem privaten Coolify-Projekt und baut die Verbindung ausgehend auf. Netzwerkfreigaben, NAS, Home Assistant und lokale Datenbanken werden nicht direkt ins Internet gestellt.

## Sicherheitsmodell

- pro Person eigene Tokens, Volumes, Datenbank und Connector-Allowlist;
- read-only als Standard; jede schreibende Fähigkeit separat aktivieren;
- High-Risk-Aktionen benötigen erneute Authentifizierung und Human Gate;
- Secrets nur serverseitig, nie im Browser, Chat, Screenshot oder Agenten-Memory;
- Quellinhalte erhalten Sensitivitätsklassen `PRIVATE`, `FAMILY`, `FINANCIAL`, `HEALTH`;
- Ergebnisse dürfen eine Personal-Grenze nur über ausdrückliches Teilen verlassen;
- Audit zeigt Zeitpunkt, Quelle, Aktion und Freigabe, aber keine Secret-Werte;
- Lösch- und Aufbewahrungsregeln pro Modul statt eines globalen Schalters.

## Empfohlene Reihenfolge

1. CalDAV/CardDAV, WebDAV und ntfy;
2. IMAP read-only und Antwortentwürfe;
3. Paperless-ngx;
4. Home Assistant read-only plus sichere Szenen;
5. Mealie und Einkaufslisten;
6. Immich;
7. Actual Budget read-only;
8. optionale Messenger und Anbieter-Clouds.

## Vorinstalliertes Personal-Paket

Ab Release `2026.10.30-31` sind folgende Adapter in jeder Personal-Instanz vorhanden, aber ohne Zugangsdaten zunächst nur `SIMULATED` beziehungsweise `SETUP`: Google Kalender, Home Assistant, AgentOne Home Connector, Spotify, Apple/iPhone Companion, Apple Health, iPhone-Standort, Apple Kurzbefehle, CalDAV/CardDAV, private Mail, Gmail, Twitch, ntfy, Paperless-ngx, Immich, Mealie und Actual Budget. Keine Verbindung startet ohne explizite Konfiguration. Details zu Apple-Berechtigungen und der notwendigen nativen Companion-App stehen in `IPHONE-HEALTH-LOCATION-CONCEPT.md`.

Google Kalender startet mit `calendar.readonly` und fordert Schreibrechte erst bei einer ausdrücklich aktivierten Terminfunktion an. Spotify beginnt mit Leserechten für Wiedergabestatus und Playlists; Player- oder Playlist-Änderungen bleiben ein eigener Freigabeschritt. Apple Kalender und Erinnerungen werden nicht über iCloud-Passwörter abgegriffen, sondern später über einen lokalen iPhone-Companion auf Basis von EventKit, Kurzbefehlen und Share Sheet angebunden.

Der vorhandene Home Assistant wird bevorzugt über den Raspberry Pi erreicht. Das fertige ARM64-Dockerpaket liegt unter `connector/raspberry/`; Installation und Sicherheitsgrenzen stehen in der dortigen `README.md`. Bring! Einkaufsliste besitzt keine dokumentierte öffentliche Consumer-API. Deshalb ist nur ein deaktivierter Bridge-Slot vorhanden; Home Assistant To-do oder Mealie sind die empfohlenen stabilen Einkaufslistenwege.

### Namens- und Voice-Schicht

`AgentOne` ist die technische Plattform. Jede Personal-Instanz erhält darüber eine eigene sichtbare Identität: aktuell `Fressi` und `Günni`. Name, Begrüßung, PWA-Titel, Avatar, Chatüberschrift, Sprachansprache und Runtime-Identity verwenden den Instanznamen. „Powered by AgentOne“ bleibt als dezenter Plattformabdruck erhalten.

Voice verwendet eine kontrollierbare Kette aus Mikrofonaufnahme, sprachgebundener `gpt-transcribe`-Transkription, gestreamter Modellantwort und lokaler Browser-Sprachausgabe. Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch und Polnisch sind direkt auswählbar; die Stimme wird aus den auf dem Endgerät verfügbaren Stimmen gewählt und pro Instanz gespeichert. Text erscheint bereits während der Generierung und vollständige Sätze werden parallel gesprochen. Die Oberfläche kennzeichnet die Ausgabe als KI-generierte Stimme. Die Audiodatei wird nur für die Transkriptionsanfrage verarbeitet und nicht in Local Storage oder Agenten-Memory gespeichert. Toolaktionen bleiben auch per Sprache hinter denselben Freigaben wie Texteingaben.

### Nächste freizugebende Kanäle

- IMAP: read-only, keine Lösch- oder Verschiebeoperationen;
- Gmail: offizieller serverseitiger OAuth-Flow mit `gmail.readonly`; Entwürfe und Versand später getrennt;
- Twitch: offizieller OAuth-Flow mit minimalen Lesescopes für Streams, Follows und Benachrichtigungen; Chatbot- und Moderationsrechte bleiben aus.

### Schlüssel je Sitzung

Für Automationen erhält jede Sitzung ein getrenntes Paar aus `login_key` und `api_key`. Der Login-Key identifiziert die Sitzung; der API-Key authentifiziert sie. Der API-Key wird nur einmal vollständig angezeigt, serverseitig ausschließlich gehasht gespeichert und kann unabhängig rotiert oder widerrufen werden. Schlüssel erscheinen nie in URLs, PWA-Speicher, Logs, Screenshots oder Agenten-Memory.

