import { pointInPolygon, segmentOverlapLength } from './geometry';
import type { FieldConnection, GameField, Point, TileCell } from './types';
export interface BoundarySegment {
  start: Point;
  end: Point;
  height?: number;
}
const length = (segment: BoundarySegment): number =>
  Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
const key = (point: Point): string => `${point.x.toFixed(9)},${point.y.toFixed(9)}`;
const segmentKey = (segment: BoundarySegment): string =>
  [key(segment.start), key(segment.end)].sort().join('|');
function overlap(first: BoundarySegment, second: BoundarySegment): BoundarySegment | null {
  if (segmentOverlapLength(first.start, first.end, second.start, second.end) < 1e-8) return null;
  const dx = first.end.x - first.start.x,
    dy = first.end.y - first.start.y,
    d2 = dx * dx + dy * dy;
  const project = (point: Point) =>
    ((point.x - first.start.x) * dx + (point.y - first.start.y) * dy) / d2;
  const p = project(second.start),
    q = project(second.end),
    lo = Math.max(0, Math.min(p, q)),
    hi = Math.min(1, Math.max(p, q));
  return {
    start: { x: first.start.x + dx * lo, y: first.start.y + dy * lo },
    end: { x: first.start.x + dx * hi, y: first.start.y + dy * hi },
  };
}
const outlineCache = new WeakMap<GameField, WeakMap<TileCell[], BoundarySegment[]>>();
/** Exact union outline, including partial-edge cancellation at central raster fragments. */
export function fieldBoundarySegments(field: GameField, cells: TileCell[]): BoundarySegment[] {
  const saved = outlineCache.get(field)?.get(cells);
  if (saved) return saved;
  const ids = new Set(field.cellIds);
  const owned = cells.filter((cell) => ids.has(cell.id));
  const surfaces = field.isCenter
    ? owned.length
      ? owned.map((cell) => ({ polygon: cell.polygon, height: cell.height }))
      : field.polygon
        ? [{ polygon: field.polygon, height: field.height }]
        : []
    : owned.flatMap((cell) =>
        cell.surfacePolygons.map((polygon) => ({ polygon, height: cell.height })),
      );
  const raw = surfaces.flatMap(({ polygon, height }) =>
    polygon.map((start, i) => ({ start, end: polygon[(i + 1) % polygon.length]!, height })),
  );
  const output = new Map<string, BoundarySegment>();
  for (const edge of raw) {
    const cuts = [0, 1],
      dx = edge.end.x - edge.start.x,
      dy = edge.end.y - edge.start.y,
      d2 = dx * dx + dy * dy;
    if (d2 < 1e-18) continue;
    for (const other of raw) {
      const common = overlap(edge, other);
      if (!common) continue;
      cuts.push(
        ((common.start.x - edge.start.x) * dx + (common.start.y - edge.start.y) * dy) / d2,
        ((common.end.x - edge.start.x) * dx + (common.end.y - edge.start.y) * dy) / d2,
      );
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1]!,
        hi = cuts[i]!;
      if (hi - lo < 1e-8) continue;
      const piece = {
        height: edge.height,
        start: { x: edge.start.x + dx * lo, y: edge.start.y + dy * lo },
        end: { x: edge.start.x + dx * hi, y: edge.start.y + dy * hi },
      };
      if (
        raw.filter(
          (other) =>
            segmentOverlapLength(piece.start, piece.end, other.start, other.end) >
            length(piece) * 0.99,
        ).length === 1
      )
        output.set(segmentKey(piece), piece);
    }
  }
  const result = [...output.values()];
  let cache = outlineCache.get(field);
  if (!cache) {
    cache = new WeakMap();
    outlineCache.set(field, cache);
  }
  cache.set(cells, result);
  return result;
}
/** Highest visible owning piece wins at an exact shared edge; fall back only outside the field. */
export function fieldHeightAt(field: GameField, cells: TileCell[], point: Point): number {
  const ids = new Set(field.cellIds),
    heights = cells
      .filter(
        (cell) =>
          ids.has(cell.id) &&
          (field.isCenter
            ? pointInPolygon(point, cell.polygon)
            : cell.surfacePolygons.some((polygon) => pointInPolygon(point, polygon))),
      )
      .map((cell) => cell.height);
  return heights.length ? Math.max(...heights) : field.height;
}
/** The public graph is derived from physical shared edges, not proximity or labels. */
export function buildConnections(fields: GameField[], cells: TileCell[]): FieldConnection[] {
  const boundaries = new Map(
      fields.map((field) => [field.id, fieldBoundarySegments(field, cells)]),
    ),
    output: FieldConnection[] = [];
  const sorted = [...fields].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const from = sorted[i]!,
        to = sorted[j]!,
        segments = new Map<
          string,
          { start: Point; end: Point; fromHeight: number; toHeight: number }
        >();
      for (const first of boundaries.get(from.id)!)
        for (const second of boundaries.get(to.id)!) {
          const shared = overlap(first, second);
          if (shared) {
            const midpoint = {
              x: (shared.start.x + shared.end.x) / 2,
              y: (shared.start.y + shared.end.y) / 2,
            };
            segments.set(segmentKey(shared), {
              ...shared,
              fromHeight: first.height ?? fieldHeightAt(from, cells, midpoint),
              toHeight: second.height ?? fieldHeightAt(to, cells, midpoint),
            });
          }
        }
      if (!segments.size) continue;
      const pieces = [...segments.values()];
      output.push({
        id: `${from.id}|${to.id}`,
        from: from.id,
        to: to.id,
        segments: pieces,
        sharedLength: pieces.reduce((sum, piece) => sum + length(piece), 0),
        heightDelta: to.height - from.height,
        kind: from.isCenter || to.isCenter ? 'center' : 'path',
      });
    }
  return output;
}
