# Günni – Schnellstart für die Testsession

## 1. Raspberry und Home Assistant

Im bestehenden Connector-Ordner auf dem Raspberry Pi:

```sh
./update.sh
chmod +x enable-home-control.sh
./enable-home-control.sh
```

Danach in Günni unter **Zuhause** auf **Neu laden**. Licht, RGB-Farbe, Weißtemperatur, Spotify, Sonos, Klima, Szenen und Automationen sind verfügbar. Schlösser, Alarm und Sirenen bleiben blockiert.

## 2. Gmail ohne OAuth-Client

In Günni **Verbindungen → Gmail einfach verbinden** öffnen. Benötigt werden nur:

- Gmail-Adresse;
- ein 16-stelliges Google-App-Passwort.

Es werden keine Google Client-ID und kein Client-Secret benötigt. Günni prüft IMAP und SMTP, versendet beim Test aber keine Nachricht.

## 3. 1blu oder anderes Postfach

Unter **Postfach hinzufügen** `1blu` oder `Anderer IMAP/SMTP-Anbieter` auswählen. Danach E-Mail, Benutzername und App-/Postfachpasswort eingeben. Der erste Scan ist read-only.

## 4. Apple, Siri und iPhone

- **Siri:** Einstellungen → Siri und Kurzbefehle → Vorlage laden.
- **iPhone koppeln:** Verbindungen → iPhone Companion → iPhone koppeln. Der Code gilt zehn Minuten und einmalig.
- **Health:** nur gewählte Zusammenfassungen für Aktivität, Schlaf und Workouts; keine Rohdaten oder Diagnosen.
- **Standort:** einmalig oder Ankunft/Abfahrt; temporäre Freigaben laufen spätestens nach 60 Minuten aus.
- **Kalender und Erinnerungen:** read-only Zusammenfassungen über den Companion-Pfad.

## 5. Audit

Home-Aktionen, Connector-Tests, Laufzeitfehler und Governance-Aktionen werden mit Zeitpunkt, Instanz, Aktion, Ziel und Ergebnis protokolliert. Passwörter, Tokens, Cookies, Mailinhalte und Authorization-Header werden redigiert oder gar nicht angenommen.
