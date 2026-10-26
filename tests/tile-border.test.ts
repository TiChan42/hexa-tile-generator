import { describe, expect, it } from 'vitest';
import {
  borderRing,
  buildDecorations,
  buildGrid,
  clipPolygon,
  configSchema,
  createCenterPolygon,
  decorationClearsBorder,
  defaultConfig,
  hexagon,
  inTileBorder,
  placementOffset,
  pointInPolygon,
  polygonArea,
} from '../src/core';
import { DECORATION_KINDS } from '../src/core/objects';
import type { Point, TileCell } from '../src/core';

const APOTHEM = Math.sqrt(3) / 2;
function boundaryDistance(point: Point): number {
  const outer = hexagon();
  return Math.min(
    ...outer.map((a, i) => {
      const b = outer[(i + 1) % 6]!;
      return (
        ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) /
        Math.hypot(b.x - a.x, b.y - a.y)
      );
    }),
  );
}
function square(point: Point, scale: number, rotation: number): Point[] {
  const angle = (rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    h = scale / 2;
  return [-h, h].flatMap((u) =>
    [-h, h].map((v) => ({ x: point.x + u * c + v * s, y: point.y - u * s + v * c })),
  );
}
function fullCell(): TileCell {
  const polygon = hexagon();
  return {
    id: 'landscape',
    center: { x: 0, y: 0 },
    polygon,
    surfacePolygons: [polygon],
    neighbors: [],
    baseHeight: 0.2,
    height: 0.2,
    color: '#678950',
    reserved: false,
  };
}

describe('exact parallel inset tile border', () => {
  it.each([0.001, 0.015, 0.04, 0.1])(
    'partitions the width %s ring into positive non-overlapping clipped pieces',
    (width) => {
      const ring = borderRing(width),
        outer = hexagon(),
        inner = outer.map((point) => ({
          x: point.x * (1 - width / APOTHEM),
          y: point.y * (1 - width / APOTHEM),
        }));
      expect(ring).toHaveLength(6);
      expect(ring.reduce((sum, polygon) => sum + polygonArea(polygon), 0)).toBeCloseTo(
        6 * width - 2 * Math.sqrt(3) * width * width,
        12,
      );
      expect(
        ring.reduce((sum, polygon) => sum + polygonArea(polygon), 0) + polygonArea(inner),
      ).toBeCloseTo(polygonArea(outer), 12);
      for (let i = 0; i < ring.length; i++) {
        const polygon = ring[i]!;
        expect(polygonArea(polygon)).toBeGreaterThan(0);
        expect(polygon.every((point) => pointInPolygon(point, outer))).toBe(true);
        expect(Math.abs(polygonArea(clipPolygon(polygon, inner)))).toBeLessThan(1e-10);
        const a = outer[i]!,
          b = outer[(i + 1) % 6]!,
          p = polygon[2]!;
        expect(
          ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) /
            Math.hypot(b.x - a.x, b.y - a.y),
        ).toBeCloseTo(width, 12);
        for (let j = i + 1; j < ring.length; j++)
          expect(Math.abs(polygonArea(clipPolygon(polygon, ring[j]!)))).toBeLessThan(1e-10);
      }
    },
  );
  it('has no band at zero width and handles the limiting full-hex ring', () => {
    expect(borderRing(0)).toEqual([]);
    expect(borderRing(-0.1)).toEqual([]);
    expect(borderRing(1)).toEqual([hexagon()]);
  });
  it('recognizes only the main-hex band and treats its inner boundary as usable ground', () => {
    const config = structuredClone(defaultConfig);
    config.border.enabled = true;
    config.border.width = 0.04;
    expect(inTileBorder(config, { x: 0, y: APOTHEM - 0.02 })).toBe(true);
    expect(inTileBorder(config, { x: 1, y: 0 })).toBe(true);
    expect(inTileBorder(config, { x: 0, y: APOTHEM - 0.04 })).toBe(false);
    expect(inTileBorder(config, { x: 0, y: APOTHEM - 0.041 })).toBe(false);
    expect(inTileBorder(config, { x: 0, y: APOTHEM + 0.01 })).toBe(false);
    expect(inTileBorder(config, { x: 0, y: 0 })).toBe(false);
    config.border.enabled = false;
    expect(inTileBorder(config, { x: 1, y: 0 })).toBe(false);
    expect(decorationClearsBorder(config, { x: 2, y: 2 }, 10, 45)).toBe(true);
    config.border.enabled = true;
    config.border.width = 0;
    expect(inTileBorder(config, { x: 1, y: 0 })).toBe(false);
    expect(decorationClearsBorder(config, { x: 2, y: 2 }, 10, 45)).toBe(true);
  });
});

describe('whole normalized decoration footprint clearance', () => {
  it('rejects an overlapping footprint even when its anchor is outside the reserved band', () => {
    const config = structuredClone(defaultConfig);
    config.border.enabled = true;
    config.border.width = 0.04;
    const point = { x: 0, y: APOTHEM - 0.04 - 0.04 };
    expect(inTileBorder(config, point)).toBe(false);
    expect(decorationClearsBorder(config, point, 0.1)).toBe(false);
    const farther = { x: 0, y: APOTHEM - 0.04 - 0.051 };
    expect(decorationClearsBorder(config, farther, 0.1, 0)).toBe(true);
    expect(decorationClearsBorder(config, farther, 0.1, 45)).toBe(false);
    expect(decorationClearsBorder(config, { x: 0, y: 0 }, 0.6, 123)).toBe(true);
  });
  it('uses Three Y-rotation signs at a diagonal outer edge', () => {
    const config = structuredClone(defaultConfig);
    config.border.enabled = true;
    config.border.width = 0.015;
    const radial = APOTHEM - config.border.width - 0.065,
      point = { x: (Math.sqrt(3) / 2) * radial, y: radial / 2 };
    expect(decorationClearsBorder(config, point, 0.1, 15)).toBe(false);
    expect(decorationClearsBorder(config, point, 0.1, -15)).toBe(true);
    expect(decorationClearsBorder(config, point, 0.1, 375)).toBe(false);
  });
  it.each(['black', 'custom', 'fields', 'transparent'] as const)(
    'reserves the same complete footprint in mode %s',
    (mode) => {
      const config = structuredClone(defaultConfig);
      config.border = { enabled: true, width: 0.07, mode, color: '#f0318c' };
      for (const rotation of [0, 15, 45, 90, 137, 270])
        for (const scale of [0.01, 0.05, 0.15, 0.4])
          for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
            const point = { x, y: x / 2 },
              expected = square(point, scale, rotation).every(
                (corner) => boundaryDistance(corner) >= config.border.width - 1e-9,
              );
            expect(decorationClearsBorder(config, point, scale, rotation)).toBe(expected);
          }
    },
  );
});

describe('deterministic decoration filtering and reversible manual conflicts', () => {
  it.each(
    (['hex', 'diamond'] as const).flatMap((kind) =>
      [6, 18, 24].map((divisions) => ({ kind, divisions })),
    ),
  )(
    'filters seeded $kind objects at resolution $divisions without changing retained records',
    ({ kind, divisions }) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.grid.divisions = divisions;
      config.grid.subDivisions = 4;
      config.decoration.density = 0.95;
      config.decoration.maxPerCell = 8;
      config.decoration.species = [...DECORATION_KINDS];
      const center = createCenterPolygon(config.seed, config.center),
        cells = buildGrid(config.grid, center, { portalWidth: config.center.portalWidth });
      cells.forEach((cell) => {
        cell.baseHeight = cell.height = 0.2;
      });
      const baseline = buildDecorations(config, cells, center);
      expect(baseline.decorations.length).toBeGreaterThan(0);
      config.border = { enabled: true, width: 0.06, mode: 'black', color: '#000000' };
      const filtered = buildDecorations(config, cells, center);
      expect(filtered.decorations).toEqual(
        baseline.decorations.filter((object) =>
          decorationClearsBorder(config, object.position, object.scale, object.rotation),
        ),
      );
      expect(filtered.decorations.length).toBeLessThan(baseline.decorations.length);
      expect(filtered.decorations.length).toBeGreaterThan(0);
      expect(filtered.warnings).toEqual([]);
      for (const object of filtered.decorations)
        for (const corner of square(object.position, object.scale, object.rotation))
          expect(boundaryDistance(corner)).toBeGreaterThanOrEqual(config.border.width - 1e-8);
      for (const mode of ['custom', 'fields', 'transparent'] as const) {
        config.border.mode = mode;
        config.border.color = '#de2789';
        expect(buildDecorations(config, cells, center)).toEqual(filtered);
      }
      config.border.enabled = false;
      expect(buildDecorations(config, cells, center)).toEqual(baseline);
    },
  );
  it.each([6, 18, 24])(
    'hides conflicting manual/imported kinds at scale-dependent resolution %s while preserving config and disabled restoration',
    (divisions) => {
      const config = structuredClone(defaultConfig);
      config.grid.divisions = divisions;
      config.decoration.density = 0;
      config.border = { enabled: false, width: 0.03, mode: 'transparent', color: '#000000' };
      const cell = fullCell(),
        center = createCenterPolygon(config.seed, config.center),
        near = { x: 0, y: APOTHEM - config.border.width - 0.002 };
      config.decoration.placements = DECORATION_KINDS.flatMap((kind, index) => {
        const angle = (index / DECORATION_KINDS.length) * Math.PI * 2,
          safe = { x: Math.cos(angle) * 0.3, y: Math.sin(angle) * 0.3 },
          scale = [0.2, 1, 3][index % 3]!,
          rotation = [0, 15, 45, 90][index % 4]!;
        return [
          {
            id: `edge-${kind}`,
            kind,
            cellId: cell.id,
            offset: placementOffset(cell, near),
            scale,
            rotation,
          },
          {
            id: `safe-${kind}`,
            kind,
            cellId: cell.id,
            offset: placementOffset(cell, safe),
            scale,
            rotation,
          },
        ];
      });
      const original = structuredClone(config.decoration.placements),
        baseline = buildDecorations(config, [cell], center);
      expect(baseline.decorations).toHaveLength(36);
      config.border.enabled = true;
      const result = buildDecorations(config, [cell], center);
      expect(result.decorations.map((object) => object.id)).toEqual(
        DECORATION_KINDS.map((kind) => `safe-${kind}`),
      );
      expect(result.warnings).toHaveLength(18);
      for (const kind of DECORATION_KINDS)
        expect(
          result.warnings.some(
            (warning) => warning.includes(`edge-${kind}`) && warning.includes('Randzone'),
          ),
        ).toBe(true);
      expect(config.decoration.placements).toEqual(original);
      const imported = configSchema.parse(JSON.parse(JSON.stringify(config)));
      expect(buildDecorations(imported, [cell], center)).toEqual(result);
      expect(imported.decoration.placements).toEqual(original);
      imported.border.enabled = false;
      expect(buildDecorations(imported, [cell], center)).toEqual(baseline);
    },
  );
  it('keeps a filtered manual slot occupied so a smaller procedural substitute does not appear there', () => {
    const config = structuredClone(defaultConfig);
    config.grid.divisions = 6;
    config.grid.subDivisions = 4;
    config.decoration.density = 1;
    config.decoration.maxPerCell = 12;
    const center = createCenterPolygon(config.seed, config.center),
      cells = buildGrid(config.grid, center),
      baseline = buildDecorations(config, cells, center);
    config.border.enabled = true;
    config.border.width = 0.015;
    const object = baseline.decorations.find(
        (object) =>
          boundaryDistance(object.position) < 0.18 &&
          decorationClearsBorder(config, object.position, object.scale, object.rotation),
      )!,
      cell = cells.find((cell) => cell.id === object.cellId)!;
    config.border.enabled = false;
    expect(object).toBeDefined();
    config.decoration.placements = [
      {
        id: 'oversized-manual',
        kind: 'quartz',
        cellId: cell.id,
        offset: placementOffset(cell, object.position),
        scale: 3,
        rotation: 45,
      },
    ];
    const disabled = buildDecorations(config, cells, center);
    config.border.enabled = true;
    config.border.width = 0.015;
    const enabled = buildDecorations(config, cells, center);
    expect(enabled.decorations).toEqual(
      disabled.decorations.filter((object) =>
        decorationClearsBorder(config, object.position, object.scale, object.rotation),
      ),
    );
    expect(
      enabled.decorations.some(
        (candidate) => candidate.id === 'oversized-manual' || candidate.id === object.id,
      ),
    ).toBe(false);
    expect(enabled.warnings.some((warning) => warning.includes('oversized-manual'))).toBe(true);
  });
});
