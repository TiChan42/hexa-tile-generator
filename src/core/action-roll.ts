import { randomAt } from './random';
import { ACTIONS } from './types';
import type { ActionId, GeneratedTile, TileConfig } from './types';

const ACTION_IDS = ACTIONS.map(({ id }) => id).sort();
const MAX_REVISION = 2147483647;

/** Explicit action-only roll: stable by seed, next revision and visible field identity. */
export function rollFieldActions(config: TileConfig, tile: GeneratedTile): TileConfig {
  const weighted = ACTION_IDS.map((id) => ({ id, weight: config.actions.weights[id] })).filter(
    ({ weight }) => weight > 0,
  );
  const total = weighted.reduce((sum, { weight }) => sum + weight, 0);
  if (!(total > 0))
    throw new Error('Zum Würfeln muss mindestens ein Aktionsgewicht größer als 0 sein.');
  const revision = config.actions.revision === MAX_REVISION ? 0 : config.actions.revision + 1;
  const actionFor = (fieldId: string): ActionId => {
    const target = randomAt(config.seed, 'field-action-roll-v10', revision, fieldId) * total;
    let cumulative = 0;
    for (const { id, weight } of weighted) {
      cumulative += weight;
      if (target < cumulative) return id;
    }
    // Positive subnormal weights can round a product onto the total; keep the last positive bin.
    return weighted.at(-1)!.id;
  };
  const draft = structuredClone(config),
    edits = new Map(draft.paths.fields.map((field) => [field.id, field]));
  draft.actions.revision = revision;
  for (const id of [...new Set(tile.fields.map((field) => field.id))].sort()) {
    const action = actionFor(id),
      existing = edits.get(id);
    if (existing) existing.action = action;
    else draft.paths.fields.push({ id, cellIds: [], action });
  }
  return draft;
}
