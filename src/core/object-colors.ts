import { randomAt } from './random';
import type { DecorationKind, MushroomColorProfile, TileConfig, TreeColorProfile } from './types';

export const DEFAULT_TREE_COLOR_PROFILES: TreeColorProfile[] = [
  { id: 'tree-evergreen', name: 'Immergrün', foliage: ['#31523b', '#5a7a4b', '#94a65f'] },
  { id: 'tree-autumn', name: 'Herbstlaub', foliage: ['#8a4431', '#bd6836', '#e2a44b'] },
  { id: 'tree-jade', name: 'Jade', foliage: ['#275a50', '#3d8c68', '#93ba78'] },
  { id: 'tree-mist', name: 'Nebelblau', foliage: ['#3c5366', '#587b86', '#a2b4a2'] },
];

export const DEFAULT_MUSHROOM_COLOR_PROFILES: MushroomColorProfile[] = [
  { id: 'mushroom-coral', name: 'Koralle', cap: ['#8e453c', '#ce634e', '#f0ac79'] },
  { id: 'mushroom-amethyst', name: 'Amethyst', cap: ['#533e70', '#8b61a8', '#c9a0d9'] },
  { id: 'mushroom-azure', name: 'Azur', cap: ['#315d82', '#4d91b4', '#aed6df'] },
  { id: 'mushroom-gold', name: 'Gold', cap: ['#80572b', '#c08b36', '#efd18b'] },
];

export function defaultObjectColorProfiles(
  enabled = true,
): TileConfig['decoration']['colorProfiles'] {
  return {
    trees: { enabled, profiles: structuredClone(DEFAULT_TREE_COLOR_PROFILES) },
    mushrooms: { enabled, profiles: structuredClone(DEFAULT_MUSHROOM_COLOR_PROFILES) },
  };
}

const TREE_KINDS = new Set<DecorationKind>(['tree', 'pine', 'oak', 'birch', 'willow', 'maple']);

export interface DecorationColorVariant {
  id: string;
  foliage?: [string, string, string];
  mushroomCap?: [string, string, string];
}

/** Select a stable, seed-based palette for one placed object without changing its geometry. */
export function decorationColorVariant(
  config: TileConfig,
  kind: DecorationKind,
  objectId: string,
): DecorationColorVariant | null {
  const tree = TREE_KINDS.has(kind);
  if (tree) {
    const settings = config.decoration.colorProfiles.trees;
    if (!settings.enabled || !settings.profiles.length) return null;
    const index = Math.floor(
      randomAt(config.seed, 'object-color-tree-v1', objectId) * settings.profiles.length,
    );
    const profile = settings.profiles[index]!;
    return { id: profile.id, foliage: profile.foliage };
  }
  if (kind === 'mushrooms') {
    const settings = config.decoration.colorProfiles.mushrooms;
    if (!settings.enabled || !settings.profiles.length) return null;
    const index = Math.floor(
      randomAt(config.seed, 'object-color-mushroom-v1', objectId) * settings.profiles.length,
    );
    const profile = settings.profiles[index]!;
    return { id: profile.id, mushroomCap: profile.cap };
  }
  return null;
}
