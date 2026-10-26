import { describe, expect, it } from 'vitest';
import {
  centroid,
  defaultConfig,
  fieldAnchor,
  fieldBoundarySegments,
  fieldHeightAt,
  generateTile,
  terracedSymbolAnchor,
} from '../src/core';
import type { Point, TileCell } from '../src/core';
const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(id: string, polygon: Point[], height: number, neighbors: string[]): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: [polygon],
    center: centroid(polygon),
    baseHeight: height,
    height,
    neighbors,
    color: '#123456',
    reserved: false,
  };
}
function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = dx * dx + dy * dy,
    t = length
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length))
      : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

describe('readable symbol anchors on terraces', () => {
  it('moves a seam-centered symbol to the nearest owning cell interior', () => {
    const left = cell('left', rectangle(0, 0, 1, 1), 0.1, ['right']),
      right = cell('right', rectangle(1, 0, 2, 1), 0.2, ['left']),
      map = new Map([left, right].map((cell) => [cell.id, cell]));
    const anchor = terracedSymbolAnchor(['left', 'right'], map, { x: 1, y: 0.5 });
    expect(anchor).toEqual({ point: { x: 0.5, y: 0.5 }, height: 0.1 });
  });
  it('preserves the original mean when the whole selected footprint is one plateau', () => {
    const left = cell('left', rectangle(0, 0, 1, 1), 0.1, ['right']),
      right = cell('right', rectangle(1, 0, 2, 1), 0.1, ['left']),
      map = new Map([left, right].map((cell) => [cell.id, cell])),
      preferred = { x: 1, y: 0.5 };
    expect(terracedSymbolAnchor(['left', 'right'], map, preferred)).toEqual({
      point: preferred,
      height: 0.1,
    });
  });
  it('samples the exact visible height even when neighboring levels differ below the plateau tolerance', () => {
    const left = cell('left', rectangle(0, 0, 1, 1), 0.1, ['right']),
      right = cell('right', rectangle(1, 0, 2, 1), 0.1 + 1e-12, ['left']),
      map = new Map([left, right].map((cell) => [cell.id, cell]));
    expect(terracedSymbolAnchor(['left', 'right'], map, { x: 1.5, y: 0.5 }).height).toBe(
      right.height,
    );
  });
  it('prefers usable plateau ground over a very narrow closer fragment', () => {
    const thin = cell('thin', rectangle(0, 0, 0.01, 1), 0.1, ['wide']),
      wide = cell('wide', rectangle(0.01, 0, 1, 1), 0.2, ['thin']),
      map = new Map([thin, wide].map((cell) => [cell.id, cell]));
    const anchor = terracedSymbolAnchor(['thin', 'wide'], map, { x: 0.005, y: 0.5 });
    expect(anchor.height).toBe(0.2);
    expect(anchor.point.x).toBeCloseTo(0.505, 12);
  });
  it('keeps flat anchors and all footprints unchanged while terraced badges have interior clearance', () => {
    const config = structuredClone(defaultConfig);
    config.terrain.elevation = 0.45;
    config.terrain.terraces = 12;
    config.decoration.enabled = false;
    const flat = generateTile(config),
      map = new Map(flat.cells.map((cell) => [cell.id, cell]));
    for (const field of flat.fields)
      expect(field.center).toEqual(
        field.isCenter ? centroid(flat.center.polygon) : fieldAnchor(field.cellIds, map),
      );
    config.paths.heightMode = 'terraced';
    const terraced = generateTile(config);
    expect(
      terraced.cells.map((cell) => ({
        id: cell.id,
        fieldId: cell.fieldId,
        polygon: cell.polygon,
        baseHeight: cell.baseHeight,
      })),
    ).toEqual(
      flat.cells.map((cell) => ({
        id: cell.id,
        fieldId: cell.fieldId,
        polygon: cell.polygon,
        baseHeight: cell.baseHeight,
      })),
    );
    expect(
      terraced.connections.map((edge) => ({
        id: edge.id,
        segments: edge.segments.map(({ start, end }) => ({ start, end })),
      })),
    ).toEqual(
      flat.connections.map((edge) => ({
        id: edge.id,
        segments: edge.segments.map(({ start, end }) => ({ start, end })),
      })),
    );
    let changed = 0;
    for (const field of terraced.fields) {
      expect(field.symbolHeight).toBe(fieldHeightAt(field, terraced.cells, field.center));
      if (field.maxHeight === field.height) continue;
      if (
        JSON.stringify(field.center) !==
        JSON.stringify(flat.fields.find((other) => other.id === field.id)!.center)
      )
        changed++;
      const plateau = {
        ...field,
        cellIds: field.cellIds.filter(
          (id) =>
            Math.abs(terraced.cells.find((cell) => cell.id === id)!.height - field.symbolHeight) <
            1e-10,
        ),
      };
      const outline = fieldBoundarySegments(plateau, terraced.cells),
        clearance = Math.min(
          ...outline.map((edge) => distanceToSegment(field.center, edge.start, edge.end)),
        );
      expect(clearance).toBeGreaterThan(0.025);
    }
    expect(changed).toBeGreaterThan(0);
  });
});
