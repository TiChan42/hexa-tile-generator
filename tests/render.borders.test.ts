import { SurfaceProjection } from '../src/render/surfaceProjection';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clipPolygon, polygonArea, regularPolygon } from '../src/core/geometry';
import type { GeneratedTile, GameField, TileCell, Point } from '../src/core/types';
import {
  buildFieldBorders,
  fieldOutlineSegments,
  FIELD_BORDER_WIDTH,
  FIELD_BORDER_LIFT,
} from '../src/render/borders';
import { buildTileSurfaces, fieldSurfaceRegions, SurfaceBuffer } from '../src/render/surfaces';
import { fieldSymbolLayout } from '../src/render/symbols';
import { pickTileSurface } from '../src/render/picking';
import { defaultConfig } from '../src/core';

const rect = (x0: number, x1: number, y0: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
function cell(
  id: string,
  polygon: Point[],
  height: number,
  fieldId: string,
  hidden = false,
): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: hidden ? [] : [polygon],
    center: { x: (polygon[0]!.x + polygon[2]!.x) / 2, y: (polygon[0]!.y + polygon[2]!.y) / 2 },
    height,
    baseHeight: height,
    color: '#d4bd82',
    fieldId,
    neighbors: [],
    reserved: hidden,
  };
}
function field(id: string, cells: TileCell[], isCenter = false): GameField {
  const heights = cells.map((c) => c.height);
  return {
    id,
    cellIds: cells.map((c) => c.id),
    center: cells[0]!.center,
    height: Math.min(...heights),
    maxHeight: Math.max(...heights),
    symbolHeight: cells[0]!.height,
    color: '#d4bd82',
    action: 'event',
    label: id,
    isCenter,
    area: cells.reduce((sum, c) => sum + Math.abs(polygonArea(c.polygon)), 0),
  };
}
function tile(
  cells: TileCell[],
  fields: GameField[],
  centerPolygon = rect(0.6, 0.7, -0.1, 0.1),
): GeneratedTile {
  return {
    cells,
    fields,
    center: {
      polygon: centerPolygon,
      height: fields.find((f) => f.isCenter)?.height ?? 0.12,
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

describe('world-width union field borders', () => {
  it('removes internal raster edges even when the same playing field has two terrace heights', () => {
    const left = cell('l', rect(-0.2, 0, -0.2, 0.2), 0.12, 'play'),
      right = cell('r', rect(0, 0.2, -0.2, 0.2), 0.3, 'play');
    const playing = field('play', [left, right]),
      model = tile([left, right], [playing]);
    const border = buildFieldBorders(model);
    expect(
      border.segments.some((edge) => Math.abs(edge.start.x) < 1e-8 && Math.abs(edge.end.x) < 1e-8),
    ).toBe(false);
    expect(
      border.segments.reduce(
        (sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
        0,
      ),
    ).toBeCloseTo(1.6, 8);
    expect(new Set(border.segments.map((edge) => edge.height))).toEqual(new Set([0.12, 0.3]));
    expect(border.steps).toHaveLength(2);
    expect(
      border.steps.every(
        (step) =>
          Math.abs(step.point.y) > 0.19 &&
          Math.hypot(step.inner.x - step.point.x, step.inner.y - step.point.y) <=
            FIELD_BORDER_WIDTH + 1e-8,
      ),
    ).toBe(true);
    const positions = border.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      expect(Math.max(Math.abs(positions.getX(i)), Math.abs(positions.getZ(i)))).toBeGreaterThan(
        0.19,
      );
    border.geometry.dispose();
  });
  it('keeps tall landscape ledges out of a lower field so its true exterior ink stays visible', () => {
    const terrain = cell('terrain', rect(-0.2, 0, -0.2, 0.2), 0.4, '');
    terrain.fieldId = undefined;
    const playing = cell('play', rect(0, 0.2, -0.2, 0.2), 0.12, 'play'),
      model = tile([terrain, playing], [field('play', [playing])]);
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0.02;
    const batch = buildTileSurfaces(model, config),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    const caster = new THREE.Raycaster(
      new THREE.Vector3(FIELD_BORDER_WIDTH / 2, 2, 0),
      new THREE.Vector3(0, -1, 0),
    );
    expect(caster.intersectObject(mesh)[0]?.point.y).toBeCloseTo(0.12, 6);
    batch.geometry.dispose();
    material.dispose();
  });
  it('keeps high playing-field ledges out of every other playing field at connected steps', () => {
    const low = cell('low', rect(-0.2, 0, -0.2, 0.2), 0.12, 'low'),
      high = cell('high', rect(0, 0.2, -0.2, 0.2), 0.4, 'high');
    const model = tile([low, high], [field('low', [low]), field('high', [high])]);
    model.connections = [
      {
        id: 'step',
        from: 'low',
        to: 'high',
        segments: [
          { start: { x: 0, y: -0.2 }, end: { x: 0, y: 0.2 }, fromHeight: 0.12, toHeight: 0.4 },
        ],
        sharedLength: 0.4,
        heightDelta: 0.28,
        kind: 'path',
      },
    ];
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0.02;
    const batch = buildTileSurfaces(model, config),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    for (const x of [-0.000001, -0.001, -0.004, -0.019]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 2, 0),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(mesh)[0];
      expect(hit?.point.y).toBeCloseTo(0.12, 7);
    }
    const wall = new THREE.Raycaster(
      new THREE.Vector3(-0.01, 0.3, 0),
      new THREE.Vector3(1, 0, 0),
    ).intersectObject(mesh)[0];
    expect(wall?.point.x).toBeCloseTo(0, 7);
    expect(wall?.face?.normal.y).toBeCloseTo(0, 7);
    batch.geometry.dispose();
    material.dispose();
  });
  it('lays horizontal ribbon triangles directly on the actual plateau plus the ink lift', () => {
    const left = cell('left', rect(-0.2, 0, -0.2, 0.2), 0.2, 'play'),
      right = cell('right', rect(0, 0.2, -0.2, 0.2), 0.4, 'play');
    const model = tile([left, right], [field('play', [left, right])]),
      source = new SurfaceBuffer();
    source.polygon(left.polygon, left.height, '#cccc88');
    source.polygon(right.polygon, right.height, '#cccc88');
    const terrain = source.geometry(),
      border = buildFieldBorders(model, terrain),
      positions = border.geometry.getAttribute('position');
    let maxError = 0,
      horizontal = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const ys = [positions.getY(i), positions.getY(i + 1), positions.getY(i + 2)];
      if (Math.max(...ys) - Math.min(...ys) > 1e-7) continue;
      const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const actual = x < 0 ? 0.2 : 0.4;
      maxError = Math.max(maxError, Math.abs(ys[0]! - actual - FIELD_BORDER_LIFT));
      horizontal++;
    }
    expect(horizontal).toBeGreaterThan(0);
    expect(maxError).toBeLessThan(1e-5);
    expect(border.steps).toHaveLength(2);
    expect(
      border.steps.every(
        (step) =>
          Math.abs(step.low - 0.2 - FIELD_BORDER_LIFT) < 1e-8 &&
          Math.abs(step.high - 0.4 - FIELD_BORDER_LIFT) < 1e-8,
      ),
    ).toBe(true);
    border.geometry.dispose();
    terrain.dispose();
  });
  it('puts short vertical ink wraps on the true internal step wall at the exterior endpoints', () => {
    const left = cell('left', rect(-0.2, 0, -0.2, 0.2), 0.12, 'play'),
      right = cell('right', rect(0, 0.2, -0.2, 0.2), 0.3, 'play');
    const model = tile([left, right], [field('play', [left, right])]),
      config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const terrain = buildTileSurfaces(model, config),
      border = buildFieldBorders(model, terrain.geometry);
    const mesh = new THREE.Mesh(
      terrain.geometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    mesh.updateMatrixWorld();
    expect(border.steps).toHaveLength(2);
    for (const step of border.steps) {
      const z = (step.point.y + step.inner.y) / 2;
      const caster = new THREE.Raycaster(
        new THREE.Vector3(-0.01, (step.low + step.high) / 2 - FIELD_BORDER_LIFT, z),
        new THREE.Vector3(1, 0, 0),
      );
      const hit = caster.intersectObject(mesh)[0];
      expect(hit?.point.x).toBeCloseTo(0, 7);
      expect(hit?.face?.normal.y).toBeCloseTo(0, 7);
    }
    border.geometry.dispose();
    terrain.geometry.dispose();
    mesh.material.dispose();
  });
  it('checks only nearby terrain triangles when draping a small ribbon mask', () => {
    const source = new SurfaceBuffer();
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 10; y++)
        source.polygon(
          rect(x * 0.12 - 0.6, x * 0.12 - 0.5, y * 0.12 - 0.6, y * 0.12 - 0.5),
          0.2,
          '#cccc88',
        );
    const terrain = source.geometry(),
      projection = new SurfaceProjection(terrain),
      positions: number[] = [];
    projection.append(rect(-0.555, -0.545, -0.555, -0.545), FIELD_BORDER_LIFT, positions);
    expect(positions.length).toBeGreaterThan(0);
    expect(projection.triangleCount).toBe(400);
    expect(projection.candidateChecks).toBeLessThan(projection.triangleCount / 10);
    terrain.dispose();
  });
  it('has an actual world width rather than relying on unsupported WebGL line width', () => {
    const square = cell('one', rect(-0.2, 0.2, -0.2, 0.2), 0.2, 'play'),
      model = tile([square], [field('play', [square])]);
    const border = buildFieldBorders(model),
      positions = border.geometry.getAttribute('position');
    const bottom = Array.from({ length: positions.count }, (_, i) => ({
      x: positions.getX(i),
      z: positions.getZ(i),
    })).filter((p) => Math.abs(p.x) < 0.1 && p.z < -0.19);
    expect(Math.max(...bottom.map((p) => p.z)) - Math.min(...bottom.map((p) => p.z))).toBeCloseTo(
      FIELD_BORDER_WIDTH,
      6,
    );
    expect(FIELD_BORDER_WIDTH).toBeGreaterThanOrEqual(0.005);
    expect(FIELD_BORDER_WIDTH).toBeLessThanOrEqual(0.009);
    expect(border.steps).toEqual([]);
    border.geometry.dispose();
  });
  it('traces the terraced pentagon exterior from reserved pieces and keeps its interior raster unoutlined', () => {
    const pentagon = regularPolygon(5, 0.15, -Math.PI / 2);
    const low = cell('center-low', clipPolygon(pentagon, rect(-2, 0, -2, 2)), 0.1, 'center', true),
      high = cell('center-high', clipPolygon(pentagon, rect(0, 2, -2, 2)), 0.27, 'center', true);
    const center = field('center', [low, high], true);
    center.center = { x: 0.04, y: 0 };
    center.symbolHeight = 0.27;
    const model = tile([low, high], [center], pentagon),
      regions = fieldSurfaceRegions(model, center),
      outline = fieldOutlineSegments(model, center);
    expect(regions.map((region) => region.height)).toEqual([0.1, 0.27]);
    expect(
      outline.some((edge) => Math.abs(edge.start.x) < 1e-8 && Math.abs(edge.end.x) < 1e-8),
    ).toBe(false);
    expect(
      outline.reduce(
        (sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
        0,
      ),
    ).toBeCloseTo(5 * 2 * 0.15 * Math.sin(Math.PI / 5), 7);
    const layout = fieldSymbolLayout(model, center);
    expect(layout.height).toBe(0.27);
    const picked = pickTileSurface(
      new THREE.Ray(new THREE.Vector3(0.04, 2, 0), new THREE.Vector3(0, -1, 0)),
      model,
    );
    expect(picked?.distance).toBeCloseTo(2 - 0.27, 7);
    expect(picked?.cellId).toBeUndefined();
  });
});

describe('local terrace heights and portal approaches', () => {
  it('closes unequal local terrace levels even when the whole-field minima are equal', () => {
    const low = cell('low', rect(-0.3, -0.1, -0.2, 0.2), 0.1, 'west'),
      edge = cell('edge', rect(-0.1, 0, -0.2, 0.2), 0.3, 'west'),
      east = cell('east', rect(0, 0.3, -0.2, 0.2), 0.15, 'east');
    const west = field('west', [low, edge]),
      right = field('east', [east]);
    right.height = 0.1;
    const model = tile([low, edge, east], [west, right]);
    model.connections = [
      {
        id: 'local',
        from: 'west',
        to: 'east',
        segments: [
          { start: { x: 0, y: -0.2 }, end: { x: 0, y: 0.2 }, fromHeight: 0.3, toHeight: 0.15 },
        ],
        sharedLength: 0.4,
        heightDelta: 0,
        kind: 'path',
      },
    ];
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const batch = buildTileSurfaces(model, config),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    const caster = new THREE.Raycaster(new THREE.Vector3(0.1, 0.2, 0), new THREE.Vector3(-1, 0, 0));
    const hit = caster.intersectObject(mesh)[0];
    expect(hit?.point.x).toBeCloseTo(0, 7);
    expect(hit?.face?.normal.y).toBeCloseTo(0, 7);
    batch.geometry.dispose();
    material.dispose();
  });
  it('picks the actual higher neighboring plateau at a shared terrace edge', () => {
    const high = cell('high', rect(-0.3, -0.1, -0.2, 0.2), 0.4, 'west'),
      edge = cell('edge', rect(-0.1, 0, -0.2, 0.2), 0.3, 'west'),
      east = cell('east', rect(0, 0.3, -0.2, 0.2), 0.15, 'east');
    const model = tile([high, edge, east], [field('west', [high, edge]), field('east', [east])]);
    model.connections = [
      {
        id: 'local',
        from: 'west',
        to: 'east',
        segments: [
          { start: { x: 0, y: -0.2 }, end: { x: 0, y: 0.2 }, fromHeight: 0.3, toHeight: 0.15 },
        ],
        sharedLength: 0.4,
        heightDelta: -0.15,
        kind: 'path',
      },
    ];
    const picked = pickTileSurface(
      new THREE.Ray(new THREE.Vector3(-0.1, 2, 0), new THREE.Vector3(0, -1, 0)),
      model,
    );
    expect(picked?.cellId).toBe('high');
    expect(picked?.distance).toBeCloseTo(1.6, 7);
  });
  it('keeps a flat portal approach unchanged across raster boundaries up to its vertical center wall', () => {
    const back = cell('back', rect(-0.12, -0.015, -0.04, 0.04), 0.1, 'path'),
      front = cell('front', rect(-0.015, 0, -0.04, 0.04), 0.1, 'path'),
      reserved = cell('center-piece', rect(0, 0.2, -0.2, 0.2), 0.3, 'center', true);
    const model = tile(
      [back, front, reserved],
      [field('path', [back, front]), field('center', [reserved], true)],
      reserved.polygon,
    );
    model.connections = [
      {
        id: 'portal',
        from: 'path',
        to: 'center',
        segments: [
          { start: { x: 0, y: -0.04 }, end: { x: 0, y: 0.04 }, fromHeight: 0.1, toHeight: 0.3 },
        ],
        sharedLength: 0.08,
        heightDelta: 0.2,
        kind: 'center',
      },
    ];
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const batch = buildTileSurfaces(model, config);
    for (const x of [-0.1, -0.02, -0.01, -0.000001, 0.000001, 0.1]) {
      const picked = pickTileSurface(
        new THREE.Ray(new THREE.Vector3(x, 2, 0), new THREE.Vector3(0, -1, 0)),
        model,
        batch.regions,
      );
      expect(picked?.distance).toBeCloseTo(2 - (x < 0 ? 0.1 : 0.3), 7);
    }
    batch.geometry.dispose();
  });
  it('limits a center approach to the portal span while retaining the entire pentagon border', () => {
    const pentagon = regularPolygon(5, 0.15).map((p) => ({
      x: p.x + 0.15 * Math.cos(Math.PI / 5),
      y: p.y,
    }));
    const body = cell('body', rect(-0.4, -0.04, -0.12, 0.12), 0.15, 'path'),
      outer = cell('portal-cell', rect(-0.04, 0, -0.025, 0.025), 0.15, 'path');
    const reserved = cell('reserved', pentagon, 0.3, 'center', true);
    const path = field('path', [body, outer]),
      center = field('center', [reserved], true);
    const model = tile([body, outer, reserved], [path, center], pentagon);
    model.center.sides = [
      {
        index: 0,
        start: { x: 0, y: -0.15 * Math.sin(Math.PI / 5) },
        end: { x: 0, y: 0.15 * Math.sin(Math.PI / 5) },
        portalStart: { x: 0, y: -0.025 },
        portalEnd: { x: 0, y: 0.025 },
        fieldId: 'path',
      },
    ];
    model.connections = [
      {
        id: 'portal',
        from: 'path',
        to: 'center',
        segments: [
          { start: { x: 0, y: -0.025 }, end: { x: 0, y: 0.025 }, fromHeight: 0.15, toHeight: 0.3 },
        ],
        sharedLength: 0.05,
        heightDelta: 0.15,
        kind: 'center',
      },
    ];
    const outline = fieldOutlineSegments(model, center);
    expect(
      outline.reduce(
        (sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y),
        0,
      ),
    ).toBeCloseTo(5 * 2 * 0.15 * Math.sin(Math.PI / 5), 7);
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const batch = buildTileSurfaces(model, config);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    for (const z of [-0.024, -0.01, 0, 0.01, 0.024]) {
      const wall = new THREE.Raycaster(
        new THREE.Vector3(-0.03, 0.22, z),
        new THREE.Vector3(1, 0, 0),
      ).intersectObject(mesh)[0];
      expect(wall?.point.x).toBeCloseTo(0, 7);
      expect(wall?.face?.normal.y).toBeCloseTo(0, 7);
      for (const [x, height] of [
        [-0.000001, 0.15],
        [0.000001, 0.3],
      ]) {
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x!, 2, z),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(mesh)[0];
        expect(hit?.point.y).toBeCloseTo(height!, 7);
      }
    }
    for (const azimuth of [-1, 1]) {
      const direction = new THREE.Vector3(azimuth * 0.55, -1, 0.15).normalize();
      for (const x of [-0.015, -0.005, 0.005, 0.015])
        for (const z of [-0.015, 0, 0.015]) {
          const target = new THREE.Vector3(x, 0.22, z),
            caster = new THREE.Raycaster(target.clone().addScaledVector(direction, -3), direction);
          const hit = caster.intersectObject(mesh)[0];
          expect(hit).toBeDefined();
          expect(hit!.point.y).toBeGreaterThanOrEqual(0.15 - 1e-6);
        }
    }
    material.dispose();
    expect([...batch.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    batch.geometry.dispose();
    expect(FIELD_BORDER_LIFT).toBeGreaterThan(0);
  });
});
