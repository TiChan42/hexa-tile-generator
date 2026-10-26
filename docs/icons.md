# Klare Aktionssymbole

Alle Aktionen verwenden ein festes Raster von 24 × 24 Pixeln. Die Canvas-Textur ist vierfach, also 96 × 96 Pixel, und wird mit Nearest-Filter ohne Mipmaps dargestellt. Es werden keine Schriftarten oder externen Bilddateien benötigt. Die Pixelgrafiken sind Bestandteil des versionierten Renderers.

| Aktion         | Erkennungsmerkmal                                  | Farbgebung                     |
| -------------- | -------------------------------------------------- | ------------------------------ |
| Drehen         | kreisförmiger Pfeil mit klarer Pfeilspitze         | Türkis                         |
| Verschieben    | vier Richtungspfeile                               | Blau                           |
| Ereignis       | Karte mit großem Fragezeichen und getrenntem Punkt | Violett auf hellem Papier      |
| Laden          | gestreifte Markise, Tür und Schaufenster           | Rot, Creme, hellblaues Glas    |
| Metallschrott  | Zahnrad mit Loch und rostiges Metallstück          | Stahlgrau und Rostbraun        |
| Zufallssprung  | Portal, ausgehender Pfeil und Würfel               | Violett und Gold               |
| Wandernder Alb | dunkle Geistergestalt, helle Maske, glühende Augen | Nachtblau und Rot              |
| Amethyst       | drei spitze Kristalle als Gruppe                   | Violett                        |
| Platin         | zwei Barren und eine Pt-Markierung                 | Silber mit blaugrauen Schatten |
| Edelstein      | einzelner breiter, facettierter Diamant            | Türkisblau                     |
| Gold           | drei Münzstapel mit sichtbaren Oberseiten          | Gelb und dunkles Gold          |
| Eigene Aktion  | fünfzackiger Stern und ein Plus                    | Orange und Grün                |
| Kein Symbol    | vollständig transparente Fläche                    | keine                          |

Eine dunkle Kontur und eine helle, pixelgenau gezeichnete Unterlage halten die Symbole auf hellen wie dunklen Spielfeldern lesbar. Die Silhouetten unterscheiden sich auch ohne Farbe. Das Ereignissymbol bleibt ein Fragezeichen, wie es die unveränderte `Spielbeschreibung` vorgibt. Die Zeichen beschreiben Aktionen für das Brettspiel; sie simulieren keine Spielregeln.

`ACTION_PIXELS` enthält die eigentlichen Glyphen ohne gemeinsame Unterlage. `0` bedeutet transparent, die anderen Zeichen verweisen auf die jeweilige `ACTION_PALETTES`-Farbe. `ACTION_ICON_META` ergänzt deutsche Namen und Beschreibungen für Legenden und barrierefreie Beschriftungen.

`actionCanvas(action)`, `actionIconUrl(action)` und `actionTexture(action)` erzeugen standardmäßig die mehrfarbigen Symbole. Ein ausdrücklich übergebenes `foreground`, etwa `actionCanvas('event', '#112233')`, erzeugt für bestehende Aufrufer eine einfarbige Grafik auf transparentem Grund. Dabei bleiben relevante Binnenzeichen wie Fragezeichen oder Pt-Markierung erhalten. `none` bleibt in beiden Modi leer.

Eine visuelle Kontaktübersicht kann lokal aus demselben Modul erzeugt werden; Screenshots und Vorschauen gehören in den ignorierten Ordner `working/`.
