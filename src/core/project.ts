import { DEFAULT_DECORATION_SCALE } from './object-sizes';
import { configSchema, defaultConfig } from './config';
import { generateTile } from './generate';
import { placementOffset } from './subgrid';
import { hash32, randomAt } from './random';
import { evaluateTileRules } from './rules';
import {
  applyBiomePreset,
  BIOME_PRESETS,
  biomeObjectSizeProfiles,
  randomizeBiomePreset,
} from './biomes';
import type { ActionId, DecorationKind, GradientStop, TileConfig } from './types';
import type { BiomePresetId } from './biomes';

const THEMES = [
  {
    name: 'Mooswald',
    sizeBiome: 'mosslight',
    species: ['tree', 'pine', 'oak', 'birch', 'bush', 'fern', 'mushrooms', 'log', 'rock'],
    terrain: ['#314c43', '#5b7951', '#8eac67', '#c6c68e'],
    walls: ['#303a30', '#75674b', '#baa878'],
    paths: ['#a78657', '#d2b67e', '#ebdbaf'],
  },
  {
    name: 'Nebelmoor',
    sizeBiome: 'nebelmoor',
    species: ['willow', 'birch', 'deadTree', 'bush', 'fern', 'mushrooms', 'reeds', 'log', 'rock'],
    terrain: ['#30464b', '#526d6c', '#86a391', '#bcc8ab'],
    walls: ['#303938', '#626e5c', '#9da58b'],
    paths: ['#8e8872', '#b5b59a', '#dce0bf'],
  },
  {
    name: 'Herbsthain',
    sizeBiome: 'abendrot',
    species: [
      'maple',
      'oak',
      'birch',
      'bush',
      'fern',
      'flowers',
      'mushrooms',
      'log',
      'stump',
      'rock',
    ],
    terrain: ['#534737', '#89744c', '#b1a261', '#dac48a'],
    walls: ['#3f352d', '#896b4c', '#c49a6c'],
    paths: ['#ab7955', '#cfab78', '#efdab0'],
  },
  {
    name: 'Frostgrat',
    sizeBiome: 'frostgrat',
    species: ['tree', 'pine', 'birch', 'deadTree', 'grass', 'rock', 'quartz', 'stump'],
    terrain: ['#354a61', '#608394', '#99bdc1', '#e1e7d9'],
    walls: ['#303c4a', '#687e88', '#b3c3bc'],
    paths: ['#839a9b', '#b1c5c0', '#e4e6ce'],
  },
  {
    name: 'Amethysthain',
    sizeBiome: 'amethysthain',
    species: ['pine', 'oak', 'birch', 'bush', 'fern', 'mushrooms', 'crystal', 'quartz', 'rock'],
    terrain: ['#453e57', '#746e85', '#a49aad', '#d6c9c0'],
    walls: ['#383345', '#736278', '#b398a4'],
    paths: ['#a18e87', '#c5b0a1', '#edddbf'],
  },
  {
    name: 'Sonnensteppe',
    sizeBiome: 'sonnensteppe',
    species: ['tree', 'oak', 'bush', 'grass', 'flowers', 'stump', 'rock', 'quartz'],
    terrain: ['#5b6242', '#8d9658', '#c2ba77', '#e2d39b'],
    walls: ['#494133', '#927953', '#c8ad77'],
    paths: ['#b68f61', '#dbc293', '#f0e2ba'],
  },
] as const satisfies readonly {
  name: string;
  sizeBiome: BiomePresetId;
  species: readonly DecorationKind[];
  terrain: readonly string[];
  walls: readonly string[];
  paths: readonly string[];
}[];
const stops = (colors: readonly string[]): GradientStop[] =>
  colors.map((color, i) => ({ at: i / (colors.length - 1), color }));

export interface SeededProjectOptions {
  /** Presentation preferences do not affect the generated playing surface. */
  export?: TileConfig['export'];
  camera?: TileConfig['camera'];
  rules?: TileConfig['rules'];
  border?: TileConfig['border'];
  editing?: TileConfig['editing'];
  actions?: TileConfig['actions'];
  fieldCount?: number;
  grid?: TileConfig['grid'];
  heightMode?: TileConfig['paths']['heightMode'];
  centerPortalWidth?: number;
  /** Shared height/material profile for a continuous bulk terrain. */
  terrainProfile?: Omit<TileConfig['terrain'], 'noise'>;
  noise?: TileConfig['terrain']['noise'];
  biome?: {
    id: BiomePresetId;
    mode: 'random' | 'fixed';
    variationSeed: string;
    continuousNoise: boolean;
  };
}

/** Complete, versioned recipe. Current editor settings never leak into generated content. */
export function createSeededProject(seed: string, options: SeededProjectOptions = {}): TileConfig {
  const r = (key: string) => randomAt(seed, 'project-v4', key);
  const between = (key: string, min: number, max: number, precision = 2) =>
    Number((min + (max - min) * r(key)).toFixed(precision));
  const pick = <T>(key: string, values: readonly T[]): T =>
    values[Math.floor(r(key) * values.length)];
  const theme = pick('theme', THEMES);
  const fieldCount = options.fieldCount ?? pick('field-count', [9, 11, 13, 15]);
  let config = structuredClone(defaultConfig);
  config.seed = seed;
  config.terrain.noise = structuredClone(options.noise ?? { seed, origin: { x: 0, y: 0 } });
  config.rules = structuredClone(options.rules ?? defaultConfig.rules);
  config.border = structuredClone(options.border ?? defaultConfig.border);
  config.editing = structuredClone(options.editing ?? defaultConfig.editing);
  config.actions = structuredClone(options.actions ?? defaultConfig.actions);
  config.name = `${theme.name} ${hash32(seed).toString(36).slice(0, 4).toUpperCase()}`;
  config.grid = structuredClone(
    options.grid ?? {
      ...defaultConfig.grid,
      divisions: fieldCount >= 19 ? 24 : defaultConfig.grid.divisions,
      showGrid: false,
    },
  );
  config.center = {
    shape: 'organic',
    scale: between('center-size', 0.65, 0.95),
    rotation: between('center-rotation', -28, 28),
    irregularity: between('center-shape', 0.08, 0.25),
    offset: { x: between('center-x', -0.28, 0.28), y: between('center-y', -0.28, 0.28) },
    portalWidth: options.centerPortalWidth ?? defaultConfig.center.portalWidth,
  };
  config.terrain = {
    ...config.terrain,
    scale: between('height-scale', 1.5, 4.5),
    octaves: pick('height-octaves', [3, 4, 5]),
    persistence: between('height-persistence', 0.4, 0.65),
    lacunarity: between('height-lacunarity', 1.8, 2.4),
    elevation: between('elevation', 0.13, 0.32),
    terraces: pick('terraces', [5, 6, 7, 8, 9]),
    grain: between('grain', 0.035, 0.085, 3),
    texture: {
      scale: between('texture-scale', 3, 9),
      octaves: pick('texture-octaves', [3, 4, 5]),
      strength: between('texture-strength', 0.23, 0.37),
      detailScale: between('detail-scale', 25, 65),
      detailStrength: between('detail-strength', 0.07, 0.16),
    },
    gradient: stops(theme.terrain),
    wallGradient: stops(theme.walls),
  };
  if (options.terrainProfile) {
    config.terrain = {
      ...structuredClone(options.terrainProfile),
      noise: structuredClone(options.noise ?? { seed, origin: { x: 0, y: 0 } }),
    };
  }
  const nominalCellArea =
    (config.grid.kind === 'hex' ? (3 * Math.sqrt(3)) / 2 : (1.7 ** 2 * Math.sqrt(3)) / 2) /
    config.grid.divisions ** 2;
  config.paths = {
    enabled: true,
    auto: true,
    enabledSides: Array.from({ length: 6 }, () => true),
    loop: true,
    fieldCount,
    heightMode: options.heightMode ?? defaultConfig.paths.heightMode,
    detail: {
      pebbleDensity: between('pebbles', 0.2, 0.55),
      centerLight: between('path-light', 0.16, 0.32),
      edgeShade: between('path-edge', 0.08, 0.2),
    },
    fieldSize: Math.ceil(between('field-area', 0.09, 0.16) / nominalCellArea),
    gradient: stops(theme.paths),
    fields: [],
  };
  config.decoration = {
    enabled: true,
    density: between('density', 0.45, 0.8),
    maxPerCell: pick('objects-per-cell', [3, 4, 5, 6]),
    species: [...theme.species],
    sizeProfiles: biomeObjectSizeProfiles(theme.sizeBiome),
    colorProfiles: structuredClone(defaultConfig.decoration.colorProfiles),
    placements: [],
  };
  if (options.biome)
    config =
      options.biome.mode === 'random'
        ? randomizeBiomePreset(
            config,
            options.biome.id,
            options.biome.variationSeed,
            options.biome.continuousNoise,
          )
        : (() => {
            const draft = applyBiomePreset(config, options.biome.id);
            const name = BIOME_PRESETS.find((preset) => preset.id === options.biome!.id)!.name;
            draft.name = `${name} ${hash32(seed).toString(36).slice(0, 4).toUpperCase()}`;
            return draft;
          })();
  config.export = structuredClone(options.export ?? defaultConfig.export);
  config.camera = structuredClone(options.camera ?? defaultConfig.camera);
  configSchema.parse(config);
  const generated = generateTile(config);
  const ruleMessages = new Set(evaluateTileRules(config, generated).map((issue) => issue.message));
  const layoutWarnings = generated.warnings.filter((warning) => !ruleMessages.has(warning));
  const complete = () =>
    generated.fields.length === fieldCount &&
    generated.stats.connected &&
    layoutWarnings.length === 0;
  // Fixed grid settings keep every entrance footprint identical across seed recipes.
  if (!complete())
    throw new Error(
      `Die Seed-Rezeptur konnte ${fieldCount} gültige, verbundene Spielfelder nicht anordnen. ${layoutWarnings.join(' ')}`,
    );
  const actions: ActionId[] = [
    'event',
    'event',
    'event',
    'rotate',
    'rotate',
    'shift',
    'shift',
    'shop',
    'scrap',
    'scrap',
    'jump',
    'alb',
    'amethyst',
    'platinum',
    'gem',
    'gold',
  ];
  // Freeze editable field shapes and actions; ordinary colors keep following the seeded gradient.
  config.paths.fields = generated.fields.map((field) => ({
    id: field.id,
    cellIds: field.isCenter ? [] : [...field.cellIds],
    action: field.isCenter ? 'event' : pick(`action:${field.id}`, actions),
    ...(field.isCenter ? { color: field.color } : {}),
    label: field.label,
  }));
  const cells = new Map(generated.cells.map((cell) => [cell.id, cell]));
  config.decoration.placements = generated.decorations.map((object) => {
    const offset = placementOffset(cells.get(object.cellId)!, object.position);
    return {
      id: `seed-object:${object.id}`,
      kind: object.kind,
      cellId: object.cellId,
      // Canonical JSON despite last-bit lattice differences between JS engines.
      offset: { x: Number(offset.x.toFixed(12)), y: Number(offset.y.toFixed(12)) },
      // Store the personal scale only: the stable profile draw is applied once when rendered.
      scale: DEFAULT_DECORATION_SCALE,
      rotation: object.rotation,
    };
  });
  config.decoration.sourceDensity = config.decoration.density;
  config.decoration.density = 0;
  config.paths.auto = false;
  config.palette = [...new Set(generated.fields.map((field) => field.color))].slice(0, 24);
  return configSchema.parse(config);
}
