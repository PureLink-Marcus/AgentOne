# Günni Release 122 – Einrichtung

## 1. iPhone-App installieren

1. Günni öffnen: `https://guenni.mwart.solutions`
2. **Private Access → Apple Live-Sync** öffnen.
3. **Jetzt in SideStore installieren** wählen. Falls SideStore nicht öffnet,
   **IPA in Dateien speichern** verwenden.
4. Die IPA in AltStore oder SideStore öffnen und mit dem eigenen Apple-Konto
   signieren. Apple-Zugangsdaten werden niemals in AgentOne eingegeben.
5. Entwickler-Modus aktivieren, falls iOS danach fragt.
6. In Günni die gewünschten Bereiche markieren und einen Pairing-Code erzeugen.
7. HealthKit-, Standort-, Kalender- und Erinnerungsrechte in iOS bestätigen.

Bei einem kostenlosen Apple-Konto muss die App regelmäßig neu signiert werden.
Falls das kostenlose Provisioning HealthKit nicht akzeptiert, den enthaltenen
Xcode-Quellstand mit dem eigenen Developer-Team signieren.

## 2. OpenClaw-Plugins verwalten

1. **Integrationen → OpenClaw Plugin Center** öffnen.
2. Im **Plugin-Katalog** nach dem gewünschten Werkzeug suchen.
3. Installationsquelle und angeforderte Fähigkeiten prüfen.
4. Installieren, erforderliches Konto verbinden und aktivieren.
5. In **Installiert verwalten** prüfen, ob der Zustand `LOADED` ist.

Für fremde npm-/Git-Pakete niemals ungeprüft `--force` oder Capability-
Freigaben verwenden. Die beigefügte Plugin-Anleitung enthält Details.

## 3. Aktueller Live-Stand

- AgentOne Personal Release 122;
- native AgentOne Companion IPA und Quellpaket direkt in der App;
- OpenClaw Plugin Center mit Katalog-, Detail- und Verwaltungslinks;
- mobile Bedienung und Plugin-Onboarding;
- bestehende Gmail-, Kalender-, Home-Assistant-, Health- und Sprachmodule.

Diese Anleitung enthält absichtlich keine Passwörter, Tokens oder API-Keys.

