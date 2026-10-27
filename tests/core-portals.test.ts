import { describe, expect, it } from 'vitest';
import {
  boundaryCells,
  buildConnections,
  buildEntranceFootprints,
  buildGrid,
  buildUntouchedGrid,
  centerPortals,
  centralSideCells,
  createCenterPolygon,
  defaultConfig,
  fieldBoundarySegments,
  fieldHeightAt,
  generateTile,
  hexagon,
  isConnectedSelection,
  MIN_FIELD_AREA,
  pointInPolygon,
  polygonArea,
  segmentOverlapLength,
} from '../src/core';
import type { GameField, Point, TileCell } from '../src/core';

const segmentLength = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

describe('centered pentagon portals with visible landscape corners', () => {
  it.each(
    (['hex', 'diamond'] as const).flatMap((kind) =>
      [0.25, 0.45, 0.7].map((portalWidth) => ({ kind, portalWidth })),
    ),
  )(
    'keeps both corners as ground for $kind portals of width $portalWidth',
    ({ kind, portalWidth }) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.center.portalWidth = portalWidth;
      config.decoration.enabled = false;
      const tile = generateTile(config),
        guards = tile.cells.filter((cell) => cell.landscapeOnly),
        center = tile.fields.find((field) => field.isCenter)!;
      expect(tile.stats.connected).toBe(true);
      expect(tile.fields).toHaveLength(config.paths.fieldCount);
      expect(guards.length).toBeGreaterThan(0);
      expect(
        guards.every((cell) => cell.fieldId === undefined && polygonArea(cell.polygon) > 0),
      ).toBe(true);
      expect(tile.cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0)).toBeCloseTo(
        polygonArea(hexagon()),
        9,
      );
      const cellsById = new Map(tile.cells.map((cell) => [cell.id, cell])),
        portalCells = centralSideCells(tile.cells, tile.center.polygon);
      for (const side of tile.center.sides) {
        const length = segmentLength(side.start, side.end),
          portalLength = segmentLength(side.portalStart, side.portalEnd);
        expect(portalLength).toBeCloseTo(length * portalWidth, 12);
        if (side.fieldId === null) {
          expect([...portalCells[side.index]!].every((id) => !cellsById.get(id)!.fieldId)).toBe(
            true,
          );
          continue;
        }
        const owner = tile.fields.find((field) => field.id === side.fieldId)!,
          outline = fieldBoundarySegments(owner, tile.cells);
        const contact = outline.reduce(
          (sum, edge) =>
            sum + segmentOverlapLength(edge.start, edge.end, side.portalStart, side.portalEnd),
          0,
        );
        expect(contact).toBeCloseTo(portalLength, 9);
        for (const [a, b] of [
          [side.start, side.portalStart],
          [side.portalEnd, side.end],
        ] as const) {
          expect(
            outline.every((edge) => segmentOverlapLength(edge.start, edge.end, a, b) < 1e-8),
          ).toBe(true);
          const covered = guards.reduce(
            (sum, cell) =>
              sum +
              cell.polygon.reduce(
                (sum, p, i) =>
                  sum + segmentOverlapLength(a, b, p, cell.polygon[(i + 1) % cell.polygon.length]!),
                0,
              ),
            0,
          );
          expect(covered).toBeCloseTo(segmentLength(a, b), 9);
          const p = midpoint(a, b),
            dx = side.end.x - side.start.x,
            dy = side.end.y - side.start.y;
          const groundPoint = { x: p.x + (dy / length) * 0.008, y: p.y - (dx / length) * 0.008 };
          expect(guards.some((cell) => pointInPolygon(groundPoint, cell.polygon))).toBe(true);
        }
      }
      for (const vertex of tile.center.polygon)
        expect(
          tile.cells
            .filter((cell) => cell.fieldId && cell.fieldId !== center.id)
            .every((cell) =>
              cell.surfacePolygons.every((polygon) => !pointInPolygon(vertex, polygon)),
            ),
        ).toBe(true);
      for (const connection of tile.connections.filter(
        (connection) => connection.kind === 'center',
      ))
        for (const edge of connection.segments) {
          expect(
            tile.center.sides.some(
              (side) =>
                segmentOverlapLength(edge.start, edge.end, side.portalStart, side.portalEnd) >
                segmentLength(edge.start, edge.end) * 0.99,
            ),
          ).toBe(true);
        }
    },
  );
  it('produces a finite positive-width corner collar around every allowed polygon', () => {
    const polygon = createCenterPolygon('narrow', {
        ...defaultConfig.center,
        scale: 0.5,
        irregularity: 0.35,
      }),
      { collar, portals } = centerPortals(polygon, 0.7);
    expect(polygon.every((point) => pointInPolygon(point, collar))).toBe(true);
    expect(polygonArea(collar)).toBeGreaterThan(polygonArea(polygon));
    expect(portals).toHaveLength(5);
  });
});

describe('untouched fixed entrance mouths and historical footprints', () => {
  it.each([
    ['hex', 'entry-a', 0, 0],
    ['hex', 'entry-b', 0.12, 21],
    ['hex', 'entry-c', -0.12, -23],
    ['diamond', 'entry-a', 0, 0],
    ['diamond', 'entry-b', 0.12, 21],
    ['diamond', 'entry-c', -0.12, -23],
  ] as const)(
    'preserves complete %s entry mouths across seeds and center poses (%s)',
    (kind, seed, x, rotation) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.decoration.enabled = false;
      const expected = buildEntranceFootprints(config.grid),
        raw = new Map(buildUntouchedGrid(config.grid).map((cell) => [cell.id, cell]));

      config.seed = seed;
      config.center.offset = { x, y: -x / 2 };
      config.center.rotation = rotation;
      const tile = generateTile(config),
        map = new Map(tile.cells.map((cell) => [cell.id, cell]));
      for (const entrance of tile.entrances) {
        const fixed = expected[entrance.side]!,
          field = tile.fields.find((field) => field.id === entrance.fieldId)!;
        expect(entrance.cellIds).toEqual(fixed.mouthIds);
        expect(entrance.footprintCellIds).toEqual(fixed.cellIds);
        expect(fixed.mouthIds.every((id) => field.cellIds.includes(id))).toBe(true);
        expect(field.area + 1e-10).toBeGreaterThanOrEqual(MIN_FIELD_AREA);
        expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
        for (const id of fixed.mouthIds) {
          expect(map.get(id)!.polygon).toEqual(raw.get(id)!.polygon);
          expect(map.get(id)!.rasterId).toBeUndefined();
          expect(map.get(id)!.entranceSide).toBe(entrance.side);
        }
        expect(
          new Set(
            boundaryCells(tile.cells, entrance.side)
              .map((cell) => cell.fieldId)
              .filter(Boolean),
          ),
        ).toEqual(new Set([field.id]));
        expect(
          boundaryCells(tile.cells, entrance.side)
            .filter((cell) => cell.fieldId)
            .map((cell) => cell.id)
            .sort(),
        ).toEqual([...fixed.mouthIds].sort());
      }
      // V14 compatibility retains its entire seed-independent entry footprint.
      config.layoutVersion = 14;
      const historical = generateTile(config);
      const historicalCells = new Map(historical.cells.map((cell) => [cell.id, cell]));
      for (const entrance of historical.entrances) {
        const fixed = expected[entrance.side]!;
        const field = historical.fields.find((field) => field.id === entrance.fieldId)!;
        expect([...field.cellIds].sort()).toEqual([...fixed.cellIds].sort());
        for (const id of field.cellIds) {
          expect(historicalCells.get(id)!.polygon).toEqual(raw.get(id)!.polygon);
          expect(historicalCells.get(id)!.rasterId).toBeUndefined();
          expect(historicalCells.get(id)!.entranceSide).toBe(entrance.side);
        }
      }
    },
  );
  it.each(['hex', 'diamond'] as const)(
    'has nonoverlapping connected minimum footprints at every $s resolution',
    (kind) => {
      for (const divisions of [6, 18, 24]) {
        const grid = { ...defaultConfig.grid, kind, divisions },
          raw = buildUntouchedGrid(grid),
          map = new Map(raw.map((cell) => [cell.id, cell])),
          all = new Set<string>();
        for (const entry of buildEntranceFootprints(grid)) {
          expect(isConnectedSelection(entry.cellIds, raw)).toBe(true);
          expect(
            entry.cellIds.reduce((sum, id) => sum + polygonArea(map.get(id)!.polygon), 0) + 1e-10,
          ).toBeGreaterThanOrEqual(MIN_FIELD_AREA);
          for (const id of entry.cellIds) {
            expect(all.has(id)).toBe(false);
            all.add(id);
          }
        }
      }
    },
  );
  it('reports a center collision instead of moving it or carving a fixed entrance', () => {
    const grid = defaultConfig.grid,
      entry = buildEntranceFootprints(grid)[0]!,
      center = createCenterPolygon('collision', { ...defaultConfig.center, offset: entry.center });
    expect(() => buildGrid(grid, center, { portalWidth: 0.45 })).toThrow(
      'Pentagon kollidiert mit festem Eingangsfeld',
    );
  });
  it('reports seven fields as infeasible while preserving a valid fixed-entry fallback', () => {
    const config = structuredClone(defaultConfig);
    config.paths.fieldCount = 7;
    config.decoration.enabled = false;
    const tile = generateTile(config);
    expect(tile.stats.connected).toBe(true);
    expect(tile.fields.length).toBeGreaterThanOrEqual(8);
    expect(tile.warnings.some((warning) => warning.includes('7'))).toBe(true);
    const expected = buildEntranceFootprints(config.grid);
    for (const entry of tile.entrances) {
      const field = tile.fields.find((field) => field.id === entry.fieldId)!;
      expect(entry.cellIds).toEqual(expected[entry.side]!.mouthIds);
      expect(entry.cellIds.every((id) => field.cellIds.includes(id))).toBe(true);
      expect(
        boundaryCells(tile.cells, entry.side)
          .filter((cell) => cell.fieldId)
          .map((cell) => cell.id)
          .sort(),
      ).toEqual([...entry.cellIds].sort());
      expect(isConnectedSelection(field.cellIds, tile.cells)).toBe(true);
      expect(field.area + 1e-10).toBeGreaterThanOrEqual(MIN_FIELD_AREA);
    }
  });
});

describe('flat, terraced and explicitly offset field elevations', () => {
  it('keeps source terraces and reports min/max and anchor elevation for each field', () => {
    const config = structuredClone(defaultConfig);
    config.paths.heightMode = 'terraced';
    config.terrain.elevation = 0.45;
    config.terrain.terraces = 12;
    config.decoration.enabled = false;
    const tile = generateTile(config),
      map = new Map(tile.cells.map((cell) => [cell.id, cell]));
    let varying = 0,
      localDiffers = false;
    for (const field of tile.fields) {
      const values = field.cellIds.map((id) => map.get(id)!.height);
      expect(
        values.every(
          (value, i) => value === Math.max(0.02, map.get(field.cellIds[i]!)!.baseHeight),
        ),
      ).toBe(true);
      expect(field.height).toBe(Math.min(...values));
      expect(field.maxHeight).toBe(Math.max(...values));
      expect(field.symbolHeight).toBe(fieldHeightAt(field, tile.cells, field.center));
      if (field.maxHeight > field.height) varying++;
    }
    expect(varying).toBeGreaterThan(0);
    for (const connection of tile.connections)
      for (const segment of connection.segments) {
        const point = midpoint(segment.start, segment.end),
          from = tile.fields.find((field) => field.id === connection.from)!,
          to = tile.fields.find((field) => field.id === connection.to)!;
        expect(segment.fromHeight).toBe(fieldHeightAt(from, tile.cells, point));
        expect(segment.toHeight).toBe(fieldHeightAt(to, tile.cells, point));
        if (Math.abs(segment.toHeight - segment.fromHeight - connection.heightDelta) > 1e-8)
          localDiffers = true;
      }
    expect(localDiffers).toBe(true);
  });
  it('applies per-field flat overrides and center offsets while clamping low ground to .02', () => {
    const config = structuredClone(defaultConfig);
    config.paths.heightMode = 'terraced';
    config.terrain.elevation = 0;
    config.decoration.enabled = false;
    config.paths.fields = [
      {
        id: 'auto:entrance:0',
        cellIds: [],
        action: 'event',
        heightMode: 'flat',
        heightOffset: -0.12,
      },
      { id: 'center', cellIds: [], action: 'event', heightMode: 'flat', heightOffset: 0.2 },
    ];
    const tile = generateTile(config),
      entry = tile.fields.find((field) => field.id === 'auto:entrance:0')!,
      center = tile.fields.find((field) => field.isCenter)!;
    expect(entry.height).toBe(0.02);
    expect(entry.maxHeight).toBe(0.02);
    expect(entry.symbolHeight).toBe(0.02);
    expect(center.height).toBeCloseTo(0.28, 14);
    expect(center.maxHeight).toBe(center.height);
    expect(tile.center.height).toBe(center.height);
    expect(
      tile.cells
        .filter((cell) => entry.cellIds.includes(cell.id))
        .every((cell) => cell.height === 0.02 && cell.baseHeight === 0.08),
    ).toBe(true);
  });
});

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function testCell(id: string, polygon: Point[], height: number): TileCell {
  return {
    id,
    polygon,
    center: midpoint(polygon[0]!, polygon[2]!),
    surfacePolygons: [polygon],
    neighbors: [],
    baseHeight: height,
    height,
    color: '#123456',
    reserved: false,
  };
}
function testField(id: string, cells: TileCell[], center = false): GameField {
  const heights = cells.map((cell) => cell.height),
    height = Math.min(...heights);
  return {
    id,
    cellIds: cells.map((cell) => cell.id),
    center: cells[0]!.center,
    height,
    maxHeight: Math.max(...heights),
    symbolHeight: cells[0]!.height,
    color: '#123456',
    action: 'event',
    label: id,
    isCenter: center,
    area: cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0),
  };
}

describe('local connection segment elevations', () => {
  it('splits one continuous boundary at local terrace changes and samples the highest exact-edge piece', () => {
    const cells = [
        testCell('a0', rect(0, 0, 1, 1), 0.1),
        testCell('a1', rect(0, 1, 1, 2), 0.2),
        testCell('b0', rect(1, 0, 2, 1), 0.3),
        testCell('b1', rect(1, 1, 2, 2), 0.5),
      ],
      a = testField('A', cells.slice(0, 2)),
      b = testField('B', cells.slice(2)),
      connections = buildConnections([a, b], cells);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.sharedLength).toBeCloseTo(2, 12);
    expect(
      new Set(
        connections[0]!.segments.map((segment) => `${segment.fromHeight}/${segment.toHeight}`),
      ),
    ).toEqual(new Set(['0.1/0.3', '0.2/0.5']));
    expect(fieldHeightAt(a, cells, { x: 0.5, y: 1 })).toBe(0.2);
    expect(fieldHeightAt(a, cells, { x: -1, y: -1 })).toBe(0.1);
  });
});
