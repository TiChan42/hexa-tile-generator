import * as THREE from 'three';
import { borderRing } from '../core/tile-border';
import { polygonArea, subtractPolygon } from '../core/geometry';
import type { GeneratedTile, Point, TileConfig } from '../core/types';
import { FIELD_BORDER_COLOR, FIELD_BORDER_LIFT, isOuterHexEdge } from './borders';
import { SurfaceProjection } from './surfaceProjection';
import { exposedWalls } from './walls';
import { SurfaceBuffer, surfaceRegions, TILE_BOTTOM, type SurfaceRegion } from './surfaces';

type BorderSettings = TileConfig['border'];
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
const bounds = (polygon: readonly Point[]): Bounds => ({
  minX: Math.min(...polygon.map((point) => point.x)),
  maxX: Math.max(...polygon.map((point) => point.x)),
  minY: Math.min(...polygon.map((point) => point.y)),
  maxY: Math.max(...polygon.map((point) => point.y)),
});
const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX + 1e-8 &&
  a.maxX >= b.minX - 1e-8 &&
  a.minY <= b.maxY + 1e-8 &&
  a.maxY >= b.minY - 1e-8;

export function tileBorderColor(border: BorderSettings): string | undefined {
  if (!border.enabled || border.width <= 0 || border.mode === 'transparent') return undefined;
  if (border.mode === 'fields') return FIELD_BORDER_COLOR;
  return border.mode === 'custom' ? border.color : '#000000';
}

/** The complete actual field footprint opens the band, independently of its elevation. */
export function tileBorderMasks(
  tile: GeneratedTile,
  width: number,
  regions: readonly SurfaceRegion[] = surfaceRegions(tile),
): Point[][] {
  const fields = regions
    .filter((region) => region.fieldId)
    .flatMap((region) => region.polygons)
    .map((polygon) => ({ polygon, bounds: bounds(polygon) }));
  return borderRing(width).flatMap((ring) => {
    let pieces = [ring];
    for (const field of fields) {
      pieces = pieces.flatMap((piece) =>
        overlaps(bounds(piece), field.bounds) ? subtractPolygon(piece, field.polygon) : [piece],
      );
      if (!pieces.length) break;
    }
    return pieces;
  });
}

interface Vertex {
  point: Point;
  height: number;
}
/** Clip a vertical wall triangle to a horizontal convex mask without creating sloped surfaces. */
function clipWall(triangle: Vertex[], mask: Point[]): Vertex[] {
  let result = triangle;
  const ordered = polygonArea(mask) > 0 ? mask : [...mask].reverse();
  for (let i = 0; i < ordered.length && result.length; i++) {
    const a = ordered[i]!,
      b = ordered[(i + 1) % ordered.length]!;
    const side = (vertex: Vertex): number =>
      (b.x - a.x) * (vertex.point.y - a.y) - (b.y - a.y) * (vertex.point.x - a.x);
    const next: Vertex[] = [];
    let previous = result.at(-1)!,
      prior = side(previous);
    for (const current of result) {
      const value = side(current);
      if (value >= -1e-12 !== prior >= -1e-12) {
        const t = prior / (prior - value);
        next.push({
          point: {
            x: previous.point.x + (current.point.x - previous.point.x) * t,
            y: previous.point.y + (current.point.y - previous.point.y) * t,
          },
          height: previous.height + (current.height - previous.height) * t,
        });
      }
      if (value >= -1e-12) next.push(current);
      previous = current;
      prior = value;
    }
    result = next;
  }
  return result;
}

/** One mesh overlays horizontal top strips and real vertical terrace walls, never the outer cliff. */
export function buildTileBorder(
  tile: GeneratedTile,
  border: BorderSettings,
  terrain?: THREE.BufferGeometry,
  regions: readonly SurfaceRegion[] = surfaceRegions(tile),
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry(),
    positions: number[] = [];
  if (tileBorderColor(border)) {
    const masks = tileBorderMasks(tile, border.width, regions).map((polygon) => ({
      polygon,
      bounds: bounds(polygon),
    }));
    let source = terrain;
    if (!source) {
      const buffer = new SurfaceBuffer();
      regions.forEach((region) =>
        region.polygons.forEach((polygon) => buffer.polygon(polygon, region.height, '#ffffff')),
      );
      exposedWalls(regions, TILE_BOTTOM).forEach((wall) =>
        buffer.wall(wall.a, wall.b, wall.low, wall.high, '#ffffff', '#ffffff'),
      );
      source = buffer.geometry();
    }
    const projection = new SurfaceProjection(source);
    masks.forEach((mask) => projection.append(mask.polygon, FIELD_BORDER_LIFT, positions));
    const vertices = source.getAttribute('position');
    for (let i = 0; i < vertices.count; i += 3) {
      const triangle: Vertex[] = [0, 1, 2].map((offset) => ({
        point: { x: vertices.getX(i + offset), y: vertices.getZ(i + offset) },
        height: vertices.getY(i + offset),
      }));
      const [a, b, c] = triangle;
      const projectedArea =
        (b!.point.x - a!.point.x) * (c!.point.y - a!.point.y) -
        (b!.point.y - a!.point.y) * (c!.point.x - a!.point.x);
      if (
        Math.abs(projectedArea) > 1e-10 ||
        Math.max(...triangle.map((v) => v.height)) - Math.min(...triangle.map((v) => v.height)) <
          1e-8
      )
        continue;
      const extent = bounds(triangle.map((vertex) => vertex.point));
      if (
        isOuterHexEdge(a!.point, b!.point) &&
        isOuterHexEdge(b!.point, c!.point) &&
        isOuterHexEdge(c!.point, a!.point)
      )
        continue;
      for (const mask of masks) {
        if (!overlaps(extent, mask.bounds)) continue;
        const piece = clipWall(triangle, mask.polygon);
        if (piece.length < 3) continue;
        const first = piece[0]!;
        for (let j = 1; j < piece.length - 1; j++)
          for (const vertex of [first, piece[j]!, piece[j + 1]!])
            positions.push(vertex.point.x, vertex.height + FIELD_BORDER_LIFT, vertex.point.y);
      }
    }
    if (!terrain) source.dispose();
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
