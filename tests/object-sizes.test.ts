import { describe, expect, it } from 'vitest';
import {
  applyBiomePreset,
  BIOME_PRESETS,
  biomeObjectSizeProfiles,
  buildDecorations,
  buildUntouchedGrid,
  configSchema,
  createSeededProject,
  decorationClearsBorder,
  decorationScale,
  decorationSlots,
  defaultConfig,
  defaultObjectSizeProfiles,
  generateTile,
  migrateConfig,
  objectSizeMultiplier,
  randomizeBiomePreset,
} from '../src/core';
import { DECORATION_CATALOG, DECORATION_KINDS } from '../src/core/objects';
import { ASSET_LIBRARY, normalizeVoxelModel } from '../src/render/voxels';
import frozenV15 from './fixtures/v15.json' with { type: 'json' };

describe('species proportions and individual size draws', () => {
  it('keeps even small trees taller than large undergrowth and stones at their actual occupied aspect ratios', () => {
    const profiles = defaultObjectSizeProfiles();
    const bounds = ASSET_LIBRARY.map((model) => {
      const normalized = normalizeVoxelModel(model);
      const height =
        (Math.max(...model.voxels.map((voxel) => voxel[1])) - normalized.pivot[1] + 1) *
        normalized.scale;
      const rule = profiles[model.id as keyof typeof profiles];
      return {
        kind: model.id,
        min: height * rule.scale * (1 - rule.variation),
        max: height * rule.scale * (1 + rule.variation),
      };
    });
    const treeIds = DECORATION_CATALOG.filter(({ group }) => group === 'Bäume').map(
      ({ kind }) => kind,
    );
    const trees = bounds.filter(({ kind }) => treeIds.includes(kind as (typeof treeIds)[number]));
    const small = bounds.filter(({ kind }) =>
      ['bush', 'fern', 'grass', 'flowers', 'mushrooms', 'rock', 'log', 'stump'].includes(kind),
    );
    expect(Math.min(...trees.map(({ min }) => min))).toBeGreaterThan(
      Math.max(...small.map(({ max }) => max)) * 1.5,
    );
    const fresh = defaultObjectSizeProfiles();
    fresh.tree.scale = 3;
    expect(defaultObjectSizeProfiles()).toEqual(profiles);
  });

  it.each(DECORATION_KINDS)(
    '%s uses bounded, repeatable independent draws and zero variation has exact base size',
    (kind) => {
      const config = structuredClone(defaultConfig);
      const profile = config.decoration.sizeProfiles[kind];
      const draws = Array.from({ length: 100 }, (_, index) =>
        objectSizeMultiplier(config, kind, `object-${index}`),
      );
      expect(new Set(draws).size).toBeGreaterThan(95);
      expect(Math.min(...draws)).toBeGreaterThanOrEqual(profile.scale * (1 - profile.variation));
      expect(Math.max(...draws)).toBeLessThanOrEqual(profile.scale * (1 + profile.variation));
      expect(objectSizeMultiplier(config, kind, 'object-0')).toBe(draws[0]);
      expect(objectSizeMultiplier(config, kind, 'seed-object:object-0')).toBe(draws[0]);
      config.actions.weights.event = 0;
      config.actions.revision++;
      config.terrain.scale = 10;
      config.decoration.colorProfiles.trees.enabled = false;
      expect(objectSizeMultiplier(config, kind, 'object-0')).toBe(draws[0]);
      profile.variation = 0;
      expect(objectSizeMultiplier(config, kind, 'object-0')).toBe(profile.scale);
    },
  );

  it('changes only the chosen species sizes while preserving layout, IDs, placements, colors and other species', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.species = ['pine', 'mushrooms'];
    const before = generateTile(config);
    config.decoration.sizeProfiles.pine.scale *= 1.3;
    config.decoration.sizeProfiles.pine.variation = 0;
    const after = generateTile(config);
    const { decorations: oldObjects, ...oldLayout } = before;
    const { decorations: newObjects, ...newLayout } = after;
    expect(newLayout).toEqual(oldLayout);
    expect(
      newObjects.map(({ scale, ...object }) => {
        void scale;
        return object;
      }),
    ).toEqual(
      oldObjects.map(({ scale, ...object }) => {
        void scale;
        return object;
      }),
    );
    expect(newObjects.some((object) => object.kind === 'pine')).toBe(true);
    for (const object of newObjects) {
      const original = oldObjects.find(({ id }) => id === object.id)!;
      if (object.kind === 'pine') expect(object.scale).not.toBe(original.scale);
      else expect(object).toEqual(original);
    }
  });

  it('freezes a seed recipe without multiplying the profile or variation twice', () => {
    const config = createSeededProject('wald-123');
    const tile = generateTile(config);
    expect(tile.decorations.length).toBeGreaterThan(0);
    expect(tile.decorations).toHaveLength(config.decoration.placements.length);
    for (const object of tile.decorations) {
      expect(config.decoration.placements.find(({ id }) => id === object.id)!.scale).toBe(0.7);
      expect(object.scale).toBeCloseTo(
        decorationScale(config, object.kind, object.id.slice('seed-object:'.length)),
        12,
      );
    }
  });

  it('uses the complete effective footprint at borders, retains conflicting saved objects and restores them', () => {
    const config = structuredClone(defaultConfig);
    config.border.enabled = true;
    config.border.width = 0.06;
    config.decoration.density = 0;
    config.decoration.sizeProfiles.tree = { scale: 0.2, variation: 0 };
    const cells = buildUntouchedGrid(config.grid);
    const large = structuredClone(config);
    large.decoration.sizeProfiles.tree.scale = 3;
    const candidate = cells
      .flatMap((cell) => decorationSlots(cell, config.grid).map((slot) => ({ cell, slot })))
      .find(
        ({ slot }) =>
          decorationClearsBorder(
            config,
            slot.position,
            decorationScale(config, 'tree', 'saved', 0.8),
            0,
          ) &&
          !decorationClearsBorder(
            large,
            slot.position,
            decorationScale(large, 'tree', 'saved', 0.8),
            0,
          ),
      );
    expect(candidate).toBeDefined();
    config.decoration.placements = [
      {
        id: 'saved',
        kind: 'tree',
        cellId: candidate!.cell.id,
        offset: candidate!.slot.offset,
        scale: 0.8,
        rotation: 0,
      },
    ];
    large.decoration.placements = structuredClone(config.decoration.placements);
    expect(buildDecorations(config, cells, []).decorations).toHaveLength(1);
    expect(buildDecorations(large, cells, []).decorations).toHaveLength(0);
    expect(large.decoration.placements).toEqual(config.decoration.placements);
    large.border.enabled = false;
    expect(buildDecorations(large, cells, []).decorations).toHaveLength(1);
  });
});

describe('biome sizes and strict V16 migration', () => {
  it.each(BIOME_PRESETS)(
    '$id sets an editable, independent size profile on existing placements',
    ({ id }) => {
      const config = structuredClone(defaultConfig);
      const profile = applyBiomePreset(config, id).decoration.sizeProfiles;
      expect(profile).toEqual(biomeObjectSizeProfiles(id));
      expect(
        configSchema.parse({
          ...config,
          decoration: { ...config.decoration, sizeProfiles: profile },
        }),
      ).toBeDefined();
      const varied = randomizeBiomePreset(config, id, 'sizing-seed', true);
      expect(varied.decoration.sizeProfiles).toEqual(
        randomizeBiomePreset(config, id, 'sizing-seed', false).decoration.sizeProfiles,
      );
      expect(varied.decoration.sizeProfiles).not.toEqual(
        randomizeBiomePreset(config, id, 'another-sizing-seed', true).decoration.sizeProfiles,
      );
      expect(defaultConfig.decoration.sizeProfiles).toEqual(defaultObjectSizeProfiles());
    },
  );

  it('gives caves larger crystals and fungi while steppe trees stay smaller than woodland trees', () => {
    expect(biomeObjectSizeProfiles('pilzkristallgrotte').mushrooms.scale).toBeGreaterThan(
      biomeObjectSizeProfiles('mosslight').mushrooms.scale,
    );
    expect(biomeObjectSizeProfiles('kobaltkristallhoehle').crystal.scale).toBeGreaterThan(
      biomeObjectSizeProfiles('sonnensteppe').crystal.scale,
    );
    expect(biomeObjectSizeProfiles('sonnensteppe').tree.scale).toBeLessThan(
      biomeObjectSizeProfiles('mosslight').tree.scale,
    );
  });

  it('migrates V15 explicitly without changing stored shapes, object coordinates, rotations or personal scale', () => {
    const source = {
      ...structuredClone(frozenV15),
      decoration: {
        ...structuredClone(frozenV15.decoration),
        placements: [
          {
            id: 'historical-tree',
            kind: 'tree',
            cellId: 'saved-cell',
            offset: { x: 0.012, y: -0.007 },
            scale: 1.35,
            rotation: 137,
          },
        ],
      },
    };
    const original = JSON.stringify(source);
    const migrated = migrateConfig(source);
    expect(migrated.config).toEqual({
      ...source,
      schemaVersion: 16,
      generatorVersion: '16.0.0',
      decoration: { ...source.decoration, sizeProfiles: defaultObjectSizeProfiles() },
    });
    expect(migrated.notices.join(' ')).toContain('Objektproportionen');
    expect(migrateConfig(migrated.config).migrated).toBe(false);
    expect(JSON.stringify(source)).toBe(original);
    expect(migrateConfig(frozenV15).config.decoration.sizeProfiles).toEqual(
      defaultObjectSizeProfiles(),
    );
    expect(() => configSchema.parse(frozenV15)).toThrow();
    expect(() =>
      migrateConfig({
        ...frozenV15,
        decoration: { ...frozenV15.decoration, sizeProfiles: defaultObjectSizeProfiles() },
      }),
    ).toThrow();
  });

  it('rejects missing and unknown species, malformed rules, negative variation and non-finite sizes', () => {
    for (const rule of [
      { scale: 0, variation: 0.2 },
      { scale: 3.1, variation: 0.2 },
      { scale: 1, variation: -0.1 },
      { scale: 1, variation: 0.6 },
      { scale: Infinity, variation: 0 },
      { scale: 1, variation: NaN },
      { scale: 1, variation: 0, extra: true },
    ]) {
      const config = structuredClone(defaultConfig);
      expect(() =>
        configSchema.parse({
          ...config,
          decoration: {
            ...config.decoration,
            sizeProfiles: { ...config.decoration.sizeProfiles, tree: rule },
          },
        }),
      ).toThrow();
    }
    const config = structuredClone(defaultConfig);
    const { tree, ...missing } = config.decoration.sizeProfiles;
    void tree;
    for (const invalid of [
      missing,
      { ...config.decoration.sizeProfiles, unknown: { scale: 1, variation: 0 } },
      undefined,
    ])
      expect(() =>
        configSchema.parse({
          ...config,
          decoration: { ...config.decoration, sizeProfiles: invalid },
        }),
      ).toThrow();
  });
});
