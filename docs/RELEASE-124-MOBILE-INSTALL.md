# Release 124 – iPhone-Web-App ohne Jailbreak

Der reguläre iPhone-Weg ist die installierbare Companion-Web-App. Sie benötigt weder IPA, Entwicklerkonto noch Jailbreak.

- In Safari `/iphone` öffnen, den Einmalcode eingeben und anschließend **Teilen → Zum Home-Bildschirm** wählen.
- Die Web-App startet danach im Standalone-Modus und übernimmt Pairing, Kalender, Erinnerungen und Kurzbefehle.
- Der Pull-to-refresh-Hinweis bleibt sichtbar, nimmt den Installationsschaltflächen aber keine Touch-Ereignisse weg.
- Browser-Smokes prüfen Manifest, Standalone-Modus, Touch-Ziele und dass im primären Onboarding keine IPA-/SideStore-Links auftauchen.
- HealthKit Background Delivery und eine dauerhafte Standort-Zeitachse sind iOS-Systemfunktionen. Sie bleiben ein optionaler nativer Pfad und benötigen eine von Apple signierte App, aber keinen Jailbreak.
- Der offizielle DuckDuckGo-Plugin bleibt in Günnis persistentem OpenClaw-Volume installiert; temporäre Administratorrechte werden nach der Installation entfernt.

Das mitgelieferte Xcode-Projekt ist nur für diesen optionalen nativen Sensorpfad gedacht. Eine unsignierte IPA wird nicht mehr als einfacher Installationsweg beworben, weil iOS sie ohne passendes Provisioning-Profil nicht zuverlässig installieren kann.
