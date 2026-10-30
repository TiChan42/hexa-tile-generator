import { describe, expect, it } from 'vitest';
import {
  configSchema,
  defaultConfig,
  DEFAULT_ACTION_WEIGHTS,
  generateTile,
  initialFieldAction,
  isResource,
  migrateConfig,
  prepareFieldShapeEdit,
  prepareCenterEdit,
  RESOURCE_AMOUNTS,
  RESOURCE_IDS,
  resourceAmountWeight,
  rollFieldActions,
  rollResourceAmount,
} from '../src/core';
import type { ActionId } from '../src/core';
import { presentFieldEdits } from '../src/editor/presentation';
import { renderGeometryKey, renderSurfaceKey } from '../src/render/state';

describe('resource rewards and exponential rarity', () => {
  it('uses an exponential material hierarchy with gold independently weighted', () => {
    const { scrap, gem, platinum, amethyst, gold } = DEFAULT_ACTION_WEIGHTS;
    expect(scrap / gem).toBeCloseTo(3);
    expect(gem / platinum).toBeCloseTo(3);
    expect(platinum / amethyst).toBeCloseTo(3);
    expect(gold).toBe(12);
    for (const amount of RESOURCE_AMOUNTS.slice(1))
      expect(resourceAmountWeight(amount - 1) / resourceAmountWeight(amount)).toBeCloseTo(3);
    expect(RESOURCE_IDS.every(isResource)).toBe(true);
    expect(isResource('event')).toBe(false);
  });
  it('samples amounts and materials with the intended decay, deterministically in independent domains', () => {
    const quantities = Array<number>(10).fill(0),
      materials = new Map<ActionId, number>();
    for (let i = 0; i < 30000; i++) {
      const id = `field-${i}`,
        amount = rollResourceAmount('rarity-test', 4, id),
        action = initialFieldAction('rarity-test', id);
      quantities[amount]++;
      materials.set(action, (materials.get(action) ?? 0) + 1);
    }
    for (let amount = 1; amount < 4; amount++) {
      expect(quantities[amount] / quantities[amount + 1]).toBeGreaterThan(2.6);
      expect(quantities[amount] / quantities[amount + 1]).toBeLessThan(3.4);
    }
    for (const [common, rare] of [
      ['scrap', 'gem'],
      ['gem', 'platinum'],
      ['platinum', 'amethyst'],
    ] as const) {
      expect(materials.get(common)! / materials.get(rare)!).toBeGreaterThan(2.5);
      expect(materials.get(common)! / materials.get(rare)!).toBeLessThan(3.5);
    }
    expect(materials.has('custom')).toBe(false);
    expect(rollResourceAmount('seed', 3, 'a')).toBe(rollResourceAmount('seed', 3, 'a'));
  });
  it('keeps quantity draws independent of biome, field ordering and old quantities', () => {
    const config = structuredClone(defaultConfig),
      tile = generateTile(config);
    const first = rollFieldActions(config, tile);
    config.actions.biome = 'kobaltkristallhoehle';
    config.paths.fields = first.paths.fields.map((field) => ({
      ...field,
      ...(isResource(field.action) ? { resourceAmount: 9 } : {}),
    }));
    const changed = rollFieldActions(config, { ...tile, fields: [...tile.fields].reverse() });
    for (const result of [first, changed]) {
      expect(result.paths.fields.some((field) => isResource(field.action))).toBe(true);
      for (const field of result.paths.fields) {
        expect(field.resourceAmount).toBe(
          isResource(field.action) ? rollResourceAmount(config.seed, 1, field.id) : undefined,
        );
      }
    }
  });
  it('validates quantities strictly and preserves them in field edits and immediate presentation', () => {
    const config = structuredClone(defaultConfig);
    config.paths.fields = [{ id: 'center', cellIds: [], action: 'gold', resourceAmount: 3 }];
    expect(configSchema.parse(config).paths.fields[0].resourceAmount).toBe(3);
    for (const amount of [0, 10, 1.5, Infinity, '3', null])
      expect(
        configSchema.safeParse({
          ...config,
          paths: {
            ...config.paths,
            fields: [{ ...config.paths.fields[0], resourceAmount: amount }],
          },
        }).success,
      ).toBe(false);
    expect(
      configSchema.safeParse({
        ...config,
        paths: { ...config.paths, fields: [{ ...config.paths.fields[0], action: 'event' }] },
      }).success,
    ).toBe(false);
    const tile = generateTile(config);
    config.paths.fields[0].resourceAmount = 9;
    const presented = presentFieldEdits(tile, config);
    expect(presented.fields[0].resourceAmount).toBe(9);
    expect(tile.fields[0].resourceAmount).toBe(3);
    expect(renderGeometryKey(presented, config, 0)).not.toBe(renderGeometryKey(tile, config, 0));
    expect(renderSurfaceKey(presented, config)).toBe(renderSurfaceKey(tile, config));
    const normal = tile.fields.find((field) => !field.isCenter)!;
    const frozen = prepareFieldShapeEdit(config, tile, normal.id, normal.cellIds);
    for (const field of tile.fields.filter((field) => !field.isCenter))
      expect(frozen.paths.fields.find((edit) => edit.id === field.id)?.resourceAmount).toBe(
        field.resourceAmount,
      );
    const resource = tile.fields.find((field) => !field.isCenter && isResource(field.action))!;
    config.paths.fields.push({
      id: resource.id,
      cellIds: [],
      action: resource.action,
      resourceAmount: 7,
    });
    const pending = prepareCenterEdit(config, tile, config.center);
    expect(pending.paths.fields.find((edit) => edit.id === resource.id)?.resourceAmount).toBe(7);
  });
  it('migrates V16 without rerolling fields or changing old recipes, and freezes its schema', () => {
    const old = {
      ...structuredClone(defaultConfig),
      schemaVersion: 16,
      generatorVersion: '16.0.0',
      actions: { weights: { ...DEFAULT_ACTION_WEIGHTS }, revision: 0 },
    };
    old.paths.fields = [{ id: 'center', cellIds: [], action: 'gold' }];
    const migrated = migrateConfig(old);
    expect(migrated.migrated).toBe(true);
    expect(migrated.config).toEqual({
      ...old,
      schemaVersion: 19,
      generatorVersion: '19.0.0',
      actionRecipe: 16,
      actions: { biome: null, revision: 0 },
    });
    expect(generateTile(migrated.config).fields[0].action).toBe('gold');
    expect(() =>
      migrateConfig({
        ...old,
        paths: { ...old.paths, fields: [{ ...old.paths.fields[0], resourceAmount: 2 }] },
      }),
    ).toThrow();
    expect(() => migrateConfig({ ...old, actionRecipe: 16 })).toThrow();
  });
});
