import { fieldBoundarySegments, fieldHeightAt } from './connections';
import type { BoundarySegment } from './connections';
import { hexagon, pointInPolygon } from './geometry';
import { randomAt } from './random';
import type { FieldConnection, GameField, PathDetail, Point, TileCell, TileConfig } from './types';

export const MAX_PATH_DETAILS = 1200;

function distanceToSegment(point: Point, edge: BoundarySegment): number {
  const dx = edge.end.x - edge.start.x,
    dy = edge.end.y - edge.start.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) / length),
        );
  return Math.hypot(point.x - edge.start.x - dx * t, point.y - edge.start.y - dy * t);
}
function pointKey(point: Point): string {
  return `${point.x.toFixed(8)},${point.y.toFixed(8)}`;
}
function edgeKey(edge: BoundarySegment): string {
  return [pointKey(edge.start), pointKey(edge.end)].sort().join('|');
}

/** Conservative circular clearance contains the entire square action icon, including its corners. */
export function pathIconClearance(field: GameField, edges: BoundarySegment[]): number {
  if (field.action === 'none') return 0;
  const clearance = Math.min(...edges.map((edge) => distanceToSegment(field.center, edge)));
  const side = Math.max(0.012, Math.min(0.18, Math.sqrt(field.area) * 0.42, clearance * 1.2));
  return side / Math.SQRT2;
}

/** Stones follow visible field unions; internal raster seams and open crossings stay clear. */
export function buildPathDetails(
  config: TileConfig,
  fields: GameField[],
  cells: TileCell[],
  connections: FieldConnection[],
): PathDetail[] {
  const density = config.paths.detail.pebbleDensity;
  if (!config.paths.enabled || density === 0) return [];
  const result: PathDetail[] = [];
  const cellMap = new Map(cells.map((cell) => [cell.id, cell]));
  const boundary = hexagon();
  const exits = boundary.map((start, index) => ({
    start,
    end: boundary[(index + 1) % boundary.length]!,
  }));
  for (const field of [...fields].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (field.isCenter) continue;
    const edges = fieldBoundarySegments(field, cells);
    const openEdges = [
      ...exits,
      ...connections
        .filter((connection) => connection.from === field.id || connection.to === field.id)
        .flatMap((connection) => connection.segments),
    ];
    const iconClearance = pathIconClearance(field, edges);
    const polygons = field.cellIds.flatMap((id) => cellMap.get(id)?.surfacePolygons ?? []);
    for (const edge of edges) {
      const dx = edge.end.x - edge.start.x,
        dy = edge.end.y - edge.start.y,
        length = Math.hypot(dx, dy);
      if (length < 1e-8) continue;
      const samples = Math.max(1, Math.floor(length / 0.045));
      const key = edgeKey(edge);
      for (let index = 0; index < samples; index++) {
        if (randomAt(config.seed, 'path-pebble-presence-v3', field.id, key, index) >= density)
          continue;
        const t =
          (index +
            0.5 +
            (randomAt(config.seed, 'path-pebble-offset-v3', field.id, key, index) - 0.5) * 0.45) /
          samples;
        const scale =
          0.006 + randomAt(config.seed, 'path-pebble-size-v3', field.id, key, index) * 0.007;
        const point = { x: edge.start.x + dx * t, y: edge.start.y + dy * t };
        if (openEdges.some((open) => distanceToSegment(point, open) < scale * 2 + 0.014)) continue;
        const position = {
          x: point.x - (dy / length) * scale * 0.65,
          y: point.y + (dx / length) * scale * 0.65,
        };
        if (!polygons.some((polygon) => pointInPolygon(position, polygon))) continue;
        if (
          Math.hypot(position.x - field.center.x, position.y - field.center.y) <
          iconClearance + scale
        )
          continue;
        result.push({
          id: `pebble:${field.id}:${key}:${index}`,
          fieldId: field.id,
          position,
          height: fieldHeightAt(field, cells, position),
          scale,
          rotation: randomAt(config.seed, 'path-pebble-rotation-v3', field.id, key, index) * 360,
          kind: 'pebble',
        });
        if (result.length >= MAX_PATH_DETAILS) return result;
      }
    }
  }
  return result;
}
