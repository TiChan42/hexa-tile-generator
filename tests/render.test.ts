import { sampleMaterial, materialPerlin, materialFbm } from '../src/render/material';
import { fieldSymbolSize } from '../src/render/symbols';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectionRay, resolveTileHit } from '../src/render/picking';
import { syncModelSlots } from '../src/render/voxels';
import { exposedWalls } from '../src/render/walls';
import {
  CAMERA_TARGET,
  captureCameraState,
  captureCameraView,
  restoreCameraState,
  configureTileCamera,
} from '../src/render/camera';
import {
  ASSET_LIBRARY,
  normalizeVoxelModel,
  voxelGeometry,
  type VoxelModel,
} from '../src/render/voxels';
import type { DecorationKind, Point, TileConfig } from '../src/core/types';
import { defaultConfig, generateTile } from '../src/core';

function camera(
  fov: number,
  overrides: Partial<TileConfig['camera']> = {},
  exporting = false,
): THREE.Camera {
  return configureTileCamera(
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40),
    new THREE.PerspectiveCamera(35, 1, 0.01, 40),
    { mode: 'perspective', azimuth: 0, elevation: 0, fov, zoom: 1, ...overrides },
    1,
    exporting,
  );
}

function model(voxels: VoxelModel['voxels']): VoxelModel {
  return { id: 'test', name: 'Test', size: [20, 20, 20], palette: ['#ffffff'], voxels };
}

describe('occupied voxel normalization', () => {
  it('centers actual occupied footprint, removes empty margins and grounds sparse models', () => {
    const source = model([
      [5, 6, 7, 0],
      [6, 8, 7, 0],
    ]);
    expect(normalizeVoxelModel(source)).toMatchObject({
      scale: 0.5,
      pivot: [6, 6, 7.5],
      footprint: 1,
    });
    const geometry = voxelGeometry(source);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.toArray()).toEqual([-0.5, 0, -0.25]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([0.5, 1.5, 0.25]);
    geometry.dispose();
  });
  it.each(ASSET_LIBRARY)(
    'normalizes $id to a unit horizontal footprint without distorting height',
    (source) => {
      const geometry = voxelGeometry(source);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const size = bounds.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.z)).toBeCloseTo(1, 6);
      expect(bounds.min.y).toBe(0);
      expect(size.y).toBeGreaterThan(0);
      expect(bounds.min.x + bounds.max.x).toBeCloseTo(0, 6);
      expect(bounds.min.z + bounds.max.z).toBeCloseTo(0, 6);
      geometry.dispose();
    },
  );
  it('culls both internal faces of adjoining voxels', () => {
    const one = voxelGeometry(model([[0, 0, 0, 0]]));
    const two = voxelGeometry(
      model([
        [0, 0, 0, 0],
        [1, 0, 0, 0],
      ]),
    );
    expect(one.getAttribute('position').count).toBe(6 * 6);
    expect(two.getAttribute('position').count).toBe(10 * 6);
    expect(two.getAttribute('normal').count).toBe(two.getAttribute('position').count);
    one.dispose();
    two.dispose();
  });
});

describe('centered camera projection', () => {
  it('fits a full-width flat-top hexagon in a square top export', () => {
    const top = camera(35, { mode: 'top' }, true);
    expect(new THREE.Vector3(-1, 0.08, 0).project(top).x).toBeCloseTo(-1, 8);
    expect(new THREE.Vector3(1, 0.08, 0).project(top).x).toBeCloseTo(1, 8);
    expect(CAMERA_TARGET.clone().project(top).x).toBeCloseTo(0, 8);
    expect(CAMERA_TARGET.clone().project(top).y).toBeCloseTo(0, 8);
  });
  it('makes distant objects smaller with positive FOV, equal at zero and larger with negative FOV', () => {
    for (const fov of [-70, 0, 70]) {
      const view = camera(fov);
      const near = new THREE.Vector3(0.2, 0.07, 0).project(view).x;
      const far = new THREE.Vector3(0.2, -0.93, 0).project(view).x;
      if (fov > 0) expect(far).toBeLessThan(near);
      else if (fov < 0) expect(far).toBeGreaterThan(near);
      else expect(far).toBeCloseTo(near, 8);
    }
  });
  it.each([-85, 0, 90])(
    'retains a finite invertible centered projection at elevation %i',
    (elevation) => {
      for (const fov of [-100, 0, 100]) {
        const view = camera(fov, { elevation, azimuth: -35 });
        const center = CAMERA_TARGET.clone().project(view);
        expect(center.x).toBeCloseTo(0, 6);
        expect(center.y).toBeCloseTo(0, 6);
        expect(view.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
        expect(Math.abs(view.projectionMatrix.determinant())).toBeGreaterThan(1e-6);
        const original = new THREE.Vector3(0.25, 0.1, -0.14);
        expect(original.clone().project(view).unproject(view).distanceTo(original)).toBeLessThan(
          1e-8,
        );
      }
    },
  );
});

describe('exposed terrain walls', () => {
  it.each(['hex', 'diamond'] as const)(
    'closes the full %s tile boundary without walls at pentagon partition seams',
    (kind) => {
      const config = structuredClone(defaultConfig);
      config.grid.kind = kind;
      config.terrain.elevation = 0;
      const tile = generateTile(config);
      const walls = exposedWalls(
        [
          ...tile.cells.map((cell) => ({ polygons: cell.surfacePolygons, height: cell.height })),
          { polygons: [tile.center.polygon], height: tile.center.height },
        ],
        -0.16,
      );
      const area = walls.reduce(
        (total, wall) =>
          total + Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) * (wall.high - wall.low),
        0,
      );
      expect(area).toBeCloseTo(6 * 0.24, 5);
    },
  );

  it('removes all internal walls between equal-height adjoining surfaces', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const right = left.map((p) => ({ x: p.x + 1, y: p.y }));
    const walls = exposedWalls(
      [
        { polygons: [left], height: 0.3 },
        { polygons: [right], height: 0.3 },
      ],
      -0.1,
    );
    expect(walls.some((wall) => wall.a.x === 1 && wall.b.x === 1)).toBe(false);
    const area = walls.reduce(
      (total, wall) =>
        total + Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) * (wall.high - wall.low),
      0,
    );
    expect(area).toBeCloseTo(6 * 0.4, 8);
  });
  it('creates one cliff only over the height difference and handles split collinear edges', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const right = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ];
    const walls = exposedWalls(
      [
        { polygons: [left], height: 0.5 },
        { polygons: [right], height: 0.2 },
      ],
      -0.1,
    );
    const cliffs = walls.filter(
      (wall) => Math.abs(wall.a.x - 1) < 1e-7 && Math.abs(wall.b.x - 1) < 1e-7,
    );
    expect(cliffs).toHaveLength(2);
    expect(cliffs.every((wall) => wall.low === 0.2 && wall.high === 0.5)).toBe(true);
    expect(cliffs.reduce((total, wall) => total + Math.abs(wall.b.y - wall.a.y), 0)).toBeCloseTo(
      1,
      8,
    );
  });
});

describe('renderer editor state integration', () => {
  it('clears transient model assignments when configuration slots are removed by undo or import', () => {
    const slots = new Map<DecorationKind, string>([['tree', 'stale-model']]);
    syncModelSlots(slots, { tree: 'selected-model' });
    expect(slots.get('tree')).toBe('selected-model');
    syncModelSlots(slots, {});
    expect(slots.has('tree')).toBe(false);
    slots.set('rock', 'another-transient-model');
    syncModelSlots(slots);
    expect(slots.size).toBe(0);
  });
  it('resolves a field symbol click to its underlying carved raster cell', () => {
    const tile = generateTile(defaultConfig);
    const field = tile.fields.find((field) => !field.isCenter)!;
    const hit = resolveTileHit(tile, { fieldId: field.id }, field.center);
    expect(hit.fieldId).toBe(field.id);
    expect(hit.cellId).toBeDefined();
    expect(field.cellIds).toContain(hit.cellId);
  });
  it('keeps a center symbol click field-only even though partially reserved cells share its area', () => {
    const tile = generateTile(defaultConfig);
    const center = tile.fields.find((field) => field.isCenter)!;
    expect(resolveTileHit(tile, { fieldId: center.id }, center.center)).toEqual({
      fieldId: center.id,
    });
    expect(resolveTileHit(tile, { fieldId: 'overlay' }, center.center)).toEqual({
      fieldId: 'overlay',
    });
  });
});

describe('orbit camera capture and export restoration', () => {
  it('preserves transient orbit zoom and orientation across a fixed-config export', () => {
    const view = camera(35, { mode: 'orbit', azimuth: 42, elevation: 28 });
    const orthographic = view as THREE.OrthographicCamera;
    orthographic.zoom = 2.3;
    orthographic.updateProjectionMatrix();
    const snapshot = captureCameraState(view);
    configureTileCamera(
      orthographic,
      new THREE.PerspectiveCamera(),
      { mode: 'orbit', azimuth: 0, elevation: 52, fov: 35, zoom: 1 },
      1,
      true,
    );
    restoreCameraState(view, snapshot);
    expect(orthographic.zoom).toBe(2.3);
    expect(view.position.toArray()).toEqual(snapshot.position.toArray());
    expect(view.quaternion.toArray()).toEqual(snapshot.quaternion.toArray());
    expect(view.projectionMatrix.elements).toEqual(snapshot.projection.elements);
    expect(view.projectionMatrixInverse.elements).toEqual(snapshot.inverseProjection.elements);
  });
  it('serializes the current centered orbit for repeatable exports', () => {
    const configured: TileConfig['camera'] = {
      mode: 'orbit',
      azimuth: -25,
      elevation: 52,
      fov: 35,
      zoom: 1,
    };
    const view = camera(35, { mode: 'orbit', azimuth: 71, elevation: -40, zoom: 1.8 });
    const captured = captureCameraView(view, configured);
    expect(captured.azimuth).toBeCloseTo(71, 8);
    expect(captured.elevation).toBeCloseTo(-40, 8);
    expect(captured.zoom).toBe(1.8);
    expect(captured.mode).toBe('orbit');
    expect(captured.fov).toBe(35);
  });
});

describe('projection-aware raster picking', () => {
  it.each([-100, -35, 0, 35, 100])('recovers off-center world points with signed FOV %i', (fov) => {
    const view = camera(fov, { azimuth: 42, elevation: 38 });
    const point = new THREE.Vector3(0.44, 0.21, -0.18);
    const ndc = point.clone().project(view);
    const ray = projectionRay(view, ndc);
    expect(ray.distanceToPoint(point)).toBeLessThan(1e-8);
    expect(point.clone().sub(ray.origin).dot(ray.direction)).toBeGreaterThan(0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      view.getWorldDirection(new THREE.Vector3()),
      point,
    );
    const intersection = ray.intersectPlane(plane, new THREE.Vector3());
    expect(intersection?.distanceTo(point)).toBeLessThan(1e-8);
    expect(Math.abs(ndc.z)).toBeLessThan(1);
  });
  it('maps reverse-projection near and far clip planes monotonically without crossing infinity', () => {
    const view = camera(-100) as THREE.OrthographicCamera;
    const near = view.position
      .clone()
      .addScaledVector(view.getWorldDirection(new THREE.Vector3()), view.near);
    const far = view.position
      .clone()
      .addScaledVector(view.getWorldDirection(new THREE.Vector3()), view.far);
    expect(near.clone().project(view).z).toBeCloseTo(-1, 8);
    expect(far.clone().project(view).z).toBeCloseTo(1, 8);
    expect(
      projectionRay(view, { x: 0.5, y: -0.3 }).direction.dot(
        view.getWorldDirection(new THREE.Vector3()),
      ),
    ).toBeGreaterThan(0);
  });
});

describe('coherent seeded material layers', () => {
  const texture = { scale: 5, octaves: 4, strength: 0.3, detailScale: 38, detailStrength: 0.15 };
  const point = { x: 0.137, y: 0.19, z: -0.271 };
  it('uses deterministic domain-separated broad/detail structure and final pixel grain', () => {
    const first = sampleMaterial('moss', point, texture, 0.09);
    expect(sampleMaterial('moss', point, texture, 0.09)).toEqual(first);
    expect(sampleMaterial('another-seed', point, texture, 0.09)).not.toEqual(first);
    expect(first.broad).not.toBe(first.detail);
    const noGrain = sampleMaterial('moss', point, texture, 0);
    expect(noGrain.broad).toBe(first.broad);
    expect(noGrain.detail).toBe(first.detail);
    expect(first.multiplier).toBeCloseTo(noGrain.multiplier * (1 + first.grain * 0.09), 12);
  });
  it('produces spatially coherent mottling rather than unrelated per-pixel variation', () => {
    let adjacent = 0,
      separated = 0;
    for (let i = 0; i < 100; i++) {
      const p = { x: i * 0.013 - 0.7, y: 0.17, z: i * 0.007 - 0.2 };
      const base = sampleMaterial('moss', p, texture, 0).broad;
      adjacent += Math.abs(
        base - sampleMaterial('moss', { ...p, x: p.x + 0.001 }, texture, 0).broad,
      );
      separated += Math.abs(
        base - sampleMaterial('moss', { ...p, x: p.x + 0.1 }, texture, 0).broad,
      );
    }
    expect(separated).toBeGreaterThan(1);
    expect(adjacent / separated).toBeLessThan(0.08);
  });
  it('keeps Perlin values and first derivatives continuous across lattice boundaries in all axes', () => {
    const epsilon = 1e-5;
    for (const axis of ['x', 'y', 'z'] as const) {
      const p = { x: 0.23, y: -0.47, z: 0.61, [axis]: 1 };
      const at = materialPerlin(729, p);
      const before = materialPerlin(729, { ...p, [axis]: 1 - epsilon });
      const after = materialPerlin(729, { ...p, [axis]: 1 + epsilon });
      expect(Math.abs(after - before)).toBeLessThan(epsilon * 3);
      expect(Math.abs((at - before) / epsilon - (after - at) / epsilon)).toBeLessThan(0.001);
    }
  });
  it('has real vertical variation for walls and independent controls for coarse and detailed layers', () => {
    const base = sampleMaterial('moss', point, texture, 0);
    expect(sampleMaterial('moss', { ...point, y: point.y + 0.1 }, texture, 0).broad).not.toBe(
      base.broad,
    );
    const differentDetail = sampleMaterial('moss', point, { ...texture, detailScale: 90 }, 0);
    expect(differentDetail.broad).toBe(base.broad);
    expect(differentDetail.detail).not.toBe(base.detail);
    const differentCoarse = sampleMaterial('moss', point, { ...texture, scale: 9 }, 0);
    expect(differentCoarse.broad).not.toBe(base.broad);
    expect(differentCoarse.detail).toBe(base.detail);
    expect(
      sampleMaterial('moss', point, { ...texture, strength: 0, detailStrength: 0 }, 0).multiplier,
    ).toBe(1);
  });
  it('normalizes fBm energy over multiple octaves and remains finite for negative coordinates', () => {
    for (const octaves of [1, 3, 6]) {
      for (let i = -20; i <= 20; i++) {
        const value = materialFbm(293, { x: i * 0.137, y: -0.9, z: 0.17 }, octaves);
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('action symbol layout', () => {
  const square = (size: number): Point[] => [
    { x: -size / 2, y: -size / 2 },
    { x: size / 2, y: -size / 2 },
    { x: size / 2, y: size / 2 },
    { x: -size / 2, y: size / 2 },
  ];
  it('increases symbol size for larger playing areas', () => {
    const small = fieldSymbolSize([square(0.12)], { x: 0, y: 0 });
    const large = fieldSymbolSize([square(0.4)], { x: 0, y: 0 });
    expect(large).toBeGreaterThan(small * 2);
    expect(large).toBeLessThanOrEqual(0.18);
  });
  it('respects a narrow field border even when its total area is large', () => {
    const narrow = [
      { x: -0.5, y: -0.05 },
      { x: 0.5, y: -0.05 },
      { x: 0.5, y: 0.05 },
      { x: -0.5, y: 0.05 },
    ];
    expect(fieldSymbolSize([narrow], { x: 0, y: 0 })).toBeLessThanOrEqual(0.06 + 1e-9);
  });
});
