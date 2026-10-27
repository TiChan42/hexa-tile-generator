import { pointInPolygon } from '../core/geometry';
import { randomAt } from '../core/random';
import { decorationClearsBorder } from '../core/tile-border';
import type { GeneratedTile, PathDetail, TileConfig } from '../core/types';
import { fieldOutlineSegments } from './borders';
import { distanceToSegment, fieldSurfaceRegions } from './surfaces';
import { fieldSymbolLayout } from './symbols';

export const MAX_PATH_ACCENTS = 2400;
type SymbolLayout = ReturnType<typeof fieldSymbolLayout>;

/** Rendering-only clusters leave the saved, versioned generator placements untouched. */
export function buildPathAccents(
  tile: GeneratedTile,
  config: TileConfig,
  symbols: ReadonlyMap<string, SymbolLayout> = new Map(),
): PathDetail[] {
  if (!config.paths.enabled || !config.paths.detail.pebbleDensity || !tile.pathDetails?.length)
    return [];
  const context = new Map(
    tile.fields.map((field) => {
      const regions = fieldSurfaceRegions(tile, field);
      return [
        field.id,
        {
          regions,
          edges: fieldOutlineSegments(tile, field),
          symbol:
            field.action === 'none'
              ? undefined
              : (symbols.get(field.id) ?? fieldSymbolLayout(tile, field)),
          openings: tile.connections
            .filter((connection) => connection.from === field.id || connection.to === field.id)
            .flatMap((connection) => connection.segments),
        },
      ];
    }),
  );
  const fits = (item: PathDetail): boolean => {
    const field = context.get(item.fieldId);
    if (!field) return false;
    // The circumcircle contains the complete rotated pebble footprint.
    const radius = item.scale * 0.5;
    if (!decorationClearsBorder(config, item.position, item.scale, item.rotation)) return false;
    if (
      !field.regions.some(
        (region) =>
          Math.abs(region.height - item.height) < 1e-7 &&
          region.polygons.some((polygon) => pointInPolygon(item.position, polygon)),
      )
    )
      return false;
    if (
      field.edges.some(
        (edge) => distanceToSegment(item.position, edge.start, edge.end) < radius + 0.001,
      )
    )
      return false;
    if (
      field.openings.some(
        (edge) => distanceToSegment(item.position, edge.start, edge.end) < radius + 0.014,
      )
    )
      return false;
    // Do not straddle a terrace step, even inside the same game field.
    if (
      field.regions.some(
        (region) =>
          Math.abs(region.height - item.height) > 1e-7 &&
          region.polygons.some((polygon) =>
            polygon.some(
              (a, i) =>
                distanceToSegment(item.position, a, polygon[(i + 1) % polygon.length]!) < radius,
            ),
          ),
      )
    )
      return false;
    if (
      field.symbol &&
      Math.hypot(item.position.x - field.symbol.center.x, item.position.y - field.symbol.center.y) <
        field.symbol.size / Math.SQRT2 + radius + 0.003
    )
      return false;
    return true;
  };
  const result = tile.pathDetails.filter(fits).slice(0, MAX_PATH_ACCENTS);
  if (result.length === MAX_PATH_ACCENTS) return result;
  const originals = [...result];
  for (const item of originals) {
    const draw = (key: string, index = 0) =>
      randomAt(config.seed, `render-path-clusters-v2:${key}`, item.id, index);
    if (draw('presence') > 0.55) continue;
    const count = 2 + Math.floor(draw('count') * 3);
    for (let i = 0; i < count; i++) {
      const angle = draw('angle', i) * Math.PI * 2;
      const offset = item.scale * (0.7 + draw('offset', i) * 1.8);
      const accent: PathDetail = {
        ...item,
        id: `${item.id}:cluster-v2:${i}`,
        position: {
          x: item.position.x + Math.cos(angle) * offset,
          y: item.position.y + Math.sin(angle) * offset,
        },
        scale: item.scale * (0.45 + draw('scale', i) * 1.05),
        rotation: draw('rotation', i) * 360,
      };
      if (fits(accent)) result.push(accent);
      if (result.length >= MAX_PATH_ACCENTS) return result;
    }
  }
  return result;
}
