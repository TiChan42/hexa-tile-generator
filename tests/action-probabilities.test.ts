import { describe, expect, it } from 'vitest';
import {
  ACTION_PROBABILITIES,
  ACTIONS,
  BIOME_PRESETS,
  DEFAULT_ACTION_WEIGHTS,
  actionProbabilitiesSchema,
  actionWeightsForBiome,
  applyBiomePreset,
  configSchema,
  createSeededProject,
  defaultConfig,
  generateTile,
  migrateConfig,
  randomAt,
  randomizeBiomePreset,
  rollFieldActions,
} from '../src/core';
import probabilities from '../src/core/action-probabilities.json';
import type { ActionId } from '../src/core';

const legacyWeights = {
  rotate: 10,
  shift: 10,
  event: 20,
  shop: 10,
  jump: 5,
  alb: 5,
  scrap: 24,
  gem: 8,
  platinum: 24 / 9,
  amethyst: 24 / 27,
  gold: 12,
  none: 0,
  custom: 0,
};

describe('global action balance and biome buffs', () => {
  it('validates one complete JSON source and keeps every nested value immutable', () => {
    expect(actionProbabilitiesSchema.parse(probabilities)).toEqual(ACTION_PROBABILITIES);
    expect(DEFAULT_ACTION_WEIGHTS).toBe(ACTION_PROBABILITIES.baseWeights);
    expect(Object.isFrozen(ACTION_PROBABILITIES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ACTION_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(ACTION_PROBABILITIES.biomeBuffs)).toBe(true);
    for (const buffs of Object.values(ACTION_PROBABILITIES.biomeBuffs))
      expect(Object.isFrozen(buffs)).toBe(true);
    const missingAction = structuredClone(probabilities) as {
      baseWeights: Partial<typeof probabilities.baseWeights>;
    };
    delete missingAction.baseWeights.event;
    const missingBiome = structuredClone(probabilities) as {
      biomeBuffs: Partial<typeof probabilities.biomeBuffs>;
    };
    delete missingBiome.biomeBuffs.mosslight;
    for (const input of [
      missingAction,
      missingBiome,
      { ...probabilities, version: 2 },
      { ...probabilities, unexpected: true },
      { ...probabilities, baseWeights: { ...probabilities.baseWeights, unknown: 1 } },
      {
        ...probabilities,
        baseWeights: Object.fromEntries(ACTIONS.map(({ id }) => [id, id === 'custom' ? 100 : 0])),
      },
      ...[-1, 101, Infinity, NaN, '10'].map((weight) => ({
        ...probabilities,
        baseWeights: { ...probabilities.baseWeights, event: weight },
      })),
      { ...probabilities, biomeBuffs: { ...probabilities.biomeBuffs, unknown: {} } },
      ...[-1, Infinity, '0.5'].map((buff) => ({
        ...probabilities,
        biomeBuffs: { ...probabilities.biomeBuffs, mosslight: { event: buff } },
      })),
      { ...probabilities, biomeBuffs: { ...probabilities.biomeBuffs, mosslight: { unknown: 1 } } },
    ])
      expect(actionProbabilitiesSchema.safeParse(input).success).toBe(false);
  });

  it.each(BIOME_PRESETS)(
    '$id applies only fixed positive buffs without changing the base',
    ({ id }) => {
      const before = structuredClone(ACTION_PROBABILITIES);
      const effective = actionWeightsForBiome(id);
      const buffs = ACTION_PROBABILITIES.biomeBuffs[id];
      for (const action of ACTIONS) {
        expect(effective[action.id]).toBe(
          DEFAULT_ACTION_WEIGHTS[action.id] * (1 + (buffs[action.id] ?? 0)),
        );
        expect(effective[action.id]).toBeGreaterThanOrEqual(DEFAULT_ACTION_WEIGHTS[action.id]);
      }
      for (const seed of ['first', 'second', 'third']) {
        const config = { ...structuredClone(defaultConfig), seed };
        const fixed = applyBiomePreset(config, id);
        const varied = randomizeBiomePreset(config, id, seed, true);
        expect(fixed.actions.biome).toBe(id);
        expect(varied.actions).toEqual(fixed.actions);
        expect(actionWeightsForBiome(varied.actions.biome)).toEqual(effective);
      }
      effective.event = 0;
      expect(ACTION_PROBABILITIES).toEqual(before);
      expect(actionWeightsForBiome(null)).toEqual(DEFAULT_ACTION_WEIGHTS);
    },
  );

  it('uses the generated biome in complete seed recipes and persists no per-project weights', () => {
    const config = createSeededProject('wald-123', {
      biome: {
        id: 'amethysthain',
        mode: 'fixed',
        variationSeed: 'ignored',
        continuousNoise: false,
      },
    });
    expect(config.actions).toEqual({ biome: 'amethysthain', revision: 0 });
    expect(configSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    const tile = generateTile(config),
      rolled = rollFieldActions(config, tile);
    expect(rolled.actions).toEqual({ biome: 'amethysthain', revision: 1 });
    expect(DEFAULT_ACTION_WEIGHTS).toEqual(probabilities.baseWeights);
  });

  it('strictly migrates V17 weights to global settings while retaining stored actions and old initial draws', () => {
    const old = {
      ...structuredClone(defaultConfig),
      schemaVersion: 17,
      generatorVersion: '17.0.0',
      actions: { weights: { ...legacyWeights, gold: 100 }, revision: 12 },
    };
    old.paths.fields = [
      { id: 'center', cellIds: [], action: 'gold', resourceAmount: 7, label: 'Bewahren' },
    ];
    const before = structuredClone(old);
    const result = migrateConfig(old);
    expect(result.migrated).toBe(true);
    expect(result.config).toEqual({
      ...old,
      schemaVersion: 18,
      generatorVersion: '18.0.0',
      actionRecipe: 17,
      actions: { biome: null, revision: 12 },
    });
    expect(result.notices.join(' ')).toContain('bisherige Projektgewichte entfallen');
    const tile = generateTile(result.config);
    expect(tile.fields[0]).toMatchObject({ action: 'gold', resourceAmount: 7, label: 'Bewahren' });
    // Historical defaults are independent of both the old explicit-roll weights and future JSON edits.
    const candidates = Object.entries(legacyWeights).sort(([a], [b]) => a.localeCompare(b));
    const total = candidates.reduce((sum, [, weight]) => sum + weight, 0);
    for (const field of tile.fields.filter((field) => !field.isCenter)) {
      const target = randomAt(old.seed, 'initial-action-v17', field.id) * total;
      let cumulative = 0;
      const expected = candidates.find(
        ([, weight]) => (cumulative += weight) > target,
      )![0] as ActionId;
      expect(field.action).toBe(expected);
    }
    expect(old).toEqual(before);
    expect(migrateConfig(result.config).migrated).toBe(false);
    expect(migrateConfig({ ...old, actionRecipe: 16 }).config.actionRecipe).toBe(16);
    for (const invalid of [
      { ...old, actions: { biome: 'mosslight', revision: 0 } },
      { ...old, actions: { ...old.actions, extra: true } },
      { ...old, actions: { ...old.actions, weights: { ...legacyWeights, event: -1 } } },
      { ...old, actionRecipe: 17 },
    ])
      expect(() => migrateConfig(invalid)).toThrow();
  });
});
