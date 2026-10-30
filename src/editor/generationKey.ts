import { defaultConfig } from '../core/config';
import type { TileConfig } from '../core/types';

/** Only generator inputs enter the worker queue; camera and materials update directly. */
export function generationKey(config: TileConfig): string {
  return JSON.stringify({
    ...config,
    name: defaultConfig.name,
    editing: defaultConfig.editing,
    actions: { ...config.actions, revision: defaultConfig.actions.revision },
    border: {
      ...config.border,
      mode: defaultConfig.border.mode,
      color: defaultConfig.border.color,
    },
    grid: { ...config.grid, showGrid: false, showSubgrid: false },
    terrain: {
      ...config.terrain,
      grain: 0,
      texture: defaultConfig.terrain.texture,
      wallGradient: defaultConfig.terrain.wallGradient,
      overhang: defaultConfig.terrain.overhang,
      skirtDepth: defaultConfig.terrain.skirtDepth,
    },
    paths: {
      ...config.paths,
      fields: config.paths.fields.map((field) => ({ ...field, label: undefined })),
      detail: { ...config.paths.detail, centerLight: 0, edgeShade: 0 },
    },
    decoration: {
      ...config.decoration,
      colorProfiles: defaultConfig.decoration.colorProfiles,
      modelSlots: undefined,
    },
    camera: defaultConfig.camera,
    export: defaultConfig.export,
    palette: [],
  });
}
