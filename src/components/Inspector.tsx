import { Diamond, Hexagon, MousePointer2, Plus, Upload, Trash2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { ACTIONS } from '../core/types';
import { BIOME_PRESETS } from '../core/biomes';
import type { BiomePresetId } from '../core/biomes';
import { DECORATION_CATALOG } from '../core/objects';
import {
  DEFAULT_MUSHROOM_COLOR_PROFILES,
  DEFAULT_TREE_COLOR_PROFILES,
} from '../core/object-colors';
import ObjectLibrary from './ObjectLibrary';
import type { ObjectPreviewOverride } from './ObjectLibrary';
import { builtinObjectPreviewUrl } from '../render/objectPreview';
import { actionIconUrl } from '../render';
import { ACTION_ICON_META } from '../render/icons';
const ACTION_IMAGES = Object.fromEntries(
  ACTIONS.map((action) => [action.id, actionIconUrl(action.id)]),
);
import type { ActionId, DecorationKind, GameField, GeneratedTile, TileConfig } from '../core/types';
import { Control, GradientEditor, Range, Section, Toggle } from './Controls';

export type Layer = 'grid' | 'terrain' | 'paths' | 'actions' | 'objects' | 'export';
export type Update = (change: (draft: TileConfig) => void) => void;
function nextProfileId(prefix: string, profiles: { id: string }[]): string {
  let suffix = 1;
  while (profiles.some((profile) => profile.id === `${prefix}-${suffix}`)) suffix++;
  return `${prefix}-${suffix}`;
}
export interface LibraryEntry {
  id: string;
  name: string;
  builtin?: boolean;
  preview?: string;
}
interface Props {
  layer: Layer;
  config: TileConfig;
  tile: GeneratedTile;
  update: Update;
  editCenter: (change: (center: TileConfig['center']) => void) => void;
  applyBiome: (id: BiomePresetId) => void;
  selectedField?: GameField;
  setField: (value: {
    action?: ActionId;
    color?: string;
    label?: string;
    heightOffset?: number;
    heightMode?: 'flat' | 'terraced';
  }) => void;
  removeField: () => void;
  onSelectField: (id: string) => void;
  objectKind: DecorationKind;
  setObjectKind: (kind: DecorationKind) => void;
  selectedObject: string | null;
  uploadModel: (event: ChangeEvent<HTMLInputElement>) => void;
  models: LibraryEntry[];
  assignModel: (id: string) => void;
}
export default function Inspector(props: Props) {
  const { layer, config: c, tile, update, selectedField } = props;
  const selectedObjectType = DECORATION_CATALOG.find((entry) => entry.kind === props.objectKind)!;
  const objectPreviews: Partial<Record<DecorationKind, ObjectPreviewOverride>> = {};
  for (const entry of DECORATION_CATALOG) {
    const id = c.decoration.modelSlots?.[entry.kind],
      model = props.models.find((model) => model.id === id);
    if (id && id !== entry.kind && model)
      objectPreviews[entry.kind] = { name: model.name, preview: model.preview };
  }
  const selectedPlacement = c.decoration.placements.find(
    (object) => object.id === props.selectedObject,
  );
  const selectedEdit = c.paths.fields.find((field) => field.id === selectedField?.id);
  const selectedEntrance = tile.entrances.find(
    (entrance) => entrance.fieldId === selectedField?.id,
  );
  const editCenter = props.editCenter;
  const terrain = (
    <>
      <GradientEditor
        label="Höhenfarben"
        stops={c.terrain.gradient}
        onChange={(v) =>
          update((d) => {
            d.terrain.gradient = v;
          })
        }
      />
      <GradientEditor
        label="Wandfarben · unten → oben"
        stops={c.terrain.wallGradient}
        onChange={(v) =>
          update((d) => {
            d.terrain.wallGradient = v;
          })
        }
      />
    </>
  );
  return (
    <div className="inspector-content">
      {layer === 'grid' && (
        <>
          <Section title="Grundform" badge="01">
            <p className="section-description">Ein Hexagon. Unendlich viele Welten.</p>
            <div className="tile-diagram">
              <Hexagon size={94} strokeWidth={0.8} />
              <span>{c.export.size} px</span>
              <i>Spitze links & rechts</i>
            </div>
            <Control label="Bildgröße">
              <select
                aria-label="Bildgröße"
                value={c.export.size}
                onChange={(e) =>
                  update((d) => {
                    d.export.size = Number(e.target.value);
                  })
                }
              >
                {[512, 1080, 2048, 4096].map((n) => (
                  <option key={n} value={n}>
                    {n} × {n} px{n === 1080 ? ' · Druckvorlage' : ''}
                  </option>
                ))}
                {![512, 1080, 2048, 4096].includes(c.export.size) && (
                  <option value={c.export.size}>
                    {c.export.size} × {c.export.size} px
                  </option>
                )}
              </select>
            </Control>
            <Control label="Eigene Breite · px">
              <input
                type="number"
                aria-label="Eigene Bildbreite"
                min={128}
                max={4096}
                step={1}
                value={c.export.size}
                onChange={(e) =>
                  update((d) => {
                    d.export.size = Number(e.target.value);
                  })
                }
              />
            </Control>
          </Section>
          <Section title="Füllraster">
            <div className="choice-grid">
              {(
                [
                  { kind: 'hex', label: 'Hexagone', Icon: Hexagon },
                  { kind: 'diamond', label: 'Rauten', Icon: Diamond },
                ] as const
              ).map(({ kind, label, Icon }) => (
                <button
                  className={`choice-card ${c.grid.kind === kind ? 'selected' : ''}`}
                  key={kind}
                  onClick={() =>
                    update((d) => {
                      d.grid.kind = kind;
                      d.paths.fields = [];
                      d.paths.auto = true;
                      if (d.decoration.sourceDensity !== undefined)
                        d.decoration.density = d.decoration.sourceDensity;
                      d.decoration.placements = [];
                    })
                  }
                >
                  <Icon size={27} strokeWidth={1.4} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <Range
              label="Rasterauflösung"
              value={c.grid.divisions}
              min={6}
              max={24}
              onChange={(v) =>
                update((d) => {
                  d.grid.divisions = v;
                  d.paths.fields = [];
                  d.paths.auto = true;
                  if (d.decoration.sourceDensity !== undefined)
                    d.decoration.density = d.decoration.sourceDensity;
                  d.decoration.placements = [];
                })
              }
              hint="Randzellen werden exakt am großen Hexagon abgeschnitten. Rasterwechsel setzt manuelle Platzierungen zurück."
            />
            <Toggle
              label="Rasterlinien anzeigen"
              checked={c.grid.showGrid}
              onChange={(v) =>
                update((d) => {
                  d.grid.showGrid = v;
                })
              }
            />
          </Section>
          <Section title="Objekt-Subraster">
            <Range
              label="Unterteilungen pro Zelle"
              value={c.grid.subDivisions}
              min={1}
              max={6}
              onChange={(v) =>
                update((d) => {
                  d.grid.subDivisions = v;
                })
              }
            />
            <Toggle
              label="Subraster anzeigen"
              checked={c.grid.showSubgrid}
              onChange={(v) =>
                update((d) => {
                  d.grid.showSubgrid = v;
                })
              }
            />
            <p className="hint">Objekte rasten innerhalb einer Zelle im feineren Raster ein.</p>
          </Section>
        </>
      )}
      {layer === 'terrain' && (
        <>
          <Section title="Landschaft" badge="02">
            <p className="section-description">Höhen aus mehrschichtigem Perlin-Rauschen.</p>
            <h3 className="biome-heading">Biomprofile</h3>
            <p className="hint">
              Farben für Gelände, Wände und Wege sowie passende Objektarten. Seed, Relief, Raster
              und Wege bleiben erhalten; unpassende gesetzte Objekte werden entfernt. Rückgängig
              stellt alles wieder her.
            </p>
            <div className="biome-preset-grid">
              {BIOME_PRESETS.map((preset) => (
                <button
                  className="biome-preset"
                  key={preset.id}
                  title={`${preset.summary}. Wendet Farbverläufe und Objektarten an.`}
                  aria-label={`Biomprofil ${preset.name} anwenden`}
                  onClick={() => props.applyBiome(preset.id)}
                >
                  <span className="biome-preset-swatches" aria-hidden="true">
                    <span
                      style={{ background: `linear-gradient(90deg,${preset.terrain.join(',')})` }}
                    />
                    <span
                      style={{ background: `linear-gradient(90deg,${preset.walls.join(',')})` }}
                    />
                    <span
                      style={{ background: `linear-gradient(90deg,${preset.paths.join(',')})` }}
                    />
                  </span>
                  <strong>{preset.name}</strong>
                  <small>{preset.summary}</small>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Relief">
            <Range
              label="Höhe"
              value={c.terrain.elevation}
              min={0}
              max={0.6}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.terrain.elevation = v;
                })
              }
            />
            <Range
              label="Höhenstufen"
              value={c.terrain.terraces}
              min={1}
              max={24}
              onChange={(v) =>
                update((d) => {
                  d.terrain.terraces = v;
                })
              }
            />
            <Range
              label="Noise-Skalierung"
              value={c.terrain.scale}
              min={0.1}
              max={8}
              step={0.1}
              onChange={(v) =>
                update((d) => {
                  d.terrain.scale = v;
                })
              }
            />
            <Range
              label="Oktaven"
              value={c.terrain.octaves}
              min={1}
              max={8}
              onChange={(v) =>
                update((d) => {
                  d.terrain.octaves = v;
                })
              }
            />
            <Range
              label="Persistenz"
              value={c.terrain.persistence}
              min={0.1}
              max={0.9}
              step={0.05}
              onChange={(v) =>
                update((d) => {
                  d.terrain.persistence = v;
                })
              }
            />
            <Range
              label="Lückenfaktor"
              value={c.terrain.lacunarity}
              min={1}
              max={4}
              step={0.1}
              onChange={(v) =>
                update((d) => {
                  d.terrain.lacunarity = v;
                })
              }
            />
          </Section>
          <Section id="tile-border-settings" title="Tile-Außenrand">
            <Toggle
              label="Außenrand aktivieren"
              checked={c.border.enabled}
              onChange={(value) =>
                update((draft) => {
                  draft.border.enabled = value;
                })
              }
            />
            <Range
              label="Randdicke"
              value={c.border.width * 100}
              min={0}
              max={10}
              step={0.1}
              unit=" %"
              hint={`${Math.round((c.border.width * c.export.size) / 2)} px bei ${c.export.size} × ${c.export.size} px. Anteil an einer Hexagon-Seitenlänge.`}
              onChange={(value) =>
                update((draft) => {
                  draft.border.width = value / 100;
                })
              }
            />
            <Control label="Randfarbe">
              <select
                aria-label="Randfarbe"
                value={c.border.mode}
                onChange={(event) =>
                  update((draft) => {
                    draft.border.mode = event.target.value as TileConfig['border']['mode'];
                  })
                }
              >
                <option value="black">Schwarz</option>
                <option value="custom">Eigene Farbe</option>
                <option value="fields">Wie Spielfeldränder</option>
                <option value="transparent">Durchsichtig</option>
              </select>
            </Control>
            {c.border.mode === 'custom' && (
              <div className="color-input">
                <input
                  type="color"
                  aria-label="Außenrandfarbe"
                  value={c.border.color}
                  onChange={(event) =>
                    update((draft) => {
                      draft.border.color = event.target.value;
                    })
                  }
                />
                <input
                  aria-label="Außenrand Hexwert"
                  key={c.border.color}
                  defaultValue={c.border.color}
                  maxLength={7}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (/^#[0-9a-f]{6}$/i.test(value))
                      update((draft) => {
                        draft.border.color = value;
                      });
                    else event.target.value = c.border.color;
                  }}
                />
              </div>
            )}
            <p className="hint">
              Wege unterbrechen die Linie und reichen bis zur Außenkante. Die Randzone bleibt frei
              von Objekten, auch wenn die Linie durchsichtig ist. Bereits gesetzte Objekte in dieser
              Zone werden ausgeblendet und erscheinen beim Deaktivieren wieder.
            </p>
            {c.border.mode === 'transparent' && (
              <p className="hint">
                Durchsichtig blendet nur die Linie aus; der Landschaftsboden bleibt erhalten.
              </p>
            )}
          </Section>
          <Section title="Überhängende Kanten">
            <Range
              label="Überhang"
              value={c.terrain.overhang * 100}
              min={0}
              max={3}
              step={0.1}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.terrain.overhang = v / 100;
                })
              }
            />
            <Range
              label="Hängende Wände"
              value={c.terrain.skirtDepth * 100}
              min={0.5}
              max={10}
              step={0.5}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.terrain.skirtDepth = v / 100;
                })
              }
            />
          </Section>
          <Section title="Material">
            {terrain}
            <Range
              label="Grobes Perlin · Stärke"
              value={c.terrain.texture.strength * 100}
              min={0}
              max={40}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.terrain.texture.strength = v / 100;
                })
              }
            />
            <Range
              label="Grobes Perlin · Frequenz"
              value={c.terrain.texture.scale}
              min={1}
              max={32}
              step={0.5}
              onChange={(v) =>
                update((d) => {
                  d.terrain.texture.scale = v;
                })
              }
            />
            <Range
              label="Material-Oktaven"
              value={c.terrain.texture.octaves}
              min={1}
              max={6}
              onChange={(v) =>
                update((d) => {
                  d.terrain.texture.octaves = v;
                })
              }
            />
            <Range
              label="Feines Perlin · Stärke"
              value={c.terrain.texture.detailStrength * 100}
              min={0}
              max={25}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.terrain.texture.detailStrength = v / 100;
                })
              }
            />
            <Range
              label="Feines Perlin · Frequenz"
              value={c.terrain.texture.detailScale}
              min={8}
              max={180}
              onChange={(v) =>
                update((d) => {
                  d.terrain.texture.detailScale = v;
                })
              }
            />
            <p className="hint">
              Flächige Farbflecken und feinere Maserung liegen unter der Pixelkörnung. Alle drei
              Schichten lassen sich unabhängig einstellen.
            </p>
            <Range
              label="Pixelkörnung"
              value={c.terrain.grain}
              min={0}
              max={0.4}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.terrain.grain = v;
                })
              }
              hint="Jedes Pixel variiert um die gemeinsame Grundfarbe seiner Zelle."
            />
          </Section>
        </>
      )}
      {layer === 'paths' && (
        <>
          <Section title="Wegenetz" badge="03">
            <p className="section-description">Sechs Eingänge. Ein gemeinsames Zentrum.</p>
            <Toggle
              label="Wege generieren"
              checked={c.paths.enabled}
              onChange={(v) =>
                update((d) => {
                  d.paths.enabled = v;
                })
              }
            />
            <Toggle
              label="Automatisch verbinden"
              checked={c.paths.auto}
              onChange={(v) =>
                update((d) => {
                  d.paths.auto = v;
                })
              }
            />
            <button
              className="button secondary full"
              onClick={() =>
                update((draft) => {
                  delete draft.legacyLayout;
                  delete draft.layoutVersion;
                  draft.paths.auto = true;
                  draft.paths.fields = [];
                  draft.decoration.density =
                    draft.decoration.sourceDensity ?? draft.decoration.density;
                  draft.decoration.placements = [];
                })
              }
            >
              Organisches Wegenetz neu erzeugen
            </button>
            <p className="hint">
              Erzeugt kleinere Felder mit meist zwei bis drei Nachbarn und Rasteranschlüssen am
              Pentagon. Feldanpassungen und Objektplatzierungen werden dabei ersetzt; Rückgängig
              stellt sie wieder her.
            </p>
            <Toggle
              label="Rundweg verbinden"
              checked={c.paths.loop}
              onChange={(v) =>
                update((d) => {
                  d.paths.loop = v;
                })
              }
            />
            <Range
              label="Anzahl Spielfelder"
              value={c.paths.fieldCount}
              min={7}
              max={24}
              onChange={(v) =>
                update((d) => {
                  delete d.legacyLayout;
                  delete d.layoutVersion;
                  d.paths.fieldCount = v;
                  d.paths.auto = true;
                  d.paths.fields = [];
                  if (d.decoration.sourceDensity !== undefined)
                    d.decoration.density = d.decoration.sourceDensity;
                  d.decoration.placements = [];
                })
              }
              hint="Gesamtzahl einschließlich Pentagon. Sechs feste Randfelder benötigen mindestens acht Felder mit einem inneren Verbinder. Unmögliche Kombinationen werden ausdrücklich gemeldet."
            />
            <p className="hint">
              Aktuell {tile.fields.length} von {c.paths.fieldCount} Feldern.{' '}
              {tile.connections.length} eindeutige Verbindungen.
            </p>
            <Control label="Höhenprofil der Spielfelder">
              <select
                aria-label="Standard-Höhenprofil"
                value={c.paths.heightMode}
                onChange={(e) =>
                  update((d) => {
                    d.paths.heightMode = e.target.value as TileConfig['paths']['heightMode'];
                  })
                }
              >
                <option value="flat">Ebene Plattformen</option>
                <option value="terraced">Terrassen aus dem Gelände</option>
              </select>
              <p className="hint">
                Alle Plattformen bleiben waagerecht. Höhenunterschiede bilden senkrechte Stufen,
                auch am Pentagon. Die Höhe ist pro Feld einstellbar.
              </p>
            </Control>
          </Section>
          <Section id="center-settings" title="Pentagon">
            <Toggle
              label="Spielfelder bei Pentagonänderung neu generieren"
              checked={c.editing.regeneratePathsOnCenterChange}
              onChange={(value) =>
                update((draft) => {
                  draft.editing.regeneratePathsOnCenterChange = value;
                })
              }
              hint="Aus: vorhandene Feldformen und Eigenschaften bleiben erhalten. Nur direkt vom Pentagon betroffene Rasterstücke werden angepasst."
            />
            <Range
              label="Breite der Pentagon-Anschlüsse"
              value={c.center.portalWidth * 100}
              min={25}
              max={70}
              step={5}
              unit=" %"
              onChange={(v) =>
                editCenter((center) => {
                  center.portalWidth = v / 100;
                })
              }
            />
            <p className="hint">
              Wege münden in der Seitenmitte. Die Ecken bleiben Landschaft und trennen die
              Anschlüsse voneinander.
            </p>
            <Range
              label="Pentagon · X-Position"
              value={c.center.offset.x * 100}
              min={-45}
              max={45}
              step={1}
              unit=" %"
              onChange={(v) =>
                editCenter((center) => {
                  center.offset.x = v / 100;
                })
              }
            />
            <Range
              label="Pentagon · Y-Position"
              value={c.center.offset.y * 100}
              min={-45}
              max={45}
              step={1}
              unit=" %"
              onChange={(v) =>
                editCenter((center) => {
                  center.offset.y = v / 100;
                })
              }
            />
            <Control label="Grundform">
              <select
                aria-label="Pentagonform"
                value={c.center.shape}
                onChange={(e) =>
                  editCenter((center) => {
                    center.shape = e.target.value as TileConfig['center']['shape'];
                  })
                }
              >
                <option value="organic">Leicht unregelmäßig</option>
                <option value="regular">Regelmäßig</option>
              </select>
            </Control>
            <Range
              label="Pentagongröße"
              value={c.center.scale * 100}
              min={50}
              max={120}
              step={5}
              unit=" %"
              onChange={(v) =>
                editCenter((center) => {
                  center.scale = v / 100;
                })
              }
            />
            <Range
              label="Pentagon-Drehung"
              value={c.center.rotation}
              min={-180}
              max={180}
              unit="°"
              onChange={(v) =>
                editCenter((center) => {
                  center.rotation = v;
                })
              }
            />
            {c.center.shape === 'organic' && (
              <Range
                label="Unregelmäßigkeit"
                value={c.center.irregularity * 100}
                min={0}
                max={35}
                unit=" %"
                onChange={(v) =>
                  editCenter((center) => {
                    center.irregularity = v / 100;
                  })
                }
              />
            )}
            <p className="hint">
              {c.editing.regeneratePathsOnCenterChange
                ? 'Formänderungen bauen Wege und Platzierungen neu auf. Rückgängig stellt deine Anpassungen wieder her.'
                : 'Vorhandene Felder werden erhalten. Neue Schnitte und Anschlüsse am Pentagon können Regelhinweise erzeugen.'}
            </p>
            <div className="center-connections">
              {tile.center.sides.map((side) => {
                const field = tile.fields.find((f) => f.id === side.fieldId);
                return (
                  <button
                    key={side.index}
                    disabled={!field}
                    onClick={() => field && props.onSelectField(field.id)}
                    aria-label={`Pentagon-Seite ${side.index + 1}: ${field?.label ?? 'kein Spielfeld'}`}
                  >
                    <span
                      className="connection-index"
                      style={{ borderColor: field?.color ?? '#a5afa0' }}
                    >
                      {side.index + 1}
                    </span>
                    <span>{field?.label ?? 'Kein Spielfeld'}</span>
                  </button>
                );
              })}
            </div>
          </Section>
          <p className="inspector-rule">
            Spielfelder werden flächenbasiert geclustert. Kleine Reststücke gehen in benachbarten
            Feldern auf.
          </p>
          <Section title="Seiteneingänge">
            <div className="side-buttons" aria-label="Feste Tile-Eingänge" role="list">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} role="listitem" className="side-entry selected">
                  {i + 1}
                  <small>
                    {tile.fields
                      .find(
                        (field) => field.id === tile.entrances.find((e) => e.side === i)?.fieldId,
                      )
                      ?.label.replace('Spielfeld ', 'F') ?? '–'}
                  </small>
                </div>
              ))}
            </div>
            <p className="hint">
              Alle sechs Tile-Seiten haben einen festen Eingang, der genau einem Feld gehört. Die
              übrige Außenkante bleibt Landschaft; kein zweites Spielfeld darf dieselbe Kante
              berühren. Die mittigen Eingangszellen bleiben bei gleichem Raster fest. Die Feldform
              dahinter ist editierbar.
            </p>
          </Section>
          <p className="inspector-rule">
            Felder rechts über die Schnellaktionen erstellen und bearbeiten. Die Prüfregeln dort
            erzeugen beim Bearbeiten nur Warnungen.
          </p>
          <Section title="Natürliche Wege">
            <Range
              label="Kiesel am Wegrand"
              value={c.paths.detail.pebbleDensity * 100}
              min={0}
              max={100}
              step={5}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.paths.detail.pebbleDensity = v / 100;
                })
              }
            />
            <Range
              label="Helle Feldmitte"
              value={c.paths.detail.centerLight * 100}
              min={0}
              max={50}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.paths.detail.centerLight = v / 100;
                })
              }
            />
            <Range
              label="Dunkler Wegrand"
              value={c.paths.detail.edgeShade * 100}
              min={0}
              max={40}
              unit=" %"
              onChange={(v) =>
                update((d) => {
                  d.paths.detail.edgeShade = v / 100;
                })
              }
            />
          </Section>
          <Section title="Wegmaterial">
            <GradientEditor
              label="Zufällige Grundfarben"
              stops={c.paths.gradient}
              onChange={(v) =>
                update((d) => {
                  d.paths.gradient = v;
                })
              }
            />
          </Section>
        </>
      )}
      {layer === 'actions' && (
        <>
          <Section title="Feldaktionen" badge="04">
            <p className="section-description">
              Ein Symbol macht aus einer Fläche ein Spielfeld. Klicke auf ein Feld in der Vorschau.
            </p>
            <p className="hint">
              Das aktive Feld wird rechts ausgewählt. Seine Eigenschaften bearbeitest du hier.
            </p>
          </Section>
          {selectedField ? (
            <>
              <Section title="Funktion">
                <div className="action-grid">
                  {ACTIONS.filter((a) => a.id !== 'none').map((a) => (
                    <button
                      key={a.id}
                      className={`action-card ${selectedField.action === a.id ? 'selected' : ''}`}
                      title={ACTION_ICON_META[a.id].description}
                      aria-description={ACTION_ICON_META[a.id].description}
                      onClick={() => props.setField({ action: a.id })}
                    >
                      <img className="action-pixel" src={ACTION_IMAGES[a.id]} alt="" />
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
                <Control label="Beschriftung / Ereigniskarte">
                  <input
                    aria-label="Feldbeschriftung"
                    value={selectedField.label}
                    maxLength={100}
                    onChange={(e) => props.setField({ label: e.target.value })}
                  />
                </Control>
                <p className="hint">
                  Eigene Aktionen verwenden ein Sternsymbol mit Plus. Die Beschriftung wird mit der
                  Konfiguration gespeichert.
                </p>
              </Section>
              <Section title="Feldhöhe">
                <Control label="Oberfläche dieses Feldes">
                  <select
                    aria-label="Höhenprofil dieses Feldes"
                    value={selectedEdit?.heightMode ?? 'inherit'}
                    onChange={(e) =>
                      props.setField({
                        heightMode:
                          e.target.value === 'inherit'
                            ? undefined
                            : (e.target.value as 'flat' | 'terraced'),
                      })
                    }
                  >
                    <option value="inherit">Standard übernehmen</option>
                    <option value="flat">Ebene Plattform</option>
                    <option value="terraced">Mehrere Terrassen</option>
                  </select>
                </Control>
                <Range
                  label="Feldhöhe · Versatz"
                  value={(selectedEdit?.heightOffset ?? 0) * 100}
                  min={-12}
                  max={30}
                  step={0.5}
                  unit=" %"
                  onChange={(v) => props.setField({ heightOffset: v / 100 })}
                />
                <p className="hint">
                  Positive Werte heben das Feld an, negative senken es ab. Jede Terrasse bleibt
                  waagerecht; ihre Höhenwechsel bilden senkrechte Wände. Die Untergrenze schützt den
                  gemeinsamen Sockel.
                </p>
                <p className="hint">
                  Höhe: {(selectedField.height * 100).toFixed(1)} %
                  {selectedField.maxHeight > selectedField.height + 0.0001
                    ? ` bis ${(selectedField.maxHeight * 100).toFixed(1)} %`
                    : ''}{' '}
                  der Kachel-Seitenlänge.
                </p>
                <button
                  className="text-button"
                  onClick={() => props.setField({ heightOffset: undefined, heightMode: undefined })}
                >
                  Standardhöhe verwenden
                </button>
              </Section>
              {!selectedField.isCenter && (
                <Section title="Feldform">
                  <p className="hint">
                    {((selectedField.area / ((3 * Math.sqrt(3)) / 2)) * 100).toFixed(1)} % der
                    Kachelfläche · zusammenhängende Rasterstücke hinzufügen oder abwählen. Auch
                    automatisch erzeugte Felder lassen sich hier bearbeiten.
                  </p>
                </Section>
              )}
              {selectedEntrance && (
                <Section title="Fester Seiteneingang">
                  <p className="hint">
                    Die mittigen Eingangszellen bleiben fest. Rasterstücke im Inneren kannst du
                    hinzufügen oder entfernen; der feste Seiteneingang bleibt erhalten.
                  </p>
                </Section>
              )}
              <Section title="Verbindungen">
                <div className="center-connections">
                  {tile.connections
                    .filter(
                      (connection) =>
                        connection.from === selectedField.id || connection.to === selectedField.id,
                    )
                    .map((connection) => {
                      const other = tile.fields.find(
                        (field) =>
                          field.id ===
                          (connection.from === selectedField.id ? connection.to : connection.from),
                      );
                      return (
                        <button
                          key={connection.id}
                          onClick={() => other && props.onSelectField(other.id)}
                        >
                          <span className="connection-index">↔</span>
                          {other?.label ?? 'Verbindung'}
                        </button>
                      );
                    })}
                </div>
                <p className="hint">
                  {tile.connections.filter(
                    (connection) =>
                      connection.from === selectedField.id || connection.to === selectedField.id,
                  ).length >= 3
                    ? 'Verzweigung mit mehreren Anschlüssen.'
                    : 'Durchgang oder äußerer Anschluss.'}
                </p>
              </Section>
              <Section title="Eigene Feldfarbe">
                <div className="color-input">
                  <input
                    type="color"
                    aria-label="Feldfarbe"
                    value={selectedField.color}
                    onChange={(e) => props.setField({ color: e.target.value })}
                  />
                  <input
                    aria-label="Feldfarbe Hexwert"
                    key={`${selectedField.id}-${selectedField.color}`}
                    defaultValue={selectedField.color}
                    maxLength={7}
                    onBlur={(e) => {
                      if (/^#[a-f\d]{6}$/i.test(e.target.value))
                        props.setField({ color: e.target.value });
                    }}
                  />
                  <button
                    className="icon-button"
                    aria-label="Farbe in Palette speichern"
                    onClick={() =>
                      update((d) => {
                        if (!d.palette.includes(selectedField.color) && d.palette.length < 32)
                          d.palette.push(selectedField.color);
                      })
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() => props.setField({ color: undefined })}
                >
                  {selectedField.isCenter
                    ? 'Standardfarbe verwenden'
                    : 'Farbe aus Verlauf verwenden'}
                </button>
                <div className="swatches">
                  {c.palette.map((color, i) => (
                    <button
                      style={{ background: color }}
                      key={`${color}-${i}`}
                      title={color}
                      aria-label={`Feldfarbe ${color}`}
                      onClick={() => props.setField({ color })}
                    />
                  ))}
                </div>
                {!selectedField.isCenter && !selectedEntrance && (
                  <button className="text-button danger" onClick={props.removeField}>
                    <Trash2 size={13} /> Manuelle Anpassung entfernen
                  </button>
                )}
              </Section>
            </>
          ) : (
            <div className="empty-state">
              <MousePointer2 size={32} />
              <p>
                Wähle ein Spielfeld
                <br />
                direkt auf der Kachel.
              </p>
            </div>
          )}
          <Section title="Spielregeln">
            <p className="hint">
              Bewegung per Würfel. Ressourcen: Amethyst → Platin → Edelsteine → Altmetall & Gold.
              Aktionen sind Symbole für das Brettspiel, keine simulierten Regeln.
            </p>
          </Section>
        </>
      )}
      {layer === 'objects' && (
        <>
          <div className="object-placement-toolbar">
            <div className="object-current">
              <img
                src={
                  objectPreviews[props.objectKind]?.preview ??
                  builtinObjectPreviewUrl(props.objectKind)
                }
                alt={`${selectedObjectType.label} · Voxelvorschau`}
                width={144}
                height={144}
              />
              <div>
                <span>Aktuelles Objekt</span>
                <strong>{selectedObjectType.label}</strong>
                <small>{objectPreviews[props.objectKind]?.name ?? selectedObjectType.group}</small>
              </div>
            </div>
            <p className="hint">
              Objekte rechts über die Schnellaktionen platzieren oder entfernen.
            </p>
          </div>
          <Section title="Objektbibliothek" badge="05">
            <p className="section-description">
              {DECORATION_CATALOG.length} Voxelmodelle auf einer gemeinsamen Grundfläche. Wähle ein
              Objekt und setze es auf freie Landschaft.
            </p>
            <ObjectLibrary
              selected={props.objectKind}
              onSelect={props.setObjectKind}
              overrides={objectPreviews}
            />
            <p className="hint">
              Die Klickposition rastet im feineren Subraster ein. Eigene Modelle kannst du unten
              importieren und zuweisen.
            </p>
          </Section>
          <Section title="Natürliche Verteilung">
            <Toggle
              label="Objekte anzeigen"
              checked={c.decoration.enabled}
              onChange={(v) =>
                update((d) => {
                  d.decoration.enabled = v;
                })
              }
            />
            <Range
              label="Dichte"
              value={c.decoration.density}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.decoration.density = v;
                })
              }
              hint="Zusammenhängende Gehölzgruppen aus Perlin-Noise, mit Abstand zu Spielfeldern."
            />
            <Range
              label="Objekte je Rasterzelle"
              value={c.decoration.maxPerCell}
              min={1}
              max={12}
              onChange={(v) =>
                update((d) => {
                  d.decoration.maxPerCell = v;
                })
              }
            />
            <Control label="Arten in der Verteilung">
              <div className="species-groups">
                {[...new Set(DECORATION_CATALOG.map((entry) => entry.group))].map((group) => (
                  <fieldset key={group} className="species-group">
                    <legend>{group}</legend>
                    <div className="species-options">
                      {DECORATION_CATALOG.filter((entry) => entry.group === group).map((object) => (
                        <label key={object.kind} title={object.description}>
                          <input
                            type="checkbox"
                            aria-label={object.label}
                            checked={c.decoration.species.includes(object.kind)}
                            disabled={
                              c.decoration.species.includes(object.kind) &&
                              c.decoration.species.length === 1
                            }
                            onChange={(event) =>
                              update((d) => {
                                if (
                                  event.target.checked &&
                                  !d.decoration.species.includes(object.kind)
                                )
                                  d.decoration.species.push(object.kind);
                                else if (!event.target.checked && d.decoration.species.length > 1)
                                  d.decoration.species = d.decoration.species.filter(
                                    (kind) => kind !== object.kind,
                                  );
                              })
                            }
                          />
                          {object.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </Control>
            <div className="object-color-profiles">
              <Toggle
                label="Baumkronenprofile durchwechseln"
                checked={c.decoration.colorProfiles.trees.enabled}
                hint="Laubfarben variieren seedbasiert; Rinde und Stamm bleiben unverändert."
                onChange={(enabled) =>
                  update((d) => {
                    d.decoration.colorProfiles.trees.enabled = enabled;
                  })
                }
              />
              {c.decoration.colorProfiles.trees.enabled && (
                <>
                  {c.decoration.colorProfiles.trees.profiles.map((profile, profileIndex) => (
                    <fieldset className="object-color-profile" key={profile.id}>
                      <legend>Baumprofil {profileIndex + 1}</legend>
                      <Control label="Profilname">
                        <input
                          aria-label={`Name Baumprofil ${profileIndex + 1}`}
                          value={profile.name}
                          maxLength={60}
                          onChange={(event) =>
                            update((d) => {
                              d.decoration.colorProfiles.trees.profiles[profileIndex]!.name =
                                event.target.value;
                            })
                          }
                        />
                      </Control>
                      <div className="object-color-profile-colors">
                        {(['Dunkel', 'Mittel', 'Hell'] as const).map((tone, colorIndex) => (
                          <Control key={tone} label={`Laub ${tone.toLowerCase()}`}>
                            <input
                              type="color"
                              aria-label={`Baumprofil ${profileIndex + 1}, Laub ${tone.toLowerCase()}`}
                              value={profile.foliage[colorIndex]}
                              onChange={(event) =>
                                update((d) => {
                                  d.decoration.colorProfiles.trees.profiles[profileIndex]!.foliage[
                                    colorIndex
                                  ] = event.target.value;
                                })
                              }
                            />
                          </Control>
                        ))}
                      </div>
                      <button
                        className="text-button danger"
                        disabled={c.decoration.colorProfiles.trees.profiles.length <= 1}
                        onClick={() =>
                          update((d) => {
                            d.decoration.colorProfiles.trees.profiles.splice(profileIndex, 1);
                          })
                        }
                      >
                        <Trash2 size={12} /> Profil entfernen
                      </button>
                    </fieldset>
                  ))}
                  <button
                    className="button secondary full"
                    disabled={c.decoration.colorProfiles.trees.profiles.length >= 8}
                    onClick={() =>
                      update((d) => {
                        const profiles = d.decoration.colorProfiles.trees.profiles;
                        const id = nextProfileId('tree-custom', profiles);
                        const base = DEFAULT_TREE_COLOR_PROFILES[0]!;
                        profiles.push({ ...structuredClone(base), id, name: 'Neues Baumprofil' });
                      })
                    }
                  >
                    <Plus size={13} /> Baumprofil hinzufügen
                  </button>
                </>
              )}

              <Toggle
                label="Pilzkappen variieren"
                checked={c.decoration.colorProfiles.mushrooms.enabled}
                hint="Kappen wechseln zwischen Profilen; Stiele behalten ihre natürliche Farbe."
                onChange={(enabled) =>
                  update((d) => {
                    d.decoration.colorProfiles.mushrooms.enabled = enabled;
                  })
                }
              />
              {c.decoration.colorProfiles.mushrooms.enabled && (
                <>
                  {c.decoration.colorProfiles.mushrooms.profiles.map((profile, profileIndex) => (
                    <fieldset className="object-color-profile" key={profile.id}>
                      <legend>Pilzprofil {profileIndex + 1}</legend>
                      <Control label="Profilname">
                        <input
                          aria-label={`Name Pilzprofil ${profileIndex + 1}`}
                          value={profile.name}
                          maxLength={60}
                          onChange={(event) =>
                            update((d) => {
                              d.decoration.colorProfiles.mushrooms.profiles[profileIndex]!.name =
                                event.target.value;
                            })
                          }
                        />
                      </Control>
                      <div className="object-color-profile-colors">
                        {(['Schatten', 'Grundfarbe', 'Licht'] as const).map((tone, colorIndex) => (
                          <Control key={tone} label={tone}>
                            <input
                              type="color"
                              aria-label={`Pilzprofil ${profileIndex + 1}, ${tone}`}
                              value={profile.cap[colorIndex]}
                              onChange={(event) =>
                                update((d) => {
                                  d.decoration.colorProfiles.mushrooms.profiles[profileIndex]!.cap[
                                    colorIndex
                                  ] = event.target.value;
                                })
                              }
                            />
                          </Control>
                        ))}
                      </div>
                      <button
                        className="text-button danger"
                        disabled={c.decoration.colorProfiles.mushrooms.profiles.length <= 1}
                        onClick={() =>
                          update((d) => {
                            d.decoration.colorProfiles.mushrooms.profiles.splice(profileIndex, 1);
                          })
                        }
                      >
                        <Trash2 size={12} /> Profil entfernen
                      </button>
                    </fieldset>
                  ))}
                  <button
                    className="button secondary full"
                    disabled={c.decoration.colorProfiles.mushrooms.profiles.length >= 8}
                    onClick={() =>
                      update((d) => {
                        const profiles = d.decoration.colorProfiles.mushrooms.profiles;
                        const id = nextProfileId('mushroom-custom', profiles);
                        const base = DEFAULT_MUSHROOM_COLOR_PROFILES[0]!;
                        profiles.push({ ...structuredClone(base), id, name: 'Neues Pilzprofil' });
                      })
                    }
                  >
                    <Plus size={13} /> Pilzprofil hinzufügen
                  </button>
                </>
              )}
            </div>
          </Section>
          {c.decoration.placements.length > 0 && (
            <Section title="Gesetzte Objekte">
              {selectedPlacement && (
                <>
                  <Range
                    label="Objektgröße"
                    value={selectedPlacement.scale}
                    min={0.2}
                    max={3}
                    step={0.05}
                    onChange={(v) =>
                      update((d) => {
                        const object = d.decoration.placements.find(
                          (o) => o.id === selectedPlacement.id,
                        );
                        if (object) object.scale = v;
                      })
                    }
                  />
                  <Range
                    label="Objektdrehung"
                    value={selectedPlacement.rotation}
                    min={-360}
                    max={360}
                    unit="°"
                    onChange={(v) =>
                      update((d) => {
                        const object = d.decoration.placements.find(
                          (o) => o.id === selectedPlacement.id,
                        );
                        if (object) object.rotation = v;
                      })
                    }
                  />
                </>
              )}
              <p className="hint">
                Auch Objekte aus der vollständigen Seed-Generierung lassen sich einzeln auswählen,
                skalieren, drehen und entfernen.
              </p>
            </Section>
          )}
          <Section title="Eigene Modelle">
            <label className="button secondary full file-button">
              <Upload size={14} /> Voxel-JSON importieren
              <input type="file" accept=".json,application/json" onChange={props.uploadModel} />
            </label>
            <Control label="Modell für gewählten Objekttyp">
              <select
                aria-label="Modell zuweisen"
                value={c.decoration.modelSlots?.[props.objectKind] ?? props.objectKind}
                onChange={(e) => props.assignModel(e.target.value)}
              >
                {props.models.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Control>
            <a className="text-button" href="/models/example.json" download>
              Beispielmodell herunterladen ↗
            </a>
            <p className="hint">
              Format: Größe, Hexfarben und Voxelkoordinaten. Importierte Modelle werden lokal in
              working/models abgelegt.
            </p>
          </Section>
        </>
      )}
      {layer === 'export' && (
        <>
          <Section title="Kamera & Export" badge="06">
            <p className="section-description">
              Die Exportkamera bleibt im Zentrum. Freies Orbitieren dient der Vorschau.
            </p>
            <Control label="Projektion">
              <select
                aria-label="Exportprojektion"
                value={c.camera.mode}
                onChange={(e) =>
                  update((d) => {
                    d.camera.mode = e.target.value as TileConfig['camera']['mode'];
                  })
                }
              >
                <option value="top">Draufsicht · orthografisch</option>
                <option value="orbit">Schrägansicht · orthografisch</option>
                <option value="perspective">Perspektivisch · signiert</option>
              </select>
            </Control>
            {c.camera.mode === 'orbit' && (
              <>
                <Range
                  label="Azimut"
                  value={c.camera.azimuth}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v) =>
                    update((d) => {
                      d.camera.azimuth = v;
                    })
                  }
                />
                <Range
                  label="Blickhöhe"
                  value={c.camera.elevation}
                  min={-85}
                  max={90}
                  unit="°"
                  onChange={(v) =>
                    update((d) => {
                      d.camera.elevation = v;
                    })
                  }
                />
              </>
            )}
            <Range
              label="Sichtfeld"
              value={c.camera.fov}
              min={-100}
              max={100}
              unit="°"
              onChange={(v) =>
                update((d) => {
                  d.camera.fov = v;
                })
              }
              hint="0 = parallel. Negative Werte kehren die Größenwirkung der Tiefe um. Aktiv in perspektivischer Ansicht."
            />
            {c.camera.mode === 'orbit' && (
              <>
                <Range
                  label="Zoom"
                  value={c.camera.zoom}
                  min={0.4}
                  max={3}
                  step={0.05}
                  onChange={(v) =>
                    update((d) => {
                      d.camera.zoom = v;
                    })
                  }
                />
              </>
            )}
            <p className="hint">
              Die Perspektivansicht steht senkrecht über der Kachelmitte. Das Sichtfeld verändert
              die Tiefenwirkung; der PNG-Rahmen behält die eingestellte Pixelgröße.
            </p>
            <Toggle
              label="Transparenter Hintergrund"
              checked={c.export.transparent}
              onChange={(v) =>
                update((d) => {
                  d.export.transparent = v;
                })
              }
            />
          </Section>
          <Section title="Ausgabe">
            <div className="export-summary">
              <Hexagon size={22} />
              <div>
                <strong>
                  {c.export.size} × {c.export.size} px
                </strong>
                <span>PNG · {c.export.transparent ? 'Alpha-Kanal' : 'Hintergrund'}</span>
              </div>
            </div>
            <p className="hint">PNG und Working-Export stehen rechts in den Schnellaktionen.</p>
            <p className="hint">
              Working speichert PNG, Konfiguration und Manifest zusammen. Gleicher Seed + gleiche
              Konfiguration ergeben dieselbe Geometrie und Textur.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
