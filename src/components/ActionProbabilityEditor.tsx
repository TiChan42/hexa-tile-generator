import { useState } from 'react';
import {
  ACTION_PROBABILITIES,
  actionProbabilitiesSchema,
  actionWeightsForBiome,
} from '../core/action-probabilities';
import { BIOME_PRESETS } from '../core/biomes';
import { SELECTABLE_ACTIONS } from '../core/types';
import type { BiomePresetId } from '../core/biomes';
import type { ActionProbabilities } from '../core/action-probabilities';
import type { ActionProbabilityController } from '../editor/useActionProbabilities';

export default function ActionProbabilityEditor({
  controller,
  currentBiome,
}: {
  controller: ActionProbabilityController;
  currentBiome: BiomePresetId | null;
}) {
  const [draft, setDraft] = useState(() => structuredClone(controller.profile.probabilities));
  const [biomeSelection, setBiomeSelection] = useState<BiomePresetId | null | 'current'>('current');
  const previewBiome = biomeSelection === 'current' ? currentBiome : biomeSelection;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const weights = actionWeightsForBiome(previewBiome, draft);
  const total = SELECTABLE_ACTIONS.reduce((sum, { id }) => sum + weights[id], 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(controller.profile.probabilities);
  const valid = actionProbabilitiesSchema.safeParse(draft).success;
  const edit = (change: (next: ActionProbabilities) => void) => {
    setDraft((previous) => {
      const next = structuredClone(previous);
      change(next);
      return next;
    });
    setError('');
  };
  return (
    <>
      <p className="hint">
        Basisgewichte gelten für alle Kacheln. Ein Biom-Bonus erhöht das jeweilige Gewicht; die
        Chancen werden auf 100 % normiert.
      </p>
      {controller.error && (
        <p className="quick-error" role="alert">
          {controller.error}
        </p>
      )}
      {!controller.ready && !controller.error && (
        <p className="hint" aria-live="polite">
          Aktionsverteilung wird geladen…
        </p>
      )}
      <fieldset className="action-balance-controls" disabled={!controller.ready || saving}>
        <label className="control">
          <span>Biom-Boni bearbeiten</span>
          <select
            aria-label="Biom-Boni bearbeiten"
            value={biomeSelection ?? ''}
            onChange={(event) =>
              setBiomeSelection(
                event.target.value ? (event.target.value as BiomePresetId | 'current') : null,
              )
            }
          >
            <option value="current">
              Aktuelles Biom
              {currentBiome
                ? `: ${BIOME_PRESETS.find(({ id }) => id === currentBiome)!.name}`
                : ': ohne Bonus'}
            </option>
            <option value="">Ohne Biom-Bonus</option>
            {BIOME_PRESETS.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <table className="action-weight-table" aria-label="Globale Aktionswahrscheinlichkeiten">
          <thead>
            <tr>
              <th scope="col">Aktion</th>
              <th scope="col">Basis</th>
              <th scope="col">Bonus %</th>
              <th scope="col">Chance</th>
            </tr>
          </thead>
          <tbody>
            {SELECTABLE_ACTIONS.map((action) => {
              const bonus =
                previewBiome === null ? 0 : (draft.biomeBuffs[previewBiome][action.id] ?? 0);
              return (
                <tr key={action.id} data-action={action.id}>
                  <th scope="row">{action.label}</th>
                  <td>
                    <input
                      type="number"
                      aria-label={`Basisgewicht ${action.label}`}
                      min={0}
                      max={100}
                      step="any"
                      value={draft.baseWeights[action.id]}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber;
                        if (Number.isFinite(value) && value >= 0 && value <= 100)
                          edit((next) => {
                            next.baseWeights[action.id] = value;
                          });
                      }}
                    />
                  </td>
                  <td>
                    {previewBiome === null ? (
                      '–'
                    ) : (
                      <input
                        type="number"
                        aria-label={`Biom-Bonus ${action.label} in Prozent`}
                        min={0}
                        max={10000}
                        step="any"
                        value={Number((bonus * 100).toFixed(6))}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          if (Number.isFinite(value) && value >= 0 && value <= 10000)
                            edit((next) => {
                              next.biomeBuffs[previewBiome][action.id] = value / 100;
                            });
                        }}
                      />
                    )}
                  </td>
                  <td>
                    {total > 0 ? `${((weights[action.id] * 100) / total).toFixed(1)} %` : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!valid && (
          <p className="quick-error" role="alert">
            Mindestens eine auswählbare Aktion braucht ein positives Basisgewicht.
          </p>
        )}
        <button
          className="button secondary full"
          disabled={!dirty || !valid || saving}
          onClick={() => {
            setSaving(true);
            setError('');
            void controller
              .save(draft)
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? 'Wird gespeichert…' : 'Verteilung speichern'}
        </button>
        <div className="action-balance-buttons">
          <button
            className="text-button"
            disabled={!dirty}
            onClick={() => setDraft(structuredClone(controller.profile.probabilities))}
          >
            Änderungen verwerfen
          </button>
          <button
            className="text-button"
            onClick={() => setDraft(structuredClone(ACTION_PROBABILITIES))}
          >
            Standardwerte laden
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="quick-error" role="alert">
          {error}
        </p>
      )}
      {(error || controller.error) && (
        <button className="text-button" onClick={() => void controller.reload()}>
          Globale Verteilung neu laden
        </button>
      )}
      <p className="hint" aria-live="polite">
        {dirty ? 'Ungespeicherte Änderungen.' : controller.ready ? 'Global gespeichert.' : ''}{' '}
        Änderungen gelten bei neuen Kacheln und beim nächsten Aktionswurf.
      </p>
      <p className="hint">
        Ressourcenmengen ×1 bis ×9 werden separat gewürfelt: Jede zusätzliche Einheit ist dreimal
        seltener. Gold wird unabhängig gewichtet.
      </p>
    </>
  );
}
