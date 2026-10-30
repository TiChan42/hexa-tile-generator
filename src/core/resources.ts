import { randomAt } from './random';
import { actionWeightsForBiome, sampleFieldAction } from './action-probabilities';
import type { BiomePresetId } from './biomes';
import type { ActionProbabilities } from './action-probabilities';
export { DEFAULT_ACTION_WEIGHTS } from './action-probabilities';
import type { ActionId } from './types';

export const RESOURCE_IDS = ['scrap', 'gem', 'platinum', 'amethyst', 'gold'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export const RESOURCE_AMOUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const RESOURCE_RARITY_FACTOR = 3;

export function isResource(action: ActionId): action is ResourceId {
  return (RESOURCE_IDS as readonly string[]).includes(action);
}

/** Frozen V17 recipe: changes to global balancing must not alter imported output. */
const V17_ACTION_WEIGHTS: Readonly<Record<ActionId, number>> = Object.freeze({
  rotate: 10,
  shift: 10,
  event: 20,
  shop: 10,
  jump: 5,
  alb: 5,
  scrap: 24,
  gem: 24 / RESOURCE_RARITY_FACTOR,
  platinum: 24 / RESOURCE_RARITY_FACTOR ** 2,
  amethyst: 24 / RESOURCE_RARITY_FACTOR ** 3,
  gold: 12,
  none: 0,
  custom: 0,
});

export function resourceAmountWeight(amount: number): number {
  return RESOURCE_RARITY_FACTOR ** (1 - amount);
}

/** Independent quantity domain: changing material weights never shifts this draw. */
export function rollResourceAmount(seed: string, revision: number, fieldId: string): number {
  const total = RESOURCE_AMOUNTS.reduce((sum, amount) => sum + resourceAmountWeight(amount), 0);
  const target = randomAt(seed, 'resource-amount-v17', revision, fieldId) * total;
  let cumulative = 0;
  return RESOURCE_AMOUNTS.find((amount) => (cumulative += resourceAmountWeight(amount)) > target)!;
}

/** Initial generation and explicit rolls share balancing, with independent draw domains. */
export function initialFieldAction(
  seed: string,
  fieldId: string,
  biome: BiomePresetId | null = null,
  recipe?: 17,
  distribution?: ActionProbabilities,
): ActionId {
  return sampleFieldAction(
    recipe === 17 ? V17_ACTION_WEIGHTS : actionWeightsForBiome(biome, distribution),
    randomAt(seed, recipe === 17 ? 'initial-action-v17' : 'initial-action-v18', fieldId),
  );
}
