import { describe, expect, it } from 'vitest';
import { buildPaths } from '../src/core/paths';
import {
  centralSideCells,
  boundaryCells,
  clusterCompactness,
  defaultConfig,
  generateTile,
  hexagon,
  isConnectedSelection,
  MIN_FIELD_AREA,
  polygonArea,
  sharedBoundaryLength,
} from '../src/core';
import type { TileConfig } from '../src/core';

function assertInvariants(config: TileConfig): void {
  const tile = generateTile(config),
    map = new Map(tile.cells.map((cell) => [cell.id, cell]));
  expect(tile.stats.connected).toBe(true);
  expect(tile.entrances).toHaveLength(config.paths.enabledSides.filter(Boolean).length);
  expect(tile.center.sides).toHaveLength(5);
  expect(tile.cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0)).toBeCloseTo(
    polygonArea(hexagon()),
    9,
  );
  for (const field of tile.fields) {
    if (!field.isCenter) {
      expect(field.area + 1e-10).toBeGreaterThanOrEqual(MIN_FIELD_AREA);
      expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
      expect(field.area).toBeCloseTo(
        field.cellIds.reduce(
          (sum, id) =>
            sum + map.get(id)!.surfacePolygons.reduce((sum, p) => sum + polygonArea(p), 0),
          0,
        ),
        12,
      );
    }
    expect(field.height).toBe(Math.min(...field.cellIds.map((id) => map.get(id)!.baseHeight)));
  }
  const sides = centralSideCells(tile.cells, tile.center.polygon);
  for (const side of tile.center.sides) {
    const owners = new Set([...sides[side.index]!].map((id) => map.get(id)!.fieldId ?? null));
    expect(owners.size).toBe(1);
    expect(side.fieldId).toBe([...owners][0]);
    const actualBoundary = [...sides[side.index]!].reduce(
      (sum, id) =>
        sum +
        (side.fieldId && map.get(id)!.fieldId === side.fieldId
          ? sharedBoundaryLength([side.portalStart, side.portalEnd], map.get(id)!.polygon) / 2
          : 0),
      0,
    );
    expect(actualBoundary).toBeCloseTo(
      side.fieldId
        ? Math.hypot(side.portalEnd.x - side.portalStart.x, side.portalEnd.y - side.portalStart.y)
        : 0,
      9,
    );
  }
  const graph = new Map(
    tile.fields
      .filter((f) => !f.isCenter)
      .map((f) => [
        f.id,
        new Set(
          f.cellIds
            .flatMap((id) => map.get(id)!.neighbors.map((next) => map.get(next)!.fieldId))
            .filter((id) => id !== undefined && id !== f.id),
        ),
      ]),
  );
  for (const field of tile.fields.filter((f) => !f.isCenter)) {
    const external = tile.entrances.filter((e) =>
      e.cellIds.some((id) => field.cellIds.includes(id)),
    ).length;
    expect(graph.get(field.id)!.size + external).toBeGreaterThanOrEqual(2);
  }
}

describe('minimum figure area and whole pentagon-side ownership', () => {
  it.each(['hex', 'diamond'] as const)(
    'enforces exact ground, connectivity and all side segments with %s raster',
    (kind) => {
      for (const divisions of [6, 10, 24]) {
        const config = structuredClone(defaultConfig);
        config.grid.kind = kind;
        config.grid.divisions = divisions;
        config.seed = `invariant-${kind}-${divisions}`;
        config.center.scale = divisions === 6 ? 0.5 : 1.2;
        config.center.irregularity = 0.35;
        config.center.rotation = 27;
        assertInvariants(config);
      }
    },
  );
  it('gives selected full sides one owner and keeps branch fields compact by default', () => {
    const tile = generateTile(defaultConfig),
      map = new Map(tile.cells.map((cell) => [cell.id, cell])),
      normalFields = tile.fields.filter((field) => !field.isCenter),
      compactness = normalFields.map((field) => ({
        field,
        value: clusterCompactness(new Set(field.cellIds), map),
      }));
    const ownedSides = tile.center.sides.filter((side) => side.fieldId !== null);
    expect(ownedSides.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ownedSides.map((side) => side.fieldId)).size).toBe(ownedSides.length);
    expect(tile.warnings).toEqual([]);
    const irregularHubs = compactness.filter(({ value }) => value >= 3.5);
    expect(irregularHubs.length).toBeLessThanOrEqual(1);
    for (const { field, value } of compactness) {
      const degree = tile.connections.filter(
        (connection) => connection.from === field.id || connection.to === field.id,
      ).length;
      if (value >= 3.5) {
        expect(degree).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThan(5.5);
      } else expect(value).toBeLessThan(3.5);
    }
    expect(
      tile.fields.reduce((sum, field) => sum + field.area, 0) / polygonArea(hexagon()),
    ).toBeLessThan(0.75);
  });
  it.each([1, 80])(
    'keeps minimum size and valid side ownership for target cell count %i',
    (fieldSize) => {
      const config = structuredClone(defaultConfig);
      config.paths.fieldSize = fieldSize;
      config.grid.divisions = 12;
      assertInvariants(config);
    },
  );
  it.each(['hex', 'diamond'] as const)(
    'materializes all auto fields to an identical editable %s layout',
    (kind) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.seed = `frozen-${kind}`;
      const before = generateTile(config);
      config.paths.auto = false;
      config.paths.fields = before.fields.map((field) => ({
        id: field.id,
        cellIds: field.isCenter ? [] : field.cellIds,
        action: field.action,
        color: field.color,
        label: field.label,
      }));
      expect(generateTile(config)).toEqual(before);
    },
  );
  it('retains a manual field below the configured ground-area threshold with an advisory warning', () => {
    const config = structuredClone(defaultConfig);
    config.paths.auto = false;
    const tile = generateTile(config),
      outer = new Set(
        Array.from({ length: 6 }, (_, side) => boundaryCells(tile.cells, side)).flatMap((cells) =>
          cells.map((cell) => cell.id),
        ),
      ),
      cell = tile.cells.find(
        (cell) => !cell.reserved && !outer.has(cell.id) && cell.entranceSide === undefined,
      )!;
    expect(polygonArea(cell.polygon)).toBeLessThan(MIN_FIELD_AREA);
    config.paths.fields = [{ id: 'too-small', cellIds: [cell.id], action: 'event' }];
    const result = generateTile(config);
    expect(result.fields.some((field) => field.id === 'too-small')).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('Grundfläche'))).toBe(true);
  });
  it('rejects a partial-side manual field instead of assigning its midpoint to one owner', () => {
    const config = structuredClone(defaultConfig),
      tile = generateTile(config),
      sides = centralSideCells(tile.cells, tile.center.polygon);
    let edit: { id: string; cellIds: string[]; action: 'event' } | undefined;
    for (const side of sides) {
      const owner = tile.fields.find((field) => field.cellIds.some((id) => side.has(id)))!;
      if (!owner || side.size < 2) continue;
      for (const removed of side) {
        const ids = owner.cellIds.filter((id) => id !== removed);
        const area = ids.reduce(
          (sum, id) => sum + polygonArea(tile.cells.find((cell) => cell.id === id)!.polygon),
          0,
        );
        if (area >= MIN_FIELD_AREA && isConnectedSelection(ids, tile.cells)) {
          edit = { id: 'partial-side', cellIds: ids, action: 'event' };
          break;
        }
      }
      if (edit) break;
    }
    expect(edit).toBeDefined();
    config.paths.auto = false;
    config.paths.fields = [edit!];
    const result = generateTile(config);
    expect(result.fields.some((field) => field.id === 'partial-side')).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('Pentagonportal'))).toBe(true);
    expect(result.center.sides.every((side) => side.fieldId === null)).toBe(true);
  });
  it('preserves original raster heights across the exact central fragments', () => {
    const tile = generateTile(defaultConfig),
      groups = new Map<string, Set<number>>();
    for (const cell of tile.cells)
      if (cell.rasterId) {
        const heights = groups.get(cell.rasterId) ?? new Set();
        heights.add(cell.baseHeight);
        groups.set(cell.rasterId, heights);
      }
    expect(groups.size).toBeGreaterThan(0);
    expect([...groups.values()].every((heights) => heights.size === 1)).toBe(true);
  });
});

describe('stable unique field IDs across automatic and manual editing', () => {
  it('allocates a deterministic new auto ID when a reshaped manual field retains its old auto ID', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    const moved = original.fields.find((field) => field.id === 'auto:entrance:1')!;
    config.paths.fields = [
      { id: 'auto:entrance:0', cellIds: moved.cellIds, action: 'alb', color: '#123456' },
    ];
    const result = generateTile(config),
      again = generateTile(config);
    expect(new Set(result.fields.map((field) => field.id)).size).toBe(result.fields.length);
    expect(result.fields.find((field) => field.id === 'auto:entrance:0')?.cellIds).toEqual(
      moved.cellIds,
    );
    expect(result.fields.find((field) => field.id === 'auto:entrance:0')?.action).toBe('alb');
    expect(result.fields.some((field) => field.id === 'auto:entrance:0:generated:1')).toBe(true);
    expect(result).toEqual(again);
    expect(result.stats.connected).toBe(true);
  });
  it('can re-enable auto paths after freezing every generated field without duplicate IDs or changes', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    config.paths.fields = original.fields.map((field) => ({
      id: field.id,
      cellIds: field.isCenter ? [] : field.cellIds,
      action: field.action,
      color: field.color,
      label: field.label,
    }));
    config.paths.auto = true;
    const result = generateTile(config);
    expect(new Set(result.fields.map((field) => field.id)).size).toBe(result.fields.length);
    expect(result).toEqual(original);
  });
  it('keeps empty color/action overrides on the original generated ID', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    config.paths.fields = [
      { id: 'auto:entrance:0', cellIds: [], action: 'jump', color: '#123456' },
    ];
    const result = generateTile(config),
      before = original.fields.find((field) => field.id === 'auto:entrance:0')!,
      after = result.fields.find((field) => field.id === before.id)!;
    expect(after.cellIds).toEqual(before.cellIds);
    expect(after.color).toBe('#123456');
    expect(after.action).toBe('jump');
    expect(result.fields.map((field) => field.id)).toEqual(
      original.fields.map((field) => field.id),
    );
  });
  it('does not apply properties of a rejected manual shape to a generated field with its former ID', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    config.paths.fields = [
      { id: 'auto:entrance:0', cellIds: ['missing'], action: 'alb', color: '#123456' },
    ];
    const result = generateTile(config);
    expect(result.fields).toEqual(original.fields);
    expect(result.warnings.some((warning) => warning.includes('ignoriert'))).toBe(true);
  });
  it('skips every accepted manual name when allocating a replacement ID', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    config.paths.fields = [
      {
        id: 'auto:entrance:0',
        cellIds: original.fields.find((field) => field.id === 'auto:entrance:1')!.cellIds,
        action: 'event',
      },
      {
        id: 'auto:entrance:0:generated:1',
        cellIds: original.fields.find((field) => field.id === 'auto:entrance:2')!.cellIds,
        action: 'event',
      },
    ];
    const result = generateTile(config);
    expect(result.fields.some((field) => field.id === 'auto:entrance:0:generated:2')).toBe(true);
    expect(new Set(result.fields.map((field) => field.id)).size).toBe(result.fields.length);
  });
  it('defends buildPaths against duplicate manual IDs even when called before schema validation', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config);
    config.paths.auto = false;
    config.paths.fields = [
      {
        id: 'duplicate',
        cellIds: original.fields.find((field) => field.id === 'auto:entrance:0')!.cellIds,
        action: 'event',
      },
      {
        id: 'duplicate',
        cellIds: original.fields.find((field) => field.id === 'auto:entrance:1')!.cellIds,
        action: 'event',
      },
    ];
    const cells = structuredClone(original.cells);
    cells.forEach((cell) => {
      cell.fieldId = undefined;
      cell.height = cell.baseHeight;
    });
    const result = buildPaths(config, cells, original.center.polygon);
    expect(result.fields.filter((field) => field.id === 'duplicate')).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes('mehrfach vorhanden'))).toBe(true);
  });
});
