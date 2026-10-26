import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  hexagon,
  pointInPolygon,
  polygonArea,
  clipPolygon,
  regularPolygon,
  subtractPolygon,
} from '../src/core/geometry';
import { defaultConfig, generateTile } from '../src/core';
import type { GeneratedTile, GameField, Point, TileCell } from '../src/core/types';
import { configureTileCamera } from '../src/render/camera';
import { buildTileSurfaces, fieldPolygons, pathDistance } from '../src/render/surfaces';
import { buildFieldBorders } from '../src/render/borders';
import { exposedWalls } from '../src/render/walls';
import { isSelectionClick, pickTileSurface, projectionRay } from '../src/render/picking';

const rect = (x0: number, x1: number, z0: number, z1: number): Point[] => [
  { x: x0, y: z0 },
  { x: x1, y: z0 },
  { x: x1, y: z1 },
  { x: x0, y: z1 },
];
function flatCell(id: string, polygon: Point[], height: number, fieldId?: string): TileCell {
  return {
    id,
    polygon,
    surfacePolygons: [polygon],
    center: { x: (polygon[0]!.x + polygon[2]!.x) / 2, y: (polygon[0]!.y + polygon[2]!.y) / 2 },
    height,
    baseHeight: height,
    color: '#aaaa77',
    fieldId,
    neighbors: [],
    reserved: false,
  };
}
function field(id: string, cell: TileCell, isCenter = false): GameField {
  return {
    id,
    cellIds: [cell.id],
    center: cell.center,
    height: cell.height,
    maxHeight: cell.height,
    symbolHeight: cell.height,
    color: cell.color,
    action: 'event',
    label: id,
    isCenter,
    area: Math.abs(polygonArea(cell.polygon)),
    polygon: isCenter ? cell.polygon : undefined,
  };
}
function transitionTile(): GeneratedTile {
  const left = flatCell('left', rect(-0.4, 0, -0.3, 0.3), 0.12, 'field');
  const center = flatCell('center-cell', rect(0, 0.3, -0.3, 0.3), 0.3, 'center');
  return {
    cells: [left],
    fields: [field('field', left), field('center', center, true)],
    center: { polygon: center.polygon, height: 0.3, sides: [] },
    connections: [
      {
        id: 'join',
        from: 'field',
        to: 'center',
        segments: [
          {
            start: { x: 0, y: -0.3 },
            end: { x: 0, y: 0.3 },
            fromHeight: left.height,
            toHeight: center.height,
          },
        ],
        sharedLength: 0.6,
        heightDelta: 0.18,
        kind: 'center',
      },
    ],
    decorations: [],
    pathDetails: [],
    entrances: [],
    warnings: [],
    stats: { cells: 1, fields: 2, decorations: 0, connected: true },
  };
}

function junctionTile(): GeneratedTile {
  const left = flatCell('west', clipPolygon(hexagon(), rect(-2, 0, -2, 2)), 0.2, 'west');
  const north = flatCell('north', clipPolygon(hexagon(), rect(0, 2, -2, 0)), 0.3, 'north');
  const south = flatCell('south', clipPolygon(hexagon(), rect(0, 2, 0, 2)), 0.12, 'south');
  const center = flatCell(
    'center-cell',
    regularPolygon(5, 0.06).map((p) => ({ x: p.x - 0.6, y: p.y })),
    0.2,
    'center',
  );
  left.surfacePolygons = subtractPolygon(left.polygon, center.polygon);
  const connection = (from: TileCell, to: TileCell, start: Point, end: Point) => ({
    id: `${from.id}|${to.id}`,
    from: from.id,
    to: to.id,
    segments: [{ start, end, fromHeight: from.height, toHeight: to.height }],
    sharedLength: Math.hypot(end.x - start.x, end.y - start.y),
    heightDelta: to.height - from.height,
    kind: 'path' as const,
  });
  return {
    cells: [left, north, south],
    fields: [
      field('west', left),
      field('north', north),
      field('south', south),
      field('center', center, true),
    ],
    center: { polygon: center.polygon, height: 0.2, sides: [] },
    connections: [
      connection(left, north, { x: 0, y: -Math.sqrt(3) / 2 }, { x: 0, y: 0 }),
      connection(left, south, { x: 0, y: 0 }, { x: 0, y: Math.sqrt(3) / 2 }),
      connection(north, south, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ],
    decorations: [],
    pathDetails: [],
    entrances: [],
    warnings: [],
    stats: { cells: 3, fields: 4, decorations: 0, connected: true },
  };
}

describe('merged terrain platforms and joins', () => {
  it('creates one finite attributed mesh for terrain, fields, walls, skirts and underside', () => {
    const config = structuredClone(defaultConfig);
    config.grid.divisions = 8;
    const tile = generateTile(config),
      batch = buildTileSurfaces(tile, config);
    const position = batch.geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(tile.cells.length * 3);
    expect(batch.geometry.getAttribute('tilePathWeight').count).toBe(position.count);
    expect(batch.geometry.getAttribute('tileBorderDistance').count).toBe(position.count);
    expect([...position.array].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < position.count; i++)
      expect(
        pointInPolygon(
          { x: position.getX(i) * (1 - 1e-7), y: position.getZ(i) * (1 - 1e-7) },
          hexagon(),
        ),
      ).toBe(true);
    expect(
      Math.min(...Array.from({ length: position.count }, (_, i) => position.getY(i))),
    ).toBeCloseTo(-0.16, 6);
    batch.geometry.dispose();
  });
  it('retains both true plateau elevations all the way to a connected center edge', () => {
    const tile = transitionTile(),
      config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const batch = buildTileSurfaces(tile, config),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    for (const distance of [0.000001, 0.0001, 0.01, 0.05]) {
      for (const [x, expected] of [
        [-distance, 0.12],
        [distance, 0.3],
      ]) {
        const raycaster = new THREE.Raycaster(
          new THREE.Vector3(x!, 3, 0),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = raycaster.intersectObject(mesh)[0];
        expect(hit?.point.y).toBeCloseTo(expected!, 6);
        expect(pickTileSurface(raycaster.ray, tile, batch.regions)?.distance).toBeCloseTo(
          hit!.distance,
          6,
        );
      }
    }
    const horizontal = new THREE.Raycaster(
      new THREE.Vector3(-0.2, 0.21, 0),
      new THREE.Vector3(1, 0, 0),
    );
    const wall = horizontal.intersectObject(mesh)[0];
    expect(wall?.point.x).toBeCloseTo(0, 7);
    expect(wall?.point.y).toBeCloseTo(0.21, 7);
    expect(wall?.face?.normal.y).toBeCloseTo(0, 8);
    batch.geometry.dispose();
    material.dispose();
  });
  it.each(['flat', 'terraced'] as const)(
    'uses only horizontal or vertical terrain and border triangles in %s mode',
    (mode) => {
      const config = structuredClone(defaultConfig);
      config.grid.divisions = 8;
      config.paths.heightMode = mode;
      config.paths.fields = [{ id: 'center', cellIds: [], action: 'event', heightOffset: 0.12 }];
      config.terrain.overhang = 0.02;
      const tile = generateTile(config),
        batch = buildTileSurfaces(tile, config),
        borders = buildFieldBorders(tile, batch.geometry);
      for (const geometry of [batch.geometry, borders.geometry]) {
        const position = geometry.getAttribute('position');
        let horizontal = 0,
          vertical = 0;
        for (let i = 0; i < position.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(position, i);
          const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
          const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
          const cross = b.sub(a).cross(c.sub(a));
          if (cross.length() < 1e-11) continue;
          const y = Math.abs(cross.normalize().y);
          expect(y < 1e-5 || y > 1 - 1e-5, `sloped triangle ${i / 3}: normalY=${y}`).toBe(true);
          if (y > 0.5) horizontal++;
          else vertical++;
        }
        expect(horizontal).toBeGreaterThan(0);
        if (geometry === batch.geometry || mode === 'terraced') expect(vertical).toBeGreaterThan(0);
      }
      batch.geometry.dispose();
      borders.geometry.dispose();
    },
  );
  it('extends exposed platform caps and closes their thin hanging skirts inside the main hexagon', () => {
    const tile = transitionTile();
    tile.cells[0]!.fieldId = undefined;
    tile.fields = tile.fields.filter((field) => field.isCenter);
    const config = structuredClone(defaultConfig);
    config.terrain.overhang = 0.02;
    config.terrain.skirtDepth = 0.04;
    const batch = buildTileSurfaces(tile, config),
      position = batch.geometry.getAttribute('position');
    const capVertices = Array.from({ length: position.count }, (_, i) => ({
      x: position.getX(i),
      y: position.getY(i),
      z: position.getZ(i),
    })).filter((p) => Math.abs(p.y - 0.3002) < 1e-5 && p.x < -0.001);
    expect(capVertices.length).toBeGreaterThan(0);
    expect(Math.min(...capVertices.map((p) => p.x))).toBeCloseTo(-0.02, 5);
    expect(
      Array.from({ length: position.count }, (_, i) => position.getY(i)).some(
        (height) => Math.abs(height - 0.26) < 1e-6,
      ),
    ).toBe(true);
    batch.geometry.dispose();
  });
  it('closes vertical steps at three-field junctions so oblique views never see the underside through valid ground', () => {
    const tile = junctionTile(),
      config = structuredClone(defaultConfig);
    config.terrain.overhang = 0;
    const batch = buildTileSurfaces(tile, config),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(batch.geometry, material);
    mesh.updateMatrixWorld();
    const camera = configureTileCamera(
      new THREE.OrthographicCamera(),
      new THREE.PerspectiveCamera(),
      { mode: 'orbit', azimuth: -25, elevation: 52, fov: 35, zoom: 1 },
      1,
      true,
      batch.ground,
    );
    const direction = camera.getWorldDirection(new THREE.Vector3()),
      raycaster = new THREE.Raycaster();
    const holes: Point[] = [];
    for (let x = -0.06; x <= 0.06; x += 0.006)
      for (let z = -0.06; z <= 0.06; z += 0.006) {
        const target = new THREE.Vector3(x, 0.2, z);
        raycaster.ray.set(target.clone().addScaledVector(direction, -3), direction);
        const hit = raycaster.intersectObject(mesh)[0];
        if (!hit || hit.point.y < 0.12 - 1e-6) holes.push({ x, y: z });
      }
    expect(holes).toEqual([]);
    batch.geometry.dispose();
    material.dispose();
  });
  it('lightens actual field interiors rather than internal raster boundaries', () => {
    const tile = transitionTile(),
      playing = tile.fields[0]!;
    const borders = exposedWalls([{ polygons: fieldPolygons(tile, playing), height: 1 }], 0);
    expect(pathDistance({ x: -0.2, y: 0 }, borders, 0.15)).toBeGreaterThan(0.9);
    expect(pathDistance({ x: -0.4, y: 0 }, borders, 0.15)).toBeCloseTo(0, 8);
  });
  it('picks merged surfaces without inspecting any render meshes or voxel triangles', () => {
    const tile = transitionTile();
    const ray = new THREE.Ray(new THREE.Vector3(-0.2, 3, 0), new THREE.Vector3(0, -1, 0));
    expect(pickTileSurface(ray, tile)).toMatchObject({
      cellId: 'left',
      fieldId: 'field',
      point: { x: -0.2, y: 0 },
    });
    const centerRay = new THREE.Ray(new THREE.Vector3(0.1, 3, 0), new THREE.Vector3(0, -1, 0));
    expect(pickTileSurface(centerRay, tile)).toMatchObject({ fieldId: 'center' });
    expect(pickTileSurface(centerRay, tile)?.cellId).toBeUndefined();
    const edgeRay = new THREE.Ray(new THREE.Vector3(-0.0001, 3, 0), new THREE.Vector3(0, -1, 0));
    expect(pickTileSurface(edgeRay, tile)?.distance).toBeCloseTo(3 - 0.12, 7);
  });
});

describe('fixed top projections and editor gestures', () => {
  it.each([-100, -35, 0, 35, 100])(
    'fits ground width at signed FOV %i and ignores orbit angles and zoom',
    (fov) => {
      const ground = hexagon().map((point, index) => ({ point, height: index % 2 ? 0.18 : 0.32 }));
      const view = { mode: 'perspective' as const, azimuth: 71, elevation: -42, fov, zoom: 2.7 };
      const camera = configureTileCamera(
        new THREE.OrthographicCamera(),
        new THREE.PerspectiveCamera(),
        view,
        1,
        true,
        ground,
      );
      expect(camera.position.x).toBeCloseTo(0, 10);
      expect(camera.position.z).toBeCloseTo(0, 10);
      expect(
        camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, -1, 0)),
      ).toBeLessThan(1e-9);
      const projected = ground.map(({ point, height }) =>
        new THREE.Vector3(point.x, height, point.y).project(camera),
      );
      expect(Math.max(...projected.map((p) => Math.abs(p.x)))).toBeCloseTo(1, 7);
      expect(projected.every((p) => Math.abs(p.x) <= 1 + 1e-7)).toBe(true);
      const target = { x: 0.37, y: -0.14 },
        height = 0.2;
      const screen = new THREE.Vector3(target.x, height, target.y).project(camera);
      const ray = projectionRay(camera, screen);
      expect(ray.distanceToPoint(new THREE.Vector3(target.x, height, target.y))).toBeLessThan(1e-8);
    },
  );
  it('accepts only an unmoved left click and never selects from a right-button gesture', () => {
    expect(isSelectionClick({ x: 10, y: 20, button: 0 }, { x: 12, y: 21, button: 0 })).toBe(true);
    expect(isSelectionClick({ x: 10, y: 20, button: 2 }, { x: 10, y: 20, button: 2 })).toBe(false);
    expect(isSelectionClick({ x: 10, y: 20, button: 0 }, { x: 30, y: 20, button: 0 })).toBe(false);
    expect(isSelectionClick({ x: 10, y: 20, button: 2 }, { x: 10, y: 20, button: 0 })).toBe(false);
  });
});

it.each([-100, 0, 100])(
  'fits the entire top-centered preview on a wide viewport at FOV %i',
  (fov) => {
    const ground = hexagon().map((point) => ({ point, height: 0.2 }));
    const camera = configureTileCamera(
      new THREE.OrthographicCamera(),
      new THREE.PerspectiveCamera(),
      { ...defaultConfig.camera, mode: 'perspective', fov },
      2.5,
      false,
      ground,
    );
    for (const { point, height } of ground) {
      const projected = new THREE.Vector3(point.x, height, point.y).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  },
);

it.each([-100, 0, 100])('fits raised ground on both axes of a square export at FOV %i', (fov) => {
  const ground = hexagon().map((point) => ({
    point,
    height: fov < 0 ? (Math.abs(point.x) > 0.9 ? 0.95 : 0.02) : point.y > 0.8 ? 0.5 : 0.1,
  }));
  const camera = configureTileCamera(
    new THREE.OrthographicCamera(),
    new THREE.PerspectiveCamera(),
    { ...defaultConfig.camera, mode: 'perspective', fov },
    1,
    true,
    ground,
  );
  const projected = ground.map(({ point, height }) =>
    new THREE.Vector3(point.x, height, point.y).project(camera),
  );
  expect(
    projected.every((point) => Math.abs(point.x) <= 1 + 1e-7 && Math.abs(point.y) <= 1 + 1e-7),
  ).toBe(true);
  expect(
    Math.max(...projected.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)])),
  ).toBeCloseTo(1, 7);
});
