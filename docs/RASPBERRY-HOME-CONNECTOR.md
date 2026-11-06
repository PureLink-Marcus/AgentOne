# Raspberry Pi als AgentOne Home Connector

Der Raspberry Pi oder ein anderer Linux-Host wird zum privaten Connector-Gateway zwischen AgentOne Personal und dem Heimnetz. Das Paket unterstützt ARM64 und AMD64, läuft vollständig in Docker und stellt keine lokalen Dienste öffentlich ins Internet.

## Enthalten

- read-only Home-Assistant-Adapter;
- reduzierte Zustände für Sensoren, Wetter, Kalender, To-do, Medien, Licht und Klima;
- private Tailscale-Verbindung;
- eigenes Connector-Token;
- feste Zieladresse und Domain-Allowlist statt allgemeinem Netzwerkproxy;
- vorbereitete Erweiterungspunkte für NAS, Paperless-ngx, Immich und Mealie.

## Download und Installation

Die fertigen Archive werden als `output/connector/agentone-home-connector-linux.zip` und kompatibel als `output/connector/agentone-home-connector-raspberry.zip` erzeugt. Zusätzlich liegt der entpackte Downloadordner unter `output/connector/agentone-home-connector-linux/`. Nach dem Entpacken folgt die Installationssession aus `connector/raspberry/README.md`. Zugangsdaten sind im Download nicht enthalten und werden ausschließlich lokal auf dem Zielhost in `.env` eingetragen.

SHA-256: `7365D09AA299F7B5D0BEC138B1FDCC12BCA74E870CDBD972646EB7611342678D`

## Verbindungsweg

```text
AgentOne Personal (Hetzner)
        │ privates Tailnet
        ▼
AgentOne Home Connector (Raspberry Pi)
        │ feste lokale Ziele
        ├── Home Assistant
        ├── Paperless / Immich / Mealie
        └── NAS / ausgewählte Ordner
```

Version 1 ist technisch read-only. Schreibaktionen, freie URL-Aufrufe, Docker-Socket-Zugriff, allgemeines LAN-Routing sowie Alarm-, Schloss- und Kameraaktionen sind nicht enthalten.

Version 2 ergänzt feingranulare, weiterhin read-only Freigaben:

- Home-Assistant-Domänen plus optionale Entity-Allowlist;
- einzelne Unterordner eines einzigen read-only Host-Mounts;
- benannte Netzwerkgeräte mit exakt festgelegten GET-Routen;
- sichtbare Tailnet-IP, MagicDNS-Adresse, Endpunkt und Schlüsselablauf;
- keine freie Ziel-URL, kein Subnet-Router und kein allgemeiner SMB/NFS-Proxy.

Der aktuelle Pi-Endpunkt lautet `100.115.49.25` beziehungsweise `agentone-home-connector.tailbece5a.ts.net`. Diese Identität ist an das persistente Tailscale-State-Volume gebunden. Die aktuelle Geräteauthentisierung läuft am 28. April 2027 ab; die Schlüsselablauffrist sollte für Pi und Hetzner in der Tailscale-Geräteverwaltung deaktiviert werden.

## Tailnet-Inbetriebnahme

Pi und Hetzner sind zwei Geräte und benötigen deshalb zwei getrennte One-off-Keys. `TAILSCALE_HETZNER_AUTH_KEY` wird einmalig durch `node scripts/hetzner-tailscale-join.mjs` über SSH-Standardinput verwendet. `TAILSCALE_HOME_AUTH_KEY` wird nur in die lokale `.env` des Linux-/Pi-Connectors übernommen. Die Keys werden weder protokolliert noch in Browserantworten ausgeliefert. Der Tailscale-Client ist auf Hetzner bereits installiert; der Beitritt wartet auf den Hetzner-Key.

## Token-Synchronisation

Der Connector-Token wird vom bereits installierten Pi übernommen. AgentOne erzeugt bei einer bestehenden Installation absichtlich keinen Ersatz-Token: `AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN` muss exakt dem Wert in der Pi-`.env` entsprechen. Ein gekürzter oder maskierter Wert kann nicht synchronisiert werden. Bis URL, vollständiger Token und Healthcheck übereinstimmen, bleibt die Verbindung `DEGRADED`.
