import * as THREE from 'three';
import { buildUntouchedGrid, polygonArea } from '../core/geometry';
import { buildSubgrid } from '../core/subgrid';
import type { GeneratedTile, Point, TileCell, TileConfig } from '../core/types';
import { exposedWalls } from './walls';

export interface RasterLineSegment {
  start: Point;
  end: Point;
  height: number;
  cellId: string;
}

/** Clip a source lattice edge to one convex visible surface, without outlining its cuts. */
function clipSegment(start: Point, end: Point, polygon: Point[]): [Point, Point] | undefined {
  if (polygon.length < 3) return;
  const orientation = polygonArea(polygon) < 0 ? -1 : 1;
  let low = 0,
    high = 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    const side = (p: Point) =>
      orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const first = side(start),
      last = side(end);
    if (first < -1e-10 && last < -1e-10) return;
    if (first < -1e-10) low = Math.max(low, first / (first - last));
    if (last < -1e-10) high = Math.min(high, first / (first - last));
    if (high <= low) return;
  }
  const at = (t: number): Point => ({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  });
  const a = at(low),
    b = at(high);
  return Math.hypot(b.x - a.x, b.y - a.y) > 1e-9 ? [a, b] : undefined;
}

function visiblePieces(cell: TileCell, centerId?: string): Point[][] {
  return cell.surfacePolygons.length
    ? cell.surfacePolygons
    : centerId && cell.fieldId === centerId
      ? [cell.polygon]
      : [];
}

/** Landscape shows the untouched lattice; artificial portal/shoulder cuts appear only on paths. */
export function rasterGridSegments(
  tile: GeneratedTile,
  grid: TileConfig['grid'],
): RasterLineSegment[] {
  const source = new Map(buildUntouchedGrid(grid).map((cell) => [cell.id, cell])),
    centerId = tile.fields.find((field) => field.isCenter)?.id;
  return tile.cells.flatMap((cell) => {
    const pieces = visiblePieces(cell, centerId);
    if (!pieces.length) return [];
    if (cell.fieldId && cell.fieldId !== centerId)
      return exposedWalls([{ polygons: pieces, height: 1 }], 0).map(({ a, b }) => ({
        start: a,
        end: b,
        height: cell.height + 0.001,
        cellId: cell.id,
      }));
    const original = source.get(cell.rasterId ?? cell.id) ?? cell;
    return original.polygon.flatMap((start, i) =>
      pieces.flatMap((piece) => {
        const clipped = clipSegment(
          start,
          original.polygon[(i + 1) % original.polygon.length]!,
          piece,
        );
        return clipped
          ? [{ start: clipped[0], end: clipped[1], height: cell.height + 0.001, cellId: cell.id }]
          : [];
      }),
    );
  });
}

/** All fragments of a landscape raster cell share its original fine lattice and clipping masks. */
export function rasterSubgridSegments(
  tile: GeneratedTile,
  grid: TileConfig['grid'],
): RasterLineSegment[] {
  const source = new Map(buildUntouchedGrid(grid).map((cell) => [cell.id, cell]));
  const cache = new Map<string, Point[][]>();
  return tile.cells
    .filter((cell) => !cell.fieldId && cell.surfacePolygons.length)
    .flatMap((cell) => {
      const original = source.get(cell.rasterId ?? cell.id) ?? cell;
      let polygons = cache.get(original.id);
      if (!polygons) {
        polygons = buildSubgrid(original, grid).map((part) => part.polygon);
        cache.set(original.id, polygons);
      }
      return polygons.flatMap((polygon) =>
        polygon.flatMap((start, i) =>
          cell.surfacePolygons.flatMap((piece) => {
            const clipped = clipSegment(start, polygon[(i + 1) % polygon.length]!, piece);
            return clipped
              ? [
                  {
                    start: clipped[0],
                    end: clipped[1],
                    height: cell.height + 0.0015,
                    cellId: cell.id,
                  },
                ]
              : [];
          }),
        ),
      );
    });
}

export function rasterLineGeometry(segments: readonly RasterLineSegment[]): THREE.BufferGeometry {
  const positions = segments.flatMap(({ start, end, height }) => [
    start.x,
    height,
    start.y,
    end.x,
    height,
    end.y,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
