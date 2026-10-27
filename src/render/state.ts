import type { GeneratedTile, TileConfig } from '../core/types';

/** Only actual surface inputs invalidate the costly terrain and contour meshes. */
export function renderSurfaceKey(tile: GeneratedTile, config: TileConfig): string {
  return JSON.stringify([
    tile.cells.map((cell) => [
      cell.id,
      cell.polygon,
      cell.surfacePolygons,
      cell.height,
      cell.color,
      cell.fieldId,
    ]),
    tile.fields.map((field) => [field.id, field.cellIds, field.color, field.area, field.isCenter]),
    tile.center.polygon,
    tile.center.height,
    config.terrain.elevation,
    config.terrain.wallGradient,
    config.terrain.overhang,
    config.terrain.skirtDepth,
  ]);
}

/** Geometry excludes editor metadata, camera and material-only controls. */
export function renderGeometryKey(
  tile: GeneratedTile,
  config: TileConfig,
  modelRevision: number,
): string {
  const borderActive = config.border.enabled && config.border.width > 0;
  return JSON.stringify([
    [borderActive ? config.border.width : 0, borderActive && config.border.mode !== 'transparent'],
    tile.cells.map((cell) => [
      cell.id,
      cell.center,
      cell.polygon,
      cell.surfacePolygons,
      cell.height,
      cell.color,
      cell.fieldId,
    ]),
    tile.fields.map((field) => [
      field.id,
      field.cellIds,
      field.center,
      field.height,
      field.maxHeight,
      field.symbolHeight,
      field.color,
      field.area,
      field.action,
      field.isCenter,
    ]),
    tile.center,
    tile.decorations,
    tile.pathDetails,
    tile.connections,
    [config.seed, config.paths.enabled, config.paths.detail.pebbleDensity],
    [
      config.grid.kind,
      config.grid.divisions,
      config.grid.subDivisions,
      config.grid.showGrid,
      config.grid.showSubgrid,
    ],
    [
      config.terrain.elevation,
      config.terrain.wallGradient,
      config.terrain.overhang,
      config.terrain.skirtDepth,
    ],
    [config.decoration.enabled, config.decoration.modelSlots, config.decoration.colorProfiles],
    modelRevision,
  ]);
}
export function renderMaterialKey(config: TileConfig): string {
  return JSON.stringify([
    config.terrain.noise.seed,
    config.terrain.noise.origin,
    config.terrain.texture,
    config.terrain.grain,
    config.paths.detail.centerLight,
    config.paths.detail.edgeShade,
  ]);
}
