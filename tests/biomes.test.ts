import { describe, expect, it } from 'vitest';
import {
  applyBiomePreset,
  BIOME_PRESETS,
  configSchema,
  defaultConfig,
  randomizeBiomePreset,
  type BiomePresetId,
} from '../src/core';

describe('biome recipes', () => {
  it.each(BIOME_PRESETS)(
    '$id applies complete valid palettes without changing the layout or seed',
    ({ id, species }) => {
      const config = structuredClone(defaultConfig);
      config.decoration.density = 0;
      config.decoration.placements = [
        {
          id: 'm',
          kind: 'mushrooms',
          cellId: 'h:5:0',
          offset: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
        },
        { id: 't', kind: 'tree', cellId: 'h:6:0', offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
      ];
      const before = structuredClone(config);
      const result = applyBiomePreset(config, id);
      expect(configSchema.parse(result)).toEqual(result);
      expect(result.seed).toBe(config.seed);
      expect(result.center).toEqual(config.center);
      expect(result.grid).toEqual(config.grid);
      expect(result.paths.fields).toEqual(config.paths.fields);
      expect(result.terrain.noise).toEqual(config.terrain.noise);
      expect(result.terrain.elevation).toBe(config.terrain.elevation);
      expect(result.decoration.species).toEqual(species);
      expect(result.decoration.density).toBeGreaterThan(0);
      expect(
        result.decoration.placements.every((object) =>
          result.decoration.species.includes(object.kind),
        ),
      ).toBe(true);
      expect(config).toEqual(before);
    },
  );

  it('keeps seed variations reproducible, ecologically restricted and independent of continuous relief', () => {
    const config = structuredClone(defaultConfig);
    const results = BIOME_PRESETS.map(({ id }) => {
      const first = randomizeBiomePreset(config, id, 'variation-one', true);
      expect(first).toEqual(randomizeBiomePreset(config, id, 'variation-one', true));
      expect(first.terrain.texture).toEqual(config.terrain.texture);
      expect(first.terrain.scale).toBe(config.terrain.scale);
      expect(first.terrain.elevation).toBe(config.terrain.elevation);
      expect(first.terrain.terraces).toBe(config.terrain.terraces);
      expect(first.terrain.gradient).not.toEqual(
        randomizeBiomePreset(config, id, 'variation-two', true).terrain.gradient,
      );
      const independent = randomizeBiomePreset(config, id, 'variation-one', false);
      expect(independent.terrain.scale).not.toBe(config.terrain.scale);
      expect(configSchema.parse(independent)).toEqual(independent);
      return first;
    });
    expect(
      results
        .find((result) => result.name.startsWith('Pilz-Kristallgrotte'))!
        .decoration.species.every((kind) => ['mushrooms', 'crystal', 'quartz'].includes(kind)),
    ).toBe(true);
    expect(
      results
        .find((result) => result.name.startsWith('Kobaltkristallhöhle'))!
        .decoration.species.every((kind) => ['crystal', 'quartz'].includes(kind)),
    ).toBe(true);
    expect(() => applyBiomePreset(config, 'missing' as BiomePresetId)).toThrow(/Unbekannt/);
    expect(() => randomizeBiomePreset(config, 'missing' as BiomePresetId, 'seed', false)).toThrow(
      /Unbekannt/,
    );
  });
});
