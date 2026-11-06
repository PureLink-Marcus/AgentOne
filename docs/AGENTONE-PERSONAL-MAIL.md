# AgentOne Personal Mail

## Ziel

Günni bündelt mehrere private Postfächer und zeigt sie nach **echten Personen**, **Newslettern**, **Transaktionen** und **Spam-Verdacht** gruppiert. Die Ersteinrichtung benötigt nur Anbieter, Anzeigename, E-Mail-Adresse, Benutzername und Passwort beziehungsweise App-Passwort. Zugangsdaten bleiben verschlüsselt in der persönlichen Instanz.

## Anbieterprofile

| Anbieter | IMAP | SMTP | Anmeldung |
| --- | --- | --- | --- |
| 1blu | `imap.1blu.de:993`, SSL/TLS | `smtp.1blu.de:465`, SSL/TLS | vollständiger Postfachname und Postfachpasswort |
| Gmail | `imap.gmail.com:993`, SSL/TLS | `smtp.gmail.com:465`, SSL/TLS | E-Mail-Adresse und Google-App-Passwort; später bevorzugt Google OAuth |
| Andere | öffentlicher Host, ausschließlich Port 993 | öffentlicher Host, Port 465 oder 587 | anbieterspezifisch |

Der Verbindungstest authentifiziert IMAP und SMTP, versendet aber keine Nachricht. Passwörter werden mit AES-256-GCM und einem instanzgebundenen Schlüssel gespeichert und nie wieder an Browser, API-Antwort oder Log zurückgegeben.

## Verarbeitung

1. IMAP liest höchstens die letzten 50 Nachrichten aus `INBOX` und verändert weder Flags noch Ordner.
2. Eine erste deterministische Klassifikation trennt Personen, Newsletter, Transaktionen und Spam-Verdacht.
3. OpenClaws eingebauter IMAP-Trigger verarbeitet künftig nur zugelassene neue Nachrichten in einem isolierten `mail_reader`-Agenten ohne Datei-, Shell-, Browser- oder Netzwerkwerkzeuge.
4. SMTP bleibt zunächst auf Anmeldung und spätere Entwürfe begrenzt. Senden wird erst als eigene, widerrufbare Freigabe ergänzt.
5. Verschieben, Löschen, Spam-Markierung und automatische Antworten bleiben ausgeschaltet, bis der Benutzer konkrete Regeln bestätigt.

## OpenClaw-Grenze

Das gebündelte OpenClaw-Plugin `imap` ist ein eingehender Trigger und kein vollständiger E-Mail-Client. Es sendet nicht, verändert keine Flags und sortiert keine alten Nachrichten. AgentOne stellt deshalb Kontoablage, Verbindungstest, Postfachübersicht und Gruppierung bereit. OpenClaw übernimmt die isolierte Agentenverarbeitung neuer, authentifizierter Nachrichten. In Günni ist das Plugin geladen; jede Plugin-Karte lässt sich mobil inspizieren. Schreibende Plugin-Konfiguration wird nicht pauschal mit `operator.admin` freigegeben, sondern über einzeln begrenzte AgentOne-Formulare umgesetzt.

## Ausbau nach der ersten Kontoanbindung

- Kontakte und bisherige Korrespondenz für eine belastbarere Personenerkennung verwenden;
- `List-Id`, `List-Unsubscribe`, `Auto-Submitted`, DMARC/DKIM und Provider-Spamordner auswerten;
- Regeln zunächst als Vorschau zeigen und erst nach Bestätigung anwenden;
- VIP-Personen, Rechnungen, Lieferungen, Termine und erforderliche Antworten priorisieren;
- tägliches Briefing und Rückfragen über Günni;
- Google OAuth mit `gmail.readonly` statt App-Passwort als bevorzugte Gmail-Anmeldung;
- Entwürfe und Versand als getrennte Rechte mit Human Gate.

## Mobile Bedienung

Die PWA zeigt unter **Verbindungen → Postfächer und Mail-Sortierung** Konten, Status, Verbindungstest und Gruppierung. Das Formular ist für 390 Pixel Breite ausgelegt. Alle OpenClaw-Plugins besitzen zusätzlich **Mobil ansehen**; sichere Konfigurationsformulare werden pro Plugin ergänzt. Der Raspberry-Connector steht in derselben Ansicht dauerhaft als authentifizierter ZIP-Download bereit.
