# Aktions- und Ressourcensymbole

Seit Generator 17 werden die Symbole auf einem nativen **72 × 72-Pixel-Raster** neu gezeichnet, dreimal so hoch aufgelöst wie die bisherigen 24 × 24 Pixel. Die vierfache Canvas-Textur hat 288 × 288 Pixel. Nearest-Filter ohne Mipmaps erhalten die Pixelkonturen; Schriftarten und externe Bilder werden nicht benötigt. Die Editorvorschau zeigt die Symbole größer und mit voller Deckkraft.

| Feld                      | Erkennungsmerkmal                                                  |
| ------------------------- | ------------------------------------------------------------------ |
| Drehen                    | Großer türkiser Kreispfeil um ein Sechseck                         |
| Verschieben               | Vier breite blaue Richtungspfeile um ein Sechseck                  |
| Ereignis                  | Helle Karte mit großem violettem Fragezeichen und getrenntem Punkt |
| Laden                     | Rot gestreifte Markise, Schaufenster und L-Schild                  |
| Zufallssprung             | Zwei violette Portale mit Sprungpfeil und Zufallswürfel            |
| Wandernder Alb            | Dunkle wandernde Geistergestalt mit heller Maske und roten Augen   |
| Metallschrott / Altmetall | Stahlgraues Zahnrad mit rostiger Schraube                          |
| Edelstein                 | Breiter türkisblauer Diamant mit klaren Facetten                   |
| Platin                    | Silberner Barren mit großer Pt-Prägung                             |
| Amethyst                  | Violette spitze Kristallgruppe                                     |
| Gold                      | Goldene Münzen mit G-Prägung                                       |
| Kein Symbol               | Transparente Fläche                                                |

Alle fünf Ressourcen zeigen unten eine kontrastreiche **×1- bis ×9-Mengenangabe**. Diese Menge ist Teil der Textur und erscheint identisch in Einzelkachel, Serienübersicht, PNG und GLB. Die Texturgruppen werden nach Aktion und Menge getrennt. Eine Mengenänderung aktualisiert das Symbol, ohne die Geländegeometrie neu aufzubauen. Die Form des Ressourcensymbols bleibt über alle Mengen gleich.

Das frühere Stern-plus-Symbol für eigene Aktionen entfällt aus der Auswahl und dem Würfeln. Eigene Ereignisse verwenden die beschriebene Fragezeichenkarte und eine Beschriftung. Historische `custom`-Einträge bleiben lesbar und werden ebenfalls als Ereigniskarte dargestellt. `none` bleibt eine leere Fläche.

`ACTION_PIXELS` enthält die Grundzeichnungen ohne gemeinsame Unterlage und Mengenanzeige. `actionPixels(action, amount)` ergänzt die Ressourcenmenge. `0` bedeutet transparent; andere Zeichen verweisen auf `ACTION_PALETTES`. `ACTION_ICON_META` enthält deutsche Namen und Beschreibungen. Die Symbole kennzeichnen Spielmaterial, ohne die genaue Wirkung einer Aktion zu simulieren.

`actionCanvas(action, foreground?, amount?)` und `actionIconUrl(action, foreground?, amount?)` erzeugen standardmäßig mehrfarbige Symbole mit Menge 1. Eine explizite Vordergrundfarbe erhält den transparenten einfarbigen Modus einschließlich erkennbarer Mengenzeichen. `actionTexture(action, amount?)` erstellt die Three.js-Textur. Ungültige Ressourcenmengen werden abgewiesen.

Kontaktübersichten und Screenshots liegen ausschließlich im ignorierten `working/`-Ordner. Die [Aktionswürfe und Seltenheiten](actions.md) beschreiben die Verteilung der Ressourcen.
