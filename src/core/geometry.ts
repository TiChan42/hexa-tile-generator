import type { Point, TileCell, TileConfig } from './types';
import { MIN_FIELD_AREA } from './limits';
const EPS = 1e-9;
export function polygonArea(points: Point[]): number {
  const origin = points[0];
  if (!origin) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    sum += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return sum / 2;
}
export function centroid(points: Point[]): Point {
  const origin = points[0];
  if (!origin) return { x: 0, y: 0 };
  let area = 0,
    x = 0,
    y = 0;
  // Translation avoids cancellation for tiny clipped subcells far from the origin.
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    const ax = a.x - origin.x,
      ay = a.y - origin.y,
      bx = b.x - origin.x,
      by = b.y - origin.y;
    const cross = ax * by - bx * ay;
    area += cross;
    x += (ax + bx) * cross;
    y += (ay + by) * cross;
  }
  if (Math.abs(area) < 1e-24) return origin;
  return { x: origin.x + x / (3 * area), y: origin.y + y / (3 * area) };
}
export function regularPolygon(sides: number, radius: number, rotation = 0): Point[] {
  return Array.from({ length: sides }, (_, i) => ({
    x: radius * Math.cos(rotation + (i * 2 * Math.PI) / sides),
    y: radius * Math.sin(rotation + (i * 2 * Math.PI) / sides),
  }));
}
export const hexagon = (): Point[] => regularPolygon(6, 1);
/** A regular pentagon with side length 1/5 of the main hexagon's side length. */
export const pentagon = (): Point[] =>
  regularPolygon(5, 0.2 / (2 * Math.sin(Math.PI / 5)), -Math.PI / 2);
function side(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}
export function clipHalfPlane(subject: Point[], a: Point, b: Point, inside = true): Point[] {
  if (!subject.length) return [];
  const result: Point[] = [],
    sign = inside ? 1 : -1;
  for (let i = 0; i < subject.length; i++) {
    const p = subject[i]!,
      q = subject[(i + 1) % subject.length]!,
      dp = side(a, b, p) * sign,
      dq = side(a, b, q) * sign;
    if (dp >= -EPS) result.push(p);
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp / (dp - dq);
      result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return result.filter((p, i) => {
    const q = result[(i + 1) % result.length]!;
    return Math.hypot(p.x - q.x, p.y - q.y) > EPS;
  });
}
export function clipPolygon(subject: Point[], boundary: Point[]): Point[] {
  let result = subject;
  for (let i = 0; i < boundary.length && result.length; i++)
    result = clipHalfPlane(result, boundary[i]!, boundary[(i + 1) % boundary.length]!);
  return result;
}
/** Non-overlapping convex pieces representing subject minus a convex cutter. */
export function subtractPolygonParts(
  subject: Point[],
  cutter: Point[],
): { polygon: Point[]; side: number }[] {
  let remainder = subject;
  const pieces: { polygon: Point[]; side: number }[] = [];
  for (let i = 0; i < cutter.length && remainder.length; i++) {
    const a = cutter[i]!,
      b = cutter[(i + 1) % cutter.length]!;
    const outside = clipHalfPlane(remainder, a, b, false);
    if (outside.length >= 3 && polygonArea(outside) > 1e-12)
      pieces.push({ polygon: outside, side: i });
    remainder = clipHalfPlane(remainder, a, b);
  }
  return pieces;
}
export function subtractPolygon(subject: Point[], cutter: Point[]): Point[][] {
  return subtractPolygonParts(subject, cutter).map((piece) => piece.polygon);
}

/** Positive overlap length of two collinear segments; point contacts do not count. */
export function segmentOverlapLength(a: Point, b: Point, c: Point, d: Point): number {
  const ux = b.x - a.x,
    uy = b.y - a.y,
    length = Math.hypot(ux, uy);
  if (length < 1e-12) return 0;
  if (
    Math.abs(ux * (c.y - a.y) - uy * (c.x - a.x)) / length > 1e-8 ||
    Math.abs(ux * (d.y - a.y) - uy * (d.x - a.x)) / length > 1e-8
  )
    return 0;
  const p = ((c.x - a.x) * ux + (c.y - a.y) * uy) / length;
  const q = ((d.x - a.x) * ux + (d.y - a.y) * uy) / length;
  return Math.max(0, Math.min(length, Math.max(p, q)) - Math.max(0, Math.min(p, q)));
}
export function sharedBoundaryLength(first: Point[], second: Point[]): number {
  let length = 0;
  for (let i = 0; i < first.length; i++)
    for (let j = 0; j < second.length; j++) {
      length += segmentOverlapLength(
        first[i]!,
        first[(i + 1) % first.length]!,
        second[j]!,
        second[(j + 1) % second.length]!,
      );
    }
  return length;
}
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  return (
    polygon.length >= 3 &&
    polygon.every((a, i) => side(a, polygon[(i + 1) % polygon.length]!, point) >= -EPS)
  );
}
export function buildUntouchedGrid(config: TileConfig['grid']): TileCell[] {
  const boundary = hexagon(),
    originals: TileCell[] = [],
    n = config.divisions,
    radius = 1 / n,
    step = 1.7 / n;
  const prefix = config.kind === 'hex' ? 'h' : 'd';
  const offsets =
    config.kind === 'hex'
      ? [
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, 0],
          [-1, 1],
          [0, 1],
        ]
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
  for (let q = -2 * n; q <= 2 * n; q++)
    for (let r = -2 * n; r <= 2 * n; r++) {
      const origin =
        config.kind === 'hex'
          ? { x: 1.5 * radius * q, y: Math.sqrt(3) * radius * (r + q / 2) }
          : { x: step * (q + r * 0.5), y: step * Math.sqrt(3) * 0.5 * r };
      if (Math.abs(origin.x) > 1 + step || Math.abs(origin.y) > 1 + step) continue;
      const raw =
        config.kind === 'hex'
          ? regularPolygon(6, radius).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }))
          : [
              { x: -0.75 * step, y: -Math.sqrt(3) * step * 0.25 },
              { x: 0.25 * step, y: -Math.sqrt(3) * step * 0.25 },
              { x: 0.75 * step, y: Math.sqrt(3) * step * 0.25 },
              { x: -0.25 * step, y: Math.sqrt(3) * step * 0.25 },
            ].map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
      const polygon = clipPolygon(raw, boundary);
      if (polygon.length < 3 || polygonArea(polygon) < 1e-8) continue;
      originals.push({
        id: `${prefix}:${q}:${r}`,
        center: centroid(polygon),
        polygon,
        surfacePolygons: [polygon],
        neighbors: offsets.map(([dq, dr]) => `${prefix}:${q + dq!}:${r + dr!}`),
        baseHeight: 0,
        height: 0,
        color: '#000000',
        reserved: false,
      });
    }
  const map = new Map(originals.map((cell) => [cell.id, cell]));
  for (const cell of originals)
    cell.neighbors = cell.neighbors.filter(
      (id) => map.has(id) && sharedBoundaryLength(cell.polygon, map.get(id)!.polygon) > 1e-8,
    );
  return originals;
}

export interface EntranceFootprint {
  side: number;
  mouthIds: string[];
  cellIds: string[];
  center: Point;
  widthCells: number;
}
/** Entrances are selected before any central geometry, using no seed or landscape height. */
export function buildEntranceFootprints(
  grid: TileConfig['grid'],
  source: TileCell[] = buildUntouchedGrid(grid),
): EntranceFootprint[] {
  const map = new Map(source.map((cell) => [cell.id, cell])),
    boundary = hexagon(),
    allOuter = new Set(
      Array.from({ length: 6 }, (_, side) => boundaryCells(source, side)).flatMap((cells) =>
        cells.map((cell) => cell.id),
      ),
    ),
    claimed = new Set<string>();
  return Array.from({ length: 6 }, (_, side) => {
    const edge = boundaryCells(source, side),
      widthCells = Math.max(1, Math.floor(edge.length / 3)),
      start = Math.floor((edge.length - widthCells) / 2),
      mouthIds = edge.slice(start, start + widthCells).map((cell) => cell.id),
      ids = new Set(mouthIds);
    const a = boundary[side]!,
      b = boundary[(side + 1) % 6]!,
      center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      inward = { x: center.x * 0.83, y: center.y * 0.83 };
    let area = [...ids].reduce((sum, id) => sum + polygonArea(map.get(id)!.polygon), 0);
    while (area + 1e-10 < MIN_FIELD_AREA) {
      const frontier = [...new Set([...ids].flatMap((id) => map.get(id)!.neighbors))].filter(
        (id) => !ids.has(id) && !claimed.has(id) && !allOuter.has(id),
      );
      frontier.sort((left, right) => {
        const x = map.get(left)!,
          y = map.get(right)!;
        const score = (cell: TileCell) =>
          Math.hypot(cell.center.x - inward.x, cell.center.y - inward.y) -
          (cell.neighbors.filter((id) => ids.has(id)).length / grid.divisions) * 0.25;
        return score(x) - score(y) || (left < right ? -1 : 1);
      });
      const next = frontier[0];
      if (!next) throw new Error('Das Raster bietet keine ausreichend große feste Eingangsfläche.');
      ids.add(next);
      area += polygonArea(map.get(next)!.polygon);
    }
    ids.forEach((id) => claimed.add(id));
    return { side, mouthIds, cellIds: [...ids], center, widthCells };
  });
}

export interface CenterPortalGeometry {
  index: number;
  start: Point;
  end: Point;
  portalStart: Point;
  portalEnd: Point;
  corridor: Point[];
}
export function centerPortals(
  polygon: Point[],
  width = 0.45,
): { collar: Point[]; portals: CenterPortalGeometry[] } {
  const lengths = polygon.map((a, i) => {
      const b = polygon[(i + 1) % polygon.length]!;
      return Math.hypot(b.x - a.x, b.y - a.y);
    }),
    depth = Math.min(0.035, ...lengths.map((length) => length * 0.3));
  const normals = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!,
      length = lengths[i]!;
    return { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
  });
  const collar = polygon.map((point, i) => {
    const prev = (i + polygon.length - 1) % polygon.length,
      a = polygon[prev]!,
      next = polygon[(i + 1) % polygon.length]!,
      u = { x: point.x - a.x, y: point.y - a.y },
      v = { x: next.x - point.x, y: next.y - point.y };
    const p = { x: point.x + normals[prev]!.x * depth, y: point.y + normals[prev]!.y * depth },
      q = { x: point.x + normals[i]!.x * depth, y: point.y + normals[i]!.y * depth },
      cross = u.x * v.y - u.y * v.x,
      t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / cross;
    return { x: p.x + u.x * t, y: p.y + u.y * t };
  });
  const portals = polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!,
      lo = (1 - width) / 2,
      hi = 1 - lo,
      n = normals[index]!;
    const portalStart = {
        x: start.x + (end.x - start.x) * lo,
        y: start.y + (end.y - start.y) * lo,
      },
      portalEnd = { x: start.x + (end.x - start.x) * hi, y: start.y + (end.y - start.y) * hi };
    return {
      index,
      start,
      end,
      portalStart,
      portalEnd,
      corridor: [
        portalStart,
        { x: portalStart.x + n.x * depth, y: portalStart.y + n.y * depth },
        { x: portalEnd.x + n.x * depth, y: portalEnd.y + n.y * depth },
        portalEnd,
      ],
    };
  });
  return { collar, portals };
}

export function buildGrid(
  config: TileConfig['grid'],
  center: Point[] = pentagon(),
  options: { portalWidth?: number } = {},
): TileCell[] {
  const originals = buildUntouchedGrid(config),
    footprints = buildEntranceFootprints(config, originals),
    entryOwners = new Map(
      footprints.flatMap((entry) => entry.cellIds.map((id) => [id, entry.side] as const)),
    );
  const { collar, portals } = centerPortals(center, options.portalWidth ?? 0.45);
  const buckets = new Map<string, TileCell[]>(),
    cells: TileCell[] = [];
  for (const original of originals) {
    const collarPart = clipPolygon(original.polygon, collar),
      pieces: TileCell[] = [];
    if (collarPart.length >= 3 && polygonArea(collarPart) > 1e-12) {
      if (entryOwners.has(original.id))
        throw new Error(
          'Pentagon kollidiert mit festem Eingangsfeld; verschiebe oder verkleinere das Pentagon.',
        );
      const make = (
        id: string,
        polygon: Point[],
        inside: boolean,
        landscapeOnly = false,
        centerPort?: number,
      ): TileCell => ({
        ...original,
        id,
        polygon,
        center: centroid(polygon),
        surfacePolygons: inside ? [] : [polygon],
        neighbors: [],
        reserved: true,
        rasterId: original.id,
        rasterCenter: original.center,
        ...(landscapeOnly ? { landscapeOnly: true } : {}),
        ...(centerPort !== undefined ? { centerPort } : {}),
      });
      const inside = clipPolygon(original.polygon, center);
      if (inside.length >= 3 && polygonArea(inside) > 1e-12)
        pieces.push(make(`${original.id}:center`, inside, true));
      for (const piece of subtractPolygonParts(original.polygon, collar))
        pieces.push(make(`${original.id}:outside:${piece.side}`, piece.polygon, false));
      let remaining = subtractPolygon(collarPart, center);
      for (const portal of portals) {
        const next: Point[][] = [];
        for (const piece of remaining) {
          const overlap = clipPolygon(piece, portal.corridor);
          if (overlap.length >= 3 && polygonArea(overlap) > 1e-12)
            pieces.push(
              make(
                `${original.id}:portal:${portal.index}:${pieces.length}`,
                overlap,
                false,
                false,
                portal.index,
              ),
            );
          if (overlap.length >= 3 && polygonArea(overlap) > 1e-12)
            next.push(...subtractPolygon(piece, portal.corridor));
          else next.push(piece);
        }
        remaining = next;
      }
      remaining.forEach((polygon, index) =>
        pieces.push(make(`${original.id}:corner:${index}`, polygon, false, true)),
      );
    } else
      pieces.push({
        ...original,
        neighbors: [],
        ...(entryOwners.has(original.id) ? { entranceSide: entryOwners.get(original.id)! } : {}),
      });
    buckets.set(original.id, pieces);
    cells.push(...pieces);
  }
  // The original lattice bounds all pair candidates; local portal cuts preserve exact positive-edge adjacency.
  const processed = new Set<string>();
  for (const original of originals) {
    const own = buckets.get(original.id)!;
    const candidates = [original.id, ...original.neighbors].flatMap((id) => buckets.get(id) ?? []);
    for (const first of own)
      for (const second of candidates) {
        if (first.id === second.id) continue;
        const key = [first.id, second.id].sort().join('|');
        if (processed.has(key)) continue;
        processed.add(key);
        if (sharedBoundaryLength(first.polygon, second.polygon) > 1e-8) {
          first.neighbors.push(second.id);
          second.neighbors.push(first.id);
        }
      }
  }
  return cells;
}
export function isConnectedSelection(cellIds: string[], cells: TileCell[]): boolean {
  const ids = new Set(cellIds),
    map = new Map(cells.map((c) => [c.id, c]));
  if (!ids.size || [...ids].some((id) => !map.has(id))) return false;
  const queue = [cellIds[0]!],
    visited = new Set(queue);
  for (let i = 0; i < queue.length; i++)
    for (const next of map.get(queue[i]!)!.neighbors)
      if (ids.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
  return visited.size === ids.size;
}
export const connectedSelection = isConnectedSelection;
export function boundaryCells(cells: TileCell[], sideIndex: number): TileCell[] {
  const boundary = hexagon(),
    a = boundary[sideIndex]!,
    b = boundary[(sideIndex + 1) % 6]!;
  return cells
    .filter((cell) => cell.polygon.filter((p) => Math.abs(side(a, b, p)) < 1e-7).length >= 2)
    .sort(
      (left, right) =>
        (left.center.x - a.x) * (b.x - a.x) +
        (left.center.y - a.y) * (b.y - a.y) -
        ((right.center.x - a.x) * (b.x - a.x) + (right.center.y - a.y) * (b.y - a.y)),
    );
}
