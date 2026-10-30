import {
  Box,
  Check,
  Download,
  Grid3X3,
  Minus,
  MousePointer2,
  Plus,
  Save,
  SlidersHorizontal,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type { DecorationPlacement, GameField, GeneratedTile, TileConfig } from '../core/types';
import { SELECTABLE_ACTIONS } from '../core/types';
import { ACTION_PROBABILITIES, actionWeightsForBiome } from '../core/action-probabilities';
import { BIOME_PRESETS } from '../core/biomes';
import type { RuleIssue } from '../core/rules';
import type { FieldShapeAxis } from '../core/field-edit';
import type { Layer, Update } from './Inspector';
import { Control, Toggle } from './Controls';

interface Props {
  layer: Layer;
  config: TileConfig;
  tile: GeneratedTile;
  update: Update;
  selectedField?: GameField;
  selectedObject?: DecorationPlacement;
  objectLabel: string;
  placing: 'fields' | 'objects' | null;
  editingField: boolean;
  selectionCount: number;
  shapeLineCounts: { horizontal: number; vertical: number };
  selectionArea: number;
  fieldIssue: string | null;
  selectionWarnings: string[];
  ruleIssues: RuleIssue[];
  exportIssues: RuleIssue[];
  busy: boolean;
  applyDisabled: boolean;
  exportDisabled: boolean;
  onSelectField: (id: string) => void;
  onSelectObject: (id: string) => void;
  onNewField: () => void;
  onEditField: () => void;
  onApply: () => void;
  onAdjustShapeLine: (axis: FieldShapeAxis, direction: -1 | 1) => void;
  onCancel: () => void;
  onClear: () => void;
  onPlaceObjects: () => void;
  onRemoveObject: () => void;
  onExport: () => void;
  onExportModel: () => void;
  onSave: () => void;
  onTopView: () => void;
  onImport: () => void;
  onExportConfig: () => void;
  onBorderSettings: () => void;
  onRollActions: () => void;
  onCenterSettings: () => void;
}

export default function QuickActions(props: Props) {
  const { config, placing, selectedField } = props;
  const fieldContext =
    props.layer === 'paths' || props.layer === 'actions' || props.layer === 'grid';
  const tileArea = (3 * Math.sqrt(3)) / 2;
  const actionWeights = actionWeightsForBiome(config.actions.biome);
  const biome = BIOME_PRESETS.find(({ id }) => id === config.actions.biome);
  const actionWeightTotal = SELECTABLE_ACTIONS.reduce(
    (total, action) => total + actionWeights[action.id],
    0,
  );
  return (
    <aside className="quick-actions" aria-label="Schnellaktionen">
      <div className="quick-actions-heading">
        <SlidersHorizontal size={16} />
        <h2>Schnellaktionen</h2>
      </div>
      <div className="quick-primary">
        {placing === 'fields' ? (
          <>
            <strong className="quick-context">
              {props.editingField
                ? selectedField?.label || 'Spielfeld bearbeiten'
                : 'Neues Spielfeld'}
            </strong>
            <p className="quick-selection">
              <span>{props.selectionCount} ausgewählt</span>
              {' · '}
              {((props.selectionArea / tileArea) * 100).toFixed(1)} % Fläche
            </p>
            <div className="field-line-tools" role="group" aria-label="Feldform nach Rasterlinien">
              {(
                [
                  { axis: 'horizontal' as const, label: 'Horizontal' },
                  { axis: 'vertical' as const, label: 'Vertikal' },
                ] as const
              ).map(({ axis, label }) => (
                <div className="field-line-tool" key={axis}>
                  <span>
                    {label} ({props.shapeLineCounts[axis]})
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`${label}e Rasterlinie entfernen`}
                    title={`${label}e Rasterlinie entfernen`}
                    disabled={props.busy || props.selectionCount <= 1}
                    onClick={() => props.onAdjustShapeLine(axis, -1)}
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${label}e Rasterlinie hinzufügen`}
                    title={`${label}e Rasterlinie hinzufügen`}
                    disabled={props.busy || props.selectionCount === 0}
                    onClick={() => props.onAdjustShapeLine(axis, 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="hint field-line-hint">
              Erweiterungen bevorzugen horizontale Linien. Vertikale Linien lassen sich zusätzlich
              einzeln ergänzen oder abziehen.
            </p>
            <div className="quick-buttons">
              <button
                className="button full"
                disabled={props.applyDisabled}
                onClick={props.onApply}
                aria-describedby="field-shape-feedback"
              >
                <Check size={15} /> Anwenden
              </button>
              <button
                className="button secondary full"
                disabled={props.busy}
                onClick={props.onClear}
                aria-label="Auswahl aufheben"
              >
                Auswahl leeren
              </button>
              <button
                className="text-button"
                onClick={props.onCancel}
                aria-label="Platzieren beenden"
              >
                <X size={14} /> Abbrechen
              </button>
            </div>
          </>
        ) : props.layer === 'objects' ? (
          <>
            <strong className="quick-context">{props.objectLabel}</strong>
            <button
              className={`button full ${placing === 'objects' ? 'active-button' : ''}`}
              disabled={props.busy}
              onClick={props.onPlaceObjects}
            >
              <MousePointer2 size={15} />
              {placing === 'objects' ? 'Platzieren beenden' : 'Objekte platzieren'}
            </button>
            {config.decoration.placements.length > 0 && (
              <Control label="Gesetztes Objekt">
                <select
                  aria-label="Gesetztes Objekt"
                  value={props.selectedObject?.id ?? ''}
                  onChange={(event) => props.onSelectObject(event.target.value)}
                >
                  <option value="" disabled>
                    Objekt auswählen
                  </option>
                  {config.decoration.placements.map((object, index) => (
                    <option key={object.id} value={object.id}>
                      {index + 1} · {object.kind}
                    </option>
                  ))}
                </select>
              </Control>
            )}
            {props.selectedObject && (
              <button
                className="text-button danger"
                disabled={props.busy}
                onClick={props.onRemoveObject}
              >
                <Trash2 size={14} /> Ausgewähltes Objekt entfernen
              </button>
            )}
          </>
        ) : props.layer === 'export' ? (
          <>
            <strong className="quick-context">
              {config.export.size} × {config.export.size} px
            </strong>
            <button
              className="button full"
              disabled={props.exportDisabled}
              onClick={props.onExport}
            >
              <Download size={15} /> PNG herunterladen
            </button>
            <button
              className="button secondary full"
              disabled={props.exportDisabled}
              onClick={props.onExportModel}
              title="3D-Modell mit eingebetteten Farben, Texturen und Aktionssymbolen"
            >
              <Box size={15} /> 3D-Modell (GLB) herunterladen
            </button>
            <button
              className="button secondary full"
              disabled={props.exportDisabled}
              onClick={props.onSave}
            >
              <Save size={15} /> Im Working-Ordner speichern
            </button>
          </>
        ) : (
          <>
            {fieldContext && (
              <Control label="Aktives Spielfeld">
                <select
                  aria-label="Spielfeld auswählen"
                  value={selectedField?.id ?? ''}
                  disabled={props.busy}
                  onChange={(event) => props.onSelectField(event.target.value)}
                >
                  <option value="" disabled>
                    Feld wählen
                  </option>
                  {props.tile.fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label || field.id}
                    </option>
                  ))}
                </select>
              </Control>
            )}
            <button className="button full" disabled={props.busy} onClick={props.onNewField}>
              <Plus size={15} /> Neues Spielfeld
            </button>
            {fieldContext && selectedField && !selectedField.isCenter && (
              <button
                className="button secondary full"
                disabled={props.busy}
                onClick={props.onEditField}
              >
                <MousePointer2 size={15} /> Feldform bearbeiten
              </button>
            )}
            {fieldContext && selectedField?.isCenter && (
              <button
                className="button secondary full"
                disabled={props.busy}
                onClick={props.onCenterSettings}
              >
                <SlidersHorizontal size={15} /> Pentagon einstellen
              </button>
            )}
            {fieldContext && (
              <>
                <button
                  className="button secondary full"
                  disabled={props.busy || actionWeightTotal <= 0}
                  onClick={props.onRollActions}
                >
                  <Shuffle size={15} /> Alle Aktionen würfeln
                </button>
                {actionWeightTotal <= 0 && (
                  <p className="hint">
                    In der globalen Verteilung muss mindestens eine Aktion ein positives Gewicht
                    haben.
                  </p>
                )}
              </>
            )}
            {props.layer === 'terrain' && (
              <button className="button secondary full" onClick={props.onBorderSettings}>
                <SlidersHorizontal size={15} /> Außenrand einstellen
              </button>
            )}
            {props.layer === 'terrain' && (
              <button className="button secondary full" onClick={props.onTopView}>
                <Grid3X3 size={15} /> Draufsicht wählen
              </button>
            )}
          </>
        )}
      </div>
      <div className="quick-secondary">
        {fieldContext && placing !== 'fields' && (
          <details className="quick-rules action-probabilities">
            <summary>Aktionswahrscheinlichkeiten</summary>
            <p className="hint">
              Die Basis gilt global für alle Kacheln. Biom-Boni erhöhen einzelne Gewichte; daraus
              werden die Chancen auf 100 % normiert. Der Seed bestimmt nur die Ziehung.
            </p>
            <p className="hint" data-testid="action-biome">
              {biome ? `Biom: ${biome.name}` : 'Ohne Biom-Bonus'}
            </p>
            <table className="action-weight-table" aria-label="Globale Aktionswahrscheinlichkeiten">
              <thead>
                <tr>
                  <th scope="col">Aktion</th>
                  <th scope="col">Basis</th>
                  <th scope="col">Bonus</th>
                  <th scope="col">Chance</th>
                </tr>
              </thead>
              <tbody>
                {SELECTABLE_ACTIONS.map((action) => {
                  const buff =
                    config.actions.biome === null
                      ? 0
                      : (ACTION_PROBABILITIES.biomeBuffs[config.actions.biome][action.id] ?? 0);
                  return (
                    <tr key={action.id} data-action={action.id}>
                      <th scope="row">{action.label}</th>
                      <td>{Number(ACTION_PROBABILITIES.baseWeights[action.id].toFixed(3))}</td>
                      <td>{buff > 0 ? `+${Number((buff * 100).toFixed(1))} %` : '–'}</td>
                      <td>
                        {actionWeightTotal > 0
                          ? `${((100 * actionWeights[action.id]) / actionWeightTotal).toFixed(1)} %`
                          : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="hint">
              Ressourcenmengen ×1 bis ×9 werden separat gewürfelt: Jede zusätzliche Einheit ist
              dreimal seltener. Die Standardgewichte machen jede höhere Materialstufe dreimal
              seltener; Gold wird unabhängig gewichtet.
            </p>
            <p className="hint">
              Ziehung {config.actions.revision}. Alle Felder einschließlich Pentagon werden in einem
              Schritt gewürfelt; Formen und Eigenschaften bleiben erhalten.
            </p>
          </details>
        )}
        {placing === 'fields' && (
          <div
            id="field-shape-feedback"
            data-testid="field-shape-feedback"
            aria-live="polite"
            className={props.fieldIssue ? 'quick-error' : 'quick-feedback'}
          >
            {props.busy
              ? 'Form wird geprüft…'
              : (props.fieldIssue ?? 'Rasterstücke anklicken zum Hinzufügen oder Entfernen.')}
            {!props.fieldIssue &&
              props.selectionWarnings.map((warning) => (
                <p key={warning} className="quick-warning">
                  {warning}
                </p>
              ))}
          </div>
        )}
        {props.ruleIssues.length > 0 && (
          <div className="quick-rule-status" aria-live="polite">
            <strong>
              {props.ruleIssues.length} Regelhinweis{props.ruleIssues.length === 1 ? '' : 'e'} ·{' '}
              {props.exportIssues.length ? 'Export gesperrt' : 'Export erlaubt'}
            </strong>
            <ul>
              {props.ruleIssues.map((issue, index) => (
                <li key={`${issue.code}-${issue.fieldId ?? index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="quick-rules">
          <summary>Prüfregeln</summary>
          <p className="hint">
            Beim Bearbeiten erscheinen nur Warnungen. Die Exportregel bestimmt, ob Regelverstöße den
            PNG- und 3D-Export sperren.
          </p>
          <Control label="Mindestfläche (% der Kachel)">
            <input
              type="number"
              aria-label="Mindestfläche (% der Kachel)"
              min={0}
              max={19.245}
              step={0.1}
              value={Number(((config.rules.minFieldArea / tileArea) * 100).toFixed(3))}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value) && value >= 0 && value <= 19.245)
                  props.update((draft) => {
                    draft.rules.minFieldArea = (value / 100) * tileArea;
                  });
              }}
            />
          </Control>
          <Toggle
            label="Felder müssen zusammenhängen"
            checked={config.rules.requireFieldConnectivity}
            onChange={(value) =>
              props.update((draft) => {
                draft.rules.requireFieldConnectivity = value;
              })
            }
          />
          <Toggle
            label="Wegenetz muss verbunden sein"
            checked={config.rules.requirePathConnectivity}
            onChange={(value) =>
              props.update((draft) => {
                draft.rules.requirePathConnectivity = value;
              })
            }
          />
          <Control label="Regelverstöße beim Export">
            <select
              aria-label="Regelverstöße beim Export"
              value={config.rules.exportPolicy}
              onChange={(event) =>
                props.update((draft) => {
                  draft.rules.exportPolicy = event.target
                    .value as TileConfig['rules']['exportPolicy'];
                })
              }
            >
              <option value="block">Export sperren</option>
              <option value="warn">Nur warnen</option>
            </select>
          </Control>
        </details>
        <div className="quick-project-actions">
          <button className="text-button" onClick={props.onImport}>
            Konfiguration laden
          </button>
          <button className="text-button" onClick={props.onExportConfig}>
            Konfiguration speichern
          </button>
        </div>
      </div>
    </aside>
  );
}
