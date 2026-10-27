import { describe, expect, it } from 'vitest';
import { centroid, pointInPolygon, polygonArea } from '../src/core/geometry';
import type { GameField, GeneratedTile, Point, TileCell } from '../src/core/types';
import { widestSymbolAnchor } from '../src/render/symbolAnchor';
import { fieldSymbolLayout, fieldSymbolSize } from '../src/render/symbols';

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function fixture(polygons: Point[][], heights: number[], preferred: Point) {
  const cells: TileCell[] = polygons.map((polygon, index) => ({
    id: `part:${index}`,
    polygon,
    surfacePolygons: [polygon],
    center: centroid(polygon),
    height: heights[index]!,
    baseHeight: heights[index]!,
    color: '#abcdef',
    fieldId: 'path',
    neighbors: [],
    reserved: false,
  }));
  const field: GameField = {
    id: 'path',
    cellIds: cells.map((cell) => cell.id),
    center: preferred,
    height: Math.min(...heights),
    maxHeight: Math.max(...heights),
    symbolHeight: heights[0]!,
    color: '#abcdef',
    action: 'event',
    label: '',
    isCenter: false,
    area: polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0),
  };
  const tile: GeneratedTile = {
    cells,
    fields: [field],
    center: { polygon: rectangle(-0.1, -0.1, 0.1, 0.1), height: 0.1, sides: [] },
    entrances: [],
    connections: [],
    pathDetails: [],
    decorations: [],
    warnings: [],
    stats: { cells: cells.length, fields: 1, decorations: 0, connected: true },
  };
  return { tile, field };
}

describe('action symbols in the broadest field area', () => {
  it('moves from a narrow arm to the broad body before scaling the badge', () => {
    const polygons = [rectangle(-0.2, -0.2, 0.2, 0.2), rectangle(0.2, -0.025, 1, 0.025)],
      preferred = { x: 0.4, y: 0 },
      { tile, field } = fixture(polygons, [0.1, 0.1], preferred),
      before = structuredClone(tile),
      layout = fieldSymbolLayout(tile, field);
    expect(layout.center.x).toBeLessThan(0.02);
    expect(Math.abs(layout.center.y)).toBeLessThan(0.001);
    expect(layout.size).toBeGreaterThan(fieldSymbolSize(polygons, preferred) * 4);
    expect(layout.height).toBe(0.1);
    expect(tile).toEqual(before);
    expect(fieldSymbolLayout(tile, field)).toEqual(layout);
  });

  it('cancels internal full and split raster edges when finding the widest area', () => {
    const polygons = [
      rectangle(-0.2, -0.2, 0, 0.2),
      rectangle(0, -0.2, 0.2, 0),
      rectangle(0, 0, 0.2, 0.2),
    ];
    const anchor = widestSymbolAnchor(polygons, { x: 0.1, y: 0.1 });
    expect(anchor.point.x).toBeCloseTo(0, 3);
    expect(anchor.point.y).toBeCloseTo(0, 3);
    expect(anchor.clearance).toBeCloseTo(0.2, 3);
  });

  it('searches actual visible ground when the field centroid falls in a concavity', () => {
    const polygons = [
      rectangle(-0.4, -0.4, -0.2, 0.4),
      rectangle(0.2, -0.4, 0.4, 0.4),
      rectangle(-0.2, -0.4, 0.2, -0.2),
    ];
    const anchor = widestSymbolAnchor(polygons, { x: 0, y: 0 });
    expect(polygons.some((polygon) => pointInPolygon(anchor.point, polygon))).toBe(true);
    expect(anchor.clearance).toBeGreaterThan(0.099);
  });

  it('prefers the widest detached component over a larger narrow component', () => {
    const polygons = [rectangle(-0.7, -0.05, 0.3, 0.05), rectangle(0.5, -0.15, 0.8, 0.15)],
      anchor = widestSymbolAnchor(polygons, { x: -0.2, y: 0 });
    expect(anchor.point.x).toBeCloseTo(0.65, 3);
    expect(anchor.point.y).toBeCloseTo(0, 3);
    expect(anchor.clearance).toBeCloseTo(0.15, 3);
    expect(widestSymbolAnchor([...polygons].reverse(), { x: -0.2, y: 0 })).toEqual(anchor);
  });

  it('selects a broad plateau and its actual height instead of bridging a terrace seam', () => {
    const polygons = [rectangle(-0.3, -0.15, 0, 0.15), rectangle(0, -0.02, 0.4, 0.02)],
      { tile, field } = fixture(polygons, [0.12, 0.28], { x: 0.1, y: 0 }),
      layout = fieldSymbolLayout(tile, field);
    expect(layout.height).toBe(0.12);
    expect(layout.center.x).toBeCloseTo(-0.15, 3);
    expect(layout.center.y).toBeCloseTo(0, 3);
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        expect(
          pointInPolygon(
            {
              x: layout.center.x + (x * layout.size) / 2,
              y: layout.center.y + (y * layout.size) / 2,
            },
            polygons[0]!,
          ),
        ).toBe(true);
  });

  it('shrinks tiny manual-field symbols to fit instead of forcing a minimum width', () => {
    const { tile, field } = fixture([rectangle(0, 0, 0.006, 0.05)], [0.17], { x: 0.003, y: 0.025 }),
      layout = fieldSymbolLayout(tile, field);
    expect(layout.size).toBeGreaterThan(0);
    expect(layout.size).toBeLessThanOrEqual(0.0036 + 1e-9);
    expect(layout.height).toBe(0.17);
  });

  it('retains the declared pentagon anchor and local terrace height', () => {
    const { tile, field } = fixture([rectangle(-0.1, -0.1, 0.1, 0.1)], [0.2], { x: 0.03, y: 0 });
    field.isCenter = true;
    field.symbolHeight = 0.2;
    expect(fieldSymbolLayout(tile, field).center).toEqual(field.center);
    expect(fieldSymbolLayout(tile, field).height).toBe(0.2);
  });

  it('handles missing or degenerate ground without an invalid coordinate', () => {
    const preferred = { x: 0.1, y: 0.2 };
    expect(widestSymbolAnchor([], preferred)).toEqual({ point: preferred, clearance: 0 });
    expect(widestSymbolAnchor([[{ x: 0, y: 0 }]], preferred)).toEqual({
      point: preferred,
      clearance: 0,
    });
  });
});
