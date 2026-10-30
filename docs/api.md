# Lokale Speicherung und Modelle

`npm run dev` stellt die API über den Vite-Server bereit. `npm start` erstellt den Produktionsbuild, verwendet dieselbe API und liefert den gebauten Editor unter `http://127.0.0.1:4173` aus. `npm run preview` ist ein Alias für diesen vollständigen Start einschließlich API. `PORT` überschreibt den Port. Beide Server sind lokal gebunden.

## Tiles

- `GET /api/tiles`: Liste gespeicherter Export-Manifeste.
- `POST /api/tiles`: JSON `{ "config": <TileConfig>, "png": "data:image/png;base64,..." }`. Die Konfiguration wird vollständig validiert; PNG-Signatur, CRC-Prüfsummen, Chunk-Struktur, Bildformat und quadratische Abmessungen müssen zur Exportgröße passen. Maximal 72 MiB PNG beziehungsweise 100 MiB Request; dies deckt auch 4096 × 4096 Pixel mit wenig komprimierbaren Farbdaten ab.
- `GET /api/tiles/:id` oder `GET /api/tiles/:id/config.json`: Konfiguration zum erneuten Öffnen.
- `GET /api/tiles/:id/tile.png`: PNG.

Der Server legt `working/<name>-<seed>-<config-hash>/config.json`, `tile.png` und `manifest.json` an. Die ID enthält keinen Zeitstempel und bleibt bei identischer Konfiguration gleich. Schreibvorgänge erfolgen in einem isolierten temporären Verzeichnis, das anschließend atomar umbenannt wird. Ein vorhandener Export wird beibehalten. Das Manifest enthält SHA-256-Prüfsummen von Konfiguration und PNG. Arbeitsdateien gehören nicht in Git.

## Feldhöhen und Pentagon-Portale

Die Felder speichern Höhenregeln, keine vorab berechneten Mesh-Höhen. Alle Weltmaße beziehen sich auf eine Seitenlänge des Haupthexagons von 1.

| Konfigurationswert            | Zulässige Werte                     | Verhalten                                                                                                                     |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `paths.heightMode`            | `flat` oder `terraced`, Pflichtfeld | Gemeinsamer Standard für normale Spielfelder und das Zentrum; Vorgabe ist `flat`.                                             |
| `paths.fields[].heightMode`   | optional `flat` oder `terraced`     | Überschreibt den Standard nur für die angegebene Feld-ID. Ohne Eintrag gilt `paths.heightMode`.                               |
| `paths.fields[].heightOffset` | optional −0,12 bis +0,30            | Additiver Höhenversatz dieses Feldes; ohne Eintrag 0. +0,05 bedeutet 5 % einer Haupthexagon-Seitenlänge.                      |
| `center.portalWidth`          | 0,25 bis 0,70, Pflichtfeld          | Breitenanteil des mittigen Portals an jeder Pentagonseite; Vorgabe ist 0,45. Die beidseitigen Eckbereiche bleiben Landschaft. |

Bei `flat` liegen alle Zellen eines Feldes auf dem Minimum ihrer ursprünglichen Terrainhöhen zuzüglich `heightOffset`. Bei `terraced` behält jede Zelle ihre eigene ursprüngliche Terrainhöhe zuzüglich dieses Versatzes. Die endgültige Höhe wird jeweils auf mindestens 0,02 begrenzt, damit kein Feld durch den gemeinsamen Sockel abgesenkt wird. Die Regeln gelten auch für das Pentagon; Symbole verwenden die jeweilige lokale Oberfläche. Zwischen unterschiedlich hohen Oberflächen stehen vertikale Wände, keine Rampen.

Ein fehlendes Feld-`heightMode` übernimmt den globalen Standard; ein ausdrücklich gesetztes `flat` bleibt auch dann flach, wenn `paths.heightMode` später auf `terraced` wechselt. Zum Zurücksetzen werden die optionalen Eigenschaften weggelassen. Für ein automatisch erzeugtes Feld können `id`, `action` und `cellIds: []` zusammen mit den gewünschten Höhenwerten als Anpassung gespeichert werden. Eine manuelle Feldform behält ihre bestehende `cellIds`-Auswahl.

## Voxelbibliothek

- `GET /api/models`: eingebaute Modelle aus `public/models/*.json` und eigene Modelle aus `working/models/*.json`.
- `POST /api/models`: validiert und speichert ein Voxelmodell.
- `GET /api/models/:id`: normalisiertes Modell.

Eingebaute Arten sind `tree` (Kiefer mit Schirmkrone), `pine`, `oak`, `birch`, `willow`, `maple`, `deadTree`, `bush`, `fern`, `grass`, `flowers`, `mushrooms`, `reeds`, `log`, `stump`, `rock`, `crystal` und `quartz`. Ihre IDs bleiben stabil; insbesondere wird `deadTree` bei `GET /api/models/deadTree` exakt in dieser Schreibweise zurückgegeben. Eigene Modell-IDs bleiben inhaltsbasierte `model-…`-Werte. `decoration.species` enthält 1 bis 18 eindeutige, prozedural zugelassene Arten; `decoration.modelSlots` ordnet jeder Art optional ein eigenes Modell zu. Mehrere Objekte derselben Rasterzelle werden über verschiedene Subrasterplätze unterschieden.

Eingabeformat:

```json
{
  "name": "Eiche",
  "size": [8, 12, 8],
  "palette": ["#654321", "#387044"],
  "voxels": [
    [3, 0, 3, 0],
    [3, 1, 3, 1]
  ]
}
```

`size` beschreibt X, Y (Höhe), Z. Ein Voxel ist `[x, y, z, paletteIndex]`. Die Dimensionen sind auf 64 pro Achse, die Palette auf 64 Farben und die Anzahl auf 16.384 Voxel begrenzt. Positionen müssen eindeutig und innerhalb der Modellgrenzen liegen. Die Normalisierung verwendet die tatsächlich belegten Voxelgrenzen und ergänzt `scale = 1 / max(maxX - minX + 1, maxZ - minZ + 1)`, `pivot = [(minX + maxX + 1) / 2, minY, (minZ + maxZ + 1) / 2]` und `footprint = 1`. Dadurch besitzen unterschiedlich große Quelldateien dieselbe horizontale Grundgröße; leere Ränder und ein versetzter Höhenursprung beeinflussen die Darstellung nicht. Bereits normalisierte Modelle lassen sich erneut importieren; abgeleitete Werte werden dabei neu berechnet. Eine kleine Vorlage liegt unter [`public/models/example.json`](../public/models/example.json). Die Modell-ID ist inhaltsbasiert, die Voxelreihenfolge spielt dabei keine Rolle.

API-Fehler liefern `{ "error": "..." }`, bei Schemafehlern zusätzlich `details`. Fremde Browser-Ursprünge, ungültige Pfade und übergroße Dateien werden abgewiesen. Die API ist für einen einzelnen lokalen Editor gedacht; sie bietet keine öffentliche Anmeldung oder Mehrbenutzerverwaltung.

## Versionen und ältere Exporte

Neue Speicherungen akzeptieren ausschließlich `schemaVersion: 19` zusammen mit `generatorVersion: "19.0.0"`. `terrain.noise` enthält den eigenen Noise-Seed und den Weltursprung der Tile-Fläche; `decoration.colorProfiles` speichert optionale, strikt validierte Farbprofile für Baumlaub und Pilzkappen. Unbekannte Eigenschaften, fehlende Pflichtfelder sowie unbekannte oder nicht zusammenpassende Versionen werden mit HTTP 400 zurückgewiesen. Die API migriert eine zusammen mit einem PNG eingereichte Konfiguration nicht: Das Bild könnte noch mit einer älteren Generatorversion erzeugt worden sein. Der Editor migriert historische Einzelprojekte nach ihrer jeweils strikten Prüfung ausdrücklich; V14 erhält `layoutVersion: 14`; V13 wird mit `legacyLayout: true` auf V18 migriert, sodass seine bisherigen Formen und Rasteranschlüsse erhalten bleiben. V12 und ältere Formate werden über ihre eingefrorenen Schemata ebenfalls ausdrücklich migriert.

Vor einer Migration wird die Eingabe gegen ihr jeweiliges eingefrorenes, striktes v1- bis v18-Schema geprüft. V11.0 und V11.1 werden gegen ihre Schema-11-Struktur geprüft; V12 erhält eine eigene strikte Prüfung und bewahrt seine gespeicherten Einstellungen. Ältere Einzelkachel-Projekte erhalten die neuen Farbprofile ausgeschaltet, damit ihre bisherigen Objektfarben gleich bleiben. V10.0-Konfigurationen werden gegen ihr eigenes striktes Schema geprüft; deaktivierte Außeneingänge werden aktiviert und das Noise-Feld wird ergänzt. V10.1 erhält ebenfalls eine eigene strikte Prüfung. V6 verwendet weiterhin seine ursprünglichen Pflichtfelder ohne Rampenbreite. V5 bleibt auf seine ursprünglichen 18 Arten und Modellschlüssel begrenzt. V4 akzeptiert weiterhin nur die ursprünglichen acht Arten, höchstens acht eindeutige `species` und die acht damaligen `modelSlots`-Schlüssel; neue Arten werden nicht stillschweigend als altes Format interpretiert.

| Eingabe          | Übernahme nach Schema 19 / Generator 19.0                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 / `1.0.0`     | Regelmäßiges Zentrum mit Größe 1, Drehung 0, ohne Unregelmäßigkeit und ohne Versatz; neue Terrain-Textur- und Darstellungswerte sowie Noise-Seed/Ursprung aus den aktuellen Vorgaben.        |
| v2 / `2.0.0`     | Bestehende Zentrumform bleibt; fehlender Zentrumsversatz, Terrain-Überhang und Sockeltiefe sowie die Regeln für mehrere Objektarten/-plätze werden ergänzt.                                  |
| v3 / `3.0.0`     | Bestehende Zentrumform und sein Versatz bleiben; die mittigen Portale werden mit Breitenanteil 0,45 ergänzt.                                                                                 |
| V10.0 / `10.0.0` | Noise-Seed aus dem bisherigen Tile-Seed und Ursprung 0 werden ergänzt; deaktivierte Außeneingänge werden aktiviert. Gespeicherte Formen bleiben erhalten; Farbprofile bleiben ausgeschaltet. |
| V10.1 / `10.1.0` | Noise-Seed aus dem bisherigen Tile-Seed und Ursprung 0 werden ergänzt. Feldformen, Terrainfarben, Aktionen und Objektplatzierungen bleiben erhalten; Farbprofile bleiben ausgeschaltet.      |
| V11.0 / `11.0.0` | Generator und Schema werden angehoben; gespeicherte Feldformen, Farben, Aktionen und Objektplatzierungen bleiben erhalten; Farbprofile bleiben ausgeschaltet.                                |
| V11.1 / `11.1.0` | Noise- und Wegeinstellungen bleiben erhalten; die neuen Farbprofile werden ausgeschaltet ergänzt.                                                                                            |
| V15.0 / `15.0.0` | Natürliche Größenprofile werden ergänzt; persönliche Objektgrößen, Positionen, Formen und Metadaten bleiben gespeichert.                                                                     |
| V14.0 / `14.0.0` | `layoutVersion: 14` erhält die bisherigen organischen Formen bis zum ausdrücklichen Neuaufbau.                                                                                               |
| V13.0 / `13.0.0` | `legacyLayout: true` erhält die frühere Rasterzerlegung und Feldanordnung.                                                                                                                   |
| V12.0 / `12.0.0` | Alle Einstellungen und gespeicherten Feldformen bleiben erhalten; automatische Felder werden nach der Migration im neuen verzweigten Generator aufgebaut.                                    |

Alle historischen Versionen erhalten die natürlichen Größenprofile aus V16. Persönliche Größenfaktoren bleiben gespeichert; die sichtbaren Proportionen ändern sich ausdrücklich. Die sechs Außeneingänge bleiben verpflichtend aktiviert. Falls eine alte manuelle Form Eingänge ausließ, wird ihr Feldplan für die Ergänzung auf automatisch gestellt; bestehende manuelle Gruppen bleiben dabei erhalten.

**V4 / `4.0.0` und V5 / `5.0.0` werden ohne Rücksetzung übernommen.** Neben dem neuen Versionspaar und den ergänzten Standard-Prüfregeln, dem deaktivierten Außenrand und den Editor-/Aktionspräferenzen wird ausschließlich die obsolete Eigenschaft `paths.transitionWidth` entfernt. Alle vorhandenen übrigen Werte bleiben unverändert, insbesondere manuelle Feldformen, Aktionen, Beschriftungen, Farben, `heightMode`, `heightOffset`, Objektplatzierungen, `density`, `sourceDensity`, ausgewählte Arten und benutzerdefinierte Modellzuordnungen. Die Migration löst keinen neuen Wegeplan und keine neue Objektverteilung aus.

**V6 / `6.0.0` und V7 / `7.0.0` behalten alle Werte und erhalten neben dem neuen Versionspaar die Standard-Prüfregeln, den deaktivierten Außenrand und die Editor-/Aktionspräferenzen.** Feldformen, Metadaten, Objekte und alle anderen Werte bleiben gleich. Erst ein ausdrücklich übernommener Formedit im Editor friert eine automatische Feldliste ein. Seit V7 können die Innenformen von Randfeldern angepasst werden; ihre vollständigen mittigen Mündungszellen bleiben geschützt.

Die historischen V4-/V5-Schemas verlangen `paths.transitionWidth` weiterhin als Zahl im Bereich 0,01 bis 0,10; fehlende oder fehlerhafte Werte werden vor der Migration abgewiesen. V6 bis V11 weisen dieselbe Eigenschaft als unbekannt zurück, statt sie stillschweigend zu ignorieren. Seit Version 6 ersetzen horizontale Oberflächen und vertikale Wände die geneigten Rampen. Vorhandene Feldhöhen und Terrassen bleiben unverändert; ein neu gerendertes Bild kann sich deshalb vom gespeicherten alten PNG unterscheiden.

Für **v1, v2 und v3** gelten weiterhin dieselben ausdrücklichen Rücksetzungen wegen der geänderten Geometrie aus Generator 4:

- `paths.auto` wird aktiviert, `paths.fields` wird geleert und `paths.heightMode` auf `flat` gesetzt. Alte manuelle Feldformen sowie feldbezogene Aktionen, Beschriftungen und Farbanpassungen werden beim Umbau nicht übernommen. Die neuen Regeln für mittige Pentagon-Portale, Landschaftsecken und feste Eingangsfelder benötigen einen neu erzeugten Wegeplan.
- `decoration.placements` wird geleert. Die natürliche Verteilung verwendet eine vorhandene `sourceDensity`, ansonsten die bisherige `density`. Bestehende Modellzuordnungen und sonstige unterstützte Objekt-Einstellungen bleiben erhalten; fehlende Werte kommen aus den aktuellen Vorgaben.
- Eine vorhandene gültige Gesamtfeldzahl von v3 bleibt erhalten. Bei v1/v2 wird die Zahl aus den alten nichtleeren manuellen Feld-Einträgen plus dem Zentrum abgeleitet, sofern sie zwischen 7 und 24 liegt; andernfalls gilt die aktuelle Vorgabe von 13. Nicht realisierbare Anordnungen werden vom Generator gemeldet.

Bei der v1-/v2-/v3-Geometriemigration bleiben Name, Seed, Raster, vorhandene Terrain- und Wegefarbverläufe, Palette, Kamera und Exportformat erhalten. Eine deaktivierte Wegebene bleibt deaktiviert; ihr neuer automatischer Plan entsteht erst bei aktivierten Wegen. Die Migration verspricht keine pixelgleiche Reproduktion eines alten Bildes. Auch alte manuelle Objektplatzierungen sind im neu aufgebauten Projekt nicht mehr enthalten.

`GET` liefert vorhandene Konfigurationen und PNGs unverändert, einschließlich älterer v1- bis v17-Dateien. Migrationen im Editor überschreiben keine Dateien unter `working/`. Die Versionsfelder sind Bestandteil des Konfigurationshashes; ein neu gerendertes Tile erhält eine eigene ID neben dem erhaltenen Original. Das Manifest kennzeichnet die verwendete Generatorversion. Einzelkachel-Autosaves verwenden den v19-Speicherschlüssel; ältere Schlüssel bleiben beim Laden erhalten. Bulk-Serien liegen separat im Browser und lassen sich als JSON-Datei exportieren oder importieren.

## Bulk-Serien

Die lokale Bulk-Projektdatei ist von der Tile-API getrennt und wird gegen `bulkProjectSchema` geprüft. Version 4 speichert Seed, Brettgröße, Noise-Modus, Biommodus und -wahl, gemeinsame Raster-/Randvorlagen, Tile-Konfigurationen, aktuelle Anordnung und Shuffle-Revision. Die Spalten wechseln um eine halbe Kachelhöhe nach unten und oben: `x = 1,5 · c`, `y = √3 · (r + (c mod 2)/2)`. Version-1- bis Version-3-Dateien werden streng gegen die bisherige Koordinatenkonvention geprüft; enthaltene Tile-Konfigurationen werden nach Schema 16 migriert. Bei durchgehendem Noise folgen ihre Weltursprünge der neuen Anordnung; Feldformen und Objektplatzierungen bleiben gespeichert. Neue Autosaves verwenden `hexa-studio-bulk-v4`, ältere Schlüssel bleiben erhalten. Bis zu 49 Tiles sind pro Serie erlaubt. Ein Shuffle ist aus Seed und Revision reproduzierbar. Bei durchgehendem Noise erhält jedes Tile den gemeinsamen Noise-Seed und einen Hex-Gitter-Weltursprung; der Ursprung folgt der Tile-Kachel auch nach dem Umordnen. Im Zufallsbiommodus bleiben Relief- und Materialrauschparameter gemeinsam, während Farben und Objektökologie variieren.

Der Browser-Bulk-Export erstellt ein ZIP mit den ausgewählten Kameraansichten. Standardmäßig ist nur die Draufsicht aktiv; diese PNGs liegen direkt im ZIP. Bei mehreren ausgewählten Ansichten erhält jede Kachel einen eigenen Unterordner mit `draufsicht.png`, `3d-ansicht.png` und/oder `perspektive.png`. Die 3D-Ansicht verwendet den gespeicherten Orbitwinkel; die Perspektive blickt zentriert senkrecht von oben. Auflösung und Transparenz kommen jeweils aus der Kachelkonfiguration. Das ZIP packt PNG-Daten ohne erneute Bildkompression. Der separate Knopf „Working speichern“ ergänzt den API-Export pro Kachel um ein Gesamtbild und die vollständige Serienkonfiguration.

## Prüfregeln und Export

`rules` ist ab Schema 8 Pflicht und wird strikt validiert:

| Wert                       | Vorgabe   | Bedeutung                                                                                                     |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `minFieldArea`             | `0.0625`  | Sichtbare Grundfläche eines normalen Feldes in Seitenlänge², 0 bis 0,5; 0 schaltet die Flächenuntergrenze ab. |
| `requireFieldConnectivity` | `true`    | Alle Rasterstücke eines einzelnen Feldes müssen verbunden sein.                                               |
| `requirePathConnectivity`  | `true`    | Alle Feldteile und aktiven Mündungen müssen über das Wegenetz am Pentagon erreichbar sein.                    |
| `exportPolicy`             | `"block"` | `"block"` sperrt den Export bei aktiven Regelverstößen; `"warn"` erlaubt ihn.                                 |

Bearbeitung und Projekt-JSON bleiben bei solchen Hinweisen möglich. `POST /api/tiles` dekodiert das PNG, erzeugt bei Blockierpolicy die Geometrie aus der Konfiguration und wendet dieselbe reine Regelprüfung wie der Editor an. Eine Umgehung der UI durch einen direkten Request liefert bei Verstoß HTTP 400 mit dem konkreten Grund. Warnpolicy erlaubt die Speicherung ausdrücklich. Schemafehler und ungültige PNGs bleiben unabhängig von der Regelpolicy Fehler. Nicht konstruierbare Geometrie wird bei eingeschalteter Blockierpolicy bereits durch die API abgewiesen. Bei `paths.enabled = false` entstehen keine Wegwarnungen für nicht verwendete Eingänge.

## Außenrand

Ab Schema 9 ist `border` ein strikt validiertes Pflichtobjekt:

| Wert      | Vorgabe     | Bedeutung                                                    |
| --------- | ----------- | ------------------------------------------------------------ |
| `enabled` | `false`     | Aktiviert das Randband und die reservierte Objektzone.       |
| `width`   | `0.015`     | Parallele Breite nach innen in Weltmaßen, 0 bis 0,1.         |
| `mode`    | `"black"`   | `"black"`, `"custom"`, `"fields"` oder `"transparent"`.      |
| `color`   | `"#000000"` | Gültiger sechsstelliger Hexwert; sichtbar im Modus `custom`. |

V8 wird ohne Änderung vorhandener Werte übernommen und erhält Versionspaar, deaktiviertes `border` und die später ergänzten Editor-/Aktionspräferenzen. Historische Schemas bleiben ohne diese neue Eigenschaft eingefroren. Die Migration löst keine Objektlöschung aus. Bei aktiviertem Rand blendet die Generierung Konfliktplatzierungen aus; Deaktivieren stellt sie wieder her. Wege bleiben bis zur Kachelaußenkante frei. Transparenz betrifft nur das gezeichnete Band, nicht den Landschaftsboden.

## Editorpräferenz und gewichtete Aktionswürfe

Ab Schema 10 sind die strikt geprüften Objekte `editing` und `actions` Pflicht. V9 erhält ausschließlich deren Vorgaben sowie das neue Versionspaar; alle vorhandenen Aktionen, Zelllisten und anderen Werte bleiben erhalten. Ältere Formate erhalten die neuen Objekte zusätzlich zu ihren bereits dokumentierten Migrationen.

| Wert                                    | Vorgabe | Bedeutung                                                                                                                                                  |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editing.regeneratePathsOnCenterChange` | `false` | Editor behält bei Pentagonänderungen vorhandene Felder und passt nur lokale Schnitte an; `true` erlaubt den ausdrücklichen neuen Wege-/Platzierungsaufbau. |
| `actions.biome`                         | `null`  | Bekannte Biom-ID oder `null` für die globale Basis ohne Bonus. Keine projektbezogenen Gewichte.                                                            |
| `actions.revision`                      | `0`     | Ganzzahliger Würfelzähler von 0 bis 2147483647. Der nächste ausdrückliche Wurf erhöht ihn einmal; nach dem Maximum folgt 0.                                |

Die globale, strikt validierte Datei [`src/core/action-probabilities.json`](../src/core/action-probabilities.json) enthält Basisgewichte und feste Biom-Boni. Effektives Gewicht = Basis × (1 + Bonus); die Normierung ergibt die Chance. Der Seed beeinflusst die Ziehung, nicht die Gewichte. Gewicht 0 schließt eine Aktion aus; die historische ID `custom` nimmt nicht teil. Details und Bonuszuordnung: [Aktionswürfe und Ressourcen](actions.md).

`rollFieldActions` schreibt nur Aktionen und gegebenenfalls Ressourcenmengen der sichtbaren Felder einschließlich Pentagon sowie die Revision. Vorhandene Zelllisten, Höhen, Farben, Labels und Objekte bleiben erhalten. Neue Auto-Feld-Anpassungen verwenden `cellIds: []`. Der Editor speichert das Ergebnis in einem Undo-Schritt. Zufallswerte verwenden die unabhängige Domäne `field-action-roll-v10` mit Seed, nächster Revision und Feld-ID; die Reihenfolge der Felder oder JSON-Schlüssel verändert das Ergebnis nicht.

Der Würfelzähler allein erzeugt keinen Worker-Geometrieauftrag. Eine Biomänderung darf bei neuen automatischen Feldern die initiale Verteilung ändern; gespeicherte Aktionen bleiben erhalten. Vollständige Seed-Rezepturen übernehmen den Würfelzähler und speichern das tatsächlich erzeugte Biom. Die Editorpräferenz ist kein Befehl an den statischen PNG-Speicherendpunkt: Ein bereits angewendeter Projektstand wird wie bisher exportiert.

## Gesamtfeld- und Modellexport

Der Browser exportiert einzelne Kacheln als binäres glTF 2.0 (`.glb`). Im Serien-ZIP ist `3D-Modell (GLB)` eine weitere Option: einzelne Modelle verwenden denselben Dateinamensstamm wie PNGs, bei mehreren Optionen `modell.glb` im Kachelordner. Das zusammengesetzte Brett liegt unter `gesamtfeld/modell.glb`. Jede gewählte Bildansicht enthält zusätzlich `gesamtfeld/draufsicht.png`, `gesamtfeld/3d-ansicht.png` oder `gesamtfeld/perspektive.png`. Die Anordnung entspricht der gespeicherten Reihenfolge und Spaltenzahl. Einzelmodelle behalten ihren lokalen Ursprung; im Gesamtmodell bleiben Kacheln benannte Gruppen mit `tileId`. Dekorationsinstanzen werden in gewöhnliche Mesh-Knoten umgewandelt, sodass keine GPU-Instanzierungserweiterung erforderlich ist. Aktionsbilder sind eingebettet. Grundfarben, Objektfarbprofile und prozedurale GPU-Texturen werden für Felder, Landschaft, Stufenwände, Voxelobjekte und Wegkiesel in eingebettete sRGB-PNG-Atlanten gebacken. Dieselben Shaderbausteine wie in der Vorschau liefern Noise, Körnung und Feldschattierung an den tatsächlichen Weltpositionen. Jede Atlas-Seite misst höchstens 2048 × 2048 Pixel; bei umfangreichen Modellen kommen weitere Seiten hinzu. Die mittlere Abtastdichte beträgt ungefähr 512 Pixel pro Welteinheit. Filterränder schützen die Dreieckskanten. Beleuchtung wird nicht eingebrannt und bleibt im Zielprogramm einstellbar. Atlas-UVs können zusätzliche Mesh-Fragmente und unabhängige Voxelgeometrien erfordern; die Dreieckspositionen, horizontalen Kappen und vertikalen Wände bleiben unverändert. Eingebettete Texturen erhöhen Dateigröße und Exportaufwand; feinste Details sowie Farbwerte jenseits des 8-Bit-sRGB-Bereichs können von der direkten Shaderdarstellung abweichen. Die Geometrie stammt aus der Editoransicht mit deren Custom-Modellen, Randunterdrückung und vertikalen Stufenwänden; Auswahlhilfen und Vorschauschattenscheibe sind ausgeschlossen.

Gesamtbilder passen das vollständige Brett einschließlich Objektgrenzen in ein Quadrat ein. Auflösung, Transparenz und gespeicherte Kamerawerte kommen aus der ersten Kachel in `order`; Orbitzoom wird beim Einpassen des Gesamtfelds durch die vollständige Übersicht ersetzt. Positive und negative Perspektiven bleiben unterstützt. Der Export verändert die gespeicherte Kachelkonfiguration nicht.

`POST /api/series` speichert ein Gesamtbild mit seiner vollständigen aktuellen Serienkonfiguration. Der strikt validierte Request lautet `{ version: 1, project: BulkProjectV4, png: "data:image/png;base64,..." }`. PNG-Maße müssen der ersten Kachel in `order` entsprechen. Für jede Kachel mit blockierender Exportregel werden Geometrie und Regeln vor der Speicherung geprüft. Die Antwort ist `{ path, pngUrl, existing }`; die Ablage unter `working/series/serie-…` erfolgt atomar und nach Projekt- und Bildinhalt adressiert. Wiederholungen überschreiben keine Artefakte. `GET /api/series/:id/gesamtfeld.png` und `GET /api/series/:id/project.json` laden die Dateien. Die Serienablage erscheint nicht als Einzelkachel in `/api/tiles`. Der Knopf **Working speichern** erstellt je Kachel das bisherige PNG und zusätzlich dieses Gesamtbild. GLBs werden im Browser heruntergeladen.

## Organische Layouts und V13-Kompatibilität

V14 ergänzt das optionale Wurzelfeld `legacyLayout`, dessen einziger zulässiger Wert `true` ist. Fehlend bedeutet organisches Flächenwachstum mit Rasterportalen. `true` behält die V13-Geometrie und den bisherigen automatischen Wegeaufbau bei; es wird bei der Migration bestehender Projekte ergänzt. `false`, zusätzliche unbekannte Felder sowie gemischte Versionspaare werden zurückgewiesen. JSON aus V13 enthält dieses Kennzeichen noch nicht und muss ausdrücklich migriert werden. Neue Seed-Rezepturen beginnen ohne das Kennzeichen. Der Seriencontainer bleibt Version 3, da er die streng versionierten Einzelkachelkonfigurationen bereits separat migriert.

Die Rasterportal-Zielzelle wird als `portalTargetId` in erzeugten `TileCell`-Daten ausgewiesen. Das ist generierte Geometrieinformation und kein frei importierbarer Konfigurationsparameter. Bei automatischer organischer Generierung schützt der Portalbesitzer die vollständige Zielzelle. Die bestehenden Exportregeln, Mindestflächen, Höhenversätze und die Trennung von Generator, Editor, Rendering und Working-Persistenz bleiben gültig.

## Objektgrößenprofile (Schema 16 / Generator 16.0.0)

`decoration.sizeProfiles` ist ein verpflichtender, vollständiger Record über alle 18 `DecorationKind`-Werte. Jeder Eintrag ist strikt `{ scale: number, variation: number }`: `scale` liegt zwischen 0,1 und 3, `variation` zwischen 0 und 0,5. Fehlende oder unbekannte Arten, zusätzliche Eintragseigenschaften, ungültige Werte und gemischte Versionspaare werden zurückgewiesen. Die API akzeptiert zum Speichern nur das aktuelle Schema; ältere Konfigurationen werden zunächst ausdrücklich migriert.

V15 wird vor der Migration gegen sein eingefrorenes Schema ohne Größenprofile geprüft. V15 und ältere Projekte erhalten die natürlichen Standardprofile und einen expliziten Hinweis auf die angepassten Objektproportionen. Bestehende Formen, IDs, Positionen, Drehungen und persönliche `placements[].scale` bleiben gespeichert. Diese persönlichen Faktoren werden mit dem neuen Artprofil und der stabilen Größenvariation kombiniert; dadurch ändern sich die sichtbaren Größen ausdrücklich mit Generator 16. Historische JSONs, PNGs und GLBs werden nicht überschrieben. V16 führte `hexa-studio-project-v16` als eigenen Autosave-Schlüssel ein; aktuelle Autosaves verwenden den unten beschriebenen V19-Schlüssel. Historische Schlüssel bleiben als unveränderte Rückfallquellen erhalten. Der Seriencontainer bleibt Version 4; enthaltene Konfigurationen werden separat migriert.

## Ressourcenmengen (Schema 17 / Generator 17.0.0)

`paths.fields[].resourceAmount` ist optional, ganzzahlig und auf 1 bis 9 begrenzt. Nur `scrap`, `gem`, `platinum`, `amethyst` und `gold` dürfen eine Menge besitzen. Ohne Angabe gilt ×1. `actionRecipe: 16` erhält beim Import historischer Projekte die bisherige initiale Aktionsverteilung. V16 wird gegen sein eingefrorenes Schema validiert. Neue Speicherungen verwenden das V19-Versionspaar und `hexa-studio-project-v19`; historische Autosaves und Working-Dateien bleiben erhalten. Der Seriencontainer bleibt Version 4; enthaltene Projekte werden separat migriert. Details: [Aktionswürfe und Ressourcen](actions.md).

## Globale Aktionsverteilung (Schema 18 / Generator 18.0.0)

V17 und ältere Projektgewichte werden nach strikter historischer Prüfung entfernt; `actions` enthält nur noch `biome` und `revision`. Eine aktuelle API-Konfiguration mit `actions.weights` wird mit HTTP 400 abgewiesen. Migrierte Projekte erhalten `biome: null`. `actionRecipe: 17` friert die initiale V17-Verteilung ein; vorhandenes `actionRecipe: 16` bleibt erhalten. Gespeicherte Feldaktionen und Mengen bleiben unverändert. Neue Kacheln verwenden die globale JSON plus feste Biom-Boni für initiale Aktionen und ausdrückliche Würfe. Neue Autosaves verwenden den v18-Schlüssel; historische Einzelprojekte und Serienkacheln werden ausdrücklich migriert, ohne Originale zu überschreiben.

## Ereigniskarten-API

Der eigenständig versionierte Karteneditor bietet Generierung, SVG-Darstellung, Druckbogen und inhaltsadressierte Speicherung ohne Tile-Konfiguration. Endpunkte, Beispiele, Schema und Spielannahmen stehen unter [Ereigniskarten](event-cards.md).

## Bearbeitung der globalen Aktionsverteilung (Schema 19)

`GET /api/action-probabilities` liefert die aktive globale Verteilung mit Formatversion 1 und inhaltsbasierter Revision. `POST` speichert `{ version: 1, expectedRevision, probabilities }` nach strenger Schema- und Origin-Prüfung atomar unter `working/settings/action-probabilities.json`. Die Anfrage ist auf 128 KB begrenzt. Die Antwort enthält den aktuellen Stand; veraltete Revisionen liefern HTTP 409. Ohne gespeicherte Datei gelten die mitgelieferten Standardwerte. Der Produktionsserver übernimmt Änderungen unmittelbar ohne Neubau.

`actions.distribution` ist seit Schema 19 eine optionale Kopie der verwendeten globalen Verteilung. Sie enthält `version`, alle `baseWeights` und die vollständigen `biomeBuffs`. Mindestens ein auswählbares Basisgewicht muss positiv sein. Abweichende Einstellungen bleiben damit nach Export, Import und späteren globalen Änderungen reproduzierbar. Neue Seed- und Serienkacheln sowie ausdrückliche Würfe übernehmen die aktive globale Verteilung; das Speichern allein verändert keine vorhandenen Kacheln. V18 wird strikt geprüft und behält Biom, Revision, Rezepte und Felder. Der neue Autosave-Schlüssel lautet `hexa-studio-project-v19`. Details und Bedienung: [Aktionswürfe und Ressourcen](actions.md).
