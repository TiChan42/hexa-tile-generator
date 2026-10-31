# Ereigniskarten

Der eigenständige Editor unter `/cards` erzeugt und bearbeitet Kartensets unabhängig von Einzelkacheln und Serien. Der Link **Ereigniskarten** steht im Tile-Editor; **Tile-Editor** führt zurück. Ein Set enthält bis zu 100 Karten, jede Karte bis zu sechs geordnete Effekte. Effekte lassen sich nacheinander ausführen oder als Alternativen zur Auswahl anbieten; eigene Texte ergänzen weitere Spielideen. Der Editor legt sein Projekt getrennt unter `hexa-studio-event-cards-v4` ab. JSON-Import und -Export, Undo/Redo und die Working-Bibliothek erhalten die Daten unabhängig von den Tiles.

## Effekte und Ziele

Der Wandernde Alb kann sich auf einen Spieler zubewegen: ohne Limit bis zum Ziel oder höchstens eine einstellbare Anzahl von Feldern oder Pentagonen. Er kann zufällige, gewählte oder bestimmte Ressourcen stehlen. Spieler können Felder oder Pentagone vorwärts oder rückwärts laufen; dabei werden nach Wahl alle betretenen Feldaktionen, nur die Zielaktion oder keine ausgeführt. Ein weiterer Effekt führt direkt zum nächsten beziehungsweise zum n-ten nächsten Pentagon. Das Verändern von Gebieten durch Drehen oder Verschieben ist separat zuschaltbar und standardmäßig nicht im Zufallstopf.

Im Aktionsmenü stehen **Vorwärts ziehen**, **Rückwärts ziehen**, **Zum nächsten Pentagon** und **Zum vorherigen Pentagon** direkt zur Auswahl. Der Richtungswechsel erhält Anzahl, Ziel und weitere Einstellungen derselben Bewegungsart. Im Datenformat bleiben es `move` beziehungsweise `pentagon` mit `direction: 'forward' | 'backward'`. Die Einstellung **Rückwärts ziehen und vorherige Spieler zulassen** ist im Zufallstopf standardmäßig aktiv; strukturierte Spielerbewegungen ziehen dann mit 35 % Wahrscheinlichkeit rückwärts.

Ressourceneffekte erlauben Erhalten, Verlieren, Bezahlen, Einlagern, Abheben und Diebstahl. Die Art kann zufällig, frei gewählt oder konkret festgelegt sein. Gold wird unabhängig von der übrigen Hierarchie gewichtet. Vor jedem Effekt können Kosten stehen; bei unvollständiger Bezahlung entfällt wahlweise der Effekt oder die restliche Karte.

Vier seltene Aktionen sind ebenfalls vollständig strukturiert und miteinander kombinierbar:

- **Pakt mit dem Alb** (`alb-give`): Der Alb hat einen unendlichen Ressourcenvorrat. Er gibt selten, dann aber standardmäßig 4–9 Ressourcen aus dem separat einstellbaren Bereich `generator.albGifts` (bis 24). Als Gegenleistung nähert er sich anschließend dem Empfänger entlang des kürzesten erlaubten Weges, beispielsweise bis zum nächsten Pentagon. `approach` legt Anzahl und Einheit (`fields` oder `pentagons`) fest; er stoppt spätestens beim Empfänger. Die Annäherung nutzt beim Generieren den Bereich der Bewegungsschritte, mit exponentiell selteneren größeren Entfernungen und überwiegend Pentagonen. Neue manuelle Pakte starten mit 5 Ressourcen und dem nächsten Pentagon. Der Startpentagon zählt nicht erneut. Der Alb führt auf seinem Weg keine Feldaktionen aus.
- **Geschenk erhalten** (`gift`): Der aktive Spieler erhält Ressourcen von der Bank oder anderen Spielern. `source` unterscheidet `{ kind: 'bank' }` und `{ kind: 'players', target, inventory }`. Geber werden über Zugreihenfolge, Brettentfernung oder alle anderen Spieler bestimmt; der aktive Spieler wird als Geber übersprungen. `inventory` wählt den mitgeführten oder eingelagerten Vorrat der Geber; `destination` den eigenen Zielvorrat. Bei allen anderen Spielern gilt die Menge pro Geber, jeweils höchstens soweit vorhanden. Bank-Geschenke und normales Erhalten kommen von der Bank.
- **Diebstahlschutz** (`protection`): Schutz gegen den Alb, andere Spieler oder beide, bis zum Beginn des ersten bis dritten nächsten eigenen Zuges. Er verhindert Ressourcendiebstahl; Zahlungen, Kosten und Geschenke bleiben möglich.
- **Zusatzwurf** (`bonus-roll`): Ein zusätzlicher Wurf mit Bewegung innerhalb des laufenden Zuges. Feldaktionen werden auf jedem betretenen Feld, nur am Ziel oder gar nicht ausgeführt. Der Editor kann dafür auch einen anderen einzelnen Spieler als Ziel festlegen.

Spielerziele unterscheiden explizit **Zugreihenfolge** und **Brettentfernung**, jeweils mit Rang: nächster, vorheriger, übernächster und weitere bis Rang sechs. Die Entfernung wird standardmäßig als kürzester Weg über Spielfelder gemessen; Luftlinie ist im Design einstellbar. Gleichstände löst die Zugreihenfolge ab dem aktiven Spieler auf. Für physische Ziele kann die vereinbarte Vorwärts- oder Rückwärtsrichtung eingeschränkt werden. Bezugspunkt ist der aktive Spieler oder der Alb. Fehlt ein Ziel, entfällt der betreffende Effekt. Da die Spielfeldrichtungen und konkrete Lagerregeln noch nicht vollständig festgelegt sind, enthalten Set und Druckbogen ein Begleitblatt mit den hier verwendeten Auflösungsannahmen. Eigene Effekte können davon abweichende Regeln benennen.

## Zufallstopf

Kartenfamilie, Aktionsgewichte, Anzahl der Karten und Effekte, Wertebereiche, Zielarten, Richtung und Kostenchance sind konfigurierbar. Sechzehn besondere Ideen wie Schutz vor Diebstahl, Tausch, Extrawurf und Bewegung anderer Spieler können im Editor als eigene Effekte eingefügt werden; sie erscheinen auch im Zufallstopf der Bewegungsaktionen. Die Alb-Familie enthält Bewegung, Diebstahl und seltene Pakte mit dem Alb. Die Ressourcenfamilie enthält Ressourcenaktionen, Diebstahl und Geschenke; Abenteuer enthalten außerdem Schutz und Zusatzwürfe. Kosten können beim Generieren auch vor Schutz und Zusatzwürfen stehen.

Unter **Seltene Aktionen** haben Alb-Pakte, Schutz und Zusatzwurf jeweils Gewicht 1, Geschenke Gewicht 2. Normale Aktionen starten mit 10–25. Bei den gemischten Standardeinstellungen entfallen damit etwa 4,3 % der einzelnen Effekte auf diese vier seltenen Arten. Eine Karte kann mehrere Effekte enthalten. Die Gewichte sind relativ zum gewählten Topf; 0 deaktiviert eine Aktion, höhere Werte machen sie häufiger. Auch die Ressourcenart und höhere Mengen bleiben separat gewichtet.

Einzelne Karten werden innerhalb ihrer Familie neu gewürfelt; ein vollständiger Wurf ersetzt das gesamte Set und würfelt die gemeinsame Rückseite im selben Undo-Schritt neu. **Rückseite würfeln** verändert ausschließlich die Rückseitenlandschaft; die Vorderseiten und Kartentexte bleiben erhalten. Ein Einzelwurf einer Karte lässt die Rückseite bestehen. Geänderte Einstellungen würfeln nicht automatisch neu.

Die reine Generierung verwendet Seed, gespeicherte Revision, Kartenindex, Effektindex und unabhängige Domänen für Art, Ziel, Richtung, Menge, Ressource, Gegenleistung und Kosten. Gleiche Eingaben ergeben gleiche Karten; die Erhöhung der Anzahl ändert den vorhandenen Präfix nicht. Ressourcenzahlen haben im eingestellten Bereich je zusätzlicher Einheit ein Drittel des vorherigen Gewichts; für konkrete Arten sind die Gewichte einstellbar. Die größere Alb-Geschenkmenge hat eine eigene Domäne und verändert weder Ziel noch Gegenleistung. `random` bleibt eine spätere zufällige Auswahl beim Spielen, `choice` eine Auswahl durch den aktiven Spieler. Der Editor simuliert keine Spielfiguren oder Bestände.

## Gestaltung und Export

Die Rückseite zeigt eine echte senkrechte Three.js-Draufsicht auf ein Brett aus 20 seedbasiert generierten Hexagonkacheln mit 24 Rasterteilungen und Voxelobjekten. Ein innen liegender Ausschnitt füllt die gesamte Karte; Titel und weitere Gestaltungselemente liegen darüber. Auf der Vorderseite zeigt jede Karte im unteren Bereich eine eigene, herangezoomte 3D-Kachel mit den vorhandenen Voxelobjekten, Beleuchtung und Terrainmaterialien. Der Blickwinkel beträgt 42° über dem Boden. Der Bildausschnitt lässt oberhalb der hinteren Silhouette einen transparenten Abstand und füllt die untere Kartenkante über die gesamte Breite mit Landschaft.

Beide Aufnahmen sind unabhängig vom aktuell geöffneten Tile-Projekt. Der Karten-Seed und `design.backRevision` bestimmen die Rückseite; die Karten-ID bestimmt zusätzlich die Vorderseitenvariante. Der eigenständig versionierte Darstellungsstand ist 5. Die Bilder werden bei Bedarf im Browser erzeugt, zeitweise im Arbeitsspeicher zwischengespeichert und weder im Projekt-JSON noch im Browser-Autosave abgelegt. Ohne WebGL meldet die Oberfläche den Fehler; die Karte bleibt als Datenprojekt bearbeitbar. Farbwelten und eigene Farben, Rückseitentitel und -motto sind einstellbar. Das Set verwendet eine gemeinsame Rückseite.

Die Browser-Exporte betten die Aufnahmen über das namensraumgebundene `xlink:href` vollständig in die SVGs ein, damit auch Bildprogramme mit SVG-1.1-Unterstützung die Landschaften laden. Es werden keine externen Bilddateien benötigt. Darstellungsstand 5 ändert nur diese SVG-Einbettung; Landschaftsrezepte, Kartendaten und Projektformat bleiben bestehen. Bestehende Working-Artefakte werden nicht überschrieben; betroffene Einzelbilder müssen neu exportiert werden.

Der ZIP-Export enthält das editierbare Projekt, Vorderseiten, Rückseite, Auflösungsregeln und einen A4-Druckbogen. Optional enthält es PNGs in 1512 × 2112 Pixeln. Der Druckbogen bettet die gemeinsame Rückseitenaufnahme einmal ein, ordnet neun Karten à 63 × 88 mm pro Seite an und spiegelt die Rückseiten jeder Reihe für Duplexdruck an der langen Kante. Bei abweichendem Druckertreiber empfiehlt sich ein Probedruck.

Lange Kombinationen werden kleiner gesetzt. Wenn sechs lange eigene Texte oder Kosten nicht auf eine Karte passen, meldet die Vorschau den Überlauf; Export und Working-Speicherung melden ihn ebenfalls, statt Text abzuschneiden. Kürze oder verteile in diesem Fall die Effekte.

## Lokale API

Der Kartenbereich läuft über denselben lokalen Server wie der Tile-Editor, ohne eine Tile-Konfiguration zu benötigen. Alle JSON-Eingaben sind strikt versioniert und begrenzt. Unbekannte Eigenschaften, falsche Versionen und ungültige Ziel- oder Effektwerte werden mit HTTP 400 abgewiesen. Browser-Anfragen unterliegen derselben lokalen Origin-Prüfung wie die bestehende API.

| Methode | Endpunkt                                                        | Zweck                                                                            |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET`   | `/api/cards/default`                                            | Vollständiges Beispielprojekt einschließlich Generator und Kartendesign          |
| `GET`   | `/api/cards/schema`                                             | JSON-Schemata für Projekt, Generator und Rendering                               |
| `POST`  | `/api/cards/generate`                                           | `{ "version": 1, "generator": … }` → `{ "version": 1, "cards": […] }`            |
| `POST`  | `/api/cards/render`                                             | `{ "version": 1, "card": …, "design": …, "side": "front" oder "back" }` → SVG    |
| `POST`  | `/api/cards/print`                                              | Vollständiges Projekt → druckbares HTML mit Vorder-/Rückseiten und Regeln        |
| `POST`  | `/api/card-projects`                                            | Vollständiges Projekt in `working/cards/` speichern; Antwort enthält ID und URLs |
| `GET`   | `/api/card-projects`                                            | Gespeicherte Sets auflisten                                                      |
| `GET`   | `/api/card-projects/{id}`                                       | Gespeichertes editierbares Projekt                                               |
| `GET`   | `/api/card-projects/{id}/fronts/{cardId}.svg`                   | Einzelne gespeicherte Vorderseite                                                |
| `GET`   | `/api/card-projects/{id}/back.svg`, `/print.html`, `/rules.txt` | Rückseite, Druckbogen und Begleitblatt                                           |

Beispiel in JavaScript bei laufendem Server:

```js
const project = await (await fetch('/api/cards/default')).json();
project.generator.theme = 'alb';
project.generator.count = 20;
project.generator.revision += 1;
project.design.backRevision += 1;
const result = await fetch('/api/cards/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ version: 1, generator: project.generator }),
});
project.cards = (await result.json()).cards;
const saved = await fetch('/api/card-projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(project),
});
console.log(await saved.json());
```

Das Projektformat verwendet **Schema 4 / events-4.0.0** und Generator **Version 3**. Die neuen Effektarten, Gewichte, Alb-Mengen und die Generierungsdomäne `event-card-v3` ändern die reproduzierbare Ausgabe ausdrücklich; neu gewürfelte Karten erhalten neue IDs. Generierungsrevision und separate Rückseitenrevision sind Teil des Projekts. Working-Speicherungen sind inhaltsadressierte unveränderliche Schnappschüsse; eine Bearbeitung wird durch erneutes POST unter einer neuen ID gespeichert. Das Schema beschränkt Textlängen, Mengen, Kartenzahl und Effektzahl; die JSON-Schemata können sprachliche Bedingungen wie Textüberlauf oder Beziehungen zwischen Feldern nicht vollständig ausdrücken. Die Servervalidierung bleibt maßgeblich.

Beim Browser-Laden, Bibliotheks-Laden und JSON-Import werden Version 1, 2 und 3 vor der Migration streng gegen ihre eingefrorenen Schemata geprüft. Vorhandene Karten, IDs, Reihenfolge, Einstellungen und Texte bleiben erhalten; ergänzt werden die vier niedrigen seltenen Gewichte und `albGifts: { min: 4, max: 9 }`. Die Rückseitenrevision bleibt in Version 3 erhalten und beginnt bei älteren Versionen mit 0. Bisherige Browser-Autosaves werden als Rückfall gelesen und nicht überschrieben. Erst ein ausdrücklicher Kartenwurf verwendet den neuen Generator. Die API nimmt für neue Anfragen das aktuelle Schema an. Der Karten-Generator ist unabhängig von den Tile-Versionen.

## Bilder über die API

Der lokale API-Server besitzt keinen WebGL-Kontext. Ohne `frontImage` beziehungsweise `backImage` erzeugt `/api/cards/render` eine SVG-Vorlage mit `data-art-pending="true"` für die betreffende Seite. Der Browser ergänzt die echte Aufnahme für Vorschau und Export. Für fertige Druckbögen oder Working-Artefakte kann ein API-Client alternativ `{ "project": …, "artwork": { "karten-id": "data:image/png;base64,…" }, "backImage": "data:image/png;base64,…" }` an `/api/cards/print` beziehungsweise `/api/card-projects` senden. Dabei muss genau eine 1512 × 712-PNG-Aufnahme je Karte vorliegen; die optionale Rückseitenaufnahme hat 1512 × 2112 Pixel. `/api/cards/render` akzeptiert dieselben optionalen Einzelaufnahmen als `frontImage` und `backImage`. Die PNG-Chunkstruktur, Prüfsummen und Abmessungen werden geprüft. Projekt-JSON bleibt bildfrei; die ausdrückliche Working-Speicherung enthält die eingebetteten Bilder in den exportierten SVGs und im Druckbogen. Illustrierte Projekte sind auf 64 MB begrenzt und Render-Requests auf 30 MB. Die Einzelgrenzen von 8 MB Base64 für eine Vorderseite und 20 MB für die Rückseite erlauben auch wenig komprimierbare Aufnahmen in der festgelegten Auflösung. Die Darstellungsvariante und die mitgelieferten Aufnahmen fließen in die Artefakt-ID ein.
