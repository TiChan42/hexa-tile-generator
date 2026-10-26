import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  buildConnections,
  centralSideCells,
  centroid,
  createCenterPolygon,
  defaultConfig,
  fieldBoundarySegments,
  generateTile,
  hexagon,
  isConnectedSelection,
  MIN_FIELD_AREA,
  pointInPolygon,
  polygonArea,
  segmentOverlapLength,
} from '../src/core';
import type { GameField, GeneratedTile, Point, TileCell } from '../src/core';

function assertHardRules(tile: GeneratedTile): void {
  const map = new Map(tile.cells.map((cell) => [cell.id, cell]));
  expect(new Set(tile.fields.map((field) => field.id)).size).toBe(tile.fields.length);
  expect(tile.stats.connected).toBe(true);
  for (const field of tile.fields) {
    expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
    if (!field.isCenter) expect(field.area + 1e-10).toBeGreaterThanOrEqual(MIN_FIELD_AREA);
    expect(field.height).toBe(Math.min(...field.cellIds.map((id) => map.get(id)!.baseHeight)));
  }
  for (const entrance of tile.entrances) {
    const owners = new Set(
      boundaryCells(tile.cells, entrance.side)
        .map((cell) => cell.fieldId)
        .filter(Boolean),
    );
    expect(owners.size).toBe(1);
    expect([...owners][0]).toBe(entrance.fieldId);
    expect(entrance.fieldId).not.toBeNull();
    expect(entrance.cellIds.every((id) => map.get(id)!.fieldId === entrance.fieldId)).toBe(true);
  }
  const touching = centralSideCells(tile.cells, tile.center.polygon);
  for (const side of tile.center.sides) {
    const owners = new Set([...touching[side.index]!].map((id) => map.get(id)!.fieldId ?? null));
    expect(owners.size).toBe(1);
    expect([...owners][0]).toBe(side.fieldId);
  }
  expect(tile.cells.reduce((area, cell) => area + polygonArea(cell.polygon), 0)).toBeCloseTo(
    polygonArea(hexagon()),
    9,
  );
  const ids = new Set(tile.fields.map((field) => field.id));
  for (const connection of tile.connections) {
    expect(ids.has(connection.from) && ids.has(connection.to)).toBe(true);
    expect(connection.sharedLength).toBeGreaterThan(1e-8);
    expect(connection.sharedLength).toBeCloseTo(
      connection.segments.reduce(
        (sum, segment) =>
          sum + Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y),
        0,
      ),
      12,
    );
    expect(connection.heightDelta).toBe(
      tile.fields.find((field) => field.id === connection.to)!.height -
        tile.fields.find((field) => field.id === connection.from)!.height,
    );
  }
  const physical = new Set(
    tile.cells
      .flatMap((cell) =>
        cell.neighbors.map((id) => {
          const neighbor = map.get(id)!;
          return cell.fieldId && neighbor.fieldId && cell.fieldId !== neighbor.fieldId
            ? [cell.fieldId, neighbor.fieldId].sort().join('|')
            : null;
        }),
      )
      .filter(Boolean),
  );
  expect(new Set(tile.connections.map((connection) => connection.id))).toEqual(physical);
}

describe('seeded branching topology and exclusive hexagon entrances', () => {
  it.each(['hex', 'diamond'] as const)(
    'creates thirteen fields where supported and reports coarse limits on %s rasters',
    (kind) => {
      for (const divisions of [6, 12, 24]) {
        const config = structuredClone(defaultConfig);
        config.grid.kind = kind;
        config.grid.divisions = divisions;
        config.decoration.enabled = false;
        const tile = generateTile(config);
        assertHardRules(tile);
        if (tile.fields.length === config.paths.fieldCount) expect(tile.warnings).toEqual([]);
        else
          expect(
            tile.warnings.some(
              (warning) => warning.includes('13') && warning.includes(String(tile.fields.length)),
            ),
          ).toBe(true);
        expect(tile.connections.length).toBeLessThan(tile.fields.length * 2);
        for (const entrance of tile.entrances)
          expect(
            tile.connections.filter(
              (edge) => edge.from === entrance.fieldId || edge.to === entrance.fieldId,
            ).length,
          ).toBeLessThanOrEqual(2);
      }
    },
  );
  it.each(
    (['hex', 'diamond'] as const).flatMap((kind) =>
      [8, 13, 18, 24].flatMap((fieldCount) => [0, 0.3].map((x) => ({ kind, fieldCount, x }))),
    ),
  )(
    'honors count $fieldCount with $kind raster and center offset $x',
    ({ kind, fieldCount, x }) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.grid.divisions = 24;
      config.paths.fieldCount = fieldCount;
      config.center.offset = { x, y: -x / 2 };
      config.decoration.enabled = false;
      const tile = generateTile(config);
      assertHardRules(tile);
      expect(tile.fields).toHaveLength(fieldCount);
      expect(tile.warnings).toEqual([]);
    },
  );
  it('validates coarse layouts and reports any count limit explicitly', () => {
    const config = structuredClone(defaultConfig);
    config.grid.kind = 'diamond';
    config.grid.divisions = 6;
    config.paths.fieldCount = 24;
    config.center.offset = { x: 0, y: 0 };
    config.decoration.enabled = false;
    const tile = generateTile(config);
    assertHardRules(tile);
    if (tile.fields.length === config.paths.fieldCount) expect(tile.warnings).toEqual([]);
    else
      expect(
        tile.warnings.some(
          (warning) => warning.includes('24') && warning.includes(String(tile.fields.length)),
        ),
      ).toBe(true);
  });
  it('rejects manual boundary fields that extend beyond the exclusive centered entrance', () => {
    const config = structuredClone(defaultConfig),
      original = generateTile(config),
      entrance = original.entrances[0]!,
      owner = original.fields.find((field) => field.id === entrance.fieldId)!;
    const extra = boundaryCells(original.cells, 0).find(
      (cell) =>
        !entrance.cellIds.includes(cell.id) &&
        cell.neighbors.some((id) => owner.cellIds.includes(id)),
    )!;
    expect(extra).toBeDefined();
    config.paths.auto = false;
    config.paths.fields = [
      { id: 'invalid-boundary', cellIds: [...owner.cellIds, extra.id], action: 'event' },
    ];
    const tile = generateTile(config);
    expect(tile.fields.some((field) => field.id === 'invalid-boundary')).toBe(false);
    expect(tile.warnings.some((warning) => warning.includes('Eingang'))).toBe(true);
  });
  it('displaces both regular and organic pentagons while preserving shape and staying inside the main tile', () => {
    for (const shape of ['regular', 'organic'] as const) {
      const options = { ...defaultConfig.center, shape, offset: { x: 0, y: 0 } },
        base = centroid(createCenterPolygon('offset-seed', options));
      for (const offset of [
        { x: 0.45, y: 0.45 },
        { x: -0.45, y: -0.45 },
      ]) {
        const polygon = createCenterPolygon('offset-seed', { ...options, offset }),
          center = centroid(polygon);
        expect(polygon).toHaveLength(5);
        expect(center.x).toBeCloseTo(base.x + offset.x, 13);
        expect(center.y).toBeCloseTo(base.y + offset.y, 13);
        expect(polygon.every((point) => pointInPolygon(point, hexagon()))).toBe(true);
      }
    }
  });
});

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(id: string, polygon: Point[]): TileCell {
  return {
    id,
    polygon,
    center: centroid(polygon),
    surfacePolygons: [polygon],
    neighbors: [],
    baseHeight: 0.1,
    height: 0.1,
    color: '#123456',
    reserved: false,
  };
}
function field(id: string, cells: TileCell[], height = 0.1): GameField {
  return {
    id,
    cellIds: cells.map((cell) => cell.id),
    center: cells[0]!.center,
    height,
    maxHeight: height,
    symbolHeight: height,
    color: '#123456',
    action: 'event',
    label: id,
    isCenter: false,
    area: cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0),
  };
}

describe('true union outlines and shared-geometry connections', () => {
  it('cancels complete and partial internal rasteredges in a concave field', () => {
    const cells = [cell('left', rectangle(0, 0, 1, 2)), cell('right', rectangle(1, 0, 2, 1))],
      gameField = field('L', cells),
      outline = fieldBoundarySegments(gameField, cells);
    expect(
      outline.reduce(
        (sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
        0,
      ),
    ).toBeCloseTo(8, 12);
    expect(
      outline.every(
        (edge) => segmentOverlapLength(edge.start, edge.end, { x: 1, y: 0 }, { x: 1, y: 1 }) < 1e-8,
      ),
    ).toBe(true);
    expect(fieldBoundarySegments(gameField, cells)).toBe(outline);
  });
  it('exports only positive-length shared boundaries with deterministic signed elevations', () => {
    const left = cell('left', rectangle(0, 0, 1, 2)),
      right = cell('right', rectangle(1, 0, 2, 1)),
      point = cell('point', rectangle(2, 1, 3, 2));
    const fields = [field('B', [right], 0.15), field('A', [left], 0.3), field('C', [point], 0.2)],
      connections = buildConnections(fields, [left, right, point]);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.from).toBe('A');
    expect(connections[0]!.to).toBe('B');
    expect(connections[0]!.sharedLength).toBeCloseTo(1, 12);
    expect(connections[0]!.heightDelta).toBeCloseTo(-0.15, 12);
    expect(connections[0]!.kind).toBe('path');
  });
});
