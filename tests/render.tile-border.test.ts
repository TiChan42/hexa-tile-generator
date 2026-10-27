import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultConfig, generateTile } from '../src/core';
import { borderRing } from '../src/core/tile-border';
import { centroid, clipPolygon, hexagon, pointInPolygon, polygonArea } from '../src/core/geometry';
import type { GameField, GeneratedTile, Point, TileCell, TileConfig } from '../src/core/types';
import {
  buildFieldBorders,
  FIELD_BORDER_COLOR,
  FIELD_BORDER_LIFT,
  FIELD_BORDER_WIDTH,
  OUTER_FIELD_BORDER_COLOR,
  isOuterHexEdge,
} from '../src/render/borders';
import { buildSelectionOutline } from '../src/render/selection';
import { buildTileBorder, tileBorderColor, tileBorderMasks } from '../src/render/tileBorder';
import { buildTileSurfaces, surfaceRegions } from '../src/render/surfaces';
import { renderGeometryKey } from '../src/render/state';

const APOTHEM = Math.sqrt(3) / 2;
const rect = (x0: number, x1: number, y0: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(id: string, polygon: Point[], height: number, fieldId?: string): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: [polygon],
    height,
    baseHeight: height,
    fieldId,
    color: '#668844',
    center: centroid(polygon),
    neighbors: [],
    reserved: false,
  };
}
function field(id: string, cells: TileCell[]): GameField {
  return {
    id,
    cellIds: cells.map((cell) => cell.id),
    center: cells[0]!.center,
    height: Math.min(...cells.map((cell) => cell.height)),
    maxHeight: Math.max(...cells.map((cell) => cell.height)),
    symbolHeight: cells[0]!.height,
    color: '#ccaa88',
    action: 'event',
    label: id,
    isCenter: false,
    area: cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0),
  };
}
function tile(cells: TileCell[], fields: GameField[] = []): GeneratedTile {
  return {
    cells,
    fields,
    center: { polygon: [], height: 0.1, sides: [] },
    connections: [],
    entrances: [],
    decorations: [],
    pathDetails: [],
    warnings: [],
    stats: { cells: cells.length, fields: fields.length, decorations: 0, connected: true },
  };
}
function rayHits(
  geometry: THREE.BufferGeometry,
  point: Point,
  height = 2,
  direction = new THREE.Vector3(0, -1, 0),
): THREE.Intersection[] {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  const hits = new THREE.Raycaster(
    new THREE.Vector3(point.x, height, point.y),
    direction,
  ).intersectObject(mesh);
  material.dispose();
  return hits;
}
const settings = (values: Partial<TileConfig['border']> = {}): TileConfig['border'] => ({
  ...defaultConfig.border,
  enabled: true,
  ...values,
});
function projectedTopArea(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < p.count; i += 3)
    area +=
      Math.abs(
        (p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) -
          (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i)),
      ) / 2;
  return area;
}

describe('inner tile border band', () => {
  it.each([0.005, 0.015, 0.1])(
    'uses an exact inward world width of %f without growing the main hexagon',
    (width) => {
      const model = tile([cell('ground', hexagon(), 0.2)]),
        band = buildTileBorder(model, settings({ width })),
        positions = band.getAttribute('position');
      const inner = hexagon().map((p) => ({
        x: p.x * (1 - width / APOTHEM),
        y: p.y * (1 - width / APOTHEM),
      }));
      expect(projectedTopArea(band)).toBeCloseTo(polygonArea(hexagon()) - polygonArea(inner), 6);
      for (let i = 0; i < positions.count; i++)
        expect(
          pointInPolygon(
            { x: positions.getX(i) * (1 - 1e-7), y: positions.getZ(i) * (1 - 1e-7) },
            hexagon(),
          ),
        ).toBe(true);
      const boundary = hexagon();
      for (let side = 0; side < 6; side++) {
        const a = boundary[side]!,
          b = boundary[(side + 1) % 6]!,
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        for (const distance of [width * 0.1, width * 0.99]) {
          const p = { x: mid.x * (1 - distance / APOTHEM), y: mid.y * (1 - distance / APOTHEM) };
          expect(rayHits(band, p)[0]?.point.y).toBeCloseTo(0.2 + FIELD_BORDER_LIFT, 6);
        }
        expect(
          rayHits(band, {
            x: mid.x * (1 - (width * 1.01) / APOTHEM),
            y: mid.y * (1 - (width * 1.01) / APOTHEM),
          }),
        ).toHaveLength(0);
      }
      band.dispose();
    },
  );
  it('subtracts complete field ground from the entire band regardless of platform elevation', () => {
    const polygon = hexagon(),
      pathPolygon = clipPolygon(polygon, rect(-0.08, 0.08, 0.7, 1));
    const path = cell('path', pathPolygon, 0.4, 'play'),
      ground = cell('ground', polygon, 0.1),
      model = tile([ground, path], [field('play', [path])]);
    const width = 0.1,
      masks = tileBorderMasks(model, width),
      band = buildTileBorder(model, settings({ width }));
    for (const mask of masks)
      expect(Math.abs(polygonArea(clipPolygon(mask, pathPolygon)))).toBeLessThan(1e-10);
    for (const y of [APOTHEM - 0.001, APOTHEM - 0.02, APOTHEM - 0.08])
      for (const x of [-0.07, 0, 0.07]) expect(rayHits(band, { x, y })).toHaveLength(0);
    expect(rayHits(band, { x: 0.12, y: APOTHEM - 0.03 }).length).toBeGreaterThan(0);
    band.dispose();
  });
  it('also excludes field overhangs supplied by the actual rendered surface regions', () => {
    const pathPolygon = clipPolygon(hexagon(), rect(-0.08, 0.08, 0.7, 1)),
      path = cell('path', pathPolygon, 0.4, 'play');
    const model = tile([path], [field('play', [path])]);
    const regions = [
      ...surfaceRegions(model),
      {
        id: 'play',
        cellId: 'path',
        fieldId: 'play',
        polygons: [rect(0.08, 0.09, 0.8, APOTHEM)],
        height: 0.4002,
        color: path.color,
      },
    ];
    const masks = tileBorderMasks(model, 0.1, regions);
    const cap = regions.at(-1)!.polygons[0]!;
    for (const mask of masks)
      expect(Math.abs(polygonArea(clipPolygon(mask, cap)))).toBeLessThan(1e-10);
  });
  it('wraps real vertical terrace steps in the ring while leaving the outer cliff and inner terrain unpainted', () => {
    const west = cell('west', clipPolygon(hexagon(), rect(-2, 0, -2, 2)), 0.12),
      east = cell('east', clipPolygon(hexagon(), rect(0, 2, -2, 2)), 0.3),
      model = tile([west, east]);
    const band = buildTileBorder(model, settings({ width: 0.03 }));
    const hit = rayHits(band, { x: -0.02, y: APOTHEM - 0.01 }, 0.21, new THREE.Vector3(1, 0, 0))[0];
    expect(hit?.point.x).toBeCloseTo(0, 7);
    expect(hit?.face?.normal.y).toBeCloseTo(0, 7);
    expect(rayHits(band, { x: -0.02, y: 0 }, 0.21, new THREE.Vector3(1, 0, 0))).toHaveLength(0);
    expect(
      rayHits(band, { x: -0.1, y: APOTHEM + 0.05 }, 0, new THREE.Vector3(0, 0, -1)),
    ).toHaveLength(0);
    const positions = band.getAttribute('position');
    let horizontal = 0,
      vertical = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i),
        b = new THREE.Vector3().fromBufferAttribute(positions, i + 1),
        c = new THREE.Vector3().fromBufferAttribute(positions, i + 2),
        normal = b.sub(a).cross(c.sub(a));
      if (normal.length() < 1e-11) continue;
      const y = Math.abs(normal.normalize().y);
      expect(y < 1e-5 || y > 1 - 1e-5).toBe(true);
      if (y > 0.5) horizontal++;
      else vertical++;
    }
    expect(horizontal).toBeGreaterThan(0);
    expect(vertical).toBeGreaterThan(0);
    band.dispose();
  });
  it('keeps a uniform-height border entirely horizontal instead of painting the outer side walls', () => {
    const band = buildTileBorder(tile([cell('ground', hexagon(), 0.2)]), settings());
    const p = band.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(0.2 + FIELD_BORDER_LIFT, 6);
    band.dispose();
  });
  it.each([{ enabled: false }, { mode: 'transparent' as const }, { width: 0 }])(
    'draws no band for %j and retains all ground',
    (values) => {
      const model = tile([cell('ground', hexagon(), 0.2)]),
        config = structuredClone(defaultConfig);
      const original = buildTileSurfaces(model, config);
      config.border = settings(values);
      const after = buildTileSurfaces(model, config),
        band = buildTileBorder(model, config.border, after.geometry, after.regions);
      expect(band.getAttribute('position').count).toBe(0);
      expect([...after.geometry.getAttribute('position').array]).toEqual([
        ...original.geometry.getAttribute('position').array,
      ]);
      original.geometry.dispose();
      after.geometry.dispose();
      band.dispose();
    },
  );
  it('uses black, custom, or normal field ink independently of the signal selection color', () => {
    expect(tileBorderColor(settings())).toBe('#000000');
    expect(tileBorderColor(settings({ mode: 'custom', color: '#aabbcc' }))).toBe('#aabbcc');
    expect(tileBorderColor(settings({ mode: 'fields', color: '#ff00ff' }))).toBe(
      FIELD_BORDER_COLOR,
    );
    expect(tileBorderColor(settings({ mode: 'transparent' }))).toBeUndefined();
  });
});

describe('closed entrance contours and border caching', () => {
  it('bounds each outer mouth with normal field-width ink while the thick tile band stays interrupted', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    const model = generateTile(config),
      batch = buildTileSurfaces(model, config);
    const closed = buildFieldBorders(model, batch.geometry),
      band = buildTileBorder(model, settings({ width: 0.1 }), batch.geometry, batch.regions);
    expect(closed.segments.some((edge) => isOuterHexEdge(edge.start, edge.end))).toBe(true);
    for (const entrance of model.entrances) {
      const inside = (depth: number) => ({
        x: entrance.center.x * (1 - depth / APOTHEM),
        y: entrance.center.y * (1 - depth / APOTHEM),
      });
      const point = inside(FIELD_BORDER_WIDTH * 0.5);
      const hits = rayHits(closed.geometry, point);
      expect(hits.length).toBeGreaterThan(0);
      const color = closed.geometry.getAttribute('color'),
        face = hits[0]!.face!;
      for (const index of [face.a, face.b, face.c])
        expect([color.getX(index), color.getY(index), color.getZ(index)]).toEqual([0, 0, 0]);
      expect(rayHits(closed.geometry, inside(FIELD_BORDER_WIDTH * 1.2))).toHaveLength(0);
      expect(rayHits(band, point)).toHaveLength(0);
      expect(rayHits(band, inside(0.04))).toHaveLength(0);
      const selected = buildSelectionOutline(model, [], entrance.fieldId!, batch.geometry);
      expect(rayHits(selected.geometry, point).length).toBeGreaterThan(0);
      selected.geometry.dispose();
    }
    expect(OUTER_FIELD_BORDER_COLOR).toBe('#000000');
    const colors = closed.geometry.getAttribute('color');
    expect(colors.count).toBe(closed.geometry.getAttribute('position').count);
    expect(Array.from(colors.array).some((value) => value > 0)).toBe(true);
    batch.geometry.dispose();
    closed.geometry.dispose();
    band.dispose();
  });
  it('keeps generated field footprints clear and produces one finite bounded mesh at a wide border setting', () => {
    const config = structuredClone(defaultConfig);
    config.border = settings({ width: 0.1 });
    config.decoration.enabled = false;
    config.paths.heightMode = 'terraced';
    const model = generateTile(config),
      batch = buildTileSurfaces(model, config),
      band = buildTileBorder(model, config.border, batch.geometry, batch.regions),
      p = band.getAttribute('position');
    expect(p.count).toBeGreaterThan(0);
    expect([...p.array].every(Number.isFinite)).toBe(true);
    expect(p.count).toBeLessThan(batch.geometry.getAttribute('position').count * 10);
    const fields = surfaceRegions(model)
        .filter((region) => region.fieldId)
        .flatMap((region) => region.polygons),
      masks = tileBorderMasks(model, config.border.width, batch.regions);
    let largestOverlap = 0;
    for (const mask of masks)
      for (const polygon of fields)
        largestOverlap = Math.max(
          largestOverlap,
          Math.abs(polygonArea(clipPolygon(mask, polygon))),
        );
    expect(largestOverlap).toBeLessThan(1e-9);
    const outer = hexagon();
    let allVerticesInside = true;
    for (let i = 0; i < p.count; i++)
      allVerticesInside =
        pointInPolygon({ x: p.getX(i) * (1 - 1e-7), y: p.getZ(i) * (1 - 1e-7) }, outer) &&
        allVerticesInside;
    expect(allVerticesInside).toBe(true);
    batch.geometry.dispose();
    band.dispose();
  });
  it('reuses geometry for visible color modes while invalidating width, visibility and mouth changes', () => {
    const model = tile([cell('ground', hexagon(), 0.2)]),
      config = structuredClone(defaultConfig),
      disabled = renderGeometryKey(model, config, 0);
    config.border = settings({ width: 0 });
    expect(renderGeometryKey(model, config, 0)).toBe(disabled);
    config.border = settings();
    const active = renderGeometryKey(model, config, 0);
    expect(active).not.toBe(disabled);
    config.border.mode = 'custom';
    config.border.color = '#ff00ff';
    expect(renderGeometryKey(model, config, 0)).toBe(active);
    config.border.mode = 'fields';
    expect(renderGeometryKey(model, config, 0)).toBe(active);
    config.border.width = 0.03;
    expect(renderGeometryKey(model, config, 0)).not.toBe(active);
    config.border.width = 0.015;
    config.border.mode = 'transparent';
    expect(renderGeometryKey(model, config, 0)).not.toBe(active);
    expect(renderGeometryKey(model, config, 0)).not.toBe(disabled);
  });
  it('returns no ring geometry at zero width', () => {
    expect(borderRing(0)).toEqual([]);
  });
});
