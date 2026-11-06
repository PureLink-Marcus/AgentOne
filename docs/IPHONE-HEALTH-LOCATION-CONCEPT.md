# iPhone, Apple Health und Standort für AgentOne Personal

Stand: 30. Oktober 2026

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
