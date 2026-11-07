# Günni · Release 112 einrichten

Stand: 7. November 2026  
Adresse: <https://guenni.mwart.solutions>

Diese Checkliste beginnt mit den einfachen Verbindungen. Nach jedem Abschnitt
kannst du in **Mein Tag → Datenquellen synchronisieren** den echten Zustand
prüfen. `AKTUELL` bedeutet erfolgreich gelesen; `NICHT VERBUNDEN` wird nicht
als Erfolg ausgegeben.

## Was Release 112 neu oder produktiv nutzbar macht

- Source Sync Center für Post, Google und Kalender-Feed;
- nebenwirkungsfreier Statusabruf und ausdrücklich gestartete read-only
  Synchronisierung;
- Provider-Backoff und Erhalt des letzten gültigen Snapshots bei Störungen;
- sichtbarer Command Stream für Synchronisierung, Briefings und Fehler;
- Fokus-Kompass, Pattern Feed und Feedback (`hilfreich`, `weniger`, `falsch`,
  `später`, `nie`);
- persistenter read-only Mailbestand mit Personen-, Newsletter-, Transaktions-
  und Spam-Prüfung;
- Tagesplanung aus Kalender und Post;
- getrennte Apple-Health- und WHOOP-Auswertung ohne Diagnose;
- iPhone-Companion-Web-App, PWA-Push, Home Connector und 68 geladene
  OpenClaw-Plugins.

## 1. Günni und Postfach prüfen

1. <https://guenni.mwart.solutions> öffnen und anmelden.
2. Einmal nach unten ziehen oder die Seite neu laden. Unter Einstellungen muss
   Release `2026.11.07-112` erscheinen.
3. **Dienste → Postfächer und Mail-Sortierung** öffnen.
4. Der vorhandene Gmail-/IMAP-Account muss `CONNECTED` anzeigen.
5. **Mein Tag → Datenquellen synchronisieren → Jetzt synchronisieren** wählen.
6. `Postfächer · AKTUELL` und im Command Stream ein abgeschlossenes Ergebnis
   prüfen. Der Abruf lädt Metadaten read-only; Antworten bleiben Entwürfe.

## 2. Kalender ohne Google-OAuth verbinden (empfohlen)

Dieser Weg benötigt keine Google-Client-ID.

1. Im Kalenderanbieter einen **privaten ICS-/iCal-Abonnementlink** erzeugen.
   Den Link nicht öffentlich teilen.
2. In Günni **Dienste → Privater iCal-Kalender → Kalenderlink** öffnen.
3. Den privaten HTTPS- oder `webcal://`-Link einfügen und verbinden.
4. **Jetzt synchronisieren** wählen.
5. Unter **Mein Tag → Datenquellen synchronisieren** muss `Kalender-Feed` danach
   `AKTUELL` oder bei einer vorübergehenden Störung `LETZTER STAND` zeigen.

Alternativ kann eine exportierte `.ics`-Datei hochgeladen werden. Ein Upload ist
ein Snapshot; ein Abonnementlink kann regelmäßig read-only aktualisiert werden.

## 3. Google Mail und Kalender gemeinsam per OAuth (optional)

Nur nötig, wenn ausgewählte Google-Kalender automatisch über die Google API
synchronisiert werden sollen.

1. In Google Cloud Gmail API und Google Calendar API aktivieren.
2. Einen OAuth-Client vom Typ Webanwendung anlegen.
3. Exakte Redirect-URI eintragen:
   `https://guenni.mwart.solutions/agentone/google/callback`
4. Diese serverseitigen Variablen in der Günni-App setzen:
   `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REDIRECT_URI=https://guenni.mwart.solutions/agentone/google/callback`.
5. Nur die Günni-App neu starten; Werte niemals in Chat, Screenshot oder
   E-Mail kopieren.
6. In Günni **Dienste → Google Mail + Kalender verbinden** wählen, Google
   freigeben, gewünschte Kalender markieren und synchronisieren.

Die Scopes sind `gmail.readonly` und `calendar.readonly`. Ein vorhandenes
Gmail-App-Passwort kann nicht als Google-Kalender-OAuth verwendet werden.

## 4. iPhone-Companion koppeln

1. In Günni **Private Access → Apple Schnellstart** öffnen.
2. Nur benötigte Rechte markieren. Health und temporärer Standort bleiben ohne
   ausdrückliche Auswahl aus.
3. **Pairing-Code erzeugen** wählen.
4. Auf dem iPhone `https://guenni.mwart.solutions/iphone` in Safari öffnen und
   den sechsstelligen Einmalcode eingeben.
5. Optional über Teilen → **Zum Home-Bildschirm** installieren.
6. Zurück in Günni prüfen, dass das Gerät als verbunden erscheint.

Der Geräteschlüssel bleibt verschlüsselt im iPhone-Browser. Der QR-Code enthält
weder Pairing-Code noch Token. Eine native App-Store-/TestFlight-App existiert
noch nicht; die aktuelle Companion ist eine Web-App.

## 5. Apple Health importieren

1. Auf dem iPhone in der Health-App das Profil öffnen und
   **Alle Gesundheitsdaten exportieren** wählen.
2. Die erzeugte ZIP-Datei nicht per E-Mail verschicken.
3. In Günni **Dienste → Health & Recovery → Apple Health** öffnen.
4. Freigaben für die gewünschten Messklassen wählen und bestätigen.
5. ZIP/XML als Importjob hochladen und den Fortschritt bis `COMPLETED` prüfen.
6. In **Health & Recovery** Abdeckung, getrennte Methoden und 7-/28-Tage-Trends
   kontrollieren.

Apple Health und WHOOP bleiben getrennte Quellen. Günni zeigt deskriptive
Trends, keine Diagnose oder Behandlungsempfehlung.

## 6. WHOOP verbinden (optional)

1. Im WHOOP Developer Dashboard eine V2-App anlegen.
2. Callback exakt setzen:
   `https://guenni.mwart.solutions/agentone/whoop/callback`
3. Serverseitig in der Günni-App setzen:
   `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_OAUTH_STATE_SECRET`,
   `WHOOP_REDIRECT_URI=https://guenni.mwart.solutions/agentone/whoop/callback`.
4. `WHOOP_OAUTH_STATE_SECRET` muss ein zufälliges Secret mit mindestens
   32 Byte sein. Es gehört nicht in E-Mail oder Browserfelder.
5. Günni-App neu starten, **WHOOP verbinden** wählen und anschließend einmal
   read-only synchronisieren.
6. Der Status muss von `NOT_CONFIGURED` über `READY` zu `LIVE` wechseln.

## 7. Home Assistant und Sprache prüfen

Der Raspberry Home Connector ist bereits `LIVE` und authentifiziert.

1. **Zuhause** öffnen und Status neu laden.
2. Erst ein unkritisches Licht oder einen Media Player testen.
3. Farben, Helligkeit, Sonos/Spotify und erlaubte Automationen erscheinen nur,
   wenn die jeweilige Home-Assistant-Entität am Connector freigegeben ist.
4. Sperren, Alarm, Sirenen und irreversible Verwaltung bleiben geschützt.

## 8. Persönlichen Login-Key und API-Key erzeugen

1. **Private Access → Session API Access** öffnen.
2. **Login-Key + API-Key erstellen** wählen.
3. Beide Werte sofort in deinem Passwortmanager speichern.
4. Der API-Key wird nur einmal angezeigt und serverseitig nur gehasht
   gespeichert. Bei Verlust widerrufen und ein neues Paar erzeugen.

## 9. PWA-Push aktivieren

1. Günni auf dem iPhone zum Home-Bildschirm hinzufügen.
2. In Günni **Einstellungen → Benachrichtigungen** öffnen.
3. Push für dieses Gerät aktivieren und den sichtbaren Test auslösen.
4. Ruhezeit, Tagesbudget und externe Zustellfreigabe kontrollieren.

## Geschützter Ablageort für Secrets

- Provider-Secrets: geschützte Environment-Variablen der **Günni-App** in
  Coolify; niemals im Access-Container.
- Lokale Masterkopie: `D:\Projekte\git\agentone\master\env\.env.master`;
  vollständig durch `.gitignore` ausgeschlossen.
- Persönliche Session-/API-Keys: in Günni unter **Private Access** erzeugen und
  direkt in den eigenen Passwortmanager übernehmen.
- E-Mail, Anhänge, Git, Screenshots und Browserlogs enthalten keine Secretwerte.

## Aktueller Ausgangszustand

- Release 112: vier private Container `healthy`;
- Postfach: verbunden und `AKTUELL`;
- Home Connector: `LIVE`;
- OpenClaw: 68/68 Plugins geladen;
- Google OAuth, Kalender-Feed, WHOOP und iPhone: noch nicht verbunden.

