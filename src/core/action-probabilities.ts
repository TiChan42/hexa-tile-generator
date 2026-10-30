import { z } from 'zod';
import probabilities from './action-probabilities.json' with { type: 'json' };
import { BIOME_PRESETS } from './biomes';
import { ACTIONS, SELECTABLE_ACTIONS } from './types';
import type { BiomePresetId } from './biomes';
import type { ActionId } from './types';

export type ActionWeights = Readonly<Record<ActionId, number>>;
const actionIds = z.enum(ACTIONS.map(({ id }) => id));
export const biomeIdSchema = z.enum(BIOME_PRESETS.map(({ id }) => id));
const weight = z.number().finite().min(0).max(100);

/** Strict global settings; projects can retain a snapshot for reproducible generation. */
export const actionProbabilitiesSchema = z
  .object({
    version: z.literal(1),
    baseWeights: z
      .record(actionIds, weight)
      .refine(
        (weights) => SELECTABLE_ACTIONS.some(({ id }) => weights[id] > 0),
        'Mindestens ein auswählbares Aktionsgewicht muss größer als 0 sein.',
      ),
    biomeBuffs: z.record(biomeIdSchema, z.partialRecord(actionIds, weight)),
  })
  .strict();
export type ActionProbabilities = z.infer<typeof actionProbabilitiesSchema>;

const parsed = actionProbabilitiesSchema.parse(probabilities);
for (const buffs of Object.values(parsed.biomeBuffs)) Object.freeze(buffs);
export const ACTION_PROBABILITIES = Object.freeze({
  ...parsed,
  baseWeights: Object.freeze(parsed.baseWeights),
  biomeBuffs: Object.freeze(parsed.biomeBuffs),
});
export const DEFAULT_ACTION_WEIGHTS: ActionWeights = ACTION_PROBABILITIES.baseWeights;

/** The bundled V18 recipe needs no extra snapshot; explicit zero buffs are equivalent. */
export function isDefaultActionProbabilities(value: ActionProbabilities): boolean {
  return (
    ACTIONS.every(({ id }) => value.baseWeights[id] === ACTION_PROBABILITIES.baseWeights[id]) &&
    BIOME_PRESETS.every(({ id: biome }) =>
      ACTIONS.every(
        ({ id }) =>
          (value.biomeBuffs[biome][id] ?? 0) === (ACTION_PROBABILITIES.biomeBuffs[biome][id] ?? 0),
      ),
    )
  );
}

/** A buff of 0.5 means +50%; a zero base weight always stays disabled. */
export function actionWeightsForBiome(
  biome: BiomePresetId | null,
  distribution: ActionProbabilities = ACTION_PROBABILITIES,
): Record<ActionId, number> {
  const buffs = biome === null ? {} : distribution.biomeBuffs[biome];
  return Object.fromEntries(
    ACTIONS.map(({ id }) => [id, distribution.baseWeights[id] * (1 + (buffs[id] ?? 0))]),
  ) as Record<ActionId, number>;
}

/** Sorted bins keep draws independent of JSON key order. */
export function sampleFieldAction(weights: ActionWeights, draw: number): ActionId {
  const candidates = SELECTABLE_ACTIONS.map(({ id }) => id)
    .sort()
    .map((id) => ({ id, weight: weights[id] }))
    .filter(({ weight }) => weight > 0);
  const total = candidates.reduce((sum, { weight }) => sum + weight, 0);
  if (!(total > 0))
    throw new Error('Zum Würfeln muss mindestens ein Aktionsgewicht größer als 0 sein.');
  const target = draw * total;
  let cumulative = 0;
  for (const { id, weight } of candidates) {
    cumulative += weight;
    if (target < cumulative) return id;
  }
  // Subnormal weights can round the target onto the end of the last positive bin.
  return candidates.at(-1)!.id;
}
