import { preV18Actions } from './fixtures/migration';
import { describe, expect, it } from 'vitest';
import {
  configSchema,
  decorationColorVariant,
  defaultConfig,
  defaultObjectColorProfiles,
  migrateConfig,
} from '../src/core';
import { ASSET_LIBRARY, voxelPalette } from '../src/render/voxels';

describe('seeded object color profiles', () => {
  it('varies foliage and mushroom caps reproducibly while preserving trunks and source models', () => {
    const config = structuredClone(defaultConfig);
    const original = structuredClone(ASSET_LIBRARY);
    for (const kind of ['tree', 'pine', 'oak', 'birch', 'willow', 'maple', 'mushrooms'] as const) {
      const model = ASSET_LIBRARY.find((asset) => asset.id === kind)!;
      const variants = Array.from({ length: 80 }, (_, index) =>
        decorationColorVariant(config, kind, `object-${index}`),
      );
      expect(new Set(variants.map((variant) => variant!.id)).size).toBe(4);
      expect(variants[0]).toEqual(decorationColorVariant(config, kind, 'object-0'));
      const palette = voxelPalette(model, variants[0]);
      model.paletteRoles!.forEach((role, index) => {
        if (role === 'trunk' || role === 'neutral')
          expect(palette[index]).toBe(model.palette[index]);
        else expect(palette[index]).not.toBe(model.palette[index]);
      });
    }
    expect(ASSET_LIBRARY).toEqual(original);
    for (const kind of ['rock', 'crystal', 'fern'] as const)
      expect(decorationColorVariant(config, kind, 'object-0')).toBeNull();
    const custom = { ...ASSET_LIBRARY[0]!, id: 'custom', paletteRoles: undefined };
    expect(voxelPalette(custom, { id: 'v', foliage: ['#111111', '#222222', '#333333'] })).toEqual(
      custom.palette,
    );
  });

  it('isolates profile draws from geometry settings and honors disabled profiles', () => {
    const config = structuredClone(defaultConfig);
    const variant = decorationColorVariant(config, 'tree', 'same-object');
    config.grid.divisions = 24;
    config.terrain.scale = 10;
    config.actions.revision = 14;
    expect(decorationColorVariant(config, 'tree', 'same-object')).toEqual(variant);
    config.decoration.colorProfiles = defaultObjectColorProfiles(false);
    expect(decorationColorVariant(config, 'tree', 'same-object')).toBeNull();
    expect(decorationColorVariant(config, 'mushrooms', 'same-object')).toBeNull();
    config.decoration.colorProfiles.trees.enabled = true;
    config.decoration.colorProfiles.trees.profiles = [];
    expect(decorationColorVariant(config, 'tree', 'same-object')).toBeNull();
  });

  it('strictly validates bounded, unique palettes and rejects missing current settings', () => {
    const profiles = structuredClone(defaultConfig.decoration.colorProfiles);
    const parse = (colorProfiles: unknown) =>
      configSchema.parse({
        ...defaultConfig,
        decoration: { ...defaultConfig.decoration, colorProfiles },
      });
    expect(parse(profiles).decoration.colorProfiles).toEqual(profiles);
    for (const invalid of [
      undefined,
      { ...profiles, extra: true },
      { ...profiles, trees: { ...profiles.trees, enabled: 'true' } },
      { ...profiles, trees: { ...profiles.trees, profiles: [] } },
      {
        ...profiles,
        trees: { ...profiles.trees, profiles: Array(9).fill(profiles.trees.profiles[0]) },
      },
      {
        ...profiles,
        trees: {
          ...profiles.trees,
          profiles: [profiles.trees.profiles[0], profiles.trees.profiles[0]],
        },
      },
      {
        ...profiles,
        mushrooms: {
          ...profiles.mushrooms,
          profiles: [{ id: 'a', name: 'A', cap: ['#fff', '#ffffff', '#000000'] }],
        },
      },
    ])
      expect(() => parse(invalid)).toThrow();
  });

  it.each(['11.0.0', '11.1.0'])(
    'migrates %s with disabled profiles and no changes to saved materials',
    (generatorVersion) => {
      const { colorProfiles, sizeProfiles, ...decoration } = structuredClone(
        defaultConfig.decoration,
      );
      void colorProfiles;
      void sizeProfiles;
      const legacy = {
        ...structuredClone(defaultConfig),
        actions: preV18Actions(),
        schemaVersion: 11,
        generatorVersion,
        decoration,
      };
      const before = structuredClone(legacy);
      const migrated = migrateConfig(legacy);
      expect(migrated.config).toEqual({
        ...legacy,
        legacyLayout: true,
        schemaVersion: 19,
        actions: defaultConfig.actions,
        actionRecipe: 16,
        generatorVersion: '19.0.0',
        decoration: {
          ...decoration,
          sizeProfiles: defaultConfig.decoration.sizeProfiles,
          colorProfiles: defaultObjectColorProfiles(false),
        },
      });
      expect(legacy).toEqual(before);
      expect(() =>
        migrateConfig({
          ...legacy,
          decoration: { ...decoration, colorProfiles: defaultObjectColorProfiles() },
        }),
      ).toThrow();
    },
  );
});
