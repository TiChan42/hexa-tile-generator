# Darstellung und Performance

Der Generator läuft im Web Worker. Eine neue Vorschau ersetzt überholte wartende Vorschauen; bereits laufende Aufgaben bleiben kontrolliert in einer einzigen Warteschlange. Vollständige Seed-Rezepte werden priorisiert, benötigte Vorschauen nach einem fehlgeschlagenen Rezept weitergeführt. Validierungsaufgaben werden nicht verworfen. Nur Antworten für die aktuelle Konfiguration werden angezeigt. Späte Rezept- und Feldvalidierungsergebnisse überschreiben keine neueren Änderungen; Escape verwirft einen noch ausstehenden Feld-Commit.

Kamera, Exportgröße, Rasteranzeige, Feldbeschriftungen und Materialtextur sind keine Eingaben der reinen Geometrieerzeugung. Die Materialparameter aktualisieren Shader-Uniforms; Kameragesten arbeiten unmittelbar auf der Vorschau. Terrain, senkrechte Wände und Wandsäume bilden ein gemeinsames Mesh. Die kräftigen Feldkonturen sind als zusätzliche Mesh-Bänder gebündelt. Linien und Symbole werden gebündelt; Vegetation und Kiesel verwenden Instanzen. Die Vorschau rendert nur bei Änderungen. Hardware-GPUs verwenden Pixelfaktor 1; erkannte Software-Renderer wie SwiftShader oder llvmpipe verwenden 0,5 und berechnen dadurch nur ein Viertel der Vorschaupixel. Nicht verfügbare oder unbekannte Treiberangaben behalten Pixelfaktor 1. Der PNG-Export rendert stets mit Pixelfaktor 1 auf die exakte eingestellte Auflösung und stellt danach die Vorschauauflösung wieder her.

Objektfarbprofile verwenden pro Modell ein gemeinsames Instanz-Mesh. Drei Farbwerte und die Profilaktivierung werden je Instanz an den Shader übergeben; Farbrollen markieren ausschließlich Laub beziehungsweise Pilzkappen. Dadurch erhöhen zusätzliche Profile weder die Zeichenaufrufe noch die Zahl der Modellgeometrien. GLB-Exporte übernehmen dieselben linearen Farben in portable Vertexfarben und behalten geteilte Geometrie für gleiche Varianten.

## Messung

Lokale Chromium-Abnahme unter macOS/Metal, 512 × 512 Pixel, 122 Rasterstücke:

| Stand             | Dekorationen | Kiesel | Zeichenaufrufe | Objekte im Inhaltsbaum |
| ----------------- | -----------: | -----: | -------------: | ---------------------: |
| Vor der Bündelung |           27 |      0 |            303 |                    290 |
| Generator 3       |          137 |     52 |             18 |                     17 |

Die damalige V3-Stichprobe zeichnet 92.502 Dreiecke. Ein warmer Materialwechsel benötigte in dieser Stichprobe 37,5 ms und änderte die Geometrie nicht. Die Zeichenaufrufe sinken um etwa 94 %; diese Messung ist keine pauschale Aussage über Bildraten auf anderen Geräten. Der Software-Renderer SwiftShader bestätigt dieselben 18 Zeichenaufrufe und die Eingabefunktionen, ist bei komplexen Shadern erwartungsgemäß deutlich langsamer.

Am Canvas stehen `data-draw-calls`, `data-triangles`, `data-scene-objects`, `data-pixel-ratio` und `data-geometry-revision` zur Diagnose bereit. `data-surface-revision` zählt tatsächliche Terrain-/Konturaufbauten, `data-model-geometry-builds` neu aufgebaute Voxelvorlagen und `data-render-style-version` die Darstellungsversion. Die Browserabnahme prüft weniger als 40 Zeichenaufrufe bei dichterer Vegetation sowie eine unveränderte Geometrierevision bei Materialänderungen. Sie prüft außerdem die Wiederverwendung des Terrains bei Raster-, Aktions- und Objektänderungen sowie die gezielte Erneuerung bearbeiteter Modellvorlagen. Die Domänentests laufen mit zwei parallelen Workern, um CI-Rechner und lokale Browserprüfungen nicht mit vielen gleichzeitigen Prozessen zu überlasten.

## Wiederverwendung in Darstellungsversion 2

Terrain und Feldkonturen bleiben als GPU-Geometrie erhalten, solange sich ihre tatsächlichen Eingaben nicht ändern. Rasteranzeige, Aktionssymbole, Objektprofile und Kachelrand können diese Geometrie wiederverwenden. Höheneinstellungen, Formen und Grundfarben erneuern sie. Pro verwendetem Voxelmodell liegt eine CPU-Vorlage vor; Instanzen und Exportsnapshots besitzen unabhängige Kopien. Ein Modellimport mit geändertem Inhalt verwirft gezielt seine Vorlage. Beim Schließen des Renderers werden alle Vorlagen und GPU-Geometrien freigegeben.

Jede sichtbare Voxelfläche verwendet vier indizierte Vertices statt sechs duplizierter Vertices: 33 % weniger Vertexdaten bei identischen Dreiecken, Farben, Normalen und Fußabdrücken. Kiesel verwenden 20 statt 36 Dreiecke pro Instanz; dadurch passen zusätzliche Gruppen in denselben Zeichenaufruf. Abgeschaltete Noise-Schichten überspringen ihre Perlin-Auswertung. Der Terrainaufbau verwendet zwischengespeicherte Farben, einen Höhenindex für Überhänge und einmal berechnete Schnittgrenzen. Abstände zur Feldkontur benötigen nur eine Quadratwurzel pro Abfrage.

Ein warmer Frame, ein Materialwechsel und der erstmalige vollständige Geometrieaufbau sind unterschiedliche Messungen. Für die Renderzeit muss ein Benchmark auf die GPU warten, etwa durch einen kleinen Pixel-Readback; die Dauer von `renderer.render()` allein misst überwiegend die Befehlsübergabe. Ein vollständiger Neuaufbau und das erste Kompilieren der Shader können weiterhin deutlich länger als wenige Millisekunden dauern. Diese Arbeit fällt bei Kamerabewegungen und Materialwechseln nicht erneut an.

Stichprobe vom 27.10.2026 mit Chromium/ANGLE Metal auf Apple M1, 512 × 512 Pixel, Pixelfaktor 1, V15-Standardkachel ohne Raster: 340 Dekorationen, 104 Kiesel, 272.475 Dreiecke und 17 Zeichenaufrufe. Über 24 warme Frames einschließlich synchronisierendem Pixel-Readback lag der Median bei 5,0 ms, das 95. Perzentil bei 6,2 ms. Der erste CPU-Geometrieaufbau benötigte 176,1 ms, ein Materialupdate 6,2 ms und der Rasterwechsel mit wiederverwendetem Terrain 53,1 ms. Die sieben Voxelvorlagen und die Terrainrevision blieben beim Rasterwechsel erhalten. Das sind lokale Stichproben, keine geräteunabhängigen Zeitgarantien; die erste Shader-Kompilierung und vollständige Seed-Generierung sind nicht in den warmen Framezeiten enthalten.

## Grenzen

Sehr feine sichtbare Subraster und große manuelle Modellimporte erhöhen die Geometrie- und Shaderkosten. Die Rasterauflösung bleibt auf 24, prozedurale Objekte auf 12 je Elternzelle und generierte Kieselanker auf 1.200 je Kachel begrenzt. Mit den zusätzlichen Gruppen zeichnet der Renderer höchstens 2.400 Kieselinstanzen. Unpassende manuelle Geometriekombinationen werden gemeldet; die V4-Seed-Rezeptur behält das gewählte Raster zur Stabilität der Eingangsflächen bei. Aufwendige Shader und große PNGs brauchen mit Software-Rendering weiterhin mehr Zeit. Der reine Generator benötigt keine GPU.

Parallele Abnahmesitzungen können mit `HEXA_COVERAGE_DIRECTORY=working/pipeline-coverage npm run check` einen eigenen Coverage-Berichtsordner nutzen. Die Prüfungen und Coverage-Grenzen bleiben identisch; CI schreibt weiterhin nach `coverage/`. Playwright unterstützt entsprechend `--output=working/pipeline-browser` für getrennte Browserartefakte.
