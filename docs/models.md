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
