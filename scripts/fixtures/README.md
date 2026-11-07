# Voice-Smoke-Fixtures

`release98-voice-smoke-de.wav` ist eine synthetische, nicht personenbezogene
Testaufnahme. Sie wurde lokal über Windows SAPI mit einer installierten
deutschen Systemstimme erzeugt und enthält ausschließlich den Satz:

> Günni Sprachtest. Kalender und E Mail sind bereit.

Die Fixture darf nicht durch eine reale Benutzeraufnahme ersetzt werden. Der
Live-Smoke sendet sie nur an die authentifizierte Günni-Transkriptionsroute,
gibt das erkannte Transkript nicht aus und prüft anschließend, dass der Inhalt
nicht im Access-Log erscheint.
