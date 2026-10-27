import { expect, test } from '@playwright/test';
import { defaultConfig, generateTile } from '../../src/core';
import type { GeneratedTile, TileConfig } from '../../src/core';

function topology(tile: GeneratedTile) {
  return {
    fields: tile.fields.map(({ id, cellIds, color, action, label }) => ({
      id,
      cellIds: [...cellIds].sort(),
      color,
      action,
      label,
    })),
    cells: tile.cells.map(({ id, fieldId }) => ({ id, fieldId })),
    mouths: tile.entrances.map(({ side, cellIds, fieldId }) => ({ side, cellIds, fieldId })),
  };
}

for (const kind of ['hex', 'diamond'] as const) {
  test(`${kind} path choices match between the browser and Node at symmetric geometry ties`, async ({
    page,
  }) => {
    // A same-origin source document permits pure browser-module checks without a renderer.
    await page.goto('/src/core/index.ts');
    for (const seed of [defaultConfig.seed, 'sparse-v15-0', 'sparse-v15-34']) {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.seed = seed;
      config.decoration.enabled = false;
      const expected = topology(generateTile(config));
      const browser = await page.evaluate(async (value) => {
        const sourcePath = '/src/core/index.ts';
        const core = (await import(sourcePath)) as {
          generateTile(config: TileConfig): GeneratedTile;
        };
        return core.generateTile(value);
      }, config);
      expect(topology(browser)).toEqual(expected);
    }
  });
}
