# iPhone, Apple Health und Standort für AgentOne Personal

Stand: 7. November 2026

Die normalisierte Import- und Vergleichspipeline ist inzwischen implementiert. Der aktuelle technische und datenschutzbezogene Stand steht in [HEALTH-DATA-INTEGRATIONS.md](./HEALTH-DATA-INTEGRATIONS.md). Diese Datei beschreibt weiterhin den geplanten iPhone-Companion und die Standortmodi.

Seit Release `2026.11.07-93` ist die Geräteebene praktisch nutzbar: `/iphone` liefert einen installierbaren Web-Companion, der HTTPS, WebCrypto und IndexedDB vor dem Pairing sichtbar prüft. Ein einmaliger sechsstelliger Code wird atomar eingelöst und danach entfernt. Der Gerätetoken liegt mit einem nicht exportierbaren WebCrypto-Schlüssel AES-GCM-verschlüsselt in IndexedDB. Health und temporärer Standort sind keine Standardrechte, sondern müssen vor der Codeerzeugung ausdrücklich gewählt werden. Verbundene Geräte, letzte Aktivität und Rechte sind in Private Access sichtbar; ein Widerruf löscht Token-Hash und zugehörige Companion-Ereignisse.

Release `2026.11.07-94` ergänzt die serverseitige Auswertung: gespeicherte,
normalisierte Apple-Health- und WHOOP-Metriken können für 1 bis 90 Tage
deskriptiv verglichen werden. Quellenserien bleiben getrennt, Rohdatensatz- und
Consent-IDs verlassen die Health-Grenze nicht. Die API nennt Datenabdeckung und
eine ausschließlich daraus abgeleitete Konfidenz. HRV-SDNN versus HRV-RMSSD
sowie Körper- versus Hauttemperatur werden ausdrücklich nicht als identische
Messung verglichen. Der Pfad erzeugt keine Diagnose oder Therapieempfehlung.

Release `2026.11.07-95` schließt mehrere Pairing-Lücken. Ein gültiger offener
Code besitzt im Status Vorrang vor bereits verbundenen Geräten, sodass ein
zweites oder erneut gekoppeltes iPhone nicht mehr als bloß `CONNECTED`
maskiert wird. Auf iOS ist die Bestätigung ausschließlich in der installierten
Home-Screen-PWA möglich. Eine gewöhnliche Safari-, Chrome- oder In-App-Ansicht
entfernt ein übergebenes Code-Fragment sofort, übernimmt es nicht in das Feld
und sendet keinen Confirm. Die Admin-Oberfläche teilt deshalb Basis-URL und
Einmalcode getrennt.

Reload und Widerruf stellen den passenden verbundenen beziehungsweise erneut
koppelbaren Zustand wieder her. Fehlt zu einem verschlüsselten Token der lokale
Wrap-Key, erzeugt der Client keinen neuen unpassenden Schlüssel, sondern bleibt
fail-closed. Wird der Code serverseitig bestätigt, aber die anschließende
IndexedDB-Ablage schlägt fehl, widerruft der Client das gerade erzeugte Gerät
best-effort über einen ausschließlich tokenautorisierten Self-Revoke-Pfad.
Dieser Pfad gibt weder Token noch Geräte-ID zurück. Der Service Worker prüft bei
`pageshow` und Rückkehr in den Vordergrund auf eine neue Version.

Für die Home-Bildschirm-App wird die Basis-URL `/iphone` zuerst in Safari geöffnet und über **Teilen → Zum Home-Bildschirm** installiert. Erst danach wird der getrennt angezeigte Einmalcode manuell in der installierten Ansicht eingegeben. So bleibt der Geräteschlüssel im Speicher genau dieser Ansicht. Privates Surfen ist für eine dauerhafte Kopplung ungeeignet. Das Rate-Limit unterscheidet echte Mobilclients auch hinter Coolify/Traefik; zusätzlich gilt ein persistentes, benutzergebundenes Fehlversuchslimit.

Der Release-95-Flow wurde in echtem Google Chrome bei 390 px mit iPhone-UA und
simuliertem `navigator.standalone` geprüft: Installationssperre, Pair, Status,
Ingest, Reload, Widerruf, Recovery und simuliertes Vault-Schreibversagen. Alle
Testgeräte und Ereignisse werden anschließend entfernt. Diese Prüfung belegt
die Weblogik, ersetzt aber keine Abnahme auf realem iOS WebKit/Safari.

Der gleiche Webflow ist nach dem Release-95-Rollout auf Günni über echtes HTTPS
live bestanden. Sicherer Kontext, AES-GCM-IndexedDB, Service-Worker-Reload,
Self-Revoke/Vault-Rollback, 0 Konsolenfehler und vollständiger Cleanup wurden
bestätigt. Auch diese Live-Prüfung verwendete Chrome mit iPhone-UA und
simuliertem Standalone-Modus; eine reale Safari-/WebKit- oder signierte native
HealthKit-Abnahme wird damit ausdrücklich nicht behauptet.

Der Web-Companion ersetzt keine native App: Safari/PWA kann HealthKit, EventKit und CoreLocation im Hintergrund nicht direkt lesen. Diese Funktionen bleiben bis zu Apple-Signing und Geräteabnahme ehrlich `PREPARED`.

Release `2026.11.07-96` ergänzt bewusst **keinen** nativen EventKit-Zugriff,
sondern einen unabhängigen read-only Kalenderweg: Ein persönlicher
`https://`- oder `webcal://`-ICS-Link kann AES-256-GCM-verschlüsselt gespeichert
und manuell beziehungsweise alle 15 Minuten synchronisiert werden. Der Link
wird weder an Browser/API zurückgegeben noch in Audit, Logs oder Screenshots
geschrieben. DNS-Pinning und SSRF-Schutz blockieren interne Ziele; bei Fehlern
bleibt der letzte gültige Snapshot erhalten und der Status wechselt auf
`DEGRADED`. 207/207 Tests, Production-Build und mobiler Chrome-Smoke sind grün;
Release 96 ist auf vier healthy privaten Containern live und die PWA auf drei
Domains geprüft. Der Kalenderstatus bleibt mangels persönlichem Feed-Link
ehrlich `NOT_CONNECTED`. Dies ist weiterhin keine Safari-/WebKit-, EventKit-
oder HealthKit-Abnahme.

Release `2026.11.07-97` korrigiert den vollständigen
Geräte-Lebenszyklus: „Auf diesem iPhone trennen“ widerruft zuerst die
serverseitige Freigabe und entfernt deren Ereignisse. Der lokale
AES-GCM-Tresor wird erst nach bestätigtem Erfolg gelöscht. Bei Netzfehler oder
HTTP 503 bleibt der Token verschlüsselt erhalten, damit der Widerruf sicher
wiederholt werden kann; ein bereits serverseitig ungültiger Token darf lokal
bereinigt werden. Der neue QR kodiert ausschließlich den normalisierten
öffentlichen Instanz-Ursprung plus `/iphone`, ohne Query, Fragment,
Pairing-Code oder Token. Die geschützte SVG-Antwort ist authentifiziert,
`no-store` und durch CSP/CORP begrenzt. UI, README und Download-ZIP nennen die
reale Reihenfolge Safari → Teilen → „Zum Home-Bildschirm“ → installierte App
öffnen → sechsstelligen Code manuell eingeben. 210/210 Tests, Production-Build
und der vollständige lokale sowie Günni-Live-Chrome-Flow sind grün; bei 390 px
liegen die Touchziele bei mindestens 54 px, ohne Konsolen- oder Secret-Leak.
Release 97 läuft auf vier healthy privaten Containern; die PWA ist auf drei
Domains bestätigt. Connectoren, Home, Mail, Command Stream, Kommunikation,
ICS, Jarvis und Planung sind live regressionsgeprüft. Die reale
Safari-/WebKit-Geräteabnahme steht weiter aus; EventKit und HealthKit bleiben
native Apple-Arbeitspakete.

## Technische Grenze

Eine PWA oder ein Server kann nicht direkt auf HealthKit, Apple Erinnerungen oder dauerhaft auf den iPhone-Standort zugreifen. Dafür wird eine kleine native **AgentOne Companion** App benötigt. Sie hält Apples Berechtigungsdialoge auf dem iPhone und überträgt ausschließlich ausdrücklich freigegebene Daten an die persönliche Instanz.

Alternative für den ersten Standort-Prototyp ist die bereits vorhandene Home-Assistant-Companion-App. Sie kann freiwillige Anwesenheits- oder Zonenereignisse an Home Assistant liefern; Günni liest daraus nur die explizit freigegebenen Entitäten über den Raspberry Home Connector.

## Apple Health – empfohlene erste Stufe

- Schritte und Gehstrecke als Tagessumme;
- Aktivitätsenergie und Trainingsminuten als Trend;
- Schlafdauer und Schlafregelmäßigkeit, nicht vollständige Rohserien;
- Workouts mit Typ, Dauer und Energie;
- Ruhepuls nur optional und getrennt aktivierbar;
- keine klinischen Gesundheitsakten in V1;
- keine Diagnose, Therapie- oder Medikamentenentscheidung;
- Rohdaten bleiben standardmäßig auf dem iPhone.

Jeder Datentyp erhält eine eigene HealthKit-Freigabe. Der Benutzer kann eine zeitlich begrenzte Historie wählen und Freigaben jederzeit in iOS oder AgentOne widerrufen.

## iPhone-Standort – empfohlene Modi

1. **Einmalig:** Standort wird nach ausdrücklichem Tippen für Wetter, Reisezeit oder eine ortsbezogene Frage übertragen.
2. **Zonenereignis:** Das iPhone sendet nur „Zuhause angekommen“, „Zuhause verlassen“ oder eine selbst benannte Zone.
3. **Grobe Position:** Stadt beziehungsweise ungefährer Bereich für Wetter und Vorschläge.
4. **Live-Freigabe:** Zeitlich begrenzt und sichtbar; standardmäßig deaktiviert.

Kontinuierlicher präziser Verlauf, heimliches Tracking und eine Kopie des Apple-„Wo ist?“-Verlaufs sind nicht Bestandteil des Systems. Apple stellt keine allgemeine öffentliche Find-My-API für diese Serverintegration bereit.

## Companion-Sicherheitsmodell

- Gerätebindung mit einmaligem Pairing-Code und anschließendem widerrufbarem Geräteschlüssel;
- Ende-zu-Ende-verschlüsselte Verbindung zur persönlichen Instanz;
- getrennte Schalter pro Datenart;
- Übertragungsprotokoll auf iPhone und in Private Access;
- kurze Aufbewahrung für Standortereignisse;
- Health-Zusammenfassungen getrennt von Chat- und Memory-Daten;
- kein Unternehmensadministrator erhält Zugriff auf private Gesundheits- oder Standortdaten.

## Weitere sinnvolle iPhone-Funktionen

- EventKit für Kalender und Erinnerungen;
- Share Sheet für Webseiten, Fotos, PDFs und Notizen;
- Apple Kurzbefehle als kontrollierter Ereignisweg;
- Push-Benachrichtigungen und Freigabeanfragen;
- Kontakte nur als einzeln gewählte Kontaktkarten;
- Fotos zunächst über Share Sheet, später optional über Immich;
- Home Assistant für Anwesenheit, Sensoren und private Routinen.

## Umsetzungsreihenfolge

1. Home-Assistant-Zonenereignisse über Raspberry Connector;
2. signierter Shortcut für Notiz, Erinnerung und einmaligen Standort;
3. minimale iPhone Companion App mit Geräte-Pairing;
4. EventKit read-only;
5. HealthKit mit Schritten, Schlafzusammenfassung und Workouts;
6. sichtbare, zeitlich begrenzte Live-Standortfreigabe erst nach gesonderter Prüfung.
