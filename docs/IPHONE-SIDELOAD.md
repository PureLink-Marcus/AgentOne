# AgentOne Companion auf dem iPhone sideloaden

## Download

- IPA: https://github.com/PureLink-Marcus/AgentOne/releases/download/agentone-companion-v1.0.0/AgentOne-Companion-unsigned.ipa
- Prüfsumme: https://github.com/PureLink-Marcus/AgentOne/releases/download/agentone-companion-v1.0.0/AgentOne-Companion-unsigned.ipa.sha256
- Günni: https://guenni.mwart.solutions

Die IPA ist bewusst **nicht fremdsigniert**. AltStore, SideStore oder Sideloadly
signieren sie mit dem persönlichen Apple-Entwicklungsprofil des iPhone-
Besitzers. Apple-ID oder Apple-Passwort werden niemals in AgentOne eingegeben.

## Empfohlen: AltStore unter Windows

1. iTunes und iCloud direkt von Apple installieren, nicht aus dem Microsoft
   Store. AltServer installieren und starten.
2. iPhone per USB verbinden, dem Computer vertrauen und in iOS den
   **Entwicklermodus** aktivieren.
3. AltStore mit AltServer auf dem iPhone installieren.
4. Die IPA auf dem iPhone herunterladen. In AltStore **My Apps → +** wählen und
   die Datei `AgentOne-Companion-unsigned.ipa` öffnen.
5. Nach der Installation AgentOne Companion starten. Instanz-URL
   `https://guenni.mwart.solutions` eintragen.
6. In Günni unter **Private Access → Apple Live-Sync** einen Einmalcode mit
   `HealthKit dauerhaft im Hintergrund` und
   `Eigene Standort-Zeitachse` erzeugen und in der App eingeben.
7. In der App zuerst Health, danach Standort aktivieren. Die iOS-Dialoge für
   Health-Datentypen und **Standort → Immer** bestätigen.

Bei einer kostenlosen Apple-ID läuft die Entwicklungssignatur nach sieben
Tagen ab. AltStore versucht sie zu erneuern, solange AltServer im selben WLAN
läuft oder das iPhone per USB verbunden ist. SideStore kann nach einmaliger
Computer-Einrichtung selbst erneuern.

## HealthKit-Entitlements prüfen

HealthKit und dessen Background Delivery sind signierte Fähigkeiten. Wenn nach
dem Start kein Apple-Health-Dialog erscheint oder iOS die App nicht installiert,
hat das Sideload-Profil die benötigten Entitlements nicht erhalten. In diesem
Fall nicht mit einer manipulierten IPA weiterprobieren, sondern:

1. das enthaltene Xcode-Projekt auf einem Mac öffnen;
2. die eigene Apple-ID beziehungsweise das Developer-Team wählen;
3. unter **Signing & Capabilities** HealthKit und Background Delivery prüfen;
4. direkt auf das registrierte iPhone ausführen oder als Development/Ad-hoc IPA
   für dieses Gerät exportieren.

Apple erstellt dabei ein Provisioning-Profil, das die Fähigkeiten für die App-ID
und das konkrete Gerät autorisiert. Eine IPA allein kann diese Autorisierung
nicht umgehen.

## Aktualisierung

Eine neue IPA mit demselben Bundle-Identifier über AltStore/SideStore erneut
sideloaden. Die App-Daten bleiben normalerweise erhalten, solange die vorhandene
App nicht vorher gelöscht wird. Nach jedem Update in AgentOne unter
**Verbindungen → Alles prüfen** kontrollieren, ob Health und Standort wieder
`LIVE` melden.
