# Darstellung und Performance

Der Generator läuft im Web Worker. Eine neue Vorschau ersetzt überholte wartende Vorschauen; bereits laufende Aufgaben bleiben kontrolliert in einer einzigen Warteschlange. Vollständige Seed-Rezepte werden priorisiert, benötigte Vorschauen nach einem fehlgeschlagenen Rezept weitergeführt. Validierungsaufgaben werden nicht verworfen. Nur Antworten für die aktuelle Konfiguration werden angezeigt. Späte Rezept- und Feldvalidierungsergebnisse überschreiben keine neueren Änderungen; Escape verwirft einen noch ausstehenden Feld-Commit.

Kamera, Exportgröße, Rasteranzeige, Feldbeschriftungen und Materialtextur sind keine Eingaben der reinen Geometrieerzeugung. Die Materialparameter aktualisieren Shader-Uniforms; Kameragesten arbeiten unmittelbar auf der Vorschau. Terrain, Wände, Rampen und Wandsäume bilden ein gemeinsames Mesh. Die kräftigen Feldkonturen sind als zusätzliche Mesh-Bänder gebündelt. Linien und Symbole werden gebündelt; Vegetation und Kiesel verwenden Instanzen. Die Vorschau rendert nur bei Änderungen. Hardware-GPUs verwenden Pixelfaktor 1; erkannte Software-Renderer wie SwiftShader oder llvmpipe verwenden 0,5 und berechnen dadurch nur ein Viertel der Vorschaupixel. Nicht verfügbare oder unbekannte Treiberangaben behalten Pixelfaktor 1. Der PNG-Export rendert stets mit Pixelfaktor 1 auf die exakte eingestellte Auflösung und stellt danach die Vorschauauflösung wieder her.

## Messung

Lokale Chromium-Abnahme unter macOS/Metal, 512 × 512 Pixel, 122 Rasterstücke:

| Stand             | Dekorationen | Kiesel | Zeichenaufrufe | Objekte im Inhaltsbaum |
| ----------------- | -----------: | -----: | -------------: | ---------------------: |
| Vor der Bündelung |           27 |      0 |            303 |                    290 |
| Generator 3       |          137 |     52 |             18 |                     17 |

Die damalige V3-Stichprobe zeichnet 92.502 Dreiecke. Ein warmer Materialwechsel benötigte in dieser Stichprobe 37,5 ms und änderte die Geometrie nicht. Die Zeichenaufrufe sinken um etwa 94 %; diese Messung ist keine pauschale Aussage über Bildraten auf anderen Geräten. Der Software-Renderer SwiftShader bestätigt dieselben 18 Zeichenaufrufe und die Eingabefunktionen, ist bei komplexen Shadern erwartungsgemäß deutlich langsamer.

Am Canvas stehen `data-draw-calls`, `data-triangles`, `data-scene-objects`, `data-pixel-ratio` und `data-geometry-revision` zur Diagnose bereit. Die Browserabnahme prüft weniger als 40 Zeichenaufrufe bei dichterer Vegetation sowie eine unveränderte Geometrierevision bei Materialänderungen. Die Domänentests laufen mit zwei parallelen Workern, um CI-Rechner und lokale Browserprüfungen nicht mit vielen gleichzeitigen Prozessen zu überlasten.

## Grenzen

Sehr feine sichtbare Subraster und große manuelle Modellimporte erhöhen die Geometrie- und Shaderkosten. Die Rasterauflösung bleibt auf 24, prozedurale Objekte auf 12 je Elternzelle und Kiesel auf 1.200 je Kachel begrenzt. Unpassende manuelle Geometriekombinationen werden gemeldet; die V4-Seed-Rezeptur behält das gewählte Raster zur Stabilität der Eingangsflächen bei. Aufwendige Shader und große PNGs brauchen mit Software-Rendering weiterhin mehr Zeit. Der reine Generator benötigt keine GPU.
