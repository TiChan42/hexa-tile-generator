# Wälder, Voxelarten und Wegdetails

Die Bibliothek verwendet denselben zentralen Katalog wie Generator und Editor und enthält 18 feste Arten:

- Bäume: Kiefer (`tree`), Fichte (`pine`), Eiche (`oak`), Birke (`birch`), Weide (`willow`) und Herbstahorn (`maple`).
- Unterholz: Busch (`bush`), Farn (`fern`), Grasbüschel (`grass`), Wildblumen (`flowers`), Pilzgruppe (`mushrooms`) und Schilf (`reeds`).
- Totholz: aufrechter toter Baum (`deadTree`), liegender Stamm (`log`) und Baumstumpf (`stump`).
- Gestein: Fels (`rock`), Amethystgruppe (`crystal`) und heller Bergkristall (`quartz`).

Die sieben bisherigen Modelle neben dem Amethyst bleiben unverändert. Die neuen Modelle entstehen aus codebasierten Formprimitiven in `src/render/assets/`; ihre editierbaren Voxel-JSONs in `public/models/` stimmen exakt mit diesen Quellen überein. Dünne Stiele, Wedel und Äste verwenden flächenverbundene Stufenzüge. Neue Objektgruppen bleiben über Wurzeln, Bodenstücke oder eine gemeinsame Felsbasis zusammenhängend.

Farbrollen für Laub und Pilzkappen sind zusätzliche Laufzeitmetadaten der eingebauten Bibliothek. Sie gehören nicht zum editierbaren Voxel-JSON oder zum Inhalts-Hash eigener Modelle. Deshalb bleiben Voxelkoordinaten, Grundpaletten und bestehende Modell-IDs erhalten; Baumstämme und Pilzstiele werden von den Farbprofilen nicht verändert.

Der Amethyst besteht aus fünf unterschiedlich hohen, leicht geneigten Prismen auf einer dunklen Felsbasis. Seine Seiten besitzen zusammenhängende violette Facetten; helle Akzente konzentrieren sich auf einzelne Lichtkanten und Spitzen. Der Bergkristall verwendet eine eigene Anordnung und eine kühle, helle Palette. Die Farbfelder wechseln nicht wie ein Schachbrett zwischen benachbarten Voxeln. Unter der hellen Three.js-Beleuchtung erhalten dunkle und mittlere Amethysttöne die Farbsättigung.

Sichtbare Voxeloberflächen werden weiterhin durch Entfernen innerer Würfelflächen aufgebaut. Gleiche Modelle verwenden in der Kachel gemeinsame Geometrie und Instanzen; neue Arten erzeugen keine zusätzlichen Renderer oder WebGL-Kontexte. Die kleinen Bibliotheksvorschauen verwenden dieselben Voxelkoordinaten und Paletten.

Die Normalisierung verwendet belegte Voxelgrenzen statt leerer Dateiränder. Die längste horizontale Ausdehnung beträgt anschließend 1, der tiefste belegte Voxel liegt auf Y=0. Ein gemeinsamer Skalierungswert im Editor erzeugt deshalb vergleichbare Grundflächen, während die charakteristischen Höhenverhältnisse erhalten bleiben.

## Mehrere Objekte pro Rasterzelle

`decoration.maxPerCell` begrenzt die pro Rasterzelle erzeugten Objekte auf 1 bis 12. `decoration.species` legt die zugelassenen Arten fest. Ein langsames, mehrschichtiges Perlin-Feld erzeugt dichte Gehölzgruppen und Lichtungen; innerhalb dieser Bereiche variieren Art, Größe, Drehung und belegte Subrasterplätze deterministisch. Die Dichte verändert die Belegung, ohne bereits belegte Plätze bei höherer Dichte zufällig zu verschieben.

Die Verteilung verwendet gecachte Vorlagen mit Positionen des feinen Rasters. Für Wälder werden keine Tausenden von Subrasterpolygonen oder einzelnen Objekt-Meshes aufgebaut. Die 3D-Ansicht fasst gleiche Modelle in Instanzen zusammen.

Jedes erzeugte Objekt besitzt eine ID aus Elternzelle und stabilem Subrasterplatz. Bei der Umrechnung eines exakt am Rand liegenden Platzes werden ausschließlich Rundungsabweichungen bis 10⁻⁹ in lokalen Koordinaten auf ±1 begrenzt; tatsächlich außerhalb liegende Plätze bleiben ungültig. Eine manuelle Platzierung verdrängt ausschließlich das Objekt auf demselben Platz; andere Bäume derselben Elternzelle bleiben erhalten. Manuell platzierte Objekte sind unabhängig von der prozeduralen Dichte. Im vollständigen Seed-Projekt werden die erzeugten Objekte als einzeln bearbeitbare Platzierungen gespeichert.

## Kiesel an Spielfeldrändern

Kiesel werden entlang der tatsächlichen Außenkontur einer Spielfläche verteilt. Interne Rasterkanten innerhalb derselben Fläche werden entfernt, auch wenn eine Seite nur teilweise mit dem Nachbarstück geteilt wird. Physische Verbindungen zwischen Spielfeldern, zum Pentagon und über die Außenkanten zu Nachbarkacheln bleiben frei. Ein Abstand zur gesamten Symbolfläche schützt die Lesbarkeit der Aktionen.

Die Kieseldichte ist unabhängig von der Vegetation. IDs, Positionen, Größen und Drehungen sind seedbasiert; die Gesamtzahl ist auf 1.200 Instanzen begrenzt. Das Pentagon erhält keine Kiesel, damit seine Anschlussseiten deutlich sichtbar bleiben.

## Artabhängige Größenprofile (V16)

Die normierte belegte Modellgrundfläche bleibt eine Einheit; Voxelkoordinaten, Seitenverhältnisse, Grundpaletten und Content-IDs bleiben unverändert. Im Spielbrett erhält jede Art einen eigenen Größenfaktor und eine natürliche Schwankung. Die Basisfaktoren lebender Bäume liegen standardmäßig zwischen 1,5 und 1,8; Busch, Farn, Gras, Blumen und Pilze zwischen 0,32 und 0,65, kleine Steine und Kristalle zwischen 0,6 und 0,65. Dadurch bleiben selbst kleine Bäume sichtbar höher als große Pflanzen und Steine. Modellbibliotheks-Miniaturen zeigen weiterhin die normierten Modelle.

Unter **Objektproportionen** lässt sich die gewählte Art einstellen: **Basisgröße der Art** ist ein Faktor von 0,1 bis 3; **Individuelle Größenschwankung** reicht von 0 bis 50 Prozent um diese Basis. Die persönliche **Objektgröße** einer gespeicherten Platzierung kommt zusätzlich hinzu. Das gilt für automatische, aus Seed eingefrorene und manuell gesetzte Objekte sowie zugewiesene eigene Modelle. **Standardgrößen wiederherstellen** setzt nur die Artprofile zurück.

Die tatsächliche Weltgröße beträgt `individuelle Größe / Rasterteilungen × Artfaktor × (1 + Schwankung × (2u − 1))`. `u` stammt aus einer eigenen Seed-Domäne nach Art und stabiler Objekt-ID. Farben, Terrain, Aktionen und Aktionsgewichte verändern diese Ziehung nicht. Neue automatische Objekte verwenden den persönlichen Faktor 0,7. Vollständige Seed-Rezepte speichern genau diesen Faktor; der Präfix `seed-object:` übernimmt die Ziehung des ursprünglichen Objekts, sodass Profil und Schwankung beim Einfrieren nicht doppelt angewandt werden. Vorhandene persönliche Größen bleiben erhalten.

Jedes Biom besitzt eigene Artprofile. Moorprofile betonen Weiden und Schilf, der Jadefarnwald größere Bäume und Farne, die Steppe kleinere Bäume und mehr Gras. Höhlen dürfen ausdrücklich große Kristalle und Pilze haben. Zufallsbiome variieren die Profile pro Kachel in unabhängigen Seed-Domänen; zusammenhängendes Terrain-Noise bleibt davon unberührt. Ein Biomwechsel ersetzt die Größenprofile; die Regler erlauben danach eigene Anpassungen.

Die Randprüfung verwendet die vollständige endgültige Grundfläche einschließlich Artfaktor, individueller Größe, Schwankung und Drehung. Vergrößerte Konfliktobjekte bleiben gespeichert und werden aus der Ausgabe ausgeblendet; ein deaktivierter Rand stellt sie wieder her. Alle Ansichten, PNGs und GLBs verwenden dieselben berechneten Größen. Ein größeres Objekt kann entsprechend mehr Raum über benachbarter Landschaft einnehmen; Objektpositionen und das Spielfeldraster werden dafür nicht verschoben.
