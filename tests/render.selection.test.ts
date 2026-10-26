import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clipPolygon, polygonArea, regularPolygon } from '../src/core/geometry';
import type { GameField, GeneratedTile, Point, TileCell } from '../src/core/types';
import { FIELD_BORDER_LIFT } from '../src/render/borders';
import {
  buildSelectionOutline,
  landscapeSelectionColor,
  SELECTION_FALLBACK_COLOR,
  selectionOutlineKey,
  selectionSurfaceTile,
} from '../src/render/selection';
import { SurfaceBuffer } from '../src/render/surfaces';

const rect = (x0: number, x1: number, y0: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(
  id: string,
  polygon: Point[],
  color = '#008000',
  height = 0.2,
  fieldId?: string,
): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: [polygon],
    color,
    height,
    baseHeight: height,
    center: { x: (polygon[0]!.x + polygon[2]!.x) / 2, y: (polygon[0]!.y + polygon[2]!.y) / 2 },
    fieldId,
    neighbors: [],
    reserved: false,
  };
}
function field(id: string, cells: TileCell[], isCenter = false): GameField {
  return {
    id,
    cellIds: cells.map((cell) => cell.id),
    center: cells[0]!.center,
    height: Math.min(...cells.map((cell) => cell.height)),
    maxHeight: Math.max(...cells.map((cell) => cell.height)),
    symbolHeight: cells[0]!.height,
    color: '#bb8844',
    action: 'event',
    label: id,
    isCenter,
    area: cells.reduce((sum, cell) => sum + Math.abs(polygonArea(cell.polygon)), 0),
  };
}
function tile(
  cells: TileCell[],
  fields: GameField[] = [],
  centerPolygon = rect(0.6, 0.7, -0.1, 0.1),
): GeneratedTile {
  return {
    cells,
    fields,
    center: {
      polygon: centerPolygon,
      height: fields.find((field) => field.isCenter)?.height ?? 0.12,
      sides: [],
    },
    connections: [],
    decorations: [],
    pathDetails: [],
    entrances: [],
    warnings: [],
    stats: { cells: cells.length, fields: fields.length, decorations: 0, connected: true },
  };
}
const perimeter = (outline: ReturnType<typeof buildSelectionOutline>): number =>
  outline.segments.reduce(
    (sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
    0,
  );

describe('landscape-derived selection signal', () => {
  it.each([
    ['#ff0000', '#00ffff'],
    ['#008000', '#ff00ff'],
    ['#0000ff', '#ffff00'],
    ['#ffff00', '#0000ff'],
    ['#00ffff', '#ff0000'],
    ['#ff00ff', '#00ff00'],
  ])(
    'rotates the actual %s ground hue by 180 degrees to fully saturated %s',
    (ground, expected) => {
      expect(landscapeSelectionColor(tile([cell('ground', rect(0, 1, 0, 1), ground)]))).toBe(
        expected,
      );
    },
  );
  it('weights the average by clipped visible ground area rather than cell count or original raster size', () => {
    const green = cell('large', rect(0, 3, 0, 1), '#00ff00'),
      red = cell('small', rect(3, 4, 0, 1), '#ff0000');
    expect(landscapeSelectionColor(tile([green, red]))).toBe('#aa00ff');
    green.surfacePolygons = [rect(0, 1, 0, 1)];
    expect(landscapeSelectionColor(tile([green, red]))).toBe('#0000ff');
    green.surfacePolygons = [rect(0, 0.5, 0, 1), rect(0.5, 1, 0, 1)];
    expect(landscapeSelectionColor(tile([red, green]))).toBe('#0000ff');
  });
  it('excludes game-field colors, reserved center pieces and invisible or invalid ground', () => {
    const ground = cell('ground', rect(0, 1, 0, 1), '#008000'),
      playing = cell('field', rect(0, 100, 0, 1), '#0000ff', 0.1, 'play');
    const hidden = cell('hidden', rect(0, 100, 0, 1), '#ff0000');
    hidden.surfacePolygons = [];
    const invalid = cell('invalid', rect(0, 100, 0, 1), 'not-a-color');
    expect(landscapeSelectionColor(tile([ground, playing, hidden, invalid]))).toBe('#ff00ff');
  });
  it.each(['#000000', '#ffffff', '#888888', '#808081'])(
    'uses a deterministic saturated fallback for neutral %s ground',
    (color) => {
      expect(landscapeSelectionColor(tile([cell('neutral', rect(0, 1, 0, 1), color)]))).toBe(
        SELECTION_FALLBACK_COLOR,
      );
    },
  );
  it('also uses that fallback when no free landscape remains', () => {
    expect(landscapeSelectionColor(tile([]))).toBe(SELECTION_FALLBACK_COLOR);
    expect(
      landscapeSelectionColor(tile([cell('field', rect(0, 1, 0, 1), '#008000', 0.2, 'play')])),
    ).toBe(SELECTION_FALLBACK_COLOR);
  });
});

describe('whole-union selection contours', () => {
  it('replaces the full selected field exterior without internal raster ink or filled caps', () => {
    const left = cell('left', rect(-0.2, 0, -0.2, 0.2), '#bb8844', 0.2, 'play'),
      right = cell('right', rect(0, 0.2, -0.2, 0.2), '#bb8844', 0.2, 'play');
    const model = tile([left, right], [field('play', [left, right])]),
      outline = buildSelectionOutline(model, [], 'play');
    expect(perimeter(outline)).toBeCloseTo(1.6, 8);
    expect(
      outline.segments.every(
        (edge) => !(Math.abs(edge.start.x) < 1e-8 && Math.abs(edge.end.x) < 1e-8),
      ),
    ).toBe(true);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(outline.geometry, material);
    mesh.updateMatrixWorld();
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0)).intersectObject(
        mesh,
      ),
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0.1, 2, -0.198),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(mesh).length,
    ).toBeGreaterThan(0);
    outline.geometry.dispose();
    material.dispose();
  });
  it('prioritizes the draft union without including any unselected cell from its former fields', () => {
    const left = cell('left', rect(-0.2, 0, -0.2, 0.2), '#bb8844', 0.2, 'play'),
      right = cell('right', rect(0, 0.2, -0.2, 0.2), '#bb8844', 0.2, 'play');
    const other = cell('other', rect(0.2, 0.4, -0.2, 0.2), '#bb8844', 0.2, 'play');
    const model = tile([left, right, other], [field('play', [left, right, other])]),
      before = structuredClone(model);
    const outline = buildSelectionOutline(model, ['left', 'right', 'right'], 'play');
    expect(perimeter(outline)).toBeCloseTo(1.6, 8);
    const positions = outline.geometry.getAttribute('position');
    expect(
      Math.max(...Array.from({ length: positions.count }, (_, i) => positions.getX(i))),
    ).toBeLessThanOrEqual(0.200001);
    expect(model).toEqual(before);
    expect(selectionSurfaceTile(model, ['left', 'right']).fields[0]!.cellIds).toEqual([
      'left',
      'right',
    ]);
    outline.geometry.dispose();
  });
  it('keeps disconnected draft parts separate without bridges or interior raster edges', () => {
    const a = cell('a', rect(-0.5, -0.3, -0.1, 0.1)),
      b = cell('b', rect(0.3, 0.5, -0.1, 0.1));
    const outline = buildSelectionOutline(tile([a, b]), ['a', 'b']);
    expect(perimeter(outline)).toBeCloseTo(1.6, 8);
    const positions = outline.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      expect(Math.abs(positions.getX(i))).toBeGreaterThan(0.29);
    outline.geometry.dispose();
  });
  it('preserves an enclosed hole in a draft union', () => {
    const cells: TileCell[] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        if (x !== 1 || y !== 1)
          cells.push(cell(`${x}:${y}`, rect(x * 0.2, (x + 1) * 0.2, y * 0.2, (y + 1) * 0.2)));
    const outline = buildSelectionOutline(
      tile(cells),
      cells.map((cell) => cell.id),
    );
    expect(perimeter(outline)).toBeCloseTo(3.2, 8);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(outline.geometry, material);
    mesh.updateMatrixWorld();
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0.3, 2, 0.3),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(mesh),
    ).toHaveLength(0);
    outline.geometry.dispose();
    material.dispose();
  });
  it('follows actual plateau heights on a terraced draft with only horizontal and vertical triangles', () => {
    const left = cell('left', rect(-0.2, 0, -0.2, 0.2), '#008000', 0.12),
      right = cell('right', rect(0, 0.2, -0.2, 0.2), '#008000', 0.3);
    const model = tile([left, right]),
      source = new SurfaceBuffer();
    for (const c of model.cells) source.polygon(c.polygon, c.height, c.color);
    const terrain = source.geometry(),
      outline = buildSelectionOutline(model, ['left', 'right'], undefined, terrain),
      positions = outline.geometry.getAttribute('position');
    expect(new Set(outline.segments.map((edge) => edge.height))).toEqual(new Set([0.12, 0.3]));
    expect(outline.steps).toHaveLength(2);
    for (let i = 0; i < positions.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i),
        b = new THREE.Vector3().fromBufferAttribute(positions, i + 1),
        c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      const cross = b.sub(a).cross(c.sub(a));
      if (cross.length() < 1e-11) continue;
      const y = Math.abs(cross.normalize().y);
      expect(y < 1e-5 || y > 1 - 1e-5).toBe(true);
      if (y > 0.5) {
        const centerX = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
        expect(positions.getY(i)).toBeCloseTo((centerX < 0 ? 0.12 : 0.3) + FIELD_BORDER_LIFT, 6);
      }
    }
    terrain.dispose();
    outline.geometry.dispose();
  });
  it('traces the entire terraced pentagon without outlining its reserved internal raster', () => {
    const polygon = regularPolygon(5, 0.15),
      low = cell('low', clipPolygon(polygon, rect(-2, 0, -2, 2)), '#bb8844', 0.12, 'center'),
      high = cell('high', clipPolygon(polygon, rect(0, 2, -2, 2)), '#bb8844', 0.3, 'center');
    low.surfacePolygons = [];
    high.surfacePolygons = [];
    const model = tile([low, high], [field('center', [low, high], true)], polygon),
      outline = buildSelectionOutline(model, [], 'center');
    expect(perimeter(outline)).toBeCloseTo(5 * 2 * 0.15 * Math.sin(Math.PI / 5), 7);
    expect(
      outline.segments.every(
        (edge) => !(Math.abs(edge.start.x) < 1e-8 && Math.abs(edge.end.x) < 1e-8),
      ),
    ).toBe(true);
    expect(new Set(outline.segments.map((edge) => edge.height))).toEqual(new Set([0.12, 0.3]));
    outline.geometry.dispose();
  });
  it('clears for an absent selection, unknown field, or reserved-only draft', () => {
    const reserved = cell('reserved', rect(-0.1, 0.1, -0.1, 0.1));
    reserved.surfacePolygons = [];
    const model = tile([reserved]);
    for (const [ids, fieldId] of [
      [[], undefined],
      [[], 'missing'],
      [['reserved'], undefined],
      [['missing'], undefined],
    ] as const) {
      const outline = buildSelectionOutline(model, ids, fieldId);
      expect(outline.geometry.getAttribute('position').count).toBe(0);
      outline.geometry.dispose();
    }
  });
  it('caches reordered duplicate IDs while invalidating field, color and surface changes', () => {
    const key = selectionOutlineKey(['b', 'a', 'a'], 'play', 3, '#ff00ff');
    expect(selectionOutlineKey(['a', 'b'], 'play', 3, '#ff00ff')).toBe(key);
    expect(selectionOutlineKey(['a', 'b'], 'other', 3, '#ff00ff')).not.toBe(key);
    expect(selectionOutlineKey(['a', 'b'], 'play', 4, '#ff00ff')).not.toBe(key);
    expect(selectionOutlineKey(['a', 'b'], 'play', 3, '#00ffff')).not.toBe(key);
  });
});
