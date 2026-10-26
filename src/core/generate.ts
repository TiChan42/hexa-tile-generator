import { parseConfig } from './config';
import { buildGrid } from './geometry';
import { buildPaths } from './paths';
import { fbm } from './random';
import { sampleGradient } from './color';
import { createCenterPolygon } from './center';
import { buildDecorations } from './decorations';
import { buildPathDetails } from './pathDetails';
import { evaluateTileRules } from './rules';
import type { GeneratedTile, TileConfig } from './types';

export function generateTile(input: TileConfig): GeneratedTile {
  const config = parseConfig(input),
    center = createCenterPolygon(config.seed, config.center),
    cells = buildGrid(config.grid, center, { portalWidth: config.center.portalWidth });
  for (const cell of cells) {
    const value = fbm(
      config.seed,
      (cell.rasterCenter ?? cell.center).x * config.terrain.scale,
      (cell.rasterCenter ?? cell.center).y * config.terrain.scale,
      config.terrain.octaves,
      config.terrain.persistence,
      config.terrain.lacunarity,
    );
    const level = Math.round(value * config.terrain.terraces) / config.terrain.terraces;
    cell.baseHeight = 0.08 + level * config.terrain.elevation;
    cell.height = cell.baseHeight;
    cell.color = sampleGradient(config.terrain.gradient, value);
  }
  const paths = buildPaths(config, cells, center),
    decor = buildDecorations(config, cells, center);
  const tile: GeneratedTile = {
    cells,
    fields: paths.fields,
    entrances: paths.entrances,
    center: { polygon: center, height: paths.centerHeight, sides: paths.centerSides },
    decorations: decor.decorations,
    connections: paths.connections,
    pathDetails: buildPathDetails(config, paths.fields, cells, paths.connections),
    warnings: [...paths.warnings, ...decor.warnings],
    stats: {
      cells: cells.length,
      fields: paths.fields.length,
      decorations: decor.decorations.length,
      connected: paths.connected,
    },
  };
  tile.warnings = [
    ...new Set([
      ...tile.warnings,
      ...evaluateTileRules(config, tile).map((issue) => issue.message),
    ]),
  ];
  return tile;
}
