# AgentOne Instanzprofile und Unternehmensbranding

Stand: 30. Oktober 2026 · verbindlich ab Release `2026.10.30-33`

## Pflichtentscheidung bei der Einrichtung

Jede AgentOne-Instanz benötigt vor der Provisionierung genau einen unveränderlichen Grundtyp:

- `PERSONAL`: persönliche Assistenz für eine natürliche Person;
- `BUSINESS`: Unternehmensinstanz mit Organisationsidentität, Unternehmensquellen und administrierten Connectoren.

Ein fehlender oder unbekannter Typ darf künftig nicht provisioniert werden. Ein späterer Wechsel des Grundtyps erfolgt nicht durch Umbenennen, sondern über eine kontrollierte Migration in eine neue Instanz, damit Vertrauensgrenzen, Secrets, Datenhaltung und Audit erhalten bleiben.

## Funktionsgrenzen

| Bereich | PERSONAL | BUSINESS |
|---|---|---|
| Oberfläche | persönliche Aufgaben, Chat, Dateien, Kalender, Notizen, Wissen | Projekte, Welten, Workflows, Teams, Gates, Reports |
| Standardquellen | private Dateien, persönliche Mail-/Kalenderkonten, Web, Notizen | ERP, Shopware, PostgreSQL, GraphQL, Git, Coolify, Microsoft 365, Connector Gateway |
| Freigaben | Versand, Termine, persönliche Automationen | Merge, Push, Publish, Deployment, Datenänderungen, Budgets |
| Zusammenarbeit | private Agenten und explizit geteilte Ergebnisse | Agententeams, Rollen, Organisationsfreigaben und Audit |
| Branding | neutrales AgentOne Personal | verpflichtender Unternehmensname; Farben und Markenkürzel konfigurierbar |
| Administration | Eigentümer der Instanz | Organisationsadministratoren und auditierte Rollen |

Business-Connectoren werden einer Personal-Instanz weder angezeigt noch automatisch bereitgestellt. Die bloße Kenntnis einer Connector-URL hebt diese Profilgrenze nicht auf.

## Unternehmensbranding

Eine Business-Instanz unterstützt folgende validierte Werte:

```text
AGENTONE_INSTANCE_TYPE=business
AGENTONE_BRAND_NAME=Unternehmensname
AGENTONE_BRAND_PRIMARY=#RRGGBB
AGENTONE_BRAND_ACCENT=#RRGGBB
AGENTONE_BRAND_MARK=AB
```

Die Werte steuern Anmeldung, PWA-Manifest, App-Icon, Kopfzeile, aktive Navigation und Akzentfarben. Freier HTML-/CSS-Code und externe Logo-URLs sind nicht erlaubt. Ein späterer Logo-Upload wird als geprüfte, intern gespeicherte Bilddatei umgesetzt, nicht als Remote-Einbettung.

## Provisionierungsdaten

Der Einrichtungsdialog verlangt:

1. Typ `PERSONAL` oder `BUSINESS`;
2. Anzeigename und HTTPS-Domain;
3. bei `BUSINESS`: Unternehmensname und Primärfarbe, optional Akzentfarbe und Markenkürzel;
4. Eigentümer beziehungsweise Organisation;
5. Datenregion, Aufbewahrung und freigegebene Connector-Klassen;
6. abschließende Vorschau und ausdrückliche Freigabe.

Die PWA führt Typ- und Branding-Metadaten beim Instanzwechsel mit, niemals Passwörter, Cookies, Tokens, Chats oder Quelleninhalte.

## Aktuelle Zuordnung

| Instanz | Profil | Branding |
|---|---|---|
| `agentone.purelink.de` | BUSINESS | PureLink, `#005ae5`, Kürzel `PL` |
| `fressi.mwart.solutions` | PERSONAL | neutrales AgentOne Personal |
| `guenni.mwart.solutions` | PERSONAL | neutrales AgentOne Personal |

Die ausführlichen Personal-Module, individuellen Themes und priorisierten privaten Schnittstellen stehen in [`PERSONAL-INSTANCE-CONCEPT.md`](PERSONAL-INSTANCE-CONCEPT.md).

