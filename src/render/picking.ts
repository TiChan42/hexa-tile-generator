import * as THREE from 'three';
import { pointInPolygon } from '../core/geometry';
import type { SurfaceRegion } from './surfaces';
import type { GeneratedTile, Point } from '../core/types';

export interface TileHit {
  cellId?: string;
  fieldId?: string;
}

/** Pixel symbols still select the raster below them; the reserved center is field-only. */
export function resolveTileHit(tile: GeneratedTile, hit: TileHit, point: Point): TileHit {
  if (hit.cellId || !hit.fieldId) return hit;
  if (
    tile.fields.some((field) => field.id === hit.fieldId && field.isCenter) ||
    pointInPolygon(point, tile.center.polygon)
  )
    return hit;
  const contains = (cell: GeneratedTile['cells'][number]): boolean =>
    cell.surfacePolygons.some((polygon) => pointInPolygon(point, polygon));
  const cell =
    tile.cells.find((cell) => cell.fieldId === hit.fieldId && contains(cell)) ??
    tile.cells.find(contains);
  return cell ? { ...hit, cellId: cell.id } : hit;
}

/** Unprojection supports ordinary perspective, orthographic and reversed homogeneous cameras. */
export function projectionRay(camera: THREE.Camera, ndc: Point): THREE.Ray {
  const near = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const far = new THREE.Vector3(ndc.x, ndc.y, 1).unproject(camera);
  return new THREE.Ray(near, far.sub(near).normalize());
}

export interface PickedTileSurface extends TileHit {
  point: Point;
  distance: number;
}
/** Picking costs polygon tests, independently of voxel triangles and merged render meshes. */
export function pickTileSurface(
  ray: THREE.Ray,
  tile: GeneratedTile,
  regions?: readonly SurfaceRegion[],
): PickedTileSurface | undefined {
  if (Math.abs(ray.direction.y) < 1e-9) return undefined;
  let best: PickedTileSurface | undefined;
  const test = (height: number, polygons: Point[][], hit: TileHit): void => {
    const distance = (height - ray.origin.y) / ray.direction.y;
    if (distance < 0 || (best && distance >= best.distance)) return;
    const point = {
      x: ray.origin.x + ray.direction.x * distance,
      y: ray.origin.z + ray.direction.z * distance,
    };
    if (polygons.some((polygon) => pointInPolygon(point, polygon)))
      best = { ...hit, point, distance };
  };
  const center = tile.fields.find((field) => field.isCenter);
  if (regions)
    regions.forEach((region) =>
      test(region.height, region.polygons, {
        cellId: region.fieldId === center?.id ? undefined : region.cellId,
        fieldId: region.fieldId,
      }),
    );
  else {
    for (const cell of tile.cells)
      test(cell.height, cell.surfacePolygons, { cellId: cell.id, fieldId: cell.fieldId });
    if (center) {
      const hidden = tile.cells.filter(
        (cell) => cell.fieldId === center.id && !cell.surfacePolygons.length,
      );
      if (hidden.length)
        hidden.forEach((cell) => test(cell.height, [cell.polygon], { fieldId: center.id }));
      else test(tile.center.height, [tile.center.polygon], { fieldId: center.id });
    }
  }
  return best;
}

export function isSelectionClick(
  start: { x: number; y: number; button: number },
  end: { x: number; y: number; button: number },
): boolean {
  return (
    start.button === 0 && end.button === 0 && Math.hypot(end.x - start.x, end.y - start.y) <= 5
  );
}
