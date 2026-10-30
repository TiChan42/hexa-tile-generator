import { randomAt } from './random';
import { actionWeightsForBiome, sampleFieldAction } from './action-probabilities';
import { isResource, rollResourceAmount } from './resources';
import type { GeneratedTile, TileConfig } from './types';

const MAX_REVISION = 2147483647;

/** Explicit action-only roll: stable by seed, next revision and visible field identity. */
export function rollFieldActions(config: TileConfig, tile: GeneratedTile): TileConfig {
  const weights = actionWeightsForBiome(config.actions.biome);
  const revision = config.actions.revision === MAX_REVISION ? 0 : config.actions.revision + 1;
  const actionFor = (fieldId: string) =>
    sampleFieldAction(weights, randomAt(config.seed, 'field-action-roll-v10', revision, fieldId));
  const draft = structuredClone(config),
    edits = new Map(draft.paths.fields.map((field) => [field.id, field]));
  draft.actions.revision = revision;
  for (const id of [...new Set(tile.fields.map((field) => field.id))].sort()) {
    const action = actionFor(id),
      existing = edits.get(id);
    const edit = existing ?? { id, cellIds: [], action };
    edit.action = action;
    if (isResource(action)) edit.resourceAmount = rollResourceAmount(config.seed, revision, id);
    else delete edit.resourceAmount;
    if (!existing) draft.paths.fields.push(edit);
  }
  return draft;
}
