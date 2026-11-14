# Release 125 – kompakte Einrichtung statt Endlosseite

## iPhone

Der empfohlene Weg ist jetzt eindeutig die installierbare Companion-Web-App unter `/iphone`:

1. in Safari öffnen;
2. einmaligen Code eingeben;
3. **Teilen → Zum Home-Bildschirm** wählen.

Das funktioniert ohne Jailbreak, IPA, SideStore oder Apple-Entwicklerkonto. HealthKit Background Delivery und eine dauerhaft laufende Standort-Zeitachse sind iOS-Systemfunktionen und benötigen weiterhin eine von Apple signierte native App. Eine rohe IPA wird deshalb nicht mehr als einfache Installation angeboten.

## Navigation

- Die Einrichtung zeigt standardmäßig höchstens drei offene Schritte.
- Suche sowie Filter für Handlungsbedarf, verbundene Dienste und alle Dienste bleiben verfügbar.
- Der technische Vollkatalog ist standardmäßig eingeklappt.
- Private Access ist in **Dienste**, **iPhone & App** und **API-Schlüssel** aufgeteilt.
- Das iPhone-Onboarding zeigt immer nur einen der vier Schritte: Rechte, Web-App, native Sensoren oder Siri.

## Integrationen

Jeder Connector-Dialog trennt jetzt Voraussetzungen, Rechte und Datenschutz. Wo ein echter Einrichtungsweg existiert, führt **Zur Verbindung** direkt zum zuständigen Formular oder Dashboard:

- Gmail/IMAP → Mail-Center;
- Google/Apple/CalDAV → Kalender-Einrichtung;
- Home Assistant, Spotify und Sonos → Home-Dashboard;
- Apple Health, Standort und Siri → passender iPhone-Schritt;
- Paperless/Immich, Mealie und ntfy → privater Dienst-Dialog.

Das Speichern von Rechten allein wird ausdrücklich nicht mehr als LIVE-Verbindung dargestellt.
