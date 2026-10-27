import { DECORATION_KINDS } from './objects';
import { randomAt } from './random';
import type { DecorationKind, TileConfig } from './types';

export interface ObjectSizeProfile {
  /** Multiplier of the normalized model footprint; the model's aspect ratio stays intact. */
  scale: number;
  /** Symmetric fractional variation around the base size. */
  variation: number;
}
export type ObjectSizeProfiles = Record<DecorationKind, ObjectSizeProfile>;
export const DEFAULT_DECORATION_SCALE = 0.7;

const PROPORTIONS: ObjectSizeProfiles = {
  tree: { scale: 1.65, variation: 0.2 },
  pine: { scale: 1.55, variation: 0.2 },
  oak: { scale: 1.75, variation: 0.16 },
  birch: { scale: 1.5, variation: 0.18 },
  willow: { scale: 1.8, variation: 0.18 },
  maple: { scale: 1.7, variation: 0.18 },
  deadTree: { scale: 1.3, variation: 0.22 },
  bush: { scale: 0.65, variation: 0.2 },
  fern: { scale: 0.42, variation: 0.2 },
  grass: { scale: 0.32, variation: 0.25 },
  flowers: { scale: 0.34, variation: 0.22 },
  mushrooms: { scale: 0.35, variation: 0.25 },
  reeds: { scale: 0.55, variation: 0.22 },
  log: { scale: 0.65, variation: 0.18 },
  stump: { scale: 0.48, variation: 0.2 },
  rock: { scale: 0.6, variation: 0.25 },
  crystal: { scale: 0.65, variation: 0.25 },
  quartz: { scale: 0.65, variation: 0.25 },
};

export function defaultObjectSizeProfiles(): ObjectSizeProfiles {
  return Object.fromEntries(
    DECORATION_KINDS.map((kind) => [kind, { ...PROPORTIONS[kind] }]),
  ) as ObjectSizeProfiles;
}

/** Frozen seed objects keep the same draw as their procedural source. Other domains stay independent. */
export function objectSizeMultiplier(config: TileConfig, kind: DecorationKind, id: string): number {
  const sourceId = id.startsWith('seed-object:') ? id.slice('seed-object:'.length) : id;
  const { scale, variation } = config.decoration.sizeProfiles[kind];
  const draw = randomAt(config.seed, 'object-size-variation-v16', kind, sourceId);
  return scale * (1 + variation * (2 * draw - 1));
}

export function decorationScale(
  config: TileConfig,
  kind: DecorationKind,
  id: string,
  individualScale = DEFAULT_DECORATION_SCALE,
): number {
  return (individualScale * objectSizeMultiplier(config, kind, id)) / config.grid.divisions;
}
