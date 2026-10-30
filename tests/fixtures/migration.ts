import frozenV15 from './v15.json' with { type: 'json' };
import { defaultConfig } from '../../src/core/config';
import type { TileConfig } from '../../src/core/types';

/** Fields added after the frozen V1–V10 formats, asserted independently of the migrator. */
export function v13MigrationAdditions(source: {
  seed: string;
  terrain: object;
  decoration: object;
  actions?: { revision: number };
}) {
  const profiles = structuredClone(defaultConfig.decoration.colorProfiles);
  profiles.trees.enabled = false;
  profiles.mushrooms.enabled = false;
  return {
    legacyLayout: true as const,
    schemaVersion: 18,
    actionRecipe: 16,
    actions: { biome: null, revision: source.actions?.revision ?? 0 },
    generatorVersion: '18.0.0',
    terrain: { ...source.terrain, noise: { seed: source.seed, origin: { x: 0, y: 0 } } },
    decoration: {
      ...source.decoration,
      colorProfiles: profiles,
      sizeProfiles: structuredClone(defaultConfig.decoration.sizeProfiles),
    },
  };
}

/** Build historical test inputs without leaking fields introduced by V11/V12. */
export function preV11Materials(source: TileConfig) {
  const { noise, ...terrain } = source.terrain;
  const { colorProfiles, sizeProfiles, ...decoration } = source.decoration;
  void noise;
  void colorProfiles;
  void sizeProfiles;
  return { terrain, decoration };
}

/** Historical project weights predate the global V18 balance. */
export function preV18Actions(revision = 0) {
  return { weights: structuredClone(frozenV15.actions.weights), revision };
}
