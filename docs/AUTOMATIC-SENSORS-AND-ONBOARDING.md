# Automatische Sensoren und verbindliches Onboarding

## Statusregeln

Eine Integration ist nur `LIVE`, wenn ein echtes Konto oder Gerät autorisiert
ist und der Healthcheck beziehungsweise die erste Datenübertragung erfolgreich
war. Gespeicherte Checkboxen allein ergeben lediglich `READY`.

- `LIVE`: echte Verbindung nachgewiesen
- `READY`: autorisiert, erste Nutzdaten stehen noch aus
- `ACTION_REQUIRED`: Benutzeraktion in AgentOne erforderlich
- `PROVIDER_APP_REQUIRED`: OAuth-App beim Anbieter fehlt
- `NATIVE_APP_REQUIRED`: native iOS-App und Apple-Freigabe fehlen
- `DEGRADED`: zuvor erreichbare Verbindung ist fehlerhaft
- `NOT_AVAILABLE`: Anbieter bietet die geforderte Schnittstelle nicht an

## Apple Health und Sensoren

Der native AgentOne Companion nutzt HealthKit-Observer und Apples Background
Delivery. Er liest Schritte, aktive Energie, Schlaf und Workouts, berechnet auf
dem Gerät Tageszusammenfassungen und sendet nur diese an die persönliche
AgentOne-Instanz. Die App muss mit HealthKit-Entitlement signiert und auf einem
echten iPhone installiert sein.

Standort wird über signifikante Ortsänderungen erfasst. Die Freigabe
`location.timeline` ist separat, sichtbar und widerrufbar. AgentOne rundet die
Koordinaten und löscht die eigene Zeitachse spätestens nach 30 Tagen.

## Google Maps Timeline

Die persönliche Google Maps Timeline ist gerätegebunden und verschlüsselt.
Google bietet keine Server-API für den kontinuierlichen Abruf der Historie.
Die Google Geolocation API ermittelt nur eine aktuelle Position aus Funk- und
WLAN-Signalen und ist kein Timeline-Export. AgentOne baut deshalb mit der
nativen Companion-App eine eigene automatische Zeitachse auf. Ein zukünftiger
Einmalimport kann historische Exporte ergänzen, ist aber nicht der Live-Pfad.

## Twitch

Twitch benötigt eine registrierte Developer-Anwendung, eine exakte
HTTPS-Redirect-URL sowie Client-ID und Client-Secret. Erst nach OAuth-
Authorization-Code-Flow und erfolgreicher Tokenvalidierung darf die UI `LIVE`
anzeigen. Refresh-Tokens bleiben serverseitig verschlüsselt. EventSub benötigt
Wiederholungs- und Replay-Schutz, weil Ereignisse mindestens einmal zugestellt
werden können.

## Einrichtungszentrum

Das Personal-Dashboard prüft parallel E-Mail, Kalender, Raspberry/Home
Assistant, Companion-Geräte, Health, WHOOP, Siri sowie persönliche Services.
Jede Kachel führt zur tatsächlich benötigten Einrichtung. Der Fortschritt
zählt ausschließlich echte `LIVE`-Verbindungen und benennt die nächste offene
Aktion.

## Primärquellen

- Apple: https://developer.apple.com/documentation/Xcode/configuring-healthkit-access
- Apple Observer Queries: https://developer.apple.com/documentation/healthkit/executing-observer-queries
- Google Maps Timeline: https://support.google.com/maps/answer/6258979
- Google Geolocation API: https://developers.google.com/maps/documentation/geolocation/overview
- Twitch OAuth: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
- Twitch EventSub: https://dev.twitch.tv/docs/eventsub/
