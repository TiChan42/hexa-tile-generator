import { polygonArea } from '../core/geometry';
import { fieldSurfaceRegions, fieldPolygons } from './surfaces';
import type { Point, GeneratedTile, GameField } from '../core/types';
import { exposedWalls } from './walls';
import { widestSymbolAnchor } from './symbolAnchor';

/** Size a square action glyph from visible playing area while keeping it inside its border. */
export function fieldSymbolSize(polygons: Point[][], center: Point): number {
  const area = polygons.reduce((sum, polygon) => sum + Math.abs(polygonArea(polygon)), 0);
  const borders = exposedWalls([{ polygons, height: 1 }], 0);
  let clearance = Infinity;
  borders.forEach(({ a, b }) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / length));
    clearance = Math.min(clearance, Math.hypot(center.x - a.x - t * dx, center.y - a.y - t * dy));
  });
  return Math.max(0.012, Math.min(0.18, Math.sqrt(area) * 0.42, clearance * 1.2));
}

/** Select the broadest usable plateau before scaling; symbols never bridge terrace seams. */
export function fieldSymbolLayout(
  tile: GeneratedTile,
  field: GameField,
): { center: Point; size: number; height: number } {
  const regions = fieldSurfaceRegions(tile, field);
  if (!field.isCenter) {
    const levels = new Map<number, Point[][]>();
    for (const region of regions) {
      const polygons = levels.get(region.height) ?? [];
      polygons.push(...region.polygons);
      levels.set(region.height, polygons);
    }
    const candidates = [...levels].map(([height, polygons]) => ({
      ...widestSymbolAnchor(polygons, field.center),
      height,
      polygons,
    }));
    const distance = (point: Point) =>
      (point.x - field.center.x) ** 2 + (point.y - field.center.y) ** 2;
    candidates.sort(
      (a, b) =>
        b.clearance - a.clearance || distance(a.point) - distance(b.point) || a.height - b.height,
    );
    const selected = candidates[0];
    if (selected) {
      const area = selected.polygons.reduce(
        (sum, polygon) => sum + Math.abs(polygonArea(polygon)),
        0,
      );
      return {
        center: selected.point,
        size: Math.min(0.18, Math.sqrt(area) * 0.42, selected.clearance * 1.2),
        height: selected.height,
      };
    }
  }
  const sameLevel = regions
    .filter((region) => Math.abs(region.height - field.symbolHeight) < 1e-7)
    .flatMap((region) => region.polygons);
  const polygons =
    field.maxHeight > field.height + 1e-7 && sameLevel.length
      ? sameLevel
      : fieldPolygons(tile, field);
  return {
    center: field.center,
    size: fieldSymbolSize(polygons, field.center),
    height: field.symbolHeight,
  };
}
