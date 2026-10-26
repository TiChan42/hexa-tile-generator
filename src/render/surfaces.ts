import * as THREE from 'three';
import {
  centroid,
  clipPolygon,
  hexagon,
  pointInPolygon,
  polygonArea,
  subtractPolygon,
} from '../core/geometry';
import { sampleGradient } from '../core/color';
import type { GameField, GeneratedTile, Point, TileConfig } from '../core/types';
import { exposedWalls, type WallSegment } from './walls';
import type { CameraGroundPoint } from './camera';

export const TILE_BOTTOM = -0.16;
export interface SurfaceRegion {
  id: string;
  cellId?: string;
  polygons: Point[][];
  height: number;
  color: string;
  fieldId?: string;
}
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t =
    length > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function fieldPolygons(tile: GeneratedTile, field: GameField): Point[][] {
  if (field.isCenter) return [tile.center.polygon];
  const ids = new Set(field.cellIds);
  return tile.cells.filter((cell) => ids.has(cell.id)).flatMap((cell) => cell.surfacePolygons);
}
/** Visible cells retain their own elevation, including reserved pieces inside a terraced center. */
export function fieldSurfaceRegions(tile: GeneratedTile, field: GameField): SurfaceRegion[] {
  const ids = new Set(field.cellIds);
  const cells = tile.cells.filter((cell) => ids.has(cell.id) || cell.fieldId === field.id);
  if (field.isCenter) {
    const hidden = cells.filter(
      (cell) => cell.surfacePolygons.length === 0 && cell.polygon.length >= 3,
    );
    if (hidden.length)
      return hidden.map((cell) => ({
        id: field.id,
        cellId: cell.id,
        polygons: [cell.polygon],
        height: cell.height,
        color: field.color,
        fieldId: field.id,
      }));
    return [
      {
        id: field.id,
        polygons: [tile.center.polygon],
        height: tile.center.height,
        color: field.color,
        fieldId: field.id,
      },
    ];
  }
  return cells
    .filter((cell) => cell.surfacePolygons.length)
    .map((cell) => ({
      id: field.id,
      cellId: cell.id,
      polygons: cell.surfacePolygons,
      height: cell.height,
      color: cell.color,
      fieldId: field.id,
    }));
}
export function surfaceRegions(tile: GeneratedTile): SurfaceRegion[] {
  const visible: SurfaceRegion[] = tile.cells
    .filter((cell) => cell.surfacePolygons.length)
    .map((cell) => ({
      id: cell.fieldId ?? cell.id,
      cellId: cell.id,
      polygons: cell.surfacePolygons,
      height: cell.height,
      color: cell.color,
      fieldId: cell.fieldId,
    }));
  const center = tile.fields.find((field) => field.isCenter);
  return [
    ...visible,
    ...(center
      ? fieldSurfaceRegions(tile, center)
      : [
          {
            id: 'center',
            polygons: [tile.center.polygon],
            height: tile.center.height,
            color: '#d4b975',
            fieldId: 'center',
          },
        ]),
  ];
}

export class SurfaceBuffer {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly pathWeights: number[] = [];
  readonly borderDistances: number[] = [];
  private vertex(
    p: Point,
    height: number,
    color: THREE.Color,
    pathWeight: number,
    borderDistance: number,
  ): void {
    this.positions.push(p.x, height, p.y);
    this.colors.push(color.r, color.g, color.b);
    this.pathWeights.push(pathWeight);
    this.borderDistances.push(borderDistance);
  }
  triangle(
    a: Point,
    b: Point,
    c: Point,
    height: number,
    color: THREE.Color,
    pathWeight = 0,
    distance: (p: Point) => number = () => 0,
    reverse = false,
  ): void {
    for (const p of reverse ? [a, b, c] : [a, c, b])
      this.vertex(p, height, color, pathWeight, distance(p));
  }
  polygon(
    polygon: Point[],
    height: number,
    color: string,
    pathWeight = 0,
    distance: (p: Point) => number = () => 0,
    reverse = false,
  ): void {
    if (polygon.length < 3) return;
    const ordered = polygonArea(polygon) >= 0 ? polygon : [...polygon].reverse();
    const center = centroid(ordered);
    const rgb = new THREE.Color(color);
    ordered.forEach((a, i) => {
      const b = ordered[(i + 1) % ordered.length];
      if (b) this.triangle(center, a, b, height, rgb, pathWeight, distance, reverse);
    });
  }
  wall(a: Point, b: Point, low: number, high: number, colorLow: string, colorHigh: string): void {
    const lo = new THREE.Color(colorLow),
      hi = new THREE.Color(colorHigh);
    const vertices: [
      [Point, number, THREE.Color],
      [Point, number, THREE.Color],
      [Point, number, THREE.Color],
      [Point, number, THREE.Color],
      [Point, number, THREE.Color],
      [Point, number, THREE.Color],
    ] = [
      [a, low, lo],
      [a, high, hi],
      [b, high, hi],
      [a, low, lo],
      [b, high, hi],
      [b, low, lo],
    ];
    vertices.forEach(([p, h, c]) => this.vertex(p, h, c, 0, 0));
  }
  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('tilePathWeight', new THREE.Float32BufferAttribute(this.pathWeights, 1));
    geometry.setAttribute(
      'tileBorderDistance',
      new THREE.Float32BufferAttribute(this.borderDistances, 1),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
export function pathDistance(
  p: Point,
  borders: readonly WallSegment[],
  normalizer: number,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      Math.min(...borders.map((edge) => distanceToSegment(p, edge.a, edge.b))) /
        Math.max(0.001, normalizer),
    ),
  );
}

export interface BatchedSurfaces {
  geometry: THREE.BufferGeometry;
  ground: CameraGroundPoint[];
  regions: SurfaceRegion[];
}
/** One opaque draw holds all terrain, fields, closed underside and vertical ledges. */
export function buildTileSurfaces(tile: GeneratedTile, config: TileConfig): BatchedSurfaces {
  const buffer = new SurfaceBuffer(),
    regions = surfaceRegions(tile),
    boundary = hexagon();
  const fieldBorders = new Map(
    tile.fields.map((field) => [
      field.id,
      exposedWalls([{ polygons: fieldPolygons(tile, field), height: 1 }], 0),
    ]),
  );
  const fieldScales = new Map(
    tile.fields.map((field) => [field.id, Math.sqrt(Math.max(field.area, 1e-6)) * 0.32]),
  );
  const ground: CameraGroundPoint[] = [];
  const maxHeight = 0.08 + config.terrain.elevation;
  const wallColor = (h: number): string =>
    sampleGradient(config.terrain.wallGradient, (h - TILE_BOTTOM) / (maxHeight - TILE_BOTTOM));
  for (const region of regions) {
    const borders = fieldBorders.get(region.id) ?? [];
    const distance = (p: Point): number =>
      pathDistance(p, borders, fieldScales.get(region.id) ?? 0.1);
    region.polygons.forEach((piece) =>
      buffer.polygon(piece, region.height, region.color, region.fieldId ? 1 : 0, distance),
    );
    region.polygons.forEach((piece) =>
      piece.forEach((point) => ground.push({ point, height: region.height })),
    );
  }
  const fieldMasks = regions
    .filter((region) => region.fieldId)
    .flatMap((region) => region.polygons.map((polygon) => ({ polygon, fieldId: region.fieldId })))
    .map(({ polygon, fieldId }) => ({
      polygon,
      fieldId,
      minX: Math.min(...polygon.map((p) => p.x)),
      maxX: Math.max(...polygon.map((p) => p.x)),
      minY: Math.min(...polygon.map((p) => p.y)),
      maxY: Math.max(...polygon.map((p) => p.y)),
    }));
  const walls = exposedWalls(regions, TILE_BOTTOM);
  for (const wall of walls) {
    for (let i = 0; i < 4; i++) {
      const lo = wall.low + ((wall.high - wall.low) * i) / 4,
        hi = wall.low + ((wall.high - wall.low) * (i + 1)) / 4;
      buffer.wall(wall.a, wall.b, lo, hi, wallColor(lo), wallColor(hi));
    }
    if (config.terrain.overhang <= 0 || wall.low <= TILE_BOTTOM + 1e-6) continue;
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const normal = { x: (wall.b.y - wall.a.y) / length, y: -(wall.b.x - wall.a.x) / length };
    const mid = {
      x: (wall.a.x + wall.b.x) / 2 - normal.x * 1e-5,
      y: (wall.a.y + wall.b.y) / 2 - normal.y * 1e-5,
    };
    const owner = regions.find(
      (region) =>
        Math.abs(region.height - wall.high) < 1e-6 &&
        region.polygons.some((piece) => pointInPolygon(mid, piece)),
    );
    if (!owner) continue;
    const d = config.terrain.overhang;
    const cap = clipPolygon(
      [
        wall.a,
        wall.b,
        { x: wall.b.x + normal.x * d, y: wall.b.y + normal.y * d },
        { x: wall.a.x + normal.x * d, y: wall.a.y + normal.y * d },
      ].reverse(),
      boundary,
    );
    if (cap.length < 3) continue;
    let caps = [cap];
    for (const mask of fieldMasks) {
      if (owner.fieldId && mask.fieldId === owner.fieldId) continue;
      caps = caps.flatMap((piece) => {
        const minX = Math.min(...piece.map((p) => p.x)),
          maxX = Math.max(...piece.map((p) => p.x)),
          minY = Math.min(...piece.map((p) => p.y)),
          maxY = Math.max(...piece.map((p) => p.y));
        if (
          maxX <= mask.minX + 1e-9 ||
          minX >= mask.maxX - 1e-9 ||
          maxY <= mask.minY + 1e-9 ||
          minY >= mask.maxY - 1e-9
        )
          return [piece];
        return subtractPolygon(piece, mask.polygon);
      });
      if (!caps.length) break;
    }
    const high = wall.high + 0.0002,
      low = wall.high - config.terrain.skirtDepth;
    for (const piece of caps) {
      if (piece.length < 3 || Math.abs(polygonArea(piece)) < 1e-12) continue;
      buffer.polygon(piece, high, owner.color, owner.fieldId ? 1 : 0);
      buffer.polygon(piece, low, wallColor(low), 0, () => 0, true);
      piece.forEach((a, i) => {
        const b = piece[(i + 1) % piece.length];
        if (b) buffer.wall(a, b, low, high, wallColor(low), owner.color);
      });
      piece.forEach((point) => ground.push({ point, height: high }));
      regions.push({ ...owner, polygons: [piece], height: high });
    }
  }
  buffer.polygon(boundary, TILE_BOTTOM, wallColor(TILE_BOTTOM), 0, () => 0, true);
  boundary.forEach((point) => ground.push({ point, height: TILE_BOTTOM }));
  return { geometry: buffer.geometry(), ground, regions };
}
