import { centroid, pointInPolygon, polygonArea } from './geometry';
import { fieldBoundarySegments } from './connections';
import type { GameField, Point, TileCell } from './types';

/** Apply only declared elevation edits; geometric footprint and source raster heights stay untouched. */
export function applyFieldElevation(
  ids: string[],
  cells: Map<string, TileCell>,
  anchor: Point,
  mode: 'flat' | 'terraced',
  offset = 0,
  center = false,
): { height: number; maxHeight: number; symbolHeight: number } {
  const originals = ids.map((id) => cells.get(id)!),
    minimum = Math.min(...originals.map((cell) => cell.baseHeight));
  for (const cell of originals)
    cell.height = Math.max(0.02, (mode === 'flat' ? minimum : cell.baseHeight) + offset);
  const heights = originals.map((cell) => cell.height),
    height = Math.min(...heights),
    maxHeight = Math.max(...heights);
  const local = originals
    .filter((cell) =>
      center
        ? pointInPolygon(anchor, cell.polygon)
        : cell.surfacePolygons.some((polygon) => pointInPolygon(anchor, polygon)),
    )
    .map((cell) => cell.height);
  return { height, maxHeight, symbolHeight: local.length ? Math.max(...local) : height };
}

/** Prefer a nearby plateau interior with enough ground around the badge, away from terrace seams. */
export function terracedSymbolAnchor(
  ids: string[],
  cells: Map<string, TileCell>,
  preferred: Point,
  center = false,
): { point: Point; height: number } {
  const selected = ids.map((id) => cells.get(id)!);
  const localHeight = (point: Point): number => {
    const visible = selected
      .filter((cell) =>
        center
          ? pointInPolygon(point, cell.polygon)
          : cell.surfacePolygons.some((polygon) => pointInPolygon(point, polygon)),
      )
      .map((cell) => cell.height);
    return visible.length ? Math.max(...visible) : Math.min(...selected.map((cell) => cell.height));
  };
  if (selected.every((cell) => Math.abs(cell.height - selected[0]!.height) < 1e-10))
    return { point: preferred, height: localHeight(preferred) };
  const pending = new Set(ids),
    candidates: { point: Point; height: number; clearance: number }[] = [];
  while (pending.size) {
    const first = pending.values().next().value! as string,
      height = cells.get(first)!.height,
      part = [first];
    pending.delete(first);
    for (let i = 0; i < part.length; i++)
      for (const next of cells.get(part[i]!)!.neighbors)
        if (pending.has(next) && Math.abs(cells.get(next)!.height - height) < 1e-10) {
          pending.delete(next);
          part.push(next);
        }
    const polygons = part.flatMap((id) => {
      const cell = cells.get(id)!;
      return center ? [cell.polygon] : cell.surfacePolygons;
    });
    const area = polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    const mean = polygons.reduce(
      (point, polygon) => {
        const local = centroid(polygon),
          weight = polygonArea(polygon) / area;
        return { x: point.x + local.x * weight, y: point.y + local.y * weight };
      },
      { x: 0, y: 0 },
    );
    const plateau: GameField = {
      id: 'symbol-plateau',
      cellIds: part,
      center: mean,
      height,
      maxHeight: height,
      symbolHeight: height,
      color: '#000000',
      action: 'none',
      label: '',
      isCenter: center,
      area,
    };
    const edges = fieldBoundarySegments(plateau, selected);
    for (const point of [mean, ...polygons.map(centroid)]) {
      if (!polygons.some((polygon) => pointInPolygon(point, polygon))) continue;
      const clearance = Math.min(
        ...edges.map((edge) => {
          const dx = edge.end.x - edge.start.x,
            dy = edge.end.y - edge.start.y,
            length = dx * dx + dy * dy;
          const t = length
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) / length,
                ),
              )
            : 0;
          return Math.hypot(point.x - edge.start.x - dx * t, point.y - edge.start.y - dy * t);
        }),
      );
      candidates.push({ point, height, clearance });
    }
  }
  const bestClearance = Math.max(...candidates.map((candidate) => candidate.clearance)),
    minimum = Math.min(0.035, bestClearance * 0.75);
  const valid = candidates.filter((candidate) => candidate.clearance >= minimum - 1e-10);
  valid.sort(
    (a, b) =>
      Math.hypot(a.point.x - preferred.x, a.point.y - preferred.y) -
        Math.hypot(b.point.x - preferred.x, b.point.y - preferred.y) ||
      b.clearance - a.clearance ||
      a.point.x - b.point.x ||
      a.point.y - b.point.y,
  );
  const result = valid[0]!;
  return { point: result.point, height: localHeight(result.point) };
}
