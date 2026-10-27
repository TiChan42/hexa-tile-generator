import * as THREE from 'three';
import {
  centroid,
  hexagon,
  clipPolygon,
  pointInPolygon,
  polygonArea,
  regularPolygon,
  segmentOverlapLength,
} from '../core/geometry';
import type { GameField, GeneratedTile, Point } from '../core/types';
import { exposedWalls } from './walls';
import { SurfaceProjection } from './surfaceProjection';
import { distanceToSegment, fieldSurfaceRegions, type SurfaceRegion } from './surfaces';

export const FIELD_BORDER_COLOR = '#2d362e';
export const OUTER_FIELD_BORDER_COLOR = '#000000';
export const FIELD_BORDER_WIDTH = 0.007;
export const CENTER_BORDER_WIDTH = 0.0085;
export const FIELD_BORDER_LIFT = 0.0025;
export interface FieldBorderSegment {
  start: Point;
  end: Point;
  height: number;
  fieldId: string;
  region: SurfaceRegion;
}
export interface BorderStep {
  point: Point;
  inner: Point;
  low: number;
  high: number;
  fieldId: string;
}
const length = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const key = (p: Point): string => `${p.x.toFixed(8)},${p.y.toFixed(8)}`;

const MAIN_HEX = hexagon();
/** A whole segment on one actual outer side; inner raster edges never qualify. */
export function isOuterHexEdge(a: Point, b: Point): boolean {
  return MAIN_HEX.some((start, i) => {
    const end = MAIN_HEX[(i + 1) % MAIN_HEX.length]!;
    return distanceToSegment(a, start, end) < 1e-7 && distanceToSegment(b, start, end) < 1e-7;
  });
}
/** Geometry is the exterior of the whole field, independent of its internal elevation steps. */
export function fieldOutlineSegments(tile: GeneratedTile, field: GameField): FieldBorderSegment[] {
  const regions = fieldSurfaceRegions(tile, field);
  const polygons = regions.flatMap((region) => region.polygons);
  return exposedWalls([{ polygons, height: 1 }], 0).flatMap(({ a, b }) => {
    const extent = length(a, b);
    if (extent < 1e-8) return [];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const inward = { x: -(b.y - a.y) / extent, y: (b.x - a.x) / extent };
    const probe = { x: mid.x + inward.x * 1e-6, y: mid.y + inward.y * 1e-6 };
    const region =
      regions.find((region) =>
        region.polygons.some((polygon) =>
          polygon.some(
            (start, i) =>
              segmentOverlapLength(a, b, start, polygon[(i + 1) % polygon.length]!) > extent - 1e-7,
          ),
        ),
      ) ??
      regions.find((region) => region.polygons.some((polygon) => pointInPolygon(probe, polygon)));
    return region ? [{ start: a, end: b, height: region.height, fieldId: field.id, region }] : [];
  });
}
function sharedStepInner(
  a: SurfaceRegion,
  b: SurfaceRegion,
  point: Point,
  width: number,
): Point | undefined {
  for (const first of a.polygons)
    for (let i = 0; i < first.length; i++) {
      const start = first[i]!,
        end = first[(i + 1) % first.length]!;
      if (distanceToSegment(point, start, end) > 1e-7) continue;
      for (const second of b.polygons)
        for (let j = 0; j < second.length; j++) {
          const other = second[j]!,
            last = second[(j + 1) % second.length]!;
          if (
            segmentOverlapLength(start, end, other, last) < 1e-8 ||
            distanceToSegment(point, other, last) > 1e-7
          )
            continue;
          for (const candidate of [start, end].sort(
            (a, b) => length(point, b) - length(point, a),
          )) {
            const extent = length(point, candidate);
            if (extent < 1e-7) continue;
            const inner = {
              x: point.x + ((candidate.x - point.x) * Math.min(width, extent)) / extent,
              y: point.y + ((candidate.y - point.y) * Math.min(width, extent)) / extent,
            };
            if (distanceToSegment(inner, other, last) < 1e-7) return inner;
          }
        }
    }
  return undefined;
}

/** A single mesh contains fixed world-width dark ink and small vertical wraps at terrace steps. */
export function buildFieldBorders(
  tile: GeneratedTile,
  terrain?: THREE.BufferGeometry,
): { geometry: THREE.BufferGeometry; segments: FieldBorderSegment[]; steps: BorderStep[] } {
  const projection = terrain ? new SurfaceProjection(terrain) : undefined;
  const positions: number[] = [],
    colors: number[] = [],
    segments: FieldBorderSegment[] = [],
    steps: BorderStep[] = [];
  const fieldInk = new THREE.Color(FIELD_BORDER_COLOR),
    outerInk = new THREE.Color(OUTER_FIELD_BORDER_COLOR);
  let ink = fieldInk;
  const appendColors = (from: number): void => {
    for (let i = from; i < positions.length; i += 3) colors.push(ink.r, ink.g, ink.b);
  };
  const triangle = (a: Point, b: Point, c: Point, height: (p: Point) => number): void => {
    const from = positions.length;
    for (const p of [a, c, b]) positions.push(p.x, height(p), p.y);
    appendColors(from);
  };
  const polygon = (piece: Point[], height: (p: Point) => number): void => {
    if (piece.length < 3 || Math.abs(polygonArea(piece)) < 1e-12) return;
    if (projection) {
      const from = positions.length;
      projection.append(piece, FIELD_BORDER_LIFT, positions);
      appendColors(from);
      return;
    }
    const ordered = polygonArea(piece) > 0 ? piece : [...piece].reverse(),
      middle = centroid(ordered);
    ordered.forEach((a, i) => {
      const b = ordered[(i + 1) % ordered.length];
      if (b) triangle(middle, a, b, height);
    });
  };
  for (const field of tile.fields) {
    const fieldSegments = fieldOutlineSegments(tile, field),
      width = field.isCenter ? CENTER_BORDER_WIDTH : FIELD_BORDER_WIDTH;
    segments.push(...fieldSegments);
    const joins = new Map<string, { point: Point; edges: FieldBorderSegment[] }>(),
      rounds = new Set<string>();
    for (const edge of fieldSegments) {
      ink = isOuterHexEdge(edge.start, edge.end) ? outerInk : fieldInk;
      const extent = length(edge.start, edge.end),
        inward = {
          x: -(edge.end.y - edge.start.y) / extent,
          y: (edge.end.x - edge.start.x) / extent,
        };
      const height = (): number => edge.height + FIELD_BORDER_LIFT;
      const sample = (t: number): Point => ({
        x: edge.start.x + (edge.end.x - edge.start.x) * t,
        y: edge.start.y + (edge.end.y - edge.start.y) * t,
      });
      const subdivisions = projection ? 1 : 6;
      for (let i = 0; i < subdivisions; i++) {
        const a = sample(i / subdivisions),
          b = sample((i + 1) / subdivisions);
        const ribbon = [
          a,
          b,
          { x: b.x + inward.x * width, y: b.y + inward.y * width },
          { x: a.x + inward.x * width, y: a.y + inward.y * width },
        ];
        if (polygonArea(ribbon) < 0) ribbon.reverse();
        edge.region.polygons.forEach((surface) => polygon(clipPolygon(ribbon, surface), height));
      }
      for (const point of [edge.start, edge.end]) {
        const at = key(point);
        let join = joins.get(at);
        if (!join) {
          join = { point, edges: [] };
          joins.set(at, join);
        }
        join.edges.push(edge);
        const roundKey = `${edge.region.cellId ?? edge.region.id}:${at}`;
        if (rounds.has(roundKey)) continue;
        rounds.add(roundKey);
        const circle = regularPolygon(10, width).map((p) => ({
          x: p.x + point.x,
          y: p.y + point.y,
        }));
        edge.region.polygons.forEach((surface) => polygon(clipPolygon(circle, surface), height));
      }
    }
    joins.forEach(({ point, edges }) => {
      const pairs = new Set<string>();
      for (let i = 0; i < edges.length; i++)
        for (let j = i + 1; j < edges.length; j++) {
          const a = edges[i]!,
            b = edges[j]!;
          if (Math.abs(a.height - b.height) < 1e-7) continue;
          const pair = [a.region.cellId ?? a.region.id, b.region.cellId ?? b.region.id]
            .sort()
            .join('|');
          if (pairs.has(pair)) continue;
          pairs.add(pair);
          const inner = sharedStepInner(a.region, b.region, point, width);
          if (!inner) continue;
          const ap = a.height + FIELD_BORDER_LIFT,
            bp = b.height + FIELD_BORDER_LIFT;
          const low = Math.min(ap, bp),
            high = Math.max(ap, bp);
          ink =
            isOuterHexEdge(a.start, a.end) && isOuterHexEdge(b.start, b.end) ? outerInk : fieldInk;
          const from = positions.length;
          positions.push(
            point.x,
            ap,
            point.y,
            point.x,
            bp,
            point.y,
            inner.x,
            bp,
            inner.y,
            point.x,
            ap,
            point.y,
            inner.x,
            bp,
            inner.y,
            inner.x,
            ap,
            inner.y,
          );
          appendColors(from);
          steps.push({ point, inner, low, high, fieldId: field.id });
        }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return { geometry, segments, steps };
}
