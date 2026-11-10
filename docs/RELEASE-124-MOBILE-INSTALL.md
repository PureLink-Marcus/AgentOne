# Release 124 – dauerhafter mobiler IPA-Install

Release 124 verhindert, dass der visuelle Pull-to-refresh-Hinweis Installationsschaltflächen auf iPhone und iPad abfängt.

- Der Hinweis bleibt sichtbar, akzeptiert aber selbst keine Touch-Ereignisse mehr.
- `Jetzt in SideStore installieren` verwendet weiterhin das offizielle `sidestore://install?url=…`-Schema.
- `IPA in Dateien speichern` bleibt als dauerhafter AltStore-/Sideloadly-Fallback erhalten.
- Lokale und produktive Browser-Smokes prüfen nun explizit `pointer-events: none`.
- Der offizielle DuckDuckGo-Plugin bleibt in Günnis persistentem OpenClaw-Volume installiert; temporäre Administratorrechte werden nach der Installation entfernt.

Die IPA wird serverseitig als Download ausgeliefert. Auf iOS muss SideStore bereits installiert und einmal eingerichtet sein, damit der direkte Link übernommen werden kann.
