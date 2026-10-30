# Aktionswürfe und Ressourcen

## Globale Basis und Biom-Boni

Die mitgelieferten Standardwerte stehen in [`src/core/action-probabilities.json`](../src/core/action-probabilities.json), Formatversion **1**. Die bearbeitbare globale Verteilung wird unter `working/settings/action-probabilities.json` gespeichert und ohne Neubau oder Serverneustart geladen. `baseWeights` enthält alle 13 gespeicherten Aktions-IDs mit endlichen Gewichten von 0 bis 100. Diese Basis ist für alle Kacheln und Seeds identisch. Unter **Feldaktionen → Wahrscheinlichkeiten bearbeiten** lassen sich Basisgewichte und die Boni aller Biome ändern. Die Oberfläche berechnet die Chancen sofort; **Verteilung speichern** aktiviert die Werte global. 0 schließt eine Aktion aus. **Standardwerte laden** übernimmt die mitgelieferten Werte zunächst als Entwurf. Die globale Verteilung gilt für neue Seed-/Serienkacheln und den nächsten ausdrücklichen Aktionswurf. Bestehende Kacheln speichern bei abweichenden Werten eine Kopie unter `actions.distribution` zur Reproduktion, ohne einen eigenen Gewichtseditor zu erhalten.

`biomeBuffs` enthält für jedes Biom feste, optionale Aufschläge je Aktion. Ein Wert von `0.5` bedeutet **+50 %** auf das Basisgewicht; fehlende Einträge bedeuten keinen Bonus. Es gilt:

`effektives Gewicht = Basisgewicht × (1 + Biom-Bonus)`

`Chance = effektives Gewicht / Summe aller auswählbaren effektiven Gewichte`

Die Basis bleibt unverändert. Gewicht 0 schließt eine Aktion auch mit Bonus aus. Biom-Boni sind nicht zufällig: Derselbe Biomtyp verwendet bei jedem Seed dieselben Faktoren, auch bei zufällig variierten Farben, Arten und Reliefs. Die Wahl eines anderen Bioms darf die effektive Verteilung ändern. Der Seed beeinflusst die konkrete Ziehung und gegebenenfalls die Biomwahl, niemals die Basiswerte oder die Bonusfaktoren. Eine erhöhte Chance einer Aktion verringert durch die Normierung die relativen Chancen der anderen Aktionen.

Beispielsweise erhält Amethyst im Amethysthain **+100 %**, Edelstein **+50 %**. Die vollständige Zuordnung steht in `biomeBuffs`. Ohne gewähltes Biom (`actions.biome: null`) gilt ausschließlich die globale Basis. Die neutrale Standardkachel und migrierte Einzelprojekte starten ohne Bonus; vollständige Seed-Rezepte und Serien speichern ihren tatsächlichen Biomtyp. Eine Biomwahl speichert diese Referenz, ohne bestehende Feldanpassungen neu zu würfeln.

Die mitgelieferten Standardwerte werden beim Laden strikt validiert und vollständig eingefroren. Bearbeitete Verteilungen werden vor dem Speichern und beim Import erneut streng geprüft; Entwürfe mit ausschließlich Nullgewichten bleiben bearbeitbar, lassen sich aber nicht aktivieren. Fehlende Basisaktionen oder Biome, unbekannte Schlüssel, negative oder nicht endliche Werte und eine Verteilung ohne positive auswählbare Aktion werden abgewiesen. Auch Boni sind auf 0 bis 100 begrenzt. Die historische ID `custom` bleibt für Feldimporte gültig, wird aber nicht angeboten, gewürfelt oder bei der Normierung mitgerechnet; eigene Ereignisse verwenden `event`.

## Ressourcenarten und Mengen

Die Basisgewichte sind Altmetall **24**, Edelstein **8**, Platin **24/9** und Amethyst **24/27**. Jede höhere Stufe der Rangfolge `Altmetall < Edelsteine < Platin < Amethyst` ist ohne Biom-Boni dreimal seltener. Gold erhält ein unabhängiges Basisgewicht von **12**. Dies ist die für das Tool gewählte Interpretation; die ursprüngliche Spielbeschreibung legt Golds Verhältnis zur übrigen Rangfolge nicht eindeutig fest. Biom-Boni können diese effektiven Verhältnisse ausdrücklich verändern.

Jedes Ressourcenfeld kann `resourceAmount` als ganze Zahl von **1 bis 9** speichern. Eine fehlende Mengenangabe bedeutet **×1**; bei anderen Aktionen ist eine Mengenangabe ungültig. Die Mengen werden unabhängig von der Ressourcenart und den Biom-Boni gewürfelt, auch bei Gold:

`P(Menge = n) = 3^(1-n) / Σ(k=1…9) 3^(1-k)`

Damit ist ×2 dreimal seltener als ×1, ×3 neunmal seltener als ×1 und ×9 insgesamt 6561-mal seltener als ×1. Ressourcenstufe und Menge multiplizieren sich: Beispielsweise ist Platin ×3 ohne Biom-Bonus 81-mal seltener als Altmetall ×1. Die Menge lässt sich im Editor ausdrücklich manuell wählen.

## Reproduzierbarkeit und Bearbeitung

`rollFieldActions(config, tile, distribution?)` verwendet die ausdrücklich übergebene globale Verteilung, sonst die gespeicherte Kopie beziehungsweise die mitgelieferten Standardwerte, jeweils plus das gespeicherte `actions.biome` und würfelt ausschließlich sichtbare Spielfelder einschließlich Pentagon. Formen, Farben, Beschriftungen, Höhen, Landschaft und Objekte bleiben erhalten. Automatische Felder ohne eigenen Eintrag erhalten minimale Metadaten einschließlich der Menge, falls eine Ressource gewürfelt wird. Bei einer anderen Aktion wird die bisherige Mengenangabe entfernt. Nicht sichtbare gespeicherte Einträge werden nicht verändert.

Die reine Funktion erhöht die gespeicherte `revision` vor dem Würfeln; auf `2147483647` folgt `0`. Die Aktionsart verwendet unabhängig je Feld `randomAt(seed, 'field-action-roll-v10', nextRevision, fieldId)` mit lexikografisch sortierten auswählbaren IDs. Die Menge verwendet einen eigenen Bereich `randomAt(seed, 'resource-amount-v17', nextRevision, fieldId)`. Feldreihenfolge, zusätzliche Felder und geänderte Ressourcenart verschieben bestehende Mengenwürfe nicht. Alle sichtbaren Felder werden als ein Undo-Schritt übernommen.

Neue automatische und vollständig aus Seed erzeugte V18-Kacheln verwenden dieselbe globale Basis und dieselben Biom-Boni, aber eine eigene initiale Aktionsdomäne `initial-action-v18` und Mengenrevision 0. Das Zentrum startet weiterhin mit einem Ereignis. Gespeicherte Feldaktionen haben immer Vorrang. Der Würfelzähler allein verändert keine initialen Rezepte. Das Bearbeiten oder Speichern globaler Gewichte verändert weder bestehende Feldaktionen noch die Geometrie. Ein ausdrücklicher Wurf übernimmt die aktuelle Verteilung zusammen mit allen sichtbaren Aktionen in einem Undo-Schritt. Ein gespeichertes Profil wirkt als explizite, versionierte Eingabe auf spätere Generierung; eine veränderte globale Datei verändert diese Kopie nicht.

## Schema 18 und ältere Projekte

Schema **18**, Generator **18.0.0**, ersetzt `actions.weights` durch die strikt geprüfte Referenz `actions.biome` (bekannte Biom-ID oder `null`). `actions.revision` bleibt erhalten. Alte Gewichte werden vor der Migration anhand des eingefrorenen historischen Schemas geprüft und anschließend entfernt. Die neue globale Basis gilt beim nächsten ausdrücklichen Wurf. Gespeicherte Aktionen und Mengen bleiben unverändert.

V17 erhält `actionRecipe: 17` für seine eingefrorene initiale Basisverteilung ohne Biom-Boni. Ein vorhandenes `actionRecipe: 16` bleibt erhalten. V16 und ältere Projekte erhalten weiterhin `actionRecipe: 16` für ihre historischen Aktionsrezepte. Alle migrierten Projekte starten mit `actions.biome: null`; eine spätere ausdrückliche Biomwahl setzt die Referenz für neue Würfe. Historische Anfangsrezepte ignorieren sie und die neue globale JSON, sodass ungespeicherte automatische Aktionen beim Import erhalten bleiben. Neue Autosaves verwenden `hexa-studio-project-v18`; ältere Einträge bleiben erhalten. Der Seriencontainer bleibt Version 4; enthaltene Kacheln werden separat migriert.

Das gewünschte Biom **Schatzinsel** mit weniger Aktionen und mehr Ressourcen ist ein Folgeschritt. Diese Änderung führt noch kein zusätzliches Biom oder Ressourceninventar ein.

## Bearbeitbare globale Verteilung (Schema 19)

Schema **19 / Generator 19.0.0** ergänzt die optionale, strikt geprüfte `actions.distribution` im selben Format wie die globale Verteilung. Die Standardverteilung wird durch ihr Fehlen repräsentiert. Abweichende Einstellungen werden bei Seed-/Seriengenerierung und ausdrücklichen Würfen als Kopie übernommen; bestehende Formen, Aktionen und Mengen bleiben beim bloßen Speichern der globalen Einstellungen unverändert. Das Aktionsrezept und alle Zufallsdomänen bleiben erhalten. V18 wird vor der Migration gegen sein eingefrorenes Schema ohne Verteilungskopie validiert und mit unverändertem Biom, Würfelstand und gespeicherten Feldern übernommen. Neue Autosaves verwenden `hexa-studio-project-v19`; historische Schlüssel bleiben erhalten.

`GET /api/action-probabilities` liefert `{ version: 1, revision, probabilities }`. `POST` akzeptiert strikt `{ version: 1, expectedRevision, probabilities }`. Die Revision ist ein inhaltsbasierter SHA-256-Wert. Vergleichen und Speichern erfolgen in einer Schreibwarteschlange mit atomarem Dateiaustausch; ein veralteter Tab erhält HTTP 409, statt neuere Einstellungen zu überschreiben. Ein defekter gespeicherter Stand wird als Fehler gemeldet. Die bisherigen lokalen Origin- und JSON-Prüfungen gelten auch hier. Der Endpunkt ist auf 128 KB begrenzt.
