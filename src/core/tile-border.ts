import { hexagon, pointInPolygon } from './geometry';
import type { Point, TileConfig } from './types';

const APOTHEM = Math.sqrt(3) / 2;
function insetHexagon(width: number): Point[] {
  const factor = 1 - width / APOTHEM;
  return hexagon().map((point) => ({ x: point.x * factor, y: point.y * factor }));
}

/** Exact parallel-inset ring, partitioned into six positive, non-overlapping convex trapezoids. */
export function borderRing(width: number): Point[][] {
  if (width <= 0) return [];
  const outer = hexagon();
  if (width >= APOTHEM) return [outer];
  const inner = insetHexagon(width);
  return outer.map((point, i) => [point, outer[(i + 1) % 6]!, inner[(i + 1) % 6]!, inner[i]!]);
}

/** The inner boundary itself belongs to usable ground; outside-the-tile points are not in the ring. */
export function inTileBorder(config: TileConfig, point: Point): boolean {
  if (!config.border.enabled || config.border.width <= 0) return false;
  return (
    pointInPolygon(point, hexagon()) &&
    (config.border.width >= APOTHEM || !pointInPolygon(point, insetHexagon(config.border.width)))
  );
}

/** Conservative normalized asset footprint, including every rotated corner rather than just its anchor. */
export function decorationClearsBorder(
  config: TileConfig,
  point: Point,
  worldScale: number,
  rotationDegrees = 0,
): boolean {
  if (!config.border.enabled || config.border.width <= 0) return true;
  if (config.border.width >= APOTHEM) return false;
  const angle = (rotationDegrees * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    half = Math.abs(worldScale) / 2,
    inner = insetHexagon(config.border.width);
  return [-half, half].every((u) =>
    [-half, half].every((v) =>
      pointInPolygon({ x: point.x + u * cos + v * sin, y: point.y - u * sin + v * cos }, inner),
    ),
  );
}
