import { centroid, pointInPolygon, polygonArea, sharedBoundaryLength } from './geometry';
import { randomAt } from './random';
import type { Point, TileCell } from './types';

/** A figure must fit on ground area equivalent to a square with side 1/4 main-hex side. */
export { MIN_FIELD_AREA } from './limits';
export const cellSurfaceArea = (cell: TileCell): number =>
  cell.surfacePolygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
export function fieldArea(cellIds: Iterable<string>, cells: Map<string, TileCell>): number {
  let area = 0;
  for (const id of cellIds) area += cellSurfaceArea(cells.get(id)!);
  return area;
}
export function fieldAnchor(ids: Iterable<string>, map: Map<string, TileCell>): Point {
  const pieces = [...ids].flatMap((id) => map.get(id)!.surfacePolygons);
  const candidates = pieces.map((polygon) => ({
    polygon,
    point: centroid(polygon),
    area: polygonArea(polygon),
  }));
  const total = candidates.reduce((sum, candidate) => sum + candidate.area, 0);
  const mean = candidates.reduce(
    (point, candidate) => ({
      x: point.x + (candidate.point.x * candidate.area) / total,
      y: point.y + (candidate.point.y * candidate.area) / total,
    }),
    { x: 0, y: 0 },
  );
  if (pieces.some((polygon) => pointInPolygon(mean, polygon))) return mean;
  candidates.sort(
    (a, b) =>
      Math.hypot(a.point.x - mean.x, a.point.y - mean.y) -
      Math.hypot(b.point.x - mean.x, b.point.y - mean.y),
  );
  return candidates[0]!.point;
}
function perimeter(polygon: Point[]): number {
  return polygon.reduce((sum, point, i) => {
    const next = polygon[(i + 1) % polygon.length]!;
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}
export function clusterCompactness(ids: Set<string>, cells: Map<string, TileCell>): number {
  const area = fieldArea(ids, cells);
  let border = 0;
  for (const id of ids) {
    const cell = cells.get(id)!;
    border += perimeter(cell.polygon);
    for (const next of cell.neighbors)
      if (ids.has(next)) border -= sharedBoundaryLength(cell.polygon, cells.get(next)!.polygon);
  }
  return (border * border) / (4 * Math.PI * area);
}
export interface FieldCluster {
  id: string;
  ids: Set<string>;
  locked: boolean;
  fixed?: boolean;
}
interface CellMetric {
  area: number;
  border: number;
  center: Point;
}
const metricCaches = new WeakMap<
  Map<string, TileCell>,
  { cells: Map<string, CellMetric>; edges: Map<string, number> }
>();
/** Add the adjacent cell which best improves roundness and concentration, rather than a BFS strip. */
export function compactCandidate(
  group: FieldCluster,
  occupied: Map<string, string>,
  cells: Map<string, TileCell>,
  seed: string,
  permitted: (id: string) => boolean = () => true,
): string | undefined {
  let cache = metricCaches.get(cells);
  if (!cache) {
    cache = { cells: new Map(), edges: new Map() };
    metricCaches.set(cells, cache);
  }
  const metric = (id: string): CellMetric => {
    let value = cache.cells.get(id);
    if (!value) {
      const cell = cells.get(id)!;
      value = { area: cellSurfaceArea(cell), border: perimeter(cell.polygon), center: cell.center };
      cache.cells.set(id, value);
    }
    return value;
  };
  const edge = (first: string, second: string): number => {
    const key = first < second ? `${first}|${second}` : `${second}|${first}`;
    let value = cache.edges.get(key);
    if (value === undefined) {
      value = sharedBoundaryLength(cells.get(first)!.polygon, cells.get(second)!.polygon);
      cache.edges.set(key, value);
    }
    return value;
  };
  const frontier = new Set<string>();
  let area = 0,
    border = 0,
    momentX = 0,
    momentY = 0;
  for (const id of group.ids) {
    const cell = cells.get(id)!,
      value = metric(id);
    area += value.area;
    border += value.border;
    momentX += value.center.x * value.area;
    momentY += value.center.y * value.area;
    for (const neighbor of cell.neighbors) {
      if (group.ids.has(neighbor)) border -= edge(id, neighbor);
      else if (
        !occupied.has(neighbor) &&
        cells.get(neighbor)!.surfacePolygons.length &&
        permitted(neighbor)
      )
        frontier.add(neighbor);
    }
  }
  const anchor = { x: momentX / area, y: momentY / area };
  let best: string | undefined,
    score = Infinity;
  for (const id of frontier) {
    const cell = cells.get(id)!,
      value = metric(id);
    let shared = 0;
    for (const neighbor of cell.neighbors)
      if (group.ids.has(neighbor)) shared += edge(id, neighbor);
    const nextBorder = border + value.border - 2 * shared;
    const distance =
      ((cell.center.x - anchor.x) ** 2 + (cell.center.y - anchor.y) ** 2) / (area + value.area);
    const candidate =
      nextBorder / Math.sqrt(area + value.area) +
      distance * 0.65 +
      randomAt(seed, 'compact-candidate', group.id, id) * 0.04;
    if (candidate < score || (candidate === score && id < (best ?? ''))) {
      best = id;
      score = candidate;
    }
  }
  return best;
}
