import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildUntouchedGrid,
  centralSideCells,
  clusterCompactness,
  defaultConfig,
  generateTile,
  hexagon,
  isConnectedSelection,
  migrateConfig,
  polygonArea,
} from '../src/core';
import { cellHasBody, longestThinChain } from '../src/core/organic-topology';
import type { GeneratedTile, TileConfig } from '../src/core';
import frozenV13 from './fixtures/v13.json' with { type: 'json' };

function geometryDigest(tile: GeneratedTile) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        cells: tile.cells.map(
          ({ id, polygon, surfacePolygons, neighbors, baseHeight, fieldId, color }) => ({
            id,
            polygon,
            surfacePolygons,
            neighbors,
            baseHeight,
            fieldId,
            color,
          }),
        ),
        fields: tile.fields,
        entrances: tile.entrances,
        center: tile.center,
        connections: tile.connections,
      }),
    )
    .digest('hex');
}

function assertOrganic(config: TileConfig) {
  const original = structuredClone(config);
  const tile = generateTile(config),
    cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
  expect(config).toEqual(original);
  expect(tile.warnings).toEqual([]);
  expect(tile.fields).toHaveLength(config.paths.fieldCount);
  expect(tile.stats.connected).toBe(true);
  expect(tile.cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0)).toBeCloseTo(
    polygonArea(hexagon()),
    9,
  );
  const normal = tile.fields.filter((field) => !field.isCenter);
  for (const field of normal) {
    expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
    expect(field.area).toBeGreaterThanOrEqual(1 / 16 - 1e-10);
    if (tile.entrances.some((entrance) => entrance.fieldId === field.id)) continue;
    expect(longestThinChain(new Set(field.cellIds), cells, config.grid.kind)).toBeLessThanOrEqual(
      2,
    );
    expect(clusterCompactness(new Set(field.cellIds), cells)).toBeLessThan(
      config.grid.kind === 'hex' ? 3.6 : 4.5,
    );
  }
  // The field network must still work when the center is removed: the pentagon is not its hub.
  const visited = new Set([normal[0]!.id]),
    queue = [normal[0]!.id];
  for (let index = 0; index < queue.length; index++)
    for (const connection of tile.connections) {
      if (connection.from === 'center' || connection.to === 'center') continue;
      const other =
        connection.from === queue[index]
          ? connection.to
          : connection.to === queue[index]
            ? connection.from
            : null;
      if (other && !visited.has(other)) {
        visited.add(other);
        queue.push(other);
      }
    }
  expect(visited.size).toBe(normal.length);
  const owned = tile.center.sides.filter((side) => side.fieldId);
  expect(owned.length).toBeGreaterThanOrEqual(2);
  expect(owned.length).toBeLessThanOrEqual(3);
  expect(new Set(owned.map((side) => side.fieldId)).size).toBe(owned.length);
  const sides = centralSideCells(tile.cells, tile.center.polygon);
  const raw = new Map(buildUntouchedGrid(config.grid).map((cell) => [cell.id, cell]));
  for (const side of owned) {
    const fragments = [...sides[side.index]!].map((id) => cells.get(id)!);
    expect(new Set(fragments.map((cell) => cell.fieldId))).toEqual(new Set([side.fieldId]));
    const targetIds = new Set(fragments.map((cell) => cell.portalTargetId));
    expect(targetIds.size).toBe(1);
    const target = cells.get([...targetIds][0]!)!;
    expect(target.reserved).toBe(false);
    expect(target.fieldId).toBe(side.fieldId);
    expect(target.polygon).toEqual(raw.get(target.id)!.polygon);
    expect(target.polygon).toHaveLength(config.grid.kind === 'hex' ? 6 : 4);
    expect(tile.entrances.some((entrance) => entrance.fieldId === side.fieldId)).toBe(false);
  }
  return tile;
}

describe('organic fields and raster-aligned pentagon connections', () => {
  it.each([
    ['hex', 13, 18, 'organic-corpus-0', 0, 0],
    ['hex', 13, 24, 'organic-corpus-11', 0.21, -0.15],
    ['hex', 19, 18, 'organic-corpus-3', 0.21, -0.15],
    ['hex', 19, 24, 'organic-corpus-6', 0, 0],
    ['diamond', 13, 18, 'organic-corpus-1', 0.21, -0.15],
    ['diamond', 13, 24, 'organic-corpus-8', 0, 0],
    ['diamond', 19, 18, 'organic-corpus-9', 0.21, -0.15],
    ['diamond', 19, 24, 'organic-corpus-12', 0, 0],
  ] as const)(
    'grows broad %s fields independently of the center (%i fields, grid %i, %s)',
    (kind, fieldCount, divisions, seed, x, y) => {
      const config = structuredClone(defaultConfig);
      config.seed = seed;
      config.grid.kind = kind;
      config.grid.divisions = divisions;
      config.paths.fieldCount = fieldCount;
      config.decoration.enabled = false;
      config.center.offset = { x, y };
      config.center.rotation = 23;
      config.center.scale = 1.1;
      assertOrganic(config);
    },
  );

  it('is deterministic, supports tree/loop preferences and preserves unrelated settings', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    const first = assertOrganic(config);
    expect(generateTile(config)).toEqual(first);
    const changed = structuredClone(config);
    changed.paths.loop = false;
    const tree = generateTile(changed);
    expect(tree.stats.connected).toBe(true);
    expect(tree.fields).toHaveLength(config.paths.fieldCount);
    expect(tree.fields.map((field) => field.cellIds)).not.toEqual(
      first.fields.map((field) => field.cellIds),
    );
    changed.actions.revision = 97;
    changed.terrain.texture.strength = 0.01;
    expect(generateTile(changed).fields).toEqual(tree.fields);
  });

  it.each(['hex', 'diamond'] as const)(
    'detects a one-cell %s corridor but accepts a two-dimensional patch',
    (kind) => {
      const cells = buildUntouchedGrid({ ...defaultConfig.grid, kind }),
        map = new Map(cells.map((cell) => [cell.id, cell]));
      const prefix = kind === 'hex' ? 'h' : 'd';
      const thin = new Set(Array.from({ length: 7 }, (_, i) => `${prefix}:0:${i - 3}`));
      expect(longestThinChain(thin, map, kind)).toBe(7);
      const broad = new Set([
        ...thin,
        ...Array.from({ length: 7 }, (_, i) => `${prefix}:1:${i - 3}`),
      ]);
      expect(longestThinChain(broad, map, kind)).toBeLessThanOrEqual(2);
      expect([...broad].some((id) => cellHasBody(id, broad, map, kind))).toBe(true);
    },
  );

  it.each(['hex', 'diamond'] as const)(
    'keeps the coarsest %s interior hub broad and all mouths unchanged',
    (kind) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.grid.divisions = 6;
      config.paths.fieldCount = 8;
      config.decoration.enabled = false;
      const tile = generateTile(config),
        cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
      expect(tile.fields).toHaveLength(8);
      expect(tile.warnings).toEqual([]);
      const hub = tile.fields.find((field) => field.id.startsWith('auto:blob:'))!;
      expect(hub.area).toBeGreaterThan(0.5);
      expect(isConnectedSelection(hub.cellIds, tile.cells)).toBe(true);
      expect(longestThinChain(new Set(hub.cellIds), cells, kind)).toBeLessThanOrEqual(2);
      expect(
        tile.entrances.every((entrance) =>
          tile.connections.some(
            (link) =>
              (link.from === entrance.fieldId && link.to === hub.id) ||
              (link.to === entrance.fieldId && link.from === hub.id),
          ),
        ),
      ).toBe(true);
      expect(new Set(tile.center.sides.map((side) => side.fieldId))).toEqual(new Set([hub.id]));
    },
  );

  it('keeps an actual V13 automatic layout byte-equivalent after explicit migration', () => {
    const before = JSON.stringify(frozenV13),
      migration = migrateConfig(frozenV13);
    expect(migration.migrated).toBe(true);
    expect(migration.config.legacyLayout).toBe(true);
    expect(migration.config.schemaVersion).toBe(19);
    expect(migration.config.generatorVersion).toBe('19.0.0');
    const config = {
      ...migration.config,
      decoration: { ...migration.config.decoration, enabled: false },
    };
    expect(geometryDigest(generateTile(config))).toBe(
      '95940ba0a40fabeb3e767cb5a919924a32c7980733936e1bed0cc4800ecfd9fe',
    );
    expect(JSON.stringify(frozenV13)).toBe(before);
    expect(() => migrateConfig({ ...frozenV13, legacyLayout: true })).toThrow();
    expect(() => migrateConfig({ ...defaultConfig, legacyLayout: false })).toThrow();
    expect(() => migrateConfig({ ...defaultConfig, generatorVersion: '13.0.0' })).toThrow();
  });
});
