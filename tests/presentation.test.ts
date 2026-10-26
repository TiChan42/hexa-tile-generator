import { expect, it } from 'vitest';
import { defaultConfig, generateTile } from '../src/core';
import { generationKey } from '../src/editor/generationKey';
import { fieldEditingKey, interactionKey, presentFieldEdits } from '../src/editor/presentation';

it('keeps field metadata immediate without mutating generated geometry', () => {
  const config = structuredClone(defaultConfig),
    tile = generateTile(config),
    before = structuredClone(tile),
    field = tile.fields[1];
  expect(presentFieldEdits(tile, config)).toBe(tile);
  config.paths.fields = [
    { id: field.id, cellIds: [], action: field.action, color: field.color, label: field.label },
  ];
  expect(presentFieldEdits(tile, config)).toBe(tile);
  Object.assign(config.paths.fields[0], {
    action: 'shop',
    color: '#aa8899',
    label: 'Tippen ohne verlorene Zeichen',
  });
  const shown = presentFieldEdits(tile, config);
  expect(shown.fields[1]).toMatchObject({
    action: 'shop',
    color: '#aa8899',
    label: 'Tippen ohne verlorene Zeichen',
  });
  expect(shown.fields[0]).toBe(tile.fields[0]);
  expect(
    shown.cells
      .filter((cell) => cell.fieldId === field.id)
      .every((cell) => cell.color === '#aa8899'),
  ).toBe(true);
  expect(shown.cells.find((cell) => !cell.fieldId)).toBe(tile.cells.find((cell) => !cell.fieldId));
  expect(shown.fields[1].cellIds).toBe(field.cellIds);
  expect(shown.connections).toBe(tile.connections);
  expect(tile).toEqual(before);
  delete config.paths.fields[0].color;
  delete config.paths.fields[0].label;
  expect(presentFieldEdits(tile, config).fields[1]).toMatchObject({
    color: field.color,
    label: field.label,
    action: 'shop',
  });
});
it('allows picking through presentation edits and blocks it when cell geometry can change', () => {
  const config = structuredClone(defaultConfig),
    key = interactionKey(config);
  config.paths.fields = [
    { id: 'color-only', cellIds: [], action: 'event', color: '#abcdef', label: 'A' },
  ];
  config.decoration.density = 1;
  config.terrain.texture.strength = 0;
  config.paths.detail.pebbleDensity = 1;
  config.camera.zoom = 2;
  expect(interactionKey(config)).toBe(key);
  const generation = generationKey(config);
  config.paths.fields[0].label = 'AB';
  expect(generationKey(config)).toBe(generation);
  config.paths.fields[0].action = 'shop';
  expect(generationKey(config)).not.toBe(generation);
  for (const mutate of [
    (c: typeof config) => {
      c.seed = 'new';
    },
    (c: typeof config) => {
      c.grid.divisions = 20;
    },
    (c: typeof config) => {
      c.center.offset.x = 0.2;
    },
    (c: typeof config) => {
      c.terrain.elevation = 0.5;
    },
    (c: typeof config) => {
      c.paths.fieldCount = 20;
    },
    (c: typeof config) => {
      c.paths.fields[0].cellIds = ['new-shape'];
    },
  ]) {
    const changed = structuredClone(config);
    mutate(changed);
    expect(interactionKey(changed)).not.toBe(key);
  }
});

it('lets field-height controls accept successive edits while surface picking waits for recomputation', () => {
  const config = structuredClone(defaultConfig),
    before = interactionKey(config),
    editing = fieldEditingKey(config);
  config.paths.fields = [
    {
      id: 'auto:lane:0:0',
      cellIds: [],
      action: 'event',
      heightOffset: 0.2,
      heightMode: 'terraced',
    },
  ];
  config.paths.heightMode = 'terraced';
  expect(interactionKey(config)).not.toBe(before);
  expect(fieldEditingKey(config)).toBe(editing);
  config.paths.fields[0].heightOffset = 0.25;
  expect(fieldEditingKey(config)).toBe(editing);
  config.center.offset.x = 0.2;
  expect(fieldEditingKey(config)).not.toBe(editing);
});
