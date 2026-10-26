import {
  Check,
  Download,
  Grid3X3,
  MousePointer2,
  Plus,
  Save,
  SlidersHorizontal,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type { DecorationPlacement, GameField, GeneratedTile, TileConfig } from '../core/types';
import { ACTIONS } from '../core/types';
import type { RuleIssue } from '../core/rules';
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
  onCancel: () => void;
  onClear: () => void;
  onPlaceObjects: () => void;
  onRemoveObject: () => void;
  onExport: () => void;
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
  const actionWeightTotal = Object.values(config.actions.weights).reduce(
    (total, weight) => total + weight,
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
                  <p className="hint">Gib mindestens einer Aktion ein Gewicht größer als 0.</p>
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
              Die Gewichte werden auf 100 % normiert. 0 schließt eine Aktion aus. Gewürfelt werden
              alle Felder einschließlich Pentagon; bestehende Formen und Eigenschaften bleiben
              erhalten.
            </p>
            <div className="action-weight-head" aria-hidden="true">
              <span>Aktion</span>
              <span>Gewicht</span>
              <span>Chance</span>
            </div>
            {ACTIONS.map((action) => (
              <div className="action-weight-row" key={action.id}>
                <label htmlFor={`action-weight-${action.id}`}>{action.label}</label>
                <input
                  id={`action-weight-${action.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`Wahrscheinlichkeit ${action.label}`}
                  value={config.actions.weights[action.id]}
                  disabled={props.busy}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isFinite(value) && value >= 0 && value <= 100)
                      props.update((draft) => {
                        draft.actions.weights[action.id] = value;
                      });
                  }}
                />
                <span>
                  {actionWeightTotal > 0
                    ? `${((100 * config.actions.weights[action.id]) / actionWeightTotal).toFixed(1)} %`
                    : '–'}
                </span>
              </div>
            ))}
            <p className="hint">
              Ziehung {config.actions.revision}. Änderungen an den Gewichten würfeln erst beim
              Knopfdruck neu.
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
            PNG-Export sperren.
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
