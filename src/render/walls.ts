import type { Point } from '../core/types';

export interface WallRegion {
  polygons: Point[][];
  height: number;
}
export interface WallSegment {
  a: Point;
  b: Point;
  low: number;
  high: number;
}
interface Edge {
  a: Point;
  b: Point;
  height: number;
  low: number;
  high: number;
}
interface Line {
  direction: Point;
  normal: Point;
  distance: number;
  edges: Edge[];
}
const EPS = 1e-7;
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const rounded = (value: number): string => (Math.abs(value) < EPS ? 0 : value).toFixed(6);

/** Find actual exposed cliffs, including edges split by the exact pentagon cutout.
 * Collinear edge intervals are partitioned before comparing heights, so fragment
 * seams and shared equal-height raster walls produce no hidden geometry.
 */
export function exposedWalls(regions: readonly WallRegion[], bottom: number): WallSegment[] {
  const lines = new Map<string, Line>();
  regions.forEach((region) =>
    region.polygons.forEach((polygon) =>
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        if (!b) return;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < EPS) return;
        const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
        if (direction.x < -EPS || (Math.abs(direction.x) < EPS && direction.y < 0)) {
          direction.x *= -1;
          direction.y *= -1;
        }
        const normal = { x: -direction.y, y: direction.x };
        const distance = dot(a, normal);
        const key = [rounded(direction.x), rounded(direction.y), rounded(distance)].join(',');
        let line = lines.get(key);
        if (!line) {
          line = { direction, normal, distance, edges: [] };
          lines.set(key, line);
        }
        const ta = dot(a, line.direction),
          tb = dot(b, line.direction);
        line.edges.push({
          a,
          b,
          height: region.height,
          low: Math.min(ta, tb),
          high: Math.max(ta, tb),
        });
      }),
    ),
  );
  const result: WallSegment[] = [];
  lines.forEach((line) => {
    const endpoints = [...line.edges.flatMap((edge) => [edge.low, edge.high])]
      .sort((a, b) => a - b)
      .filter((value, i, all) => i === 0 || value - all[i - 1]! > EPS);
    for (let i = 0; i < endpoints.length - 1; i++) {
      const start = endpoints[i]!,
        end = endpoints[i + 1]!,
        middle = (start + end) / 2;
      const edges = line.edges.filter((edge) => edge.low < middle && edge.high > middle);
      if (!edges.length) continue;
      const high = Math.max(...edges.map((edge) => edge.height));
      const low = edges.length === 1 ? bottom : Math.min(...edges.map((edge) => edge.height));
      if (high - low < EPS) continue;
      const edge = edges.find((edge) => edge.height === high)!;
      const point = (t: number): Point => ({
        x: line.direction.x * t + line.normal.x * line.distance,
        y: line.direction.y * t + line.normal.y * line.distance,
      });
      const increasing = dot(edge.a, line.direction) < dot(edge.b, line.direction);
      result.push({
        a: point(increasing ? start : end),
        b: point(increasing ? end : start),
        low,
        high,
      });
    }
  });
  return result;
}
