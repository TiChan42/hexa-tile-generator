# Umsetzungsplan und Produktentscheidungen

## Ziel

Eine lokal laufende Web-App erzeugt aus einer versionierten Konfiguration und einem Seed reproduzierbare hexagonale Brettspielkacheln. Der Generator ist unabhängig von UI und GPU. Der Editor zeigt jeden Schritt als frei drehbares 3D-Objekt; PNGs und Konfigurationen bleiben im Repository unter `working/`.

Grundlage sind die Anforderungen im Auftrag und die unveränderte Datei `Spielbeschreibung`. Deren zwei Nachrichten unterscheiden sich bei der Verbindlichkeit einzelner Regeln. Für diesen Editor gilt die präzisere Vorgabe des Auftrags: immer ein verschiebbares Pentagon mit eindeutigen mittigen Portalen und freien Landschaftsecken; standardmäßig alle sechs Eingänge; jede automatisch erzeugte Spielfläche bekommt eine Aktion. Sackgassen werden durch eine optionale Ringverbindung reduziert, manuelle Netze dürfen Warnungen auslösen. Eine Simulation der Spielregeln ist nicht Bestandteil des Editors.

## Reihenfolge und abgeschlossene Arbeitspakete

1. **Fundament:** React, TypeScript strict, Vite, Three.js; saubere Trennung von Domäne, Darstellung, Editor und Dateizugriff. Zod validiert Konfigurationsimporte und API-Nutzdaten. Lockfile, Gitignore und CI stehen.
2. **Geometrie:** flaches Haupthexagon mit horizontaler Ober-/Unterkante; Hexagon- und Rautenraster mit exaktem Polygon-Clipping; Nachbarschaftsgraph; feineres Objekt-Subraster.
3. **Terrain:** echtes mehrschichtiges Gradient-Perlin-Noise, terrassierte Höhen, editierbare Höhen- und Wandfarbverläufe; zusätzliche deterministische Pixelkörnung.
4. **Spielbrett:** sechs mittige, diskret gerundete Seiteneingänge; gewichtete automatische Wege und Ring; zusammenhängende manuelle Mehrzellenfelder; Absenkung auf das Minimum der ursprünglichen Zellhöhen.
5. **Pentagon:** grob fünfeckige, optional unregelmäßige Form mit einstellbarer Größe. Jede Seite hat einen eindeutigen Nachbarn oder keinen. Angeschnittene Rasterstücke teilen ihre Fläche geometrisch mit dem Zentrum, statt eine grobe fünfeckige Zellgruppe vorzutäuschen.
6. **Aktionen und Materialien:** pro Feld eindeutige Pixelgrafiken für alle genannten Aktionen und Ressourcen, eigene Ereignisbeschriftungen, Hexfarben und wiederverwendbare Palette.
7. **Gestaltung:** seedbasierte Verteilung und manuelle Subrasterplatzierung; versionierte Voxel-JSON-Bibliothek; normalisierte Modellgrundflächen, Import und gespeicherte Modellzuordnung.
8. **Editor und Ausgabe:** sechs Ebenen, Undo/Redo, Autosave im Browser, JSON-Import/-Export, Working-Bibliothek, echte Orbitansicht, Draufsicht, zentrierte signierte Perspektive, transparenter PNG-Export und lokale Dateipersistenz.
9. **Abnahme:** Invariantentests für den Generator, HTTP-/Parser-/Modelltests, strikte Typprüfung, ESLint ohne Warnungen, Prettier, Coverage-Gates, Produktionsbuild und Browserprüfungen der wichtigen Arbeitsabläufe.

Die Geometrie/Generierung, 3D-Darstellung und lokale Persistenz wurden als getrennte Subagentenaufgaben mit gemeinsamen TypeScript-Verträgen umgesetzt. Der Hauptagent verantwortet Integration, Editor, Qualitätspipeline und Browserabnahme.

## Präzisierte Konzepte

- **Quadratische Bildfläche, korrekt proportioniertes Hexagon:** Bei Draufsicht und Zoom 1 reichen die zwei horizontalen Spitzen im Export bis an den Bildrand. Oben und unten bleibt wegen der Geometrie transparenter Raum. 1080 px ist eine Pixelgröße, keine DPI-Angabe.
- **Vorschaukamera und Exportkamera:** Freies Orbitieren ist ein temporärer Inspektionszustand. Exportiert werden die gespeicherten Reglerwerte. So verändern versehentliche Mausgesten keine gespeicherten Ergebnisse.
- **Signiertes Sichtfeld:** Positiv entspricht normaler perspektivischer Verkleinerung; null einer Parallelprojektion; negativ einer inversen Größenwirkung. Die Perspektive ist ab Generator 3 stets zentriert und senkrecht von oben; Unteransichten bleiben über die Orbitkamera möglich. Die inverse Projektion ist eine bewusst stilisierte Projektion und keine physikalische Kamera.
- **Reproduzierbarkeit:** Geometrie, Höhen, Aktionen, Objektwahl und Materialien sind durch Seed und Konfiguration festgelegt. Der PNG-Export ist im gleichen Browser/GPU-Kontext reproduzierbar; zwischen verschiedenen Grafiktreibern können Antialiasing und Shader-Rundung einzelne Pixel verändern.
- **Eigene Assets:** Das erste Importformat ist bewusst Voxel-JSON, passend zum gewünschten Stil. Seine tatsächliche belegte X/Z-Ausdehnung wird auf dieselbe Grundfläche normalisiert und auf Y=0 gestellt. Die Konfiguration referenziert Modelle per Inhalts-ID. Für die Weitergabe eines Projekts müssen die referenzierten Custom-Modelle mitgegeben werden.
- **Lokale Dateien:** Browser dürfen nicht direkt beliebige Repo-Dateien schreiben. Deshalb gibt es einen ausschließlich lokal gebundenen Node-Server, der validierte Bilder und JSON zusammen ablegt. Ein statischer Host kann PNG-Downloads anbieten, aber keinen lokalen Working-Ordner beschreiben.

## Nächste mögliche Ausbaustufen

Diese Punkte sind Erweiterungen, keine Voraussetzungen für den enthaltenen Editor:

- GLB-/VOX-Importer und eine interaktive Vorschau eigener Assets mit Größenanpassung.
- Verschiebbare und skalierbare Objekt-Gizmos, freie Polygonfelder und frei definierbare Subrasterobjekte.
- Exportpakete, die Custom-Modelle mitsamt Konfiguration und Druckvorlage enthalten.
- Validierung zusammengelegter Nachbarkacheln und gemeinsamer Übergänge.
- Einheitlicher Software-Renderer für treiberübergreifend bitgleiche PNGs.
- Druckbögen mit Beschnitt, Maßstab in Millimetern und DPI-Metadaten.

Die zwei Discord-Referenzbilder konnten nach einem direkten Download geprüft werden. Sie bestätigen Mehrzellenfelder, mittige Drittel-Eingänge und ein eigenständiges Pentagon. Die konkrete Flächenteilung ist hier bewusst über ein editierbares Raster statt über fest vorgegebene Beispielpolygone definiert.

## Aktualisierung: Generator 2

Die nachfolgenden Regeln ersetzen die frühere Forderung nach einem strikt regelmäßigen, gleichseitigen Pentagon:

- Normale Spielfelder müssen mindestens `(Hauptseitenlänge / 4)²` sichtbare Grundfläche haben. Automatische Gruppen wachsen kompakt und führen kleine Reststücke zusammen; die reine Zellanzahl ist nur eine Zielgröße. Die manuelle Platzierung prüft dieselben Regeln.
- Das Zentrum darf kleiner und leicht unregelmäßig sein. An seinen fünf vollständigen Seiten sind Mehrfachbesitzer verboten. Angeschnittene Rasterzellen werden dort in exakte Außenstücke aufgeteilt; diese Ausnahme ermöglicht unabhängige Anschlüsse ohne einen erzwungenen Ring als einziges großes Nachbarfeld.
- Die Texturierung erhält grobes mehrschichtiges und feineres Perlin-Noise vor der bisherigen Pixelkörnung. Die drei Schichten sind unabhängig steuerbar und auf Wänden ebenso wirksam wie auf Oberflächen.
- Eine vollständige Seed-Rezeptur erzeugt alle Inhaltsebenen und speichert das Ergebnis als bearbeitbare Feldgruppen. Ausgabegröße und Kamera sind explizit erhaltene Präsentationsoptionen. Gleicher Seed und gleiche Ausgabeoptionen erzeugen dieselbe Ausgangskachel.
- JSON-Schema und Generatorversion werden auf 2 / 2.0.0 angehoben. Alte Projekte werden mit Hinweis migriert; alte PNGs und Manifeste bleiben unverändert. Der Speicherserver nimmt ausschließlich passende neue Versionen entgegen.

Abnahme: Mindestfläche anhand echter Polygonflächen; Zusammenhang, minimale Feldhöhe, vollständige zentrale Seitenzuordnung, konservierte Hexagonfläche, Seed-Wiederholung und nachträgliche Bearbeitbarkeit. Zusätzlich werden die räumliche Kohärenz beider Materialschichten, ihre unabhängigen Regler, die Migration und die Editorabläufe geprüft.

## Aktualisierung: Generator 3

Die Umsetzung erfolgt in drei koordinierten Subagentenaufgaben: Topologie und Invarianten, gebündeltes Rendering mit Kamera sowie Objekt- und Wegdetails. Der Hauptagent integriert Editor, Worker, Versionierung und Browserabnahme. Die gemeinsamen Typen werden vor den parallelen Änderungen festgelegt.

- Der Gesamtzähler enthält das Pentagon. Gewünschte 7–24 Felder sind ein Ziel mit harten Flächen- und Anschlussregeln. Bei geometrischer Unmöglichkeit wird die tatsächliche Anzahl mit einer konkreten Warnung angezeigt.
- Ein Graph aus Ketten und Verzweigungen wird vor der Zellbelegung geplant. Fremde Äste erhalten Landschaftspuffer. Jede aktive Außenseite hat genau einen Besitzer am mittigen Drittel-Eingang; keine weitere Spielfläche darf die Seite berühren. Echte gemeinsame Kanten erzeugen einen expliziten, im Editor sichtbaren Feldgraphen.
- Das grobe Pentagon darf unabhängig von der Bildmitte versetzt werden. Die fünf Seiten bleiben vollständig zuordenbar. Die geometrischen Anschlüsse bewahren die Spielfeldgrundflächen; ihre aktuelle Darstellung mit senkrechten Stufen ist unter Generator 6 festgelegt.
- Kiesel an echten Feldrändern und zusätzliche Helligkeitsverläufe schaffen natürliche Wege. Durchgänge und Aktionssymbole bleiben frei. Überhängende Bodenkappen und hängende Wandsäume werden am Außenhexagon abgeschnitten.
- Vegetation nutzt mehrere stabile Subrasterplätze je Zelle, eine kohärente Perlin-Walddichte und acht Objektarten. Einzelne manuelle Platzierungen ersetzen nur den betreffenden Subrasterplatz.
- Die UI lässt reine Geometrie in einem Worker berechnen. Veraltete Vorschauen werden zusammengefasst; vollständige Rezepturen und Geometrieprüfungen laufen über dieselbe kontrollierte Warteschlange. Material- und Kameraänderungen umgehen den Generator.
- Die Darstellung verwendet zusammengefasste Flächen und Linien sowie Instanzen für Vegetation und Kiesel. Rechte Maustaste dreht den Orbit, das Mausrad zoomt. Die feste Perspektivkamera bleibt über der Haupthexagonmitte und passt die Bodenbreite an die quadratische Exportauflösung an.
- Schema 3 / Generator 3.0.0 markiert geänderte reproduzierbare Inhalte. V1/V2 werden ausdrücklich migriert; alte Exporte bleiben unverändert.

Abnahme: geometrische und graphische Invarianten über Seeds, Raster und Feldzahlen; tatsächlich belegte Mindestflächen und einzelne Außenbesitzer; vollständige Seed-Rezepte und Schema-Roundtrip; Warteschlangenkollisionen und Fehlerbehandlung; Wand-/Überhanggeometrie und Kameraprojektion; Browserabläufe mit Rechtsmaus, Zoom, exakten PNG-Maßen sowie Grenzen für Zeichenaufrufe und unveränderte Geometrie bei Materialänderungen.

## Aktualisierung: Generator 4

Die bisherigen vollständigen Pentagon-Seitenanschlüsse werden durch mittige Portale ersetzt. Die Portalbreite ist konfigurierbar; ein geometrisch abgetrennter Landschaftssaum schützt die Eckzonen. Diese Stücke dürfen weder automatisch noch manuell Spielfeld werden. Jeder Anschluss bleibt einem Feld oder keinem zugeordnet.

Die sechs festen Eingangsfelder werden aus dem ungeschnittenen Grundraster abgeleitet. Ihre gesamten Rasterstücke und ihre Form bleiben bei derselben Rasterkonfiguration unabhängig von Seed, Pentagonform und Topologie gleich. Das Wegenetz verbindet die Innenseite dieser Felder mit den Pentagon-Portalen. Kollidierende Pentagonpositionen werden gemeldet, statt die Eingänge oder die Benutzerposition heimlich zu verschieben. Sechs feste Randfelder, Pentagon und mindestens ein innerer Verbinder erfordern mindestens acht Spielfelder.

Neue Projekte starten mit 18 Unterteilungen. Die vollständige Seed-Rezeptur übernimmt die gewählte Rasterkonfiguration, Feldzahl, Portalbreite und Höhenart. Ohne explizite Rasterwahl nutzt sie für hohe Feldzahlen ein festes feineres Raster. Eine geometrisch unmögliche Rezeptur wird nicht als vollständiges Ergebnis eingefroren.

Spielfelder können flache Plattformen oder mehrere Terrassen verwenden; die Einstellung ist global und pro Feld wählbar. Ein zusätzlicher Höhenversatz hebt oder senkt ein Feld. Lokale Höhen bestimmen Konturen, Kiesel und Symbolplattformen. Die ursprüngliche Übergangsgeometrie wird durch die Darstellungsregel in Generator 6 ersetzt. Die Außengrenze eines Spielfelds erhält ein breites dunkles Mesh-Band; innere Rasterlinien bleiben dünn und zurückhaltend. Landschaftsüberhänge verdecken die Feldkontur nicht.

Alle Aktionsgrafiken werden durch neue 24-Pixel-Motive mit semantischen Farben und kontrastreicher Unterlage ersetzt. Der Renderer verwendet dieselben Grafiken wie der Editor.

Die Arbeit ist zwischen Geometrie/Topologie, Darstellung sowie Symbolen aufgeteilt; gemeinsame Datenverträge werden vor den parallelen Änderungen auf Version 4 angehoben. Der Hauptagent integriert Schema, Migration, Editor, Seed-Rezeptur und Abnahme. Alte Exporte bleiben unverändert.

Abnahme: Eigentum der Portale und vollständige Landschaftsecken anhand realer gemeinsamer Kanten; feste Eingangspolygone und IDs über Seeds und Mittelpunktpositionen; erhaltene Gesamtfläche und Feld-Mindestfläche; lokale Höhen mit Versatz und begrenzter Unterkante; kräftige Außenkonturen ohne doppelte innere Grenzen; vollständige erkennbare Symbolbibliothek; Import alter Versionen, nachträgliche Bearbeitung sowie Browser-/PNG-Prüfungen.

## Aktualisierung: Generator 5

Die Objektbibliothek wächst auf 18 Arten. Weide und Herbstahorn ergänzen die Baumformen; Farn, Gras, Wildblumen, Pilze und Schilf bilden Unterholz. Liegender Stamm und Baumstumpf ergänzen das Totholz. Amethyst und Bergkristall erhalten asymmetrische Gruppen mit verschieden hohen, spitz zulaufenden Prismen, ruhigen Farbfacetten und einer gemeinsamen Felsbasis. Alle Modelle behalten die Normalisierung nach belegter Grundfläche und werden als editierbare Voxel-JSONs mitgeliefert.

Ein gemeinsamer Katalog definiert die stabilen Objekt-IDs und deutschen Bezeichnungen. Der Editor zeigt gruppierte, durchsuchbare Modellminiaturen, die ohne zusätzliche WebGL-Kontexte aus den tatsächlichen Voxeln entstehen. Alle Arten sind manuell platzierbar, in der automatischen Verteilung wählbar und durch eigene Modelle ersetzbar. Vollständige Seed-Rezepturen verwenden thematisch passende Artenmischungen.

Schema 5 / Generator 5.0.0 kennzeichnet die erweiterte Bibliothek und die erneuerten Kristalle. V4 wird ohne Datenverlust übernommen: Felder, Aktionen, Farben, Beschriftungen, Höhen, Objektplatzierungen und Custom-Modellzuordnungen bleiben erhalten. Die alten V4-Arten und Grenzen werden bei Importen separat strikt validiert. Frühere V1–V3-Migrationen behalten ihren notwendigen Geometrieumbau. Vorhandene Exporte und Browser-Autosaves werden nicht überschrieben.

Die Umsetzung ist auf Modelle, Schema/Migration und Editorbibliothek aufgeteilt. Die Integration prüft Modellgrenzen, Paletten, JSON-Synchronität, verlustfreie V4-Migration, alle Arten im Renderer und den bestehenden Grenzwert für Draw Calls. Eine echte 3D-Kontaktübersicht ergänzt die automatischen Tests um die visuelle Abnahme der Kristalle.

## Aktualisierung: Generator 6

Die neue Vorgabe ersetzt die Rampen und schrägen Verbindungsbänder früherer Versionen: Alle Oberflächen bleiben waagerecht. Zwischen unterschiedlich hohen Polygonen stehen gerade senkrechte Wände; das gilt auch zwischen Spielfeldern, an Terrassen und an den Pentagonportalen. Bei gleicher Höhe entfällt eine innere Wand. Der Regler „Übergang zum Pentagon“ und die Einstellung `paths.transitionWidth` werden entfernt. Globale und einzelne Höhenmodi sowie Höhenversätze bleiben einstellbar.

Feldgraph, Grundrisse, feste Eingangsflächen, Portalbreiten, Landschaftsecken und gespeicherte Höhen bleiben unverändert. Schema 6 / Generator 6.0.0 kennzeichnet die neue Darstellung. V5 und V4 werden unter Erhaltung aller Bearbeitungen migriert; allein die obsolete Übergangsbreite entfällt. Die bereits früher erforderlichen Layoutanpassungen bei V1–V3 werden weiterhin ausdrücklich gemeldet. Vorhandene Exporte und Originalkonfigurationen werden nicht überschrieben.

## Aktualisierung: Generator 7 – vorhandene Feldformen bearbeiten

Alle normalen Spielfelder sind nachträglich über ihre Rasterstücke bearbeitbar, einschließlich automatischer Anordnungen und Randfelder. Die mittigen Eingangszellen bleiben fest; die dahinterliegende Form darf wachsen oder schrumpfen. Die automatisch erzeugte Standardform bleibt seedunabhängig. Das Pentagon verwendet weiterhin seine eigenen Formregler.

Vor dem Übernehmen friert ein reiner Kernschritt die sichtbare Anordnung als explizite Feldliste ein. Andere Feldformen, IDs, Aktionen, Farben und Höhenparameter bleiben erhalten. Überdeckte manuelle Objekte werden gezielt entfernt. Die Worker-Prüfung verhindert ungültige Flächen, überlappende Felder, zerteilte Portalanschlüsse und die Abtrennung eines verbundenen Wegenetzes. Abbrechen verändert die Konfiguration nicht; Übernehmen ist ein einzelner Undo-Schritt. Unvollständige manuelle Pläne bleiben schrittweise aufbaubar.

Schema 7 / Generator 7.0.0 bezeichnet die erweiterten manuellen Eingangsregeln. V6 wird ausschließlich durch Änderung des Versionspaars übernommen; V4/V5 behalten zusätzlich ihre bestehende Migration ohne Rampenbreite. Alte Browserstände und gespeicherte Dateien werden erhalten. Abnahme: manuelles Hinzufügen und Entfernen auf Auto- und Seed-Kacheln, feste Mündungen, unveränderte übrige Felder, Metadaten und Dekoration, JSON-Rundlauf, Undo/Redo und Browser-Neuladen.

Nachbesserung der Bedienung: Übernehmen und Abbrechen stehen in einer eigenen Leiste über der Vorschau, unabhängig vom Scrollstand des Inspektors. Gemeinsame Auswahlvalidierung zeigt den konkreten Hinderungsgrund schon vor dem Übernehmen an; nachgelagerte Verbindungsfehler bleiben sichtbar. Fehlende oder noch ladende Objektmodelle blockieren die Feldform nicht. Browserabnahme umfasst eine zunächst zu kleine, anschließend korrigierte und tatsächlich gespeicherte Form auf Desktop und Mobilgerät sowie das Speichern bei nicht verfügbarem Modell. Die Generatorsemantik bleibt unverändert.

Abnahme: ausschließlich horizontale Oberflächen und vertikale Stufenwände, unveränderte Feld- und Portaldaten, Terrassen und positive wie negative Höhenversätze, vollständige V4/V5-Migration sowie Browser- und GPU-PNG-Prüfungen. Die Arbeit ist zwischen Rendering, Schema/Persistenz und Editor/Dokumentation aufgeteilt; der Hauptagent führt die gemeinsame Abnahme durch.

## Aktualisierung: Generator 8 – Schnellaktionen und konfigurierbare Prüfregeln

Eine rechte Seitenleiste bündelt kontextabhängige Aktionen für Spielfelder, Objekte und Export. Erstellen, Bearbeiten, Anwenden, Auswahl leeren und Abbrechen sind ohne Scrollen des linken Parameterbereichs erreichbar; es gibt genau eine Anwenden-Aktion. Auf schmalen Bildschirmen wird die Leiste unten angedockt.

Gespeicherte Felder und Entwürfe erhalten eine kräftige Kontur ihrer tatsächlichen Vereinigung. Die Farbe liegt gegenüber dem flächengewichteten mittleren Landschaftsfarbton bei voller Sättigung; neutrale Landschaft verwendet Magenta. Die Markierung bleibt außerhalb des PNGs.

Kleine, getrennte oder nicht vollständig angebundene Felder können manuell gespeichert werden. Die einstellbare Mindestfläche sowie Feld- und Wegkonnektivität liefern Warnungen. Exportpolicy entscheidet, ob diese PNG und Working-Speicherung sperren. Geometrische Eigentumsregeln, exakte Schnitte, geschützte Pentagonecken und feste Mündungen bleiben verbindlich. Die automatische Layoutrezeptur behält ihr Standard-Flächenziel; strengere Prüfgrenzen verändern keine bestehenden Formen.

Schema 8 übernimmt V4–V7 ohne Zurücksetzen der Bearbeitungen und ergänzt die Regeln; V4/V5 verlieren weiterhin nur die obsolete Rampenbreite. Historische Dateien und Autosaves bleiben erhalten. Abnahme: ein einzelner sichtbarer Anwenden-Knopf, Desktop/Mobil ohne Scrollzwang, kleine und getrennte Felder speicherbar, Export blockiert oder erlaubt gemäß Regeln, API-Schutz, Auswahlfarbe und PNG ohne Auswahl sowie Migrationen.

## Aktualisierung: Generator 9 – äußerer Rand und freie Objektzone

Ein optionaler paralleler Innenrand folgt dem Haupthexagon. Aktivierung, Breite und Schwarz/eigene Farbe/Feldrandfarbe/durchsichtig werden im Landschaftsschritt eingestellt; rechts führt eine Schnellaktion direkt zu den Reglern. Wege schneiden den Rand vollständig auf und behalten den Zugang zur Außenkante ohne dunklen Querabschluss. Höhenwechsel bleiben waagerechte Plateaus und senkrechte Wände.

Automatische und manuelle Objekte dürfen mit ihrer gesamten gedrehten normalisierten Grundfläche nicht in die Zone ragen. Gespeicherte Konfliktobjekte bleiben als Daten erhalten und werden nur ausgeblendet; nach Abschalten erscheinen sie wieder. Transparenter Rand bleibt objektfrei, ohne den Boden auszuschneiden.

Schema 9 ergänzt bei V8 nur einen deaktivierten Rand und das Versionspaar. Ältere verlustfreie Migrationen bleiben erhalten; alte Dateien und Bilder werden nicht überschrieben. Abnahme: exakte Streifenbreite/Fläche, Terrainstufen, alle sechs offenen Eingänge, Farbmodi in echten PNGs, robuste Objektabstände bei verschiedenen Arten/Größen/Drehungen, transparente Zone, Wiederherstellung und JSON/Autosave/Seed-Rezeptur.

## Aktualisierung: Generator 10 – stabile Pentagonbearbeitung und Aktionswürfe

Pentagonregler erhalten standardmäßig den sichtbaren Wegeplan. Automatische Felder werden dabei als konkrete Formen festgehalten; lokale Rasterüberlappungen ordnen neue Schnitte und komplette Portale bisherigen Besitzern zu. Feldidentitäten, Anpassungen, äußere Eingänge und gespeicherte Objekte bleiben erhalten. Vollständige Verdrängung oder Eingangskollision wird gemeldet. Ein separater Schalter erlaubt weiterhin den ausdrücklichen Neuaufbau. Schnelle Änderungen und Undo/Redo sind mit beiden Rasterarten abgesichert.

Die Schnellaktionsleiste erhält einen gemeinsamen Knopf für alle Feldaktionen einschließlich Pentagon. Dreizehn nichtnegative Gewichte und ihre normierten Chancen sind einstellbar. Würfe sind über Seed und gespeicherte Revision unabhängig pro Feld reproduzierbar und verändern nur Aktionen. Gewicht 0 schließt aus; Summe 0 bleibt als editierbarer Stand erlaubt und deaktiviert den Würfelknopf. Die bisherigen Seed-Anfangsaktionen bleiben erhalten.

Schema 10 ergänzt V9 ohne Zurücksetzen von Daten um die neuen Präferenzen; ältere Migrationen und historische Autosaves bleiben erhalten. Abnahme: äußere Feldformen und Metadaten unverändert, lokale Portale gültig, manuelle Randformen geschützt, expliziter Neuaufbau, schnelle Änderungen, gewichtete Ein-Aktions-Verteilungen, Pentagon einbezogen, Nullgewichte, gemeinsame Undo-Schritte und erneutes Öffnen.

## Ergänzung: Biomprofile in der Landschaftsebene

Dreizehn ausdrücklich auswählbare Profile stimmen Gelände-, Wand- und Wegfarbverläufe mit passenden Objektarten und einer natürlichen Objektdichte ab. Mehrfarbige Biome verwenden zusätzliche Farbstopps; die Pilz-Kristallgrotte enthält ausschließlich Pilze, Kristalle und Bergkristalle, die Kobalthöhle nur Kristallarten. Ein Profil verändert weder Seed, Relief noch Raster und Wege. Nicht passende manuelle Objektarten werden entfernt; Anwenden ist ein einzelner Undo-Schritt. Die ausgewählten Verläufe, Objektarten und Platzierungen liegen in bestehenden Konfigurationsfeldern, daher ändert sich weder das Versionsschema noch die bisherige Seed-Ausgabe.

## Aktualisierung: Generator 10.1 – kompakte Felder und verzweigte Wege

Automatische Spielfelder wachsen jetzt zuerst zu zusammenhängenden, kompakten Gruppen. Die Verbindungswege werden danach geplant, damit sie nicht die Grundform der Spielfelder zu dünnen Korridoren ziehen. Seedabhängig erhalten zwei bis vier Pentagonseiten Portale; nicht benutzte Seiten bleiben Landschaft. Manuelle, bereits gespeicherte Portalformen bleiben unangetastet. Alle sechs Außenseiten haben feste, vollständig erreichbare Eingänge. Die Version 10.1.0 markiert diese neue reproduzierbare Generatorsemantik; Schema 10 bleibt unverändert. V10.0 wird streng validiert, frühere deaktivierte Außeneingänge werden aktiviert, und gespeicherte Formen bleiben erhalten.

## Aktualisierung: Generator 11 – Bulk-Spielbrett

Der neue Bulk-Modus erzeugt aus einem Seed ein Hex-Spielbrett mit bis zu 49 einzeln editierbaren Tiles. Reihen und Spalten sind einstellbar. Der Serienviewer zeigt die Anordnung als 2D-Draufsicht mit Flächenfarben und Feldkonturen oder als orbitierbares 3D-Brett in einem gemeinsamen Renderer. Das Standard-Biomprofil wählt pro Tile ein zufälliges Biom und variiert seine Farben, Objektarten und Dichte reproduzierbar. Alternativ lässt sich ein Biom für alle Tiles festlegen. Optional teilen die Tiles einen Welt-Noise-Seed, gemeinsame Terrainparameter und Weltkoordinaten im Hexgitter, damit Höhen- und Materialrauschen an den Nachbarkanten kontinuierlich bleiben. Raster und Tile-Rand lassen sich optional serienweit vereinheitlichen; solche Änderungen werden im normalen Einzelkachel-Editor zurück in die Serie synchronisiert.

Tile-Reihenfolge und Shuffle-Revision sind Teil eines separaten `BulkProject`-Formats der Version 3. Version-1- und Version-2-Serien werden streng validiert und mit ihren bestehenden Tile-Rezepten migriert. Neu anordnen ist seedbasiert reproduzierbar und verschiebt bei aktivem durchgehendem Noise auch die Weltursprünge. Einzelkachel-Autosave und Bulk-Serienspeicherung bleiben getrennt. Alle PNGs einer Serie werden über die bestehende Regelprüfung und lokale Working-API einzeln gespeichert. Schema 11 ergänzt pro Tile `terrain.noise.seed` und `terrain.noise.origin`; Schema 12 ergänzt Objektfarbprofile.

Generator 11.1 führt für neue automatische Wege einen seedabhängigen Routenbogen und bis zu drei zusätzliche Querverbindungen ein. Felder bleiben als zusammenhängende Flächencluster aufgebaut. Alle sechs Außeneingänge, vollständige Mittigkeit, Pentagon-Ecken als Landschaft sowie die Mindestfläche bleiben harte geometrische Regeln. Generator 11.0 wird beim Laden gegen sein striktes Schema geprüft; manuelle gespeicherte Feldformen werden erhalten.

## Aktualisierung: Generator 12 – Objektfarbprofile

Schema 12 ergänzt für Baumlaub und Pilzkappen jeweils bis zu acht benennbare Profile mit drei Farben für Schatten, Grundfarbe und Licht. Die Profilvariante wird pro Objekt mit einem unabhängigen Seed-Bereich gewählt, sodass sie weder andere Zufallsdomänen noch Geometrie oder Objektplatzierung verändert. Stämme, Äste und Pilzstiele behalten ihre eingebauten Modellfarben; andere Arten und eigene Modelle bleiben ohne Rollenpalette unberührt. Neue Projekte nutzen die Standardprofile. Migrationen aus Schema 11 ergänzen dieselben Profile ausgeschaltet, damit das bisherige Aussehen erhalten bleibt. `BulkProject` wird auf Version 3 angehoben und migriert Tile-Konfigurationen über die Einzelkachel-Migration. Der Einzelkachel-Autosave nutzt den Schlüssel `hexa-studio-project-v12`.

Der Bulk-Export lädt die gewählten Kameraansichten als ZIP herunter. Standardmäßig enthält es nur Draufsicht-PNGs direkt im Archiv. Mehrere Ansichten werden pro Tile in getrennten Unterordnern gespeichert. Die 3D-Ausgabe nutzt den gespeicherten Orbitwinkel; die Perspektive bleibt zentriert von oben. Auflösung und Transparenz folgen der jeweiligen Tile-Konfiguration. Die bestehende Einzelablage der PNGs im Working-Ordner bleibt separat verfügbar.

## Aktualisierung: Generator 13 – verzweigte Wege und lesbare Feldfarben

Der feste Sechs-Lanes-Aufbau wurde durch seedbasierte Innenanker und einen randomisierten Prim-Spannbaum ersetzt. Pentagonportale und sechs Außeneingänge sind die festen Netzwerkknoten; `paths.loop` ergänzt wenige Querverbindungen. Routingkosten enthalten Höhenwechsel und eine seedbasierte Kurvenführung. Vor dem Routing wachsen die Feldkerne über die Mindestfläche hinaus zu kompakten Flächen; natürliche Kontakte zwischen Kernen erzeugen zusätzliche Abzweigungen. Für automatisch abgeleitete Spielfeldfarben sorgt eine OKLab-Kontrastkorrektur gegenüber den lokalen Landschaftsfarben. Sie zielt auf einen Abstand von 0,18 und wählt bei nicht erreichbarem Ziel den bestmöglichen Abstand; manuelle Farbwerte bleiben exakt. Wegen der geänderten Seed-Ausgabe steigt das Konfigurationsschema von 12 auf 13; V12 wird strikt migriert, ohne gespeicherte Feldformen zu verändern.

## Abgeschlossene Integration und Pipeline

Die historischen Migrations-, API-, Autosave- und Browserprüfungen verwenden nun das aktuelle Versionspaar 13 / 13.0.0 und bleiben für jedes alte Eingabeformat strikt. Zusätzliche Prüfungen decken Bulk-Erzeugung und -Bearbeitung, feste und variierte Biome, gemeinsame Noise-Koordinaten, Objektfarbprofile sowie die ZIP-Dateistruktur und unveränderte PNG-Nutzdaten ab. Die Coverage-Grenzen bleiben unverändert; Bulk-Persistenz und ZIP-Erzeugung sind zusätzlich in die Coverage aufgenommen.

Beim Import sehr alter Einzelprojekte stammen Terrain-Noise-Seed und Ursprung ausdrücklich aus dem damaligen Tile-Seed und Ursprung 0. Ein V3-Seriencontainer migriert auch enthaltene V12-Kacheln, ohne gespeicherte Feldformen oder Farbprofile zu ersetzen. Der Seriencontainer bleibt Version 3, da seine Struktur unverändert ist.

Ein gemeinsamer Wechsel der Rasterart oder Rasterauflösung verwirft wie im Einzelkachel-Editor rasterabhängige Feldformen und Objektplatzierungen und schaltet auf automatische Wege um. Die ursprüngliche Objektdichte wird wiederhergestellt. Anzeigeoptionen, Subrasteränderungen, Randänderungen und Noise-Umschaltung lösen diesen Neuaufbau nicht aus. Die Serienoberfläche erklärt diese Folge am Rasterregler.

Die Browserabnahme ergänzt einen zugänglichen Namen für den Bulk-Knopf auch bei ausgeblendeter mobiler Textbeschriftung. Objektfarbvarianten teilen sich jetzt je Modell ein Instanz-Mesh, sodass das bestehende Limit für Zeichenaufrufe auch mit allen Objektarten und aktivierten Profilen erhalten bleibt. Der GLB-Export erhält dieselben Farben über explizites Einbacken der Instanzpaletten. Die automatische Pentagonfarbe darf sich bei geändertem Anschlussumfeld zur Kontrasterhaltung anpassen; ausdrücklich gespeicherte Farben bleiben exakt.

## Generator 14: flächiges Wegenetz und Rasteranschlüsse

Automatische Innenfelder werden als zusammenhängende Flächen partitioniert und kompakt ausgedünnt; gemeinsame breite Kontaktzonen bilden den Graphen. Der Graph bleibt ohne Pentagon verbunden. Kleine zufällige Randvariation, entspannte Flächenkerne und Landschaftstaschen ersetzen schmale nachträgliche Zellrouten. Neue Invarianten prüfen einstückbreite Ketten, Mindestfläche, Zusammenhang, Kompaktheit und vollständige Rasterziele an den Pentagonportalen über mehrere Seeds, Feldzahlen, Rasterarten und Centerpositionen.

Pentagonseiten wählen vollständige Rasterzellen außerhalb des reservierten Fußabdrucks. Eine kurze mittige Mündung verbreitert sich bis zur zugewandten Rasterkante, ohne Landschaftsecken oder fremde Zielzellen zu schneiden. Erst das fertige normale Wegenetz bestimmt die nahen Besitzer von zwei oder drei gesäten Anschlüssen. Kappen bleiben horizontal und Höhendifferenzen behalten senkrechte Wände.

Schema und Generator steigen auf 14 / 14.0.0. Das eingefrorene V13-Schema und `legacyLayout: true` halten existierende Layouts reproduzierbar. Eine mit dem ursprünglichen V13-Code erzeugte Fixture-Geometrie wird gegen einen festen SHA-256-Wert verglichen. Neue Autosaves verwenden einen eigenen V14-Schlüssel; ältere Quellen bleiben bestehen. Der ausdrückliche Neuaufbauknopf aktiviert das neue Verfahren und ist zusammen mit dem vollständigen vorherigen Projektstand per Undo wiederherstellbar.

## Generator 15: kleinere Felder und erkennbare Pfade

- Kleinere Feldflächen und explizite Trennung unerwünschter Nachbarschaften; gewöhnlich zwei oder drei Kontakte, selten vier.
- Unveränderte mittige Außenmündungen mit variablen Innenformen der Randfelder.
- Rasterlinien ohne zusätzliche Landschaftsschnitte am Pentagon; dünne schwarze Feldkontur an der Kachelkante.
- Aktionssymbole in der breitesten passenden Fläche statt am bisherigen Feldmittelpunkt.
- Striktes Schema15 und eingefrorene V14-Kompatibilität mit eigenem Autosave-Schlüssel.

## Abwechselnder Spaltenversatz in Bulk-Serien

Kachelliste, 2D-Draufsicht, 3D-Brett und Gesamtfeld-Exporte verwenden abwechselnd um eine halbe Kachelhöhe versetzte Spalten. Die dritte Spalte liegt wieder auf Höhe der ersten; der Versatz wächst nicht mehr zu einer Raute an. Der Seriencontainer wird wegen der geänderten Weltkoordinaten auf Version 4 angehoben. V1–V3 werden vor der Migration gegen die bisherige Koordinatenkonvention geprüft; durchgehendes Noise erhält die neuen Weltursprünge in gespeicherter Tile-Reihenfolge. Feldformen und Metadaten bleiben erhalten, während Höhen und Materialrauschen verschobener Tiles neu abgetastet werden. Alte Autosaves bleiben unter ihren bisherigen Schlüsseln erhalten. Geometrische Invarianten prüfen gemeinsame Hexkanten ohne Flächenüberlappung; Browsertests prüfen den halben Höhenversatz auch nach Zeilenumbrüchen und die neue Gesamtmodell-Anordnung.

## Kachelliste mit 2D-Brett zusammengeführt

Die Serienauswahl zeigt standardmäßig ein zusammenhängendes, vollständig gerendertes Brett statt einzelner Karten und einer zweiten 2D-Liste. Direkt anklickbare Hexflächen mit hellen, schwarz schattierten Namen wählen die Kacheln aus; der gemeinsame Bearbeiten-Knopf öffnet die Auswahl. Ziehen und Mausrad navigieren durch die Ansicht. Der Startausschnitt und **Alles anzeigen** passen sämtliche Kacheln samt Objekten an den verfügbaren Viewport an. Die Einzelkachel-Draufsicht erhält ebenfalls Verschieben und Zoom. Geometrie, Serienkoordinaten, gespeicherte Kamerawerte und reproduzierbare Exporte bleiben unverändert; die Versionsstände bleiben bestehen. Kamerainvarianten prüfen vollständige Einpassung bei schmalen und breiten Viewports, Browsertests Auswahl, Navigation, 49 Kacheln und unveränderte Exporte.

## Generator 16: stimmige Objektproportionen und Biomgrößen

Bäume erhalten größere Basisfaktoren als Unterholz, Pilze, Holzstücke und kleine Steine. Alle 18 Arten besitzen persistierte, einzeln einstellbare Größen- und Schwankungsprofile. Biome und vollständige Seed-Themen setzen passende Profile; Zufallsbiome variieren sie unabhängig von Terrain, Farben und Objektbelegung. Auch gespeicherte Platzierungen folgen den Profilen, ihre persönlichen Größen, Positionen und Metadaten bleiben erhalten. Neue Seed-Rezepte frieren den persönlichen Faktor ein und erhalten ihre ursprüngliche Größenziehung über eine kanonische Objekt-ID.

Die Änderung erhält Schema 16 / Generator 16.0.0 mit strikt eingefrorenem V15-Importer und eigenem Autosave-Schlüssel. Migrierte Objekte erhalten ausdrücklich natürliche Proportionen; historische Artefakte bleiben erhalten. Die vollständige normierte Grundfläche einschließlich sämtlicher Größenfaktoren entscheidet über Randkonflikte. Invarianten prüfen reale Modellhöhen, stabile unabhängige Variation, Einfrieren ohne doppelte Skalierung, unveränderte Feldgeometrie und reversible Randkonflikte. Browserprüfungen decken Artregler, Biome, Undo, Persistenz sowie übereinstimmende PNG-/GLB-Größen ab.
