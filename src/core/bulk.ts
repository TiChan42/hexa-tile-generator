import { z } from 'zod';
import { configSchema, migrateConfig } from './config';
import { BIOME_PRESETS } from './biomes';
import { createSeededProject } from './project';
import { actionProbabilitiesSchema } from './action-probabilities';
import type { ActionProbabilities } from './action-probabilities';
import { hash32, randomAt } from './random';
import type { TileConfig } from './types';
import type { BiomePresetId } from './biomes';

const biomeIdSchema = z.enum(
  BIOME_PRESETS.map((preset) => preset.id) as [BiomePresetId, ...BiomePresetId[]],
);

const gridSchema = z
  .object({
    kind: z.enum(['hex', 'diamond']),
    divisions: z.number().int().min(6).max(24),
    subDivisions: z.number().int().min(1).max(6),
    showGrid: z.boolean(),
    showSubgrid: z.boolean(),
  })
  .strict();
const borderSchema = z
  .object({
    enabled: z.boolean(),
    width: z.number().min(0).max(0.1),
    mode: z.enum(['black', 'custom', 'fields', 'transparent']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export interface BulkGenerationOptions {
  rows: number;
  columns: number;
  seed: string;
  continuousNoise: boolean;
  uniformGrid: boolean;
  uniformBorder: boolean;
  biomeMode: 'random' | 'fixed';
  biomeId: BiomePresetId;
  gridTemplate: TileConfig['grid'];
  borderTemplate: TileConfig['border'];
  fieldCount: number;
  actionDistribution?: ActionProbabilities;
  gridVisibility?: Pick<TileConfig['grid'], 'showGrid' | 'showSubgrid'>;
  exportTemplate?: TileConfig['export'];
}

export interface BulkProject {
  version: 4;
  seed: string;
  rows: number;
  columns: number;
  continuousNoise: boolean;
  uniformGrid: boolean;
  uniformBorder: boolean;
  biomeMode: 'random' | 'fixed';
  biomeId: BiomePresetId;
  gridTemplate: TileConfig['grid'];
  borderTemplate: TileConfig['border'];
  tiles: { id: string; biomeId: BiomePresetId | null; config: TileConfig }[];
  order: string[];
  shuffleRevision: number;
}

export const bulkGenerationOptionsSchema = z
  .object({
    rows: z.number().int().min(1).max(10),
    columns: z.number().int().min(1).max(10),
    seed: z.string().trim().min(1).max(128),
    continuousNoise: z.boolean(),
    uniformGrid: z.boolean(),
    uniformBorder: z.boolean(),
    biomeMode: z.enum(['random', 'fixed']),
    biomeId: biomeIdSchema,
    gridTemplate: gridSchema,
    borderTemplate: borderSchema,
    fieldCount: z.number().int().min(7).max(24),
    actionDistribution: actionProbabilitiesSchema.optional(),
    gridVisibility: z
      .object({ showGrid: z.boolean(), showSubgrid: z.boolean() })
      .strict()
      .optional(),
    exportTemplate: configSchema.shape.export.optional(),
  })
  .strict()
  .refine((options) => options.rows * options.columns <= 49, {
    message: 'Eine Serie kann höchstens 49 Kacheln enthalten.',
  });

const bulkProjectV1Schema = z
  .object({
    version: z.literal(1),
    seed: z.string().min(1).max(128),
    rows: z.number().int().min(1).max(10),
    columns: z.number().int().min(1).max(10),
    continuousNoise: z.boolean(),
    uniformGrid: z.boolean(),
    uniformBorder: z.boolean(),
    gridTemplate: gridSchema,
    borderTemplate: borderSchema,
    tiles: z
      .array(z.object({ id: z.string().min(1).max(100), config: z.unknown() }).strict())
      .max(49),
    order: z.array(z.string().min(1).max(100)).max(49),
    shuffleRevision: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine((project) => {
    if (
      project.tiles.length !== project.rows * project.columns ||
      project.order.length !== project.tiles.length ||
      new Set(project.tiles.map((tile) => tile.id)).size !== project.tiles.length ||
      new Set(project.order).size !== project.order.length ||
      !project.order.every((id) => project.tiles.some((tile) => tile.id === id))
    )
      return false;
    return true;
  }, 'Bulk-Serie muss vollständig, geordnet und mit ihren gemeinsamen Einstellungen konsistent sein.');

const bulkProjectV2Schema = z
  .object({
    version: z.literal(2),
    seed: z.string().min(1).max(128),
    rows: z.number().int().min(1).max(10),
    columns: z.number().int().min(1).max(10),
    continuousNoise: z.boolean(),
    uniformGrid: z.boolean(),
    uniformBorder: z.boolean(),
    biomeMode: z.enum(['random', 'fixed']),
    biomeId: biomeIdSchema,
    gridTemplate: gridSchema,
    borderTemplate: borderSchema,
    tiles: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            biomeId: biomeIdSchema.nullable(),
            config: z.unknown(),
          })
          .strict(),
      )
      .max(49),
    order: z.array(z.string().min(1).max(100)).max(49),
    shuffleRevision: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine((project) => {
    return (
      project.tiles.length === project.rows * project.columns &&
      project.order.length === project.tiles.length &&
      new Set(project.tiles.map((tile) => tile.id)).size === project.tiles.length &&
      new Set(project.order).size === project.order.length &&
      project.order.every((id) => project.tiles.some((tile) => tile.id === id))
    );
  }, 'Bulk-Serie muss vollständig und geordnet sein.');

const bulkProjectV3Schema = z
  .object({
    version: z.literal(3),
    seed: z.string().min(1).max(128),
    rows: z.number().int().min(1).max(10),
    columns: z.number().int().min(1).max(10),
    continuousNoise: z.boolean(),
    uniformGrid: z.boolean(),
    uniformBorder: z.boolean(),
    biomeMode: z.enum(['random', 'fixed']),
    biomeId: biomeIdSchema,
    gridTemplate: gridSchema,
    borderTemplate: borderSchema,
    tiles: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            biomeId: biomeIdSchema.nullable(),
            config: configSchema,
          })
          .strict(),
      )
      .max(49),
    order: z.array(z.string().min(1).max(100)).max(49),
    shuffleRevision: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine(
    (project) => consistentBulkSettings(project, legacyBoardOrigin),
    'Bulk-Serie muss vollständig, geordnet und mit ihren gemeinsamen Einstellungen konsistent sein.',
  );

export const bulkProjectSchema = z
  .strictObject({ ...bulkProjectV3Schema.shape, version: z.literal(4) })
  .refine(
    (project) => consistentBulkSettings(project, boardOrigin),
    'Bulk-Serie muss vollständig, geordnet und mit ihren gemeinsamen Einstellungen konsistent sein.',
  );

function consistentBulkSettings(
  project: Omit<BulkProject, 'version'>,
  originAt: typeof boardOrigin,
) {
  if (
    project.tiles.length !== project.rows * project.columns ||
    project.order.length !== project.tiles.length ||
    new Set(project.tiles.map((tile) => tile.id)).size !== project.tiles.length ||
    new Set(project.order).size !== project.order.length ||
    !project.order.every((id) => project.tiles.some((tile) => tile.id === id))
  )
    return false;
  if (
    project.uniformGrid &&
    project.tiles.some(
      (tile) => JSON.stringify(tile.config.grid) !== JSON.stringify(project.gridTemplate),
    )
  )
    return false;
  if (
    project.uniformBorder &&
    project.tiles.some(
      (tile) => JSON.stringify(tile.config.border) !== JSON.stringify(project.borderTemplate),
    )
  )
    return false;
  if (
    project.biomeMode === 'fixed' &&
    project.tiles.some((tile) => tile.biomeId !== project.biomeId)
  )
    return false;
  if (!project.continuousNoise) return true;
  const first = project.tiles[0]?.config.terrain;
  if (!first) return false;
  const firstProfile = sharedTerrainProfile(first);
  const firstNoise = first.noise;
  return project.order.every((id, index) => {
    const config = project.tiles.find((tile) => tile.id === id)?.config;
    if (!config) return false;
    const noise = config.terrain.noise;
    const profile = sharedTerrainProfile(config.terrain);
    const expectedOrigin = originAt(index, project.columns);
    return (
      noise.seed === firstNoise.seed &&
      noise.origin.x === expectedOrigin.x &&
      noise.origin.y === expectedOrigin.y &&
      JSON.stringify(profile) === JSON.stringify(firstProfile)
    );
  });
}

// The collection envelope is unchanged when an individual tile schema advances.
const bulkProjectV3InputSchema = z.strictObject({
  ...bulkProjectV2Schema.shape,
  version: z.literal(3),
});
const bulkProjectInputSchema = z.discriminatedUnion('version', [
  bulkProjectV3InputSchema,
  z.strictObject({ ...bulkProjectV3InputSchema.shape, version: z.literal(4) }),
]);

export function migrateBulkProject(input: unknown): BulkProject {
  if (typeof input === 'object' && input !== null && 'version' in input && input.version === 1) {
    const legacy = bulkProjectV1Schema.parse(input);
    return migrateBulkProject({
      ...legacy,
      version: 3,
      biomeMode: 'random',
      biomeId: 'mosslight',
      tiles: legacy.tiles.map(({ id, config }) => ({
        id,
        biomeId: null,
        config,
      })),
    });
  }
  if (typeof input === 'object' && input !== null && 'version' in input && input.version === 2) {
    const legacy = bulkProjectV2Schema.parse(input);
    return migrateBulkProject({
      ...legacy,
      version: 3,
    });
  }
  const project = bulkProjectInputSchema.parse(input);
  const tiles = project.tiles.map((tile) => ({
    ...tile,
    config: migrateConfig(tile.config).config,
  }));
  if (project.version === 3) {
    // Validate the old coordinate convention before explicitly migrating its world origins.
    const legacy = bulkProjectV3Schema.parse({ ...project, tiles });
    const origins = new Map(
      legacy.order.map((id, index) => [id, boardOrigin(index, legacy.columns)]),
    );
    return bulkProjectSchema.parse({
      ...legacy,
      version: 4,
      tiles: legacy.tiles.map((tile) => ({
        ...tile,
        config: legacy.continuousNoise
          ? {
              ...tile.config,
              terrain: {
                ...tile.config.terrain,
                noise: { ...tile.config.terrain.noise, origin: origins.get(tile.id)! },
              },
            }
          : tile.config,
      })),
    });
  }
  return bulkProjectSchema.parse({
    ...project,
    tiles,
  });
}

function legacyBoardOrigin(index: number, columns: number) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  return { x: column * 1.5, y: Math.sqrt(3) * (row + column / 2) };
}

/** Flat-top hex columns alternate by half a tile height instead of drifting downwards. */
export function boardOrigin(index: number, columns: number) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  return { x: column * 1.5, y: Math.sqrt(3) * (row + (column % 2) / 2) };
}

function sharedTerrainProfile(terrain: TileConfig['terrain']) {
  const { noise, gradient, wallGradient, ...profile } = terrain;
  void noise;
  void gradient;
  void wallGradient;
  return profile;
}

/** Cell IDs belong to a specific raster; match the single-tile editor's rebuild policy. */
function applySharedGrid(config: TileConfig, grid: TileConfig['grid']): TileConfig {
  const rebuild = config.grid.kind !== grid.kind || config.grid.divisions !== grid.divisions;
  return configSchema.parse({
    ...config,
    grid,
    ...(rebuild
      ? {
          paths: { ...config.paths, auto: true, fields: [] },
          decoration: {
            ...config.decoration,
            density: config.decoration.sourceDensity ?? config.decoration.density,
            placements: [],
          },
        }
      : {}),
  });
}

/** Generate a reproducible collection of independently editable tile recipes. */
export function createBulkProject(input: BulkGenerationOptions): BulkProject {
  const options = bulkGenerationOptionsSchema.parse(input);
  const gridTemplate = { ...options.gridTemplate, ...options.gridVisibility };
  const tiles: BulkProject['tiles'] = [];
  let terrainProfile: Omit<TileConfig['terrain'], 'noise'> | undefined;
  const sharedNoiseSeed = `bulk-terrain-${hash32(`${options.seed}:continuous-terrain`).toString(36)}`;

  for (let index = 0; index < options.rows * options.columns; index++) {
    const id = `tile-${index.toString().padStart(2, '0')}`;
    const biomeId =
      options.biomeMode === 'fixed'
        ? options.biomeId
        : BIOME_PRESETS[
            Math.floor(randomAt(options.seed, 'bulk-biome-pick', index) * BIOME_PRESETS.length)
          ]!.id;
    const variationSeed = `${options.seed}:tile-biome:${index}:${biomeId}`;
    let config: TileConfig | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 8 && !config; attempt++) {
      const tileSeed = `${options.seed.slice(0, 80)}-${hash32(`${options.seed}:tile:${index}:${attempt}`).toString(36)}-${index}`;
      try {
        config = createSeededProject(tileSeed, {
          fieldCount: options.fieldCount,
          ...(options.actionDistribution
            ? { actions: { biome: biomeId, revision: 0, distribution: options.actionDistribution } }
            : {}),
          ...(options.uniformGrid ? { grid: gridTemplate } : {}),
          ...(options.exportTemplate ? { export: options.exportTemplate } : {}),
          ...(options.uniformBorder ? { border: options.borderTemplate } : {}),
          ...(options.continuousNoise
            ? {
                ...(terrainProfile ? { terrainProfile } : {}),
                noise: {
                  seed: sharedNoiseSeed,
                  origin: boardOrigin(index, options.columns),
                },
              }
            : {}),
          biome: {
            id: biomeId,
            mode: options.biomeMode,
            variationSeed,
            continuousNoise: options.continuousNoise,
          },
        });
      } catch (error) {
        lastError = error;
      }
    }
    if (!config)
      throw new Error(
        `Tile ${index + 1} konnte nach acht reproduzierbaren Versuchen nicht erzeugt werden. ${lastError instanceof Error ? lastError.message : ''}`,
      );
    if (options.gridVisibility)
      config = configSchema.parse({
        ...config,
        grid: { ...config.grid, ...options.gridVisibility },
      });
    if (options.continuousNoise && !terrainProfile) {
      const { noise, ...profile } = config.terrain;
      void noise;
      terrainProfile = profile;
    }
    tiles.push({ id, biomeId, config });
  }

  return bulkProjectSchema.parse({
    version: 4,
    seed: options.seed,
    rows: options.rows,
    columns: options.columns,
    continuousNoise: options.continuousNoise,
    uniformGrid: options.uniformGrid,
    uniformBorder: options.uniformBorder,
    biomeMode: options.biomeMode,
    biomeId: options.biomeId,
    gridTemplate,
    borderTemplate: options.borderTemplate,
    tiles,
    order: tiles.map((tile) => tile.id),
    shuffleRevision: 0,
  });
}

/** Visibility is presentation only, including series with independently sized rasters. */
export function setBulkGridVisibility(
  input: BulkProject,
  visibility: Partial<Pick<TileConfig['grid'], 'showGrid' | 'showSubgrid'>>,
): BulkProject {
  const project = bulkProjectSchema.parse(input);
  const parsed = gridSchema.pick({ showGrid: true, showSubgrid: true }).partial().parse(visibility);
  return bulkProjectSchema.parse({
    ...project,
    gridTemplate: { ...project.gridTemplate, ...parsed },
    tiles: project.tiles.map((tile) => ({
      ...tile,
      config: { ...tile.config, grid: { ...tile.config.grid, ...parsed } },
    })),
  });
}

/** A shared output size does not rebuild fields, heights or placements. */
export function setBulkExportSettings(
  input: BulkProject,
  settings: TileConfig['export'],
): BulkProject {
  const project = bulkProjectSchema.parse(input);
  const parsed = configSchema.shape.export.parse(settings);
  return bulkProjectSchema.parse({
    ...project,
    tiles: project.tiles.map((tile) => ({
      ...tile,
      config: { ...tile.config, export: { ...parsed } },
    })),
  });
}

/** Deterministic shuffle; the terrain origin follows a tile to its new board position. */
export function shuffleBulkProject(input: BulkProject): BulkProject {
  const project = bulkProjectSchema.parse(input);
  const order = [...project.order];
  const revision = project.shuffleRevision + 1;
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(
      randomAt(project.seed, `bulk-shuffle-${revision}`, index) * (index + 1),
    );
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  const positions = new Map(order.map((id, index) => [id, boardOrigin(index, project.columns)]));
  const tiles = project.tiles.map(({ id, biomeId, config }) => ({
    id,
    biomeId,
    config: project.continuousNoise
      ? configSchema.parse({
          ...config,
          terrain: {
            ...config.terrain,
            noise: { ...config.terrain.noise, origin: positions.get(id)! },
          },
        })
      : config,
  }));
  return bulkProjectSchema.parse({ ...project, tiles, order, shuffleRevision: revision });
}

export function setBulkContinuousNoise(input: BulkProject, enabled: boolean): BulkProject {
  const project = bulkProjectSchema.parse(input);
  if (project.continuousNoise === enabled) return project;
  const first = project.tiles[0];
  if (!first) return project;
  const { noise, ...firstProfile } = first.config.terrain;
  void noise;
  const sharedSeed = `bulk-terrain-${hash32(`${project.seed}:continuous-terrain`).toString(36)}`;
  const positions = new Map(
    project.order.map((id, index) => [id, boardOrigin(index, project.columns)]),
  );
  const tiles = project.tiles.map(({ id, biomeId, config }) => ({
    id,
    biomeId,
    config: configSchema.parse({
      ...config,
      terrain: enabled
        ? {
            ...firstProfile,
            ...(project.biomeMode === 'random'
              ? {
                  gradient: config.terrain.gradient,
                  wallGradient: config.terrain.wallGradient,
                }
              : {}),
            noise: { seed: sharedSeed, origin: positions.get(id)! },
          }
        : {
            ...config.terrain,
            noise: { seed: config.seed, origin: { x: 0, y: 0 } },
          },
    }),
  }));
  return bulkProjectSchema.parse({ ...project, continuousNoise: enabled, tiles });
}

/** Apply edited tile settings and propagate enabled collection-wide settings. */
export function syncBulkTile(input: BulkProject, id: string, edited: TileConfig): BulkProject {
  const project = bulkProjectSchema.parse(input);
  const parsed = configSchema.parse(edited);
  if (!project.tiles.some((tile) => tile.id === id)) throw new Error('Kachel nicht gefunden.');
  const gridTemplate = project.uniformGrid ? structuredClone(parsed.grid) : project.gridTemplate;
  const borderTemplate = project.uniformBorder
    ? structuredClone(parsed.border)
    : project.borderTemplate;
  const terrainProfile = project.continuousNoise
    ? (({ noise, ...terrain }) => {
        void noise;
        return terrain;
      })(parsed.terrain)
    : null;
  const sharedNoiseSeed = project.tiles[0]?.config.terrain.noise.seed;
  const tiles = project.tiles.map((tile) => ({
    id: tile.id,
    biomeId: tile.biomeId,
    config:
      tile.id === id
        ? configSchema.parse({
            ...parsed,
            ...(terrainProfile
              ? {
                  terrain: {
                    ...terrainProfile,
                    noise: {
                      seed: sharedNoiseSeed,
                      origin: tile.config.terrain.noise.origin,
                    },
                  },
                }
              : {}),
          })
        : configSchema.parse({
            ...applySharedGrid(tile.config, project.uniformGrid ? gridTemplate : tile.config.grid),
            ...(project.uniformBorder ? { border: borderTemplate } : {}),
            ...(terrainProfile
              ? {
                  terrain: {
                    ...terrainProfile,
                    ...(project.biomeMode === 'random'
                      ? {
                          gradient: tile.config.terrain.gradient,
                          wallGradient: tile.config.terrain.wallGradient,
                        }
                      : {}),
                    noise: {
                      seed: sharedNoiseSeed,
                      origin: tile.config.terrain.noise.origin,
                    },
                  },
                }
              : {}),
          }),
  }));
  return bulkProjectSchema.parse({ ...project, gridTemplate, borderTemplate, tiles });
}

export function setBulkUniformity(
  input: BulkProject,
  setting: 'grid' | 'border',
  enabled: boolean,
  template?: TileConfig['grid'] | TileConfig['border'],
): BulkProject {
  const project = bulkProjectSchema.parse(input);
  if (setting === 'grid') {
    const gridTemplate = template ? gridSchema.parse(template) : project.gridTemplate;
    return bulkProjectSchema.parse({
      ...project,
      uniformGrid: enabled,
      gridTemplate,
      tiles: project.tiles.map((tile) => ({
        ...tile,
        config: enabled ? applySharedGrid(tile.config, gridTemplate) : tile.config,
      })),
    });
  }
  const borderTemplate = template ? borderSchema.parse(template) : project.borderTemplate;
  return bulkProjectSchema.parse({
    ...project,
    uniformBorder: enabled,
    borderTemplate,
    tiles: project.tiles.map((tile) => ({
      ...tile,
      config: enabled
        ? configSchema.parse({ ...tile.config, border: borderTemplate })
        : tile.config,
    })),
  });
}
