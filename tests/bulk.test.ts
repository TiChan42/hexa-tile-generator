import { preV18Actions } from './fixtures/migration';
import { describe, expect, it, vi } from 'vitest';
import * as projectRecipes from '../src/core/project';
import { boardOrigin } from '../src/core/bulk';
import { clipPolygon, hexagon, polygonArea, sharedBoundaryLength } from '../src/core/geometry';
import {
  bulkGenerationOptionsSchema,
  bulkProjectSchema,
  createBulkProject,
  defaultConfig,
  ACTION_PROBABILITIES,
  ACTIONS,
  actionProbabilitiesSchema,
  generateTile,
  migrateBulkProject,
  setBulkContinuousNoise,
  setBulkUniformity,
  shuffleBulkProject,
  syncBulkTile,
  type BulkGenerationOptions,
  type BulkProject,
} from '../src/core';
import {
  BULK_STORAGE_KEY,
  loadStoredBulkProject,
  saveStoredBulkProject,
} from '../src/editor/bulkStorage';

const options: BulkGenerationOptions = {
  seed: 'bulk-acceptance',
  rows: 1,
  columns: 2,
  fieldCount: 13,
  continuousNoise: true,
  uniformGrid: true,
  uniformBorder: true,
  biomeMode: 'random',
  biomeId: 'mosslight',
  gridTemplate: defaultConfig.grid,
  borderTemplate: defaultConfig.border,
};

function fixture(): BulkProject {
  const tiles = Array.from({ length: 6 }, (_, index) => {
    const config = structuredClone(defaultConfig);
    config.seed = `bulk-fixture-${index}`;
    config.terrain.noise.seed = config.seed;
    return { id: `tile-${index}`, biomeId: 'mosslight' as const, config };
  });
  return {
    version: 4,
    seed: options.seed,
    rows: 2,
    columns: 3,
    uniformGrid: true,
    uniformBorder: true,
    biomeMode: 'random',
    biomeId: 'mosslight',
    gridTemplate: structuredClone(defaultConfig.grid),
    borderTemplate: structuredClone(defaultConfig.border),
    continuousNoise: false,
    tiles,
    order: tiles.map(({ id }) => id),
    shuffleRevision: 0,
  } as BulkProject;
}

describe('editable bulk collections', () => {
  it('captures an edited global distribution in every new series tile', () => {
    const actionDistribution = actionProbabilitiesSchema.parse(ACTION_PROBABILITIES);
    for (const { id } of ACTIONS) actionDistribution.baseWeights[id] = id === 'gold' ? 100 : 0;
    const result = createBulkProject({ ...options, rows: 1, columns: 1, actionDistribution });
    expect(result.tiles[0]!.config.actions.distribution).toEqual(actionDistribution);
    expect(
      result.tiles[0]!.config.paths.fields.filter((field) => field.id !== 'center').every(
        (field) => field.action === 'gold',
      ),
    ).toBe(true);
  });
  it.each([1, 2, 3, 4, 7])(
    'keeps %i columns in alternating half-height rows with shared edges and no overlaps',
    (columns) => {
      const height = Math.sqrt(3);
      const origins = Array.from({ length: columns * 3 }, (_, index) =>
        boardOrigin(index, columns),
      );
      const polygons = origins.map((origin) =>
        hexagon().map((point) => ({ x: point.x + origin.x, y: point.y + origin.y })),
      );
      for (let index = 0; index < origins.length; index++) {
        const origin = origins[index]!;
        const row = Math.floor(index / columns);
        const column = index % columns;
        expect(origin.y - row * height).toBeCloseTo(column % 2 === 0 ? 0 : height / 2);
        if (column > 0) {
          expect(origin.x - origins[index - 1]!.x).toBe(1.5);
          expect(sharedBoundaryLength(polygons[index]!, polygons[index - 1]!)).toBeCloseTo(1);
        }
        if (row > 0) {
          expect(origin.y - origins[index - columns]!.y).toBeCloseTo(height);
          expect(sharedBoundaryLength(polygons[index]!, polygons[index - columns]!)).toBeCloseTo(1);
        }
        for (let other = 0; other < index; other++)
          expect(
            Math.abs(polygonArea(clipPolygon(polygons[index]!, polygons[other]!))),
          ).toBeLessThan(1e-8);
      }
    },
  );

  it('rebuilds cell-dependent shapes when a shared raster changes and keeps display-only changes intact', () => {
    const project = fixture();
    for (const { config } of project.tiles.slice(0, 2)) {
      const tile = generateTile(config);
      config.paths.auto = false;
      config.paths.fields = tile.fields.map((field) => ({
        id: field.id,
        cellIds: field.isCenter ? [] : field.cellIds,
        action: field.action,
      }));
      config.decoration.sourceDensity = 0.7;
      config.decoration.density = 0;
    }
    const grid = { ...defaultConfig.grid, kind: 'diamond' as const };
    const updated = setBulkUniformity(project, 'grid', true, grid);
    for (const { config } of updated.tiles) {
      expect(config.paths.auto).toBe(true);
      expect(config.paths.fields).toEqual([]);
      expect(config.decoration.density).toBe(
        config.decoration.sourceDensity ?? defaultConfig.decoration.density,
      );
    }
    expect(generateTile(updated.tiles[1]!.config).stats.connected).toBe(true);
    const displayOnly = setBulkUniformity(project, 'grid', true, {
      ...defaultConfig.grid,
      showGrid: false,
    });
    expect(displayOnly.tiles.map(({ config }) => config.paths)).toEqual(
      project.tiles.map(({ config }) => config.paths),
    );
    const edited = structuredClone(project.tiles[0]!.config);
    edited.grid = grid;
    edited.paths.auto = true;
    edited.paths.fields = [];
    expect(
      syncBulkTile(project, project.tiles[0]!.id, edited).tiles[1]!.config.paths.fields,
    ).toEqual([]);
  });

  it('generates reproducible, editable random biomes on shared noise with valid entrances', () => {
    const source = structuredClone(options);
    const first = createBulkProject(source);
    expect(createBulkProject(source)).toEqual(first);
    expect(source).toEqual(options);
    expect(first.tiles).toHaveLength(2);
    expect(first.tiles[0]!.config.terrain.gradient).not.toEqual(
      first.tiles[1]!.config.terrain.gradient,
    );
    for (const { config } of first.tiles) {
      expect(config.decoration.colorProfiles).toBeDefined();
      expect(config.paths.auto).toBe(false);
      expect(config.grid).toEqual(options.gridTemplate);
      const tile = generateTile(config);
      expect(tile.fields).toHaveLength(13);
      expect(tile.warnings).toEqual([]);
      expect(tile.stats.connected).toBe(true);
      expect(tile.entrances.every((entrance) => entrance.fieldId !== null)).toBe(true);
    }
    expect(first.tiles[0]!.config.terrain.noise.seed).toBe(
      first.tiles[1]!.config.terrain.noise.seed,
    );
    expect(first.tiles[1]!.config.terrain.noise.origin).toEqual({ x: 1.5, y: Math.sqrt(3) / 2 });
  }, 30000);

  it('supports one fixed restricted biome and independent noise without forced grid or border', () => {
    const project = createBulkProject({
      ...options,
      rows: 1,
      columns: 1,
      continuousNoise: false,
      uniformGrid: false,
      uniformBorder: false,
      biomeMode: 'fixed',
      biomeId: 'pilzkristallgrotte',
    });
    expect(project.tiles[0]!.biomeId).toBe('pilzkristallgrotte');
    expect(project.tiles[0]!.config.decoration.species).toEqual(['mushrooms', 'crystal', 'quartz']);
    expect(project.tiles[0]!.config.terrain.noise.origin).toEqual({ x: 0, y: 0 });
  });

  it('rejects invalid dimensions, excessive collections and impossible recipes explicitly', () => {
    for (const invalid of [
      { rows: 0 },
      { rows: 8, columns: 8 },
      { seed: ' ' },
      { biomeId: 'missing' },
      { extra: true },
    ])
      expect(() => bulkGenerationOptionsSchema.parse({ ...options, ...invalid })).toThrow();
    const recipe = vi.spyOn(projectRecipes, 'createSeededProject').mockImplementation(() => {
      throw new Error('Layoutkonflikt');
    });
    try {
      expect(() => createBulkProject(options)).toThrow(
        /Tile 1.*acht reproduzierbaren.*Layoutkonflikt/,
      );
      expect(recipe).toHaveBeenCalledTimes(8);
      expect(new Set(recipe.mock.calls.map(([seed]) => seed)).size).toBe(8);
    } finally {
      recipe.mockRestore();
    }
  });

  it('reorders deterministically while preserving tile edits and updating shared coordinates', () => {
    const original = setBulkContinuousNoise(fixture(), true);
    const before = structuredClone(original);
    const shuffled = shuffleBulkProject(original);
    expect(shuffleBulkProject(original)).toEqual(shuffled);
    expect(shuffled.shuffleRevision).toBe(1);
    expect([...shuffled.order].sort()).toEqual([...original.order].sort());
    expect(shuffled.order).not.toEqual(original.order);
    const height = Math.sqrt(3);
    const expectedOrigins = [
      { x: 0, y: 0 },
      { x: 1.5, y: height / 2 },
      { x: 3, y: 0 },
      { x: 0, y: height },
      { x: 1.5, y: height * 1.5 },
      { x: 3, y: height },
    ];
    shuffled.order.forEach((id, index) => {
      const tile = shuffled.tiles.find((tile) => tile.id === id)!;
      expect(tile.config.paths).toEqual(
        original.tiles.find((tile) => tile.id === id)!.config.paths,
      );
      expect(tile.config.terrain.noise.origin).toEqual(expectedOrigins[index]);
    });
    expect(original).toEqual(before);
    expect(shuffleBulkProject(fixture()).tiles).toEqual(fixture().tiles);
  });

  it('propagates enabled shared settings and retains other tiles, palettes and local edits', () => {
    const original = setBulkContinuousNoise(fixture(), true);
    const edited = structuredClone(original.tiles[1]!.config);
    edited.name = 'Bearbeitet';
    edited.grid.showGrid = false;
    edited.border = { ...edited.border, enabled: true, color: '#ab1234' };
    edited.terrain.scale = 7;
    edited.terrain.gradient[0]!.color = '#ff1111';
    edited.paths.fields = [{ id: 'center', cellIds: [], action: 'gold', label: 'Mein Zentrum' }];
    const synced = syncBulkTile(original, original.tiles[1]!.id, edited);
    expect(synced.gridTemplate).toEqual(edited.grid);
    expect(synced.borderTemplate).toEqual(edited.border);
    for (const tile of synced.tiles) {
      expect(tile.config.grid).toEqual(edited.grid);
      expect(tile.config.border).toEqual(edited.border);
      expect(tile.config.terrain.scale).toBe(7);
      if (tile.id !== original.tiles[1]!.id) {
        expect(tile.config.name).not.toBe('Bearbeitet');
        expect(tile.config.terrain.gradient).toEqual(
          original.tiles.find((item) => item.id === tile.id)!.config.terrain.gradient,
        );
        expect(tile.config.paths.fields).toEqual([]);
      }
    }
    expect(synced.tiles[1]!.config.paths.fields).toEqual(edited.paths.fields);
    expect(() => syncBulkTile(original, 'missing', edited)).toThrow(/nicht gefunden/);
    const independent = setBulkUniformity(
      setBulkUniformity(fixture(), 'grid', false),
      'border',
      false,
    );
    expect(syncBulkTile(independent, independent.tiles[1]!.id, edited).tiles[0]).toEqual(
      independent.tiles[0],
    );
  });

  it('toggles shared noise, grid and border without mutating the source', () => {
    const original = fixture();
    const before = structuredClone(original);
    const connected = setBulkContinuousNoise(original, true);
    expect(setBulkContinuousNoise(connected, true)).toEqual(connected);
    const independent = setBulkContinuousNoise(connected, false);
    expect(
      independent.tiles.every(
        ({ config }) =>
          config.terrain.noise.seed === config.seed &&
          config.terrain.noise.origin.x === 0 &&
          config.terrain.noise.origin.y === 0,
      ),
    ).toBe(true);
    const grid = { ...defaultConfig.grid, showGrid: false };
    const border = { ...defaultConfig.border, enabled: true };
    expect(
      setBulkUniformity(original, 'grid', true, grid).tiles.every(
        ({ config }) => !config.grid.showGrid,
      ),
    ).toBe(true);
    expect(
      setBulkUniformity(original, 'border', true, border).tiles.every(
        ({ config }) => config.border.enabled,
      ),
    ).toBe(true);
    expect(original).toEqual(before);
  });

  it('validates collection ownership, order, uniform settings and continuous noise consistently', () => {
    const project = fixture();
    expect(bulkProjectSchema.parse(project)).toEqual(project);
    const inconsistent = structuredClone(project);
    inconsistent.tiles[0]!.config.grid.divisions = 20;
    for (const invalid of [
      { ...project, order: [project.order[0], project.order[0], ...project.order.slice(2)] },
      { ...project, order: ['missing', ...project.order.slice(1)] },
      { ...project, tiles: project.tiles.slice(1) },
      { ...project, tiles: [project.tiles[0], project.tiles[0], ...project.tiles.slice(2)] },
      { ...project, extra: true },
      inconsistent,
      { ...project, continuousNoise: true },
      { ...project, biomeMode: 'fixed', biomeId: 'nebelmoor' },
    ])
      expect(() => migrateBulkProject(invalid)).toThrow();
  });

  it.each([1, 2, 3])(
    'migrates V%i shared noise by saved order without replacing tile edits',
    (version) => {
      const current = shuffleBulkProject(setBulkContinuousNoise(fixture(), true));
      current.tiles[0]!.config.paths.fields = [
        { id: 'center', cellIds: [], action: 'gold', label: 'Mein Zentrum', heightOffset: 0.1 },
      ];
      const { biomeMode, biomeId, ...oldEnvelope } = current;
      void biomeMode;
      void biomeId;
      const legacy = {
        ...(version === 1 ? oldEnvelope : current),
        version,
        tiles: current.tiles.map((tile) => {
          const index = current.order.indexOf(tile.id);
          return {
            id: tile.id,
            ...(version === 1 ? {} : { biomeId: tile.biomeId }),
            config: {
              ...tile.config,
              terrain: {
                ...tile.config.terrain,
                noise: {
                  ...tile.config.terrain.noise,
                  origin: {
                    x: (index % current.columns) * 1.5,
                    y:
                      Math.sqrt(3) *
                      (Math.floor(index / current.columns) + (index % current.columns) / 2),
                  },
                },
              },
            },
          };
        }),
      };
      const before = structuredClone(legacy);
      const migrated = migrateBulkProject(legacy);
      expect(migrated).toEqual({
        ...current,
        tiles: current.tiles.map((tile) => ({
          ...tile,
          biomeId: version === 1 ? null : tile.biomeId,
        })),
      });
      expect(legacy).toEqual(before);
      expect(migrateBulkProject(migrated)).toEqual(migrated);
      expect(() => bulkProjectSchema.parse({ ...legacy, version: 4 })).toThrow();
      expect(() => migrateBulkProject({ ...current, version: 3 })).toThrow();
    },
  );

  it.each([1, 2, 3, 4])(
    'migrates a version %i envelope and its historical tile schemas without overwriting saves',
    (version) => {
      const current = fixture();
      const { biomeMode, biomeId, ...oldEnvelope } = current;
      void biomeMode;
      void biomeId;
      const tiles = current.tiles.map((tile) => ({
        id: tile.id,
        ...(version === 1 ? {} : { biomeId: tile.biomeId }),
        config: {
          ...tile.config,
          actions: preV18Actions(),
          schemaVersion: 12,
          generatorVersion: '12.0.0',
          decoration: Object.fromEntries(
            Object.entries(tile.config.decoration).filter(([key]) => key !== 'sizeProfiles'),
          ),
        },
      }));
      const legacy = { ...(version === 1 ? oldEnvelope : current), version, tiles };
      const before = JSON.stringify(legacy);
      const migrated = migrateBulkProject(legacy);
      expect(migrated.tiles.map(({ config }) => config)).toEqual(
        current.tiles.map(({ config }) => ({ ...config, legacyLayout: true, actionRecipe: 16 })),
      );
      expect(migrated.version).toBe(4);
      const entries = new Map([
        [`hexa-studio-bulk-v${version}`, before],
        [BULK_STORAGE_KEY, '{broken'],
      ]);
      if (version === 4) entries.set(BULK_STORAGE_KEY, before);
      const storage = {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => {
          entries.set(key, value);
        },
      };
      expect(loadStoredBulkProject(storage)).toEqual(migrated);
      expect(entries.get(`hexa-studio-bulk-v${version}`)).toBe(before);
      expect(saveStoredBulkProject(storage, migrated)).toBe(true);
      expect(loadStoredBulkProject(storage)).toEqual(migrated);
      expect(JSON.stringify(legacy)).toBe(before);
      expect(() => migrateBulkProject({ ...legacy, extra: true })).toThrow();
    },
  );

  it('handles unavailable or corrupt storage without losing valid older collections', () => {
    expect(loadStoredBulkProject(null)).toBeNull();
    expect(loadStoredBulkProject({ getItem: () => '{broken' })).toBeNull();
    expect(
      loadStoredBulkProject({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
    expect(saveStoredBulkProject(null, fixture())).toBe(false);
    expect(
      saveStoredBulkProject(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        fixture(),
      ),
    ).toBe(false);
  });
});
