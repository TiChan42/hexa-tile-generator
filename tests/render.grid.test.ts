import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  buildUntouchedGrid,
  defaultConfig,
  pentagon,
  segmentOverlapLength,
} from '../src/core';
import { buildSubgrid } from '../src/core/subgrid';
import type { GeneratedTile, Point, TileCell } from '../src/core/types';
import {
  rasterGridSegments,
  rasterLineGeometry,
  rasterSubgridSegments,
  type RasterLineSegment,
} from '../src/render/grid';

const length = ({ start, end }: RasterLineSegment) => Math.hypot(end.x - start.x, end.y - start.y);
function liesOn(segment: RasterLineSegment, polygons: Point[][]): boolean {
  return polygons.some((polygon) =>
    polygon.some(
      (start, i) =>
        segmentOverlapLength(
          segment.start,
          segment.end,
          start,
          polygon[(i + 1) % polygon.length]!,
        ) >=
        length(segment) - 1e-8,
    ),
  );
}
function fixture(kind: 'hex' | 'diamond') {
  const grid = { ...defaultConfig.grid, kind },
    center = pentagon(),
    cells = buildGrid(grid, center);
  for (const cell of cells) {
    cell.height = 0.12;
    if (!cell.surfacePolygons.length) cell.fieldId = 'center';
    else if (cell.centerPort === 0) cell.fieldId = 'path';
  }
  const model: GeneratedTile = {
    cells,
    fields: [
      {
        id: 'center',
        cellIds: [],
        center: { x: 0, y: 0 },
        height: 0.12,
        maxHeight: 0.12,
        symbolHeight: 0.12,
        color: '#aabbcc',
        action: 'none',
        label: '',
        isCenter: true,
        area: 0.1,
      },
    ],
    center: { polygon: center, height: 0.12, sides: [] },
    entrances: [],
    connections: [],
    decorations: [],
    pathDetails: [],
    warnings: [],
    stats: { cells: cells.length, fields: 1, decorations: 0, connected: true },
  };
  const raw = new Map(buildUntouchedGrid(grid).map((cell) => [cell.id, cell]));
  return { grid, model, raw };
}

it.each(['hex', 'diamond'] as const)(
  '%s landscape fragments retain the source raster without artificial pentagon shoulder cuts',
  (kind) => {
    const { grid, model, raw } = fixture(kind),
      cells = new Map(model.cells.map((cell) => [cell.id, cell])),
      segments = rasterGridSegments(model, grid);
    let landscapeFragments = 0,
      pathCuts = 0;
    for (const segment of segments) {
      const cell = cells.get(segment.cellId)!,
        original = raw.get(cell.rasterId ?? cell.id)!;
      expect(segment.height).toBeCloseTo(cell.height + 0.001, 10);
      if (cell.fieldId !== 'path') {
        expect(liesOn(segment, [original.polygon])).toBe(true);
        if (cell.rasterId && !cell.fieldId) landscapeFragments++;
      } else if (!liesOn(segment, [original.polygon])) pathCuts++;
    }
    expect(landscapeFragments).toBeGreaterThan(0);
    expect(pathCuts).toBeGreaterThan(0);
    // Unused portal fragments are actually covered by the assertion, not simply omitted wholesale.
    const unused = model.cells.filter((cell) => cell.centerPort !== undefined && !cell.fieldId);
    expect(unused.some((cell) => segments.some((segment) => segment.cellId === cell.id))).toBe(
      true,
    );
    const geometry = rasterLineGeometry(segments),
      positions = geometry.getAttribute('position');
    expect(positions.count).toBe(segments.length * 2);
    expect([...positions.array].every(Number.isFinite)).toBe(true);
    geometry.dispose();
  },
);

it.each(['hex', 'diamond'] as const)(
  '%s landscape fine grid uses the original lattice even across multiple portal fragments',
  (kind) => {
    const { grid, model, raw } = fixture(kind),
      cells = new Map(model.cells.map((cell) => [cell.id, cell])),
      segments = rasterSubgridSegments(model, grid),
      cache = new Map<string, Point[][]>();
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      const cell = cells.get(segment.cellId)!;
      expect(cell.fieldId).toBeUndefined();
      const original = raw.get(cell.rasterId ?? cell.id)!;
      let polygons = cache.get(original.id);
      if (!polygons) {
        polygons = buildSubgrid(original, grid).map((part) => part.polygon);
        cache.set(original.id, polygons);
      }
      expect(liesOn(segment, polygons)).toBe(true);
    }
  },
);

describe('raster display edge cases', () => {
  it('omits hidden non-field pieces, clips out empty line intersections and supports isolated surfaces', () => {
    const { grid, model } = fixture('hex');
    model.fields = [];
    model.cells = [
      ...model.cells
        .filter((cell) => !cell.surfacePolygons.length)
        .map((cell) => ({ ...cell, fieldId: undefined })),
      {
        id: 'isolated',
        center: { x: 0, y: 0 },
        polygon: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0 },
          { x: 0, y: 0.1 },
        ],
        surfacePolygons: [],
        height: 0.2,
        baseHeight: 0.2,
        color: '#ffffff',
        neighbors: [],
        reserved: false,
      } satisfies TileCell,
    ];
    expect(rasterGridSegments(model, grid)).toEqual([]);
    expect(rasterSubgridSegments(model, grid)).toEqual([]);
    const standalone = model.cells.at(-1)!;
    standalone.surfacePolygons = [standalone.polygon];
    expect(rasterGridSegments(model, grid)).toHaveLength(3);
  });
});
