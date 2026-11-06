# AgentOne – Screendesign-Paket

## Projektidee

AgentOne ist eine Plattform zur visuellen Orchestrierung von Projekten, Workflows, Agenten und Connectoren. Ein Projekt enthält mehrere **Workflow-Welten**. Jede Welt besitzt genau **einen eigenen AgentOne**, der innerhalb dieser Welt plant, delegiert, Agenten koordiniert, Ergebnisse zusammenführt, Freigaben einholt, Änderungen pusht und berichtet.

Die Projekt- beziehungsweise Außenansicht dient ausschließlich der Navigation und Statusübersicht. Sie besitzt keinen globalen AgentOne. Beim Öffnen einer Welt wechselt die Oberfläche in deren Innenansicht mit dem zugehörigen AgentOne, Agententeam, Connectoren, Datenflüssen, Übergaben und Human Gates.

## Drei Designvarianten

### Celestial Cartography

Räumliche, ruhige Galaxy-Darstellung. Welten und Agenten werden als Orbit-Systeme dargestellt. Sie eignet sich besonders für Orientierung, Beziehungen und eine emotionale Produktidentität.

### Pixel Hive OS

Dichte technische Rasteransicht mit klaren Nodes, Output-Matrix und hoher Informationsdichte. Die Pixel-Metapher bleibt in Geometrie und Rhythmus erhalten; die Oberfläche verwendet jedoch die besser lesbare PureLink-Typografie.

### PureLink Orbit Grid

Kombinierte Arbeitsrichtung: räumliche Orientierung aus der Galaxy-Variante, Statusdichte und Output-Logik aus Pixel Hive sowie die PureLink-Designsprache für Typografie, Farben und Bedienoberflächen.

## Designsystem

- UI-Schrift: **Barlow**
- Technische Werte und IDs: **IBM Plex Mono**
- Primärfarbe: PureLink Blue `#005ae5`
- Statusfarben: Grün `#10b981`, Amber `#f59e0b`, Rot `#ef4444`
- Helle und dunkle Darstellung sind funktional gleichwertig.
- Status wird zusätzlich über Text, Form und Symbole vermittelt und nicht ausschließlich über Farbe.

## Ansichten

Für jede Variante existieren vier Screenshots:

1. Außenansicht / Hell
2. Innenansicht / Hell
3. Außenansicht / Dunkel
4. Innenansicht / Dunkel

Insgesamt umfasst das Paket zwölf Screenshots im Ordner `screenshots/`. Die interaktive Auswahl startet über `index.html`.

## Inhalt der Innenansicht

- AgentOne als Zentrum der geöffneten Welt
- spezialisierte Agenten und ihre Übergaben
- freigegebene Connectoren und Ziele
- Status, Kosten, Fortschritt und Fehler
- Welt-gebundener Chat mit AgentOne
- Merge-, Snapshot-, Gate-, Push- und Reporting-Schritte

## Inhalt der Außenansicht

- Projektkontext und Projektstatus
- mehrere Workflow-Welten
- ein eigener AgentOne je Welt
- aktive, wartende und geplante Welten
- menschliche Freigaben und Engpässe
- direkter Wechsel in die Innenansicht einer Welt

## Hosting-Ziel

Die spätere Anwendung ist für das AgentOne-Projekt auf `container2.purelink.de` vorgesehen. Connectoren werden als eigenständige, sicher angebundene Docker-Komponenten behandelt. TechHub bleibt eine Anbindung neben APIs, MCP-Diensten, Datenbanken und weiteren internen Systemen.
