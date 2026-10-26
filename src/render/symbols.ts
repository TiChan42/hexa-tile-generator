import { polygonArea } from '../core/geometry';
import { fieldSurfaceRegions, fieldPolygons } from './surfaces';
import type { Point, GeneratedTile, GameField } from '../core/types';
import { exposedWalls } from './walls';

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

/** Terrace glyphs remain on their actual anchor elevation and inside its level footprint. */
export function fieldSymbolLayout(
  tile: GeneratedTile,
  field: GameField,
): { size: number; height: number } {
  const regions = fieldSurfaceRegions(tile, field);
  const sameLevel = regions
    .filter((region) => Math.abs(region.height - field.symbolHeight) < 1e-7)
    .flatMap((region) => region.polygons);
  const polygons =
    field.maxHeight > field.height + 1e-7 && sameLevel.length
      ? sameLevel
      : fieldPolygons(tile, field);
  return { size: fieldSymbolSize(polygons, field.center), height: field.symbolHeight };
}
