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

Neue Speicherungen akzeptieren ausschließlich `schemaVersion: 15` zusammen mit `generatorVersion: "15.0.0"`. `terrain.noise` enthält den eigenen Noise-Seed und den Weltursprung der Tile-Fläche; `decoration.colorProfiles` speichert optionale, strikt validierte Farbprofile für Baumlaub und Pilzkappen. Unbekannte Eigenschaften, fehlende Pflichtfelder sowie unbekannte oder nicht zusammenpassende Versionen werden mit HTTP 400 zurückgewiesen. Die API migriert eine zusammen mit einem PNG eingereichte Konfiguration nicht: Das Bild könnte noch mit einer älteren Generatorversion erzeugt worden sein. Der Editor migriert historische Einzelprojekte nach ihrer jeweils strikten Prüfung ausdrücklich; V14 erhält `layoutVersion: 14`; V13 wird mit `legacyLayout: true` auf V15 migriert, sodass seine bisherigen Formen und Rasteranschlüsse erhalten bleiben. V12 und ältere Formate werden über ihre eingefrorenen Schemata ebenfalls ausdrücklich migriert.

Vor einer Migration wird die Eingabe gegen ihr jeweiliges eingefrorenes, striktes v1- bis v14-Schema geprüft. V11.0 und V11.1 werden gegen ihre Schema-11-Struktur geprüft; V12 erhält eine eigene strikte Prüfung und bewahrt seine gespeicherten Einstellungen. Ältere Einzelkachel-Projekte erhalten die neuen Farbprofile ausgeschaltet, damit ihre bisherigen Objektfarben gleich bleiben. V10.0-Konfigurationen werden gegen ihr eigenes striktes Schema geprüft; deaktivierte Außeneingänge werden aktiviert und das Noise-Feld wird ergänzt. V10.1 erhält ebenfalls eine eigene strikte Prüfung. V6 verwendet weiterhin seine ursprünglichen Pflichtfelder ohne Rampenbreite. V5 bleibt auf seine ursprünglichen 18 Arten und Modellschlüssel begrenzt. V4 akzeptiert weiterhin nur die ursprünglichen acht Arten, höchstens acht eindeutige `species` und die acht damaligen `modelSlots`-Schlüssel; neue Arten werden nicht stillschweigend als altes Format interpretiert.

| Eingabe          | Übernahme nach Schema 15 / Generator 15.0                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 / `1.0.0`     | Regelmäßiges Zentrum mit Größe 1, Drehung 0, ohne Unregelmäßigkeit und ohne Versatz; neue Terrain-Textur- und Darstellungswerte sowie Noise-Seed/Ursprung aus den aktuellen Vorgaben.        |
| v2 / `2.0.0`     | Bestehende Zentrumform bleibt; fehlender Zentrumsversatz, Terrain-Überhang und Sockeltiefe sowie die Regeln für mehrere Objektarten/-plätze werden ergänzt.                                  |
| v3 / `3.0.0`     | Bestehende Zentrumform und sein Versatz bleiben; die mittigen Portale werden mit Breitenanteil 0,45 ergänzt.                                                                                 |
| V10.0 / `10.0.0` | Noise-Seed aus dem bisherigen Tile-Seed und Ursprung 0 werden ergänzt; deaktivierte Außeneingänge werden aktiviert. Gespeicherte Formen bleiben erhalten; Farbprofile bleiben ausgeschaltet. |
| V10.1 / `10.1.0` | Noise-Seed aus dem bisherigen Tile-Seed und Ursprung 0 werden ergänzt. Feldformen, Terrainfarben, Aktionen und Objektplatzierungen bleiben erhalten; Farbprofile bleiben ausgeschaltet.      |
| V11.0 / `11.0.0` | Generator und Schema werden angehoben; gespeicherte Feldformen, Farben, Aktionen und Objektplatzierungen bleiben erhalten; Farbprofile bleiben ausgeschaltet.                                |
| V11.1 / `11.1.0` | Noise- und Wegeinstellungen bleiben erhalten; die neuen Farbprofile werden ausgeschaltet ergänzt.                                                                                            |
| V14.0 / `14.0.0` | `layoutVersion: 14` erhält die bisherigen organischen Formen bis zum ausdrücklichen Neuaufbau.                                                                                               |
| V13.0 / `13.0.0` | `legacyLayout: true` erhält die frühere Rasterzerlegung und Feldanordnung.                                                                                                                   |
| V12.0 / `12.0.0` | Alle Einstellungen und gespeicherten Feldformen bleiben erhalten; automatische Felder werden nach der Migration im neuen verzweigten Generator aufgebaut.                                    |

In allen historischen Versionen werden die sechs Außeneingänge verpflichtend aktiviert. Falls eine alte manuelle Form Eingänge ausließ, wird ihr Feldplan für die Ergänzung auf automatisch gestellt; bestehende manuelle Gruppen bleiben dabei erhalten.

**V4 / `4.0.0` und V5 / `5.0.0` werden ohne Rücksetzung übernommen.** Neben dem neuen Versionspaar und den ergänzten Standard-Prüfregeln, dem deaktivierten Außenrand und den Editor-/Aktionspräferenzen wird ausschließlich die obsolete Eigenschaft `paths.transitionWidth` entfernt. Alle vorhandenen übrigen Werte bleiben unverändert, insbesondere manuelle Feldformen, Aktionen, Beschriftungen, Farben, `heightMode`, `heightOffset`, Objektplatzierungen, `density`, `sourceDensity`, ausgewählte Arten und benutzerdefinierte Modellzuordnungen. Die Migration löst keinen neuen Wegeplan und keine neue Objektverteilung aus.

**V6 / `6.0.0` und V7 / `7.0.0` behalten alle Werte und erhalten neben dem neuen Versionspaar die Standard-Prüfregeln, den deaktivierten Außenrand und die Editor-/Aktionspräferenzen.** Feldformen, Metadaten, Objekte und alle anderen Werte bleiben gleich. Erst ein ausdrücklich übernommener Formedit im Editor friert eine automatische Feldliste ein. Seit V7 können die Innenformen von Randfeldern angepasst werden; ihre vollständigen mittigen Mündungszellen bleiben geschützt.

Die historischen V4-/V5-Schemas verlangen `paths.transitionWidth` weiterhin als Zahl im Bereich 0,01 bis 0,10; fehlende oder fehlerhafte Werte werden vor der Migration abgewiesen. V6 bis V11 weisen dieselbe Eigenschaft als unbekannt zurück, statt sie stillschweigend zu ignorieren. Seit Version 6 ersetzen horizontale Oberflächen und vertikale Wände die geneigten Rampen. Vorhandene Feldhöhen und Terrassen bleiben unverändert; ein neu gerendertes Bild kann sich deshalb vom gespeicherten alten PNG unterscheiden.

Für **v1, v2 und v3** gelten weiterhin dieselben ausdrücklichen Rücksetzungen wegen der geänderten Geometrie aus Generator 4:

- `paths.auto` wird aktiviert, `paths.fields` wird geleert und `paths.heightMode` auf `flat` gesetzt. Alte manuelle Feldformen sowie feldbezogene Aktionen, Beschriftungen und Farbanpassungen werden beim Umbau nicht übernommen. Die neuen Regeln für mittige Pentagon-Portale, Landschaftsecken und feste Eingangsfelder benötigen einen neu erzeugten Wegeplan.
- `decoration.placements` wird geleert. Die natürliche Verteilung verwendet eine vorhandene `sourceDensity`, ansonsten die bisherige `density`. Bestehende Modellzuordnungen und sonstige unterstützte Objekt-Einstellungen bleiben erhalten; fehlende Werte kommen aus den aktuellen Vorgaben.
- Eine vorhandene gültige Gesamtfeldzahl von v3 bleibt erhalten. Bei v1/v2 wird die Zahl aus den alten nichtleeren manuellen Feld-Einträgen plus dem Zentrum abgeleitet, sofern sie zwischen 7 und 24 liegt; andernfalls gilt die aktuelle Vorgabe von 13. Nicht realisierbare Anordnungen werden vom Generator gemeldet.

Bei der v1-/v2-/v3-Geometriemigration bleiben Name, Seed, Raster, vorhandene Terrain- und Wegefarbverläufe, Palette, Kamera und Exportformat erhalten. Eine deaktivierte Wegebene bleibt deaktiviert; ihr neuer automatischer Plan entsteht erst bei aktivierten Wegen. Die Migration verspricht keine pixelgleiche Reproduktion eines alten Bildes. Auch alte manuelle Objektplatzierungen sind im neu aufgebauten Projekt nicht mehr enthalten.

`GET` liefert vorhandene Konfigurationen und PNGs unverändert, einschließlich älterer v1- bis v14-Dateien. Migrationen im Editor überschreiben keine Dateien unter `working/`. Die Versionsfelder sind Bestandteil des Konfigurationshashes; ein neu gerendertes Tile erhält eine eigene ID neben dem erhaltenen Original. Das Manifest kennzeichnet die verwendete Generatorversion. Einzelkachel-Autosaves verwenden den v15-Speicherschlüssel; ältere Schlüssel bleiben beim Laden erhalten. Bulk-Serien liegen separat im Browser und lassen sich als JSON-Datei exportieren oder importieren.

## Bulk-Serien

Die lokale Bulk-Projektdatei ist von der Tile-API getrennt und wird gegen `bulkProjectSchema` geprüft. Version 3 speichert Seed, Brettgröße, Noise-Modus, Biommodus und -wahl, gemeinsame Raster-/Randvorlagen, Tile-Konfigurationen, aktuelle Anordnung und Shuffle-Revision. Version-1- und Version-2-Dateien werden streng geprüft und ihre Tile-Konfigurationen explizit nach Schema 13 migriert. Bis zu 49 Tiles sind pro Serie erlaubt. Ein Shuffle ist aus Seed und Revision reproduzierbar. Bei durchgehendem Noise erhält jedes Tile den gemeinsamen Noise-Seed und einen Hex-Gitter-Weltursprung; der Ursprung folgt der Tile-Kachel auch nach dem Umordnen. Im Zufallsbiommodus bleiben Relief- und Materialrauschparameter gemeinsam, während Farben und Objektökologie variieren.

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

| Wert                                    | Vorgabe             | Bedeutung                                                                                                                                                  |
| --------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editing.regeneratePathsOnCenterChange` | `false`             | Editor behält bei Pentagonänderungen vorhandene Felder und passt nur lokale Schnitte an; `true` erlaubt den ausdrücklichen neuen Wege-/Platzierungsaufbau. |
| `actions.weights`                       | alle 13 Aktions-IDs | Relative Gewichte als endliche Zahlen von 0 bis 100; alle Schlüssel sind erforderlich, unbekannte werden abgewiesen.                                       |
| `actions.revision`                      | `0`                 | Ganzzahliger Würfelzähler von 0 bis 2147483647. Der nächste ausdrückliche Wurf erhöht ihn einmal; nach dem Maximum folgt 0.                                |

Alle Nullgewichte sind ein speicherbarer Zwischenstand. Ein Würfelversuch benötigt mindestens ein positives Gewicht. Die tatsächliche Chance ist Gewicht geteilt durch die Summe; 0 schließt eine Aktion aus. `rollFieldActions` schreibt nur Aktionen der sichtbaren Felder einschließlich Pentagon und die Revision. Vorhandene Zelllisten, Höhen, Farben, Labels und Objekte bleiben erhalten. Neue Auto-Feld-Anpassungen verwenden `cellIds: []`. Der Editor speichert das Ergebnis in einem Undo-Schritt.

Zufallswerte verwenden die unabhängige Domäne `field-action-roll-v10` mit Seed, nächster Revision und Feld-ID; die Reihenfolge von Feldern oder Gewichtsobjekten verändert das Ergebnis nicht. Gewicht-/Präferenzänderungen allein erzeugen keine neuen Aktionen und keinen Worker-Geometrieauftrag. Vollständige Seed-Rezepturen übernehmen die Einstellungen, behalten jedoch ihre bisherigen Anfangsaktionen. Die Editorpräferenz ist kein Befehl an den statischen PNG-Speicherendpunkt: Ein bereits angewendeter Projektstand wird wie bisher exportiert.

## Organische Layouts und V13-Kompatibilität

V14 ergänzt das optionale Wurzelfeld `legacyLayout`, dessen einziger zulässiger Wert `true` ist. Fehlend bedeutet organisches Flächenwachstum mit Rasterportalen. `true` behält die V13-Geometrie und den bisherigen automatischen Wegeaufbau bei; es wird bei der Migration bestehender Projekte ergänzt. `false`, zusätzliche unbekannte Felder sowie gemischte Versionspaare werden zurückgewiesen. JSON aus V13 enthält dieses Kennzeichen noch nicht und muss ausdrücklich migriert werden. Neue Seed-Rezepturen beginnen ohne das Kennzeichen. Der Seriencontainer bleibt Version 3, da er die streng versionierten Einzelkachelkonfigurationen bereits separat migriert.

Die Rasterportal-Zielzelle wird als `portalTargetId` in erzeugten `TileCell`-Daten ausgewiesen. Das ist generierte Geometrieinformation und kein frei importierbarer Konfigurationsparameter. Bei automatischer organischer Generierung schützt der Portalbesitzer die vollständige Zielzelle. Die bestehenden Exportregeln, Mindestflächen, Höhenversätze und die Trennung von Generator, Editor, Rendering und Working-Persistenz bleiben gültig.
