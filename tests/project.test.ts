import { v13MigrationAdditions, preV11Materials, preV18Actions } from './fixtures/migration';
import { describe, expect, it } from 'vitest';
import {
  configSchema,
  createSeededProject,
  defaultConfig,
  generateTile,
  migrateConfig,
  MIN_FIELD_AREA,
  randomAt,
  decorationScale,
} from '../src/core';
import type { TileConfig } from '../src/core';

import v1 from './fixtures/v1.json' with { type: 'json' };
import v3 from './fixtures/v3.json' with { type: 'json' };
import v4 from './fixtures/v4.json' with { type: 'json' };
import v5 from './fixtures/v5.json' with { type: 'json' };
import v6 from './fixtures/v6.json' with { type: 'json' };
import v7 from './fixtures/v7.json' with { type: 'json' };
import v8 from './fixtures/v8.json' with { type: 'json' };
import v9 from './fixtures/v9.json' with { type: 'json' };
import { evaluateTileRules, getExportRuleIssues } from '../src/core/rules';
import { DECORATION_KINDS } from '../src/core/objects';
function legacyProject() {
  return structuredClone(v1);
}
function legacyV2Project() {
  return {
    ...legacyProject(),
    schemaVersion: 2,
    generatorVersion: '2.0.0',
    center: { shape: 'organic', scale: 0.8, rotation: 0, irregularity: 0.18 },
    terrain: {
      ...v1.terrain,
      texture: { scale: 5, octaves: 4, strength: 0.3, detailScale: 38, detailStrength: 0.12 },
    },
  };
}
describe('complete seed-based editable projects', () => {
  it('recreates the entire project, including material parameters, layout, colors, actions and objects', () => {
    const first = createSeededProject('wald-123');
    const second = createSeededProject('wald-123'),
      firstTile = generateTile(first),
      secondTile = generateTile(second);
    expect(second).toEqual(first);
    expect(configSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(firstTile).toEqual(secondTile);
    expect(first.paths.auto).toBe(false);
    expect(first.decoration.density).toBe(0);
    expect(first.decoration.placements.length).toBe(firstTile.decorations.length);
    expect(first.decoration.placements.length).toBeGreaterThan(0);
    expect(first.paths.fields.length).toBeGreaterThan(5);
    expect(
      first.paths.fields.every(
        (field) =>
          field.action !== 'none' &&
          (field.color === undefined || /^#[\da-f]{6}$/i.test(field.color)),
      ),
    ).toBe(true);
  });
  const seeds = Array.from({ length: 6 }, (_, theme) => {
    let i = 0;
    while (Math.floor(randomAt(`project-${i}`, 'project-v4', 'theme') * 6) !== theme) i++;
    return `project-${i}`;
  });
  it.each([...seeds, 'wald-123', 'board-42'])(
    'follows field area, connectivity, central ownership and frozen-edit rules for %s',
    (seed) => {
      const config = createSeededProject(seed),
        tile = generateTile(config);
      expect(tile.stats.connected).toBe(true);
      expect(tile.warnings).toEqual([]);
      expect(tile.entrances).toHaveLength(6);
      expect(
        tile.fields.every((field) => field.isCenter || field.area + 1e-9 >= MIN_FIELD_AREA),
      ).toBe(true);
      expect(tile.center.sides).toHaveLength(5);
      expect(
        tile.center.sides.every(
          (side) => side.fieldId === null || tile.fields.some((field) => field.id === side.fieldId),
        ),
      ).toBe(true);
      const originalCells = structuredClone(tile.cells);
      config.paths.fields[1].action = 'shop';
      delete config.paths.fields[1].resourceAmount;
      config.paths.fields[1].color = '#ad7862';
      config.paths.fields[1].label = 'Waldladen';
      const edited = generateTile(config);
      expect(edited.fields[1]).toMatchObject({
        action: 'shop',
        color: '#ad7862',
        label: 'Waldladen',
      });
      expect(
        edited.cells.map((cell) => ({ id: cell.id, polygon: cell.polygon, fieldId: cell.fieldId })),
      ).toEqual(
        originalCells.map((cell) => ({
          id: cell.id,
          polygon: cell.polygon,
          fieldId: cell.fieldId,
        })),
      );
    },
    15000,
  );
  it('keeps seeded path colors tied to their gradient until a field gets an explicit override', () => {
    const config = createSeededProject('wald-123'),
      initial = generateTile(config);
    expect(
      config.paths.fields
        .filter((field) => field.id !== 'center')
        .every((field) => field.color === undefined),
    ).toBe(true);
    config.paths.fields[1].color = '#aa4499';
    config.paths.gradient = [
      { at: 0, color: '#111111' },
      { at: 1, color: '#222222' },
    ];
    const changed = generateTile(config);
    expect(changed.fields[1].color).toBe('#aa4499');
    expect(changed.fields[2].color).not.toBe(initial.fields[2].color);
    expect(changed.fields.map((field) => field.cellIds)).toEqual(
      initial.fields.map((field) => field.cellIds),
    );
    expect(config.decoration.sourceDensity).toBeGreaterThan(0);
  });
  it.each([13, 18, 24])(
    'builds exactly %i editable fields on the fixed seed-independent lattice',
    (count) => {
      for (const seed of ['wald-123', 'project-1']) {
        const config = createSeededProject(seed, { fieldCount: count }),
          tile = generateTile(config);
        expect(tile.fields).toHaveLength(count);
        expect(tile.warnings).toEqual([]);
        expect(tile.stats.connected).toBe(true);
        expect(config.grid.divisions).toBeLessThanOrEqual(24);
        expect(createSeededProject(seed, { fieldCount: count })).toEqual(config);
      }
    },
    30000,
  );
  it('separates presentation preferences from generated content and keeps options explicit', () => {
    const original = createSeededProject('wald-123');
    const options = {
      export: { size: 2048, transparent: false },
      camera: { ...defaultConfig.camera, mode: 'top' as const },
    };
    const changed = createSeededProject('wald-123', options);
    expect(changed.export).toEqual(options.export);
    expect(changed.camera).toEqual(options.camera);
    expect(generateTile(changed)).toEqual(generateTile(original));
    expect(createSeededProject('other-world').terrain).not.toEqual(original.terrain);
    expect(options.export.size).toBe(2048);
    expect(() => createSeededProject('')).toThrow();
    expect(() => createSeededProject('x', { export: { size: 2, transparent: true } })).toThrow();
  });
});
describe('explicit config migration', () => {
  it.each(['10.0.0', '10.1.0'])(
    'migrates %s strictly while retaining manual edits and supplying material coordinates',
    (generatorVersion) => {
      const source = structuredClone(defaultConfig);
      source.paths.auto = false;
      source.paths.fields = [{ id: 'center', cellIds: [], action: 'shop', label: 'Behalten' }];
      const legacy = {
        ...source,
        ...preV11Materials(source),
        actions: preV18Actions(),
        schemaVersion: 10,
        generatorVersion,
      };
      const before = structuredClone(legacy);
      const migrated = migrateConfig(legacy);
      expect(migrated.config).toEqual({ ...legacy, ...v13MigrationAdditions(legacy) });
      expect(legacy).toEqual(before);
      expect(() => migrateConfig({ ...legacy, terrain: source.terrain })).toThrow();
      expect(() => migrateConfig({ ...legacy, decoration: source.decoration })).toThrow();
      const disabled = {
        ...legacy,
        paths: { ...legacy.paths, enabledSides: [false, true, true, true, true, true] },
      };
      if (generatorVersion === '10.0.0') {
        const rebuilt = migrateConfig(disabled).config;
        expect(rebuilt.paths.auto).toBe(true);
        expect(rebuilt.paths.enabledSides).toEqual([true, true, true, true, true, true]);
        expect(rebuilt.paths.fields).toEqual(source.paths.fields);
      } else expect(() => migrateConfig(disabled)).toThrow();
    },
  );

  it('strictly migrates V12 without changing saved field data or preferences', () => {
    const { sizeProfiles, ...oldDecoration } = structuredClone(defaultConfig.decoration);
    void sizeProfiles;
    const legacy = {
      ...structuredClone(defaultConfig),
      decoration: oldDecoration,
      actions: preV18Actions(),
      schemaVersion: 12 as const,
      generatorVersion: '12.0.0' as const,
    };
    legacy.paths.fields = [
      { id: 'saved-field', cellIds: ['h:2:3'], action: 'shop', color: '#aabbcc', label: 'Markt' },
    ];
    const result = migrateConfig(legacy);
    expect(result.migrated).toBe(true);
    expect(result.config.schemaVersion).toBe(19);
    expect(result.config.generatorVersion).toBe('19.0.0');
    expect(result.config.paths.fields).toEqual(legacy.paths.fields);
    expect(result.config.paths.fieldCount).toBe(legacy.paths.fieldCount);
    expect(result.config.decoration.colorProfiles).toEqual(legacy.decoration.colorProfiles);
    expect(result.notices.join(' ')).toContain('verzweigtes Wegenetz');
    expect(() => migrateConfig({ ...legacy, unexpected: true })).toThrow();
  });
  it('migrates v1 without mutating source, keeps original center geometry and reports changed rules', () => {
    const legacy = legacyProject(),
      before = JSON.stringify(legacy),
      result = migrateConfig(legacy);
    expect(result.migrated).toBe(true);
    expect(result.notices[0]).toContain('Generator 19');
    expect(result.config.schemaVersion).toBe(19);
    expect(result.config.generatorVersion).toBe('19.0.0');
    expect(result.config.center).toEqual({
      shape: 'regular',
      scale: 1,
      rotation: 0,
      irregularity: 0,
      offset: { x: 0, y: 0 },
      portalWidth: 0.45,
    });
    expect(result.config.terrain.texture).toEqual(defaultConfig.terrain.texture);
    expect(JSON.stringify(legacy)).toBe(before);
    result.config.terrain.texture.scale = 9;
    expect(defaultConfig.terrain.texture.scale).toBe(5);
  });
  it('migrates frozen v2 shapes explicitly and restores forest density', () => {
    const legacy = legacyV2Project();
    legacy.paths.fields = [{ id: 'legacy-field', cellIds: ['hex:0:1'], action: 'event' }] as never;
    const result = migrateConfig({
      ...legacy,
      decoration: { ...legacy.decoration, density: 0, sourceDensity: 0.72 },
    });
    expect(result.config.paths.fields).toEqual([]);
    expect(result.config.paths.auto).toBe(true);
    expect(result.config.center.offset).toEqual({ x: 0, y: 0 });
    expect(result.config.decoration.density).toBe(0.72);
    expect(result.notices.join(' ')).toContain('Generator 19');
  });
  it('migrates the frozen v3 format explicitly and rejects unsupported v4 elevation values', () => {
    const source = structuredClone(v3),
      before = JSON.stringify(source),
      result = migrateConfig(source);
    expect(result.migrated).toBe(true);
    expect(result.config.schemaVersion).toBe(19);
    expect(result.config.center.portalWidth).toBe(0.45);
    expect(result.config.paths.heightMode).toBe('flat');
    expect(result.config.paths.fields).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
    expect(() =>
      migrateConfig({ ...defaultConfig, paths: { ...defaultConfig.paths, heightMode: 'broken' } }),
    ).toThrow();
    expect(() =>
      migrateConfig({
        ...defaultConfig,
        paths: {
          ...defaultConfig.paths,
          fields: [{ id: 'high', cellIds: [], action: 'event', heightOffset: 2 }],
        },
      }),
    ).toThrow();
  });
  it('leaves the current version unchanged and rejects missing new fields, unknown properties and mixed versions', () => {
    expect(migrateConfig(defaultConfig)).toEqual({
      config: defaultConfig,
      migrated: false,
      notices: [],
    });
    expect(() => migrateConfig({ ...legacyProject(), generatorVersion: '2.0.0' })).toThrow();
    expect(() =>
      migrateConfig({ ...legacyProject(), schemaVersion: 2, generatorVersion: '2.0.0' }),
    ).toThrow();
    expect(() => migrateConfig({ ...defaultConfig, schemaVersion: 11 })).toThrow();
    expect(() => migrateConfig({ ...defaultConfig, unknown: true })).toThrow();
    const duplicate = structuredClone(defaultConfig);
    duplicate.paths.fields = [
      { id: 'same-id', cellIds: [], action: 'event' },
      { id: 'same-id', cellIds: [], action: 'shop' },
    ];
    expect(() => migrateConfig(duplicate)).toThrow(/eindeutig/);
    expect(() => migrateConfig(null)).toThrow();
    expect(() => migrateConfig('wrong')).toThrow();
    const bad = structuredClone(defaultConfig) as TileConfig;
    bad.terrain.texture.detailStrength = 1;
    expect(() => migrateConfig(bad)).toThrow();
  });
});

it('preserves the configured finer grid, portal width and terrace mode across seed recipes', () => {
  const grid = { ...defaultConfig.grid, kind: 'diamond' as const, divisions: 18, showGrid: true };
  const projects = ['fixed-entry-a', 'fixed-entry-b', 'fixed-entry-c'].map((seed) =>
    createSeededProject(seed, {
      grid,
      fieldCount: 13,
      heightMode: 'terraced',
      centerPortalWidth: 0.5,
    }),
  );
  const footprints = projects.map((config) =>
    generateTile(config).entrances.map((entrance) => ({
      side: entrance.side,
      mouth: entrance.cellIds,
      footprint: entrance.footprintCellIds,
    })),
  );
  expect(footprints[1]).toEqual(footprints[0]);
  expect(footprints[2]).toEqual(footprints[0]);
  for (const config of projects) {
    expect(config.grid).toEqual(grid);
    expect(config.paths.heightMode).toBe('terraced');
    expect(config.center.portalWidth).toBe(0.5);
    expect(
      generateTile(config).fields.some((field) => field.maxHeight > field.height + 0.001),
    ).toBe(true);
  }
}, 20000);
it('reports the impossible seven-field all-entrance recipe without silently changing the configured grid', () => {
  expect(() => createSeededProject('too-few', { fieldCount: 7, grid: defaultConfig.grid })).toThrow(
    /7/,
  );
});

describe('lossless V4/V5 migration to stepped walls', () => {
  it.each([4, 5] as const)(
    'preserves all V%i manual fields, actions, colors, heights, objects, model slots and presentation',
    (version) => {
      const fixture = version === 4 ? v4 : v5;
      const source = migrateConfig(structuredClone(fixture)).config;
      const tile = generateTile(source);
      source.name = 'Altes manuelles Projekt';
      source.paths.auto = false;
      source.paths.heightMode = 'terraced';
      source.paths.fields = tile.fields.map((field, i) => ({
        id: field.id,
        cellIds: field.isCenter ? [] : [...field.cellIds],
        action: i === 1 ? 'custom' : field.action,
        label: `Mein altes Feld ${i}`,
        color: i === 1 ? '#aa77cc' : field.color,
        heightMode: i === 1 ? 'flat' : 'terraced',
        heightOffset: i === 1 ? 0.12 : -0.02,
      }));
      const free = tile.cells.find((cell) => !cell.reserved && !cell.fieldId)!;
      source.decoration.enabled = true;
      source.decoration.density = 0;
      source.decoration.sourceDensity = 0.73;
      source.decoration.species = [
        'tree',
        'pine',
        'oak',
        'birch',
        'deadTree',
        'bush',
        'rock',
        'crystal',
      ];
      source.decoration.placements = [
        {
          id: 'v4-rock',
          kind: 'rock',
          cellId: free.id,
          offset: { x: 0, y: 0 },
          scale: 1.4,
          rotation: 37.5,
        },
      ];
      source.decoration.modelSlots = {
        tree: 'model-original-tree',
        crystal: 'model-original-crystal',
      };
      source.camera = { ...source.camera, mode: 'perspective', fov: -42, zoom: 1.4 };
      source.export = { size: 512, transparent: false };
      source.palette = ['#aa77cc', '#33aabb'];
      const {
        actionRecipe: sourceRecipe,
        legacyLayout: sourceLegacy,
        rules: sourceRules,
        border: sourceBorder,
        editing: sourceEditing,
        actions: sourceActions,
        ...legacySource
      } = source;
      expect(sourceRecipe).toBe(16);
      expect(sourceLegacy).toBe(true);
      expect(sourceRules).toEqual(defaultConfig.rules);
      expect(sourceBorder).toEqual(defaultConfig.border);
      expect(sourceEditing).toEqual(defaultConfig.editing);
      expect(sourceActions.revision).toBe(defaultConfig.actions.revision);
      const legacy = {
        ...legacySource,
        ...preV11Materials(source),
        schemaVersion: version,
        generatorVersion: `${version}.0.0`,
        paths: { ...source.paths, transitionWidth: fixture.paths.transitionWidth },
      };
      const before = JSON.stringify(legacy);
      const migration = migrateConfig(legacy);
      expect(migration.migrated).toBe(true);
      expect(migration.notices.join(' ')).toContain('Projekt auf Generator 19 umgestellt');
      expect(migration.notices.join(' ')).toContain('unverändert übernommen');
      const { transitionWidth: obsoleteWidth, ...paths } = legacy.paths;
      expect(obsoleteWidth).toBeGreaterThanOrEqual(0.01);
      expect(migration.config).toEqual({
        ...legacy,
        paths,
        ...v13MigrationAdditions(legacy),
        editing: defaultConfig.editing,
        actions: defaultConfig.actions,
        rules: defaultConfig.rules,
        border: defaultConfig.border,
      });
      expect(migration.config.paths).not.toHaveProperty('transitionWidth');
      expect(migration.notices.join(' ')).toContain('Stufen mit senkrechten Wänden');
      expect(JSON.stringify(legacy)).toBe(before);
      const migratedTile = generateTile(migration.config);
      expect(migratedTile).toEqual(generateTile(source));
      expect(migratedTile.fields[1]).toMatchObject({
        action: 'custom',
        label: 'Mein altes Feld 1',
        color: '#aa77cc',
      });
      expect(migratedTile.decorations.find((object) => object.id === 'v4-rock')).toBeDefined();
      migration.config.paths.fields[1].heightOffset = 0.2;
      expect(legacy.paths.fields[1].heightOffset).toBe(0.12);
    },
  );
  it('keeps the V4 schema frozen to eight species, eight slots and the old placement enum', () => {
    const base = structuredClone(v4);
    for (const decoration of [
      { ...base.decoration, species: ['fern'] },
      {
        ...base.decoration,
        species: [...base.decoration.species, 'tree', 'deadTree', 'crystal', 'pine'],
      },
      { ...base.decoration, modelSlots: { quartz: 'model-new-kind' } },
      {
        ...base.decoration,
        placements: [
          {
            id: 'v4-new-kind',
            kind: 'maple',
            cellId: 'h:1:1',
            offset: { x: 0, y: 0 },
            scale: 1,
            rotation: 0,
          },
        ],
      },
      { ...base.decoration, unknown: true },
    ])
      expect(() => migrateConfig({ ...base, decoration })).toThrow();
    expect(() => migrateConfig({ ...base, generatorVersion: '5.0.0' })).toThrow();
    expect(() =>
      migrateConfig({ ...v3, decoration: { ...v3.decoration, species: ['quartz'] } }),
    ).toThrow();
    const mixedV1 = legacyProject();
    expect(() =>
      migrateConfig({
        ...mixedV1,
        decoration: {
          ...mixedV1.decoration,
          placements: [
            {
              id: 'wrong-old-kind',
              kind: 'fern',
              cellId: 'h:1:1',
              offset: { x: 0, y: 0 },
              scale: 1,
              rotation: 0,
            },
          ],
        },
      }),
    ).toThrow();
  });
  it('accepts all eighteen current kinds and strict model assignments while rejecting duplicates and unknown kinds', () => {
    const config = structuredClone(defaultConfig);
    config.decoration.species = [...DECORATION_KINDS];
    config.decoration.modelSlots = Object.fromEntries(
      DECORATION_KINDS.map((kind) => [kind, `model-${kind}`]),
    );
    config.decoration.placements = DECORATION_KINDS.map((kind, index) => ({
      id: `all-kinds-${index}`,
      kind,
      cellId: 'h:1:1',
      offset: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    }));
    expect(configSchema.parse(config)).toEqual(config);
    expect(Object.keys(config.decoration.modelSlots)).toHaveLength(18);
    expect(() =>
      configSchema.parse({
        ...config,
        decoration: { ...config.decoration, species: [...DECORATION_KINDS, 'pine'] },
      }),
    ).toThrow();
    expect(() =>
      configSchema.parse({ ...config, decoration: { ...config.decoration, species: ['dragon'] } }),
    ).toThrow();
    expect(() =>
      configSchema.parse({
        ...config,
        decoration: { ...config.decoration, modelSlots: { dragon: 'unknown-model' } },
      }),
    ).toThrow();
  });
});

it('chooses theme-specific mixed vegetation and keeps object choices independent of the playing surface', () => {
  const expectations = [
    ['Mooswald', ['fern', 'mushrooms', 'oak']],
    ['Nebelmoor', ['willow', 'reeds', 'log']],
    ['Herbsthain', ['maple', 'flowers', 'stump']],
    ['Frostgrat', ['pine', 'quartz', 'rock']],
    ['Amethysthain', ['crystal', 'quartz', 'mushrooms']],
    ['Sonnensteppe', ['grass', 'flowers', 'tree']],
  ] as const;
  for (const [index, [theme, species]] of expectations.entries()) {
    let attempt = 0;
    while (Math.floor(randomAt(`project-${attempt}`, 'project-v4', 'theme') * 6) !== index)
      attempt++;
    const project = createSeededProject(`project-${attempt}`);
    expect(project.name.startsWith(theme)).toBe(true);
    expect(species.every((kind) => project.decoration.species.includes(kind))).toBe(true);
    expect(
      project.decoration.species.some((kind) =>
        ['tree', 'pine', 'oak', 'birch', 'willow', 'maple'].includes(kind),
      ),
    ).toBe(true);
  }
  const first = structuredClone(defaultConfig);
  const initial = generateTile(first);
  first.decoration.species = ['quartz'];
  const changed = generateTile(first);
  expect(changed.fields).toEqual(initial.fields);
  expect(changed.cells).toEqual(initial.cells);
  const placement = (tile: typeof initial) =>
    tile.decorations.map(({ id, position, rotation }) => ({
      id,
      position,
      rotation,
    }));
  expect(placement(changed)).toEqual(placement(initial));
  for (const object of changed.decorations)
    expect(object.scale).toBe(decorationScale(first, object.kind, object.id));
}, 30000);

it('validates obsolete ramp widths in frozen V5 before removing only that setting', () => {
  const source = structuredClone(v5);
  source.decoration.species = ['quartz', 'willow', 'fern', 'mushrooms'];
  const decorated = {
    ...source,
    paths: {
      ...source.paths,
      auto: false,
      fields: [
        {
          id: 'manual-v5',
          cellIds: ['h:2:0'],
          action: 'custom',
          label: 'Erhalten',
          color: '#bc96ef',
          heightMode: 'terraced',
          heightOffset: 0.2,
        },
      ],
    },
    decoration: {
      ...source.decoration,
      density: 0,
      placements: [
        {
          id: 'quartz-v5',
          kind: 'quartz',
          cellId: 'h:4:1',
          offset: { x: 0.2, y: -0.4 },
          scale: 1.3,
          rotation: 75,
        },
      ],
      modelSlots: { fern: 'model-fern-v5', quartz: 'model-quartz-v5' },
    },
  };
  const before = JSON.stringify(decorated);
  for (const transitionWidth of [0.01, 0.1]) {
    const legacy = { ...decorated, paths: { ...decorated.paths, transitionWidth } };
    const result = migrateConfig(legacy);
    const { transitionWidth: discarded, ...paths } = legacy.paths;
    expect(discarded).toBe(transitionWidth);
    expect(result.config).toEqual({
      ...legacy,
      paths,
      ...v13MigrationAdditions(legacy),
      editing: defaultConfig.editing,
      actions: defaultConfig.actions,
      rules: defaultConfig.rules,
      border: defaultConfig.border,
    });
  }
  expect(JSON.stringify(decorated)).toBe(before);
  for (const transitionWidth of [0.009, 0.101, -1, Infinity, '0.04'])
    expect(() =>
      migrateConfig({ ...decorated, paths: { ...decorated.paths, transitionWidth } }),
    ).toThrow();
  const { transitionWidth: omitted, ...missingWidth } = source.paths;
  void omitted;
  expect(() => migrateConfig({ ...source, paths: missingWidth })).toThrow();
  expect(() =>
    migrateConfig({ ...source, decoration: { ...source.decoration, species: ['future-kind'] } }),
  ).toThrow();
  expect(() =>
    migrateConfig({
      ...source,
      decoration: { ...source.decoration, modelSlots: { futureKind: 'invalid' } },
    }),
  ).toThrow();
  expect(() =>
    configSchema.parse({
      ...defaultConfig,
      paths: { ...defaultConfig.paths, transitionWidth: 0.04 },
    }),
  ).toThrow();
});

it('keeps the stored recipe and personal sizes while migrating versions, ramp width and size profiles', () => {
  const current = createSeededProject('wald-123');
  // Construct a historical file with quantities absent, as required by its frozen schema.
  for (const field of current.paths.fields) delete field.resourceAmount;
  current.decoration.colorProfiles.trees.enabled = false;
  current.decoration.colorProfiles.mushrooms.enabled = false;
  const {
    rules: currentRules,
    border: currentBorder,
    editing: currentEditing,
    actions: currentActions,
    ...oldCurrent
  } = current;
  expect(currentRules).toEqual(defaultConfig.rules);
  expect(currentBorder).toEqual(defaultConfig.border);
  expect(currentEditing).toEqual(defaultConfig.editing);
  expect(currentActions.revision).toBe(defaultConfig.actions.revision);
  const legacy = {
    ...oldCurrent,
    ...preV11Materials(current),
    schemaVersion: 5,
    generatorVersion: '5.0.0',
    paths: {
      ...current.paths,
      transitionWidth: 0.025 + randomAt('wald-123', 'project-v4', 'transition') * 0.04,
    },
  };
  expect(migrateConfig(legacy).config).toEqual({
    ...current,
    actions: defaultConfig.actions,
    actionRecipe: 16,
    legacyLayout: true,
    decoration: { ...current.decoration, sizeProfiles: defaultConfig.decoration.sizeProfiles },
  });
  expect(current.paths).not.toHaveProperty('transitionWidth');
});

it('migrates frozen V6 configurations one to one without snapshotting or resetting manual work', () => {
  const source = migrateConfig(structuredClone(v6)).config;
  expect(source).toEqual({
    ...v6,
    ...v13MigrationAdditions(v6),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    rules: defaultConfig.rules,
    border: defaultConfig.border,
  });
  expect(source.paths.auto).toBe(v6.paths.auto);
  const generated = generateTile(source);
  source.paths.auto = false;
  source.paths.fields = generated.fields.map((field, index) => ({
    id: field.id,
    cellIds: field.isCenter ? [] : [...field.cellIds],
    action: index === 1 ? 'custom' : field.action,
    label: `V6-Feld ${index}`,
    color: index === 1 ? '#ca68ad' : field.color,
    heightMode: index % 2 === 0 ? 'terraced' : 'flat',
    heightOffset: index === 1 ? 0.17 : -0.03,
  }));
  const free = generated.cells.find((cell) => !cell.reserved && !cell.fieldId)!;
  source.decoration.density = 0;
  source.decoration.sourceDensity = 0.68;
  source.decoration.species = ['quartz', 'willow', 'fern'];
  source.decoration.placements = [
    {
      id: 'v6-quartz',
      kind: 'quartz',
      cellId: free.id,
      offset: { x: 0, y: 0 },
      scale: 1.2,
      rotation: 35,
    },
  ];
  source.decoration.modelSlots = { quartz: 'model-v6-quartz', fern: 'model-v6-fern' };
  const {
    actionRecipe: sourceRecipe,
    legacyLayout: sourceLegacy,
    rules: sourceRules,
    border: sourceBorder,
    editing: sourceEditing,
    actions: sourceActions,
    ...legacySource
  } = source;
  expect(sourceRecipe).toBe(16);
  expect(sourceLegacy).toBe(true);
  expect(sourceRules).toEqual(defaultConfig.rules);
  expect(sourceBorder).toEqual(defaultConfig.border);
  expect(sourceEditing).toEqual(defaultConfig.editing);
  expect(sourceActions.revision).toBe(defaultConfig.actions.revision);
  const legacy = {
    ...legacySource,
    ...preV11Materials(source),
    schemaVersion: 6,
    generatorVersion: '6.0.0',
  };
  const before = JSON.stringify(legacy);
  const result = migrateConfig(legacy);
  expect(result.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    rules: defaultConfig.rules,
    border: defaultConfig.border,
  });
  expect(result.migrated).toBe(true);
  expect(result.notices.join(' ')).toContain('Projekt auf Generator 19 umgestellt');
  expect(result.notices.join(' ')).toContain('unverändert übernommen');
  expect(JSON.stringify(legacy)).toBe(before);
  expect(generateTile(result.config)).toEqual(generateTile(source));
  result.config.paths.fields[1].label = 'Unabhängige Kopie';
  expect(legacy.paths.fields[1].label).toBe('V6-Feld 1');
});

it('keeps frozen V6 validation strict instead of accepting obsolete or future fields during migration', () => {
  expect(configSchema.safeParse(v6).success).toBe(false);
  expect(() => migrateConfig({ ...v6, generatorVersion: '7.0.0' })).toThrow();
  expect(() => migrateConfig({ ...v6, paths: { ...v6.paths, transitionWidth: 0.045 } })).toThrow();
  expect(() =>
    migrateConfig({ ...v6, decoration: { ...v6.decoration, species: ['future-kind'] } }),
  ).toThrow();
  expect(() =>
    migrateConfig({
      ...v6,
      decoration: { ...v6.decoration, modelSlots: { futureKind: 'model-invalid' } },
    }),
  ).toThrow();
  expect(() => migrateConfig({ ...v6, newOption: true })).toThrow();
});

it('adds default rules, noise coordinates and disabled color profiles when migrating the frozen V7 format', () => {
  const source = {
    ...structuredClone(v7),
    paths: {
      ...structuredClone(v7.paths),
      auto: false,
      fields: [
        {
          id: 'tiny-split-v7',
          cellIds: ['h:3:0', 'h:-3:0'],
          action: 'custom',
          label: 'Nicht verwerfen',
          color: '#aa88cc',
          heightMode: 'terraced',
          heightOffset: 0.15,
        },
      ],
    },
    decoration: {
      ...structuredClone(v7.decoration),
      density: 0,
      placements: [
        {
          id: 'v7-quartz',
          kind: 'quartz',
          cellId: 'h:5:0',
          offset: { x: 0.1, y: -0.1 },
          scale: 1.4,
          rotation: 60,
        },
      ],
      modelSlots: { quartz: 'model-v7-custom' },
    },
  };
  const before = JSON.stringify(source);
  const result = migrateConfig(source);
  expect(result.config).toEqual({
    ...source,
    ...v13MigrationAdditions(source),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    border: defaultConfig.border,
    rules: {
      minFieldArea: 0.0625,
      requireFieldConnectivity: true,
      requirePathConnectivity: true,
      exportPolicy: 'block',
    },
  });
  expect(result.notices.join(' ')).toContain('Projekt auf Generator 19 umgestellt');
  expect(result.notices.join(' ')).toContain('Prüfregeln');
  expect(JSON.stringify(source)).toBe(before);
  result.config.rules.minFieldArea = 0;
  expect(defaultConfig.rules.minFieldArea).toBe(0.0625);
});

it('keeps persisted rules strict and never broadens a historical schema with current rule fields', () => {
  for (const minFieldArea of [0, 0.0625, 0.5])
    expect(
      configSchema.parse({ ...defaultConfig, rules: { ...defaultConfig.rules, minFieldArea } })
        .rules.minFieldArea,
    ).toBe(minFieldArea);
  for (const rules of [
    { ...defaultConfig.rules, minFieldArea: -0.001 },
    { ...defaultConfig.rules, minFieldArea: 0.501 },
    { ...defaultConfig.rules, minFieldArea: Infinity },
    { ...defaultConfig.rules, requireFieldConnectivity: 'false' },
    { ...defaultConfig.rules, exportPolicy: 'ignore' },
    { ...defaultConfig.rules, extra: true },
  ])
    expect(() => configSchema.parse({ ...defaultConfig, rules })).toThrow();
  const { rules: absent, ...withoutRules } = defaultConfig;
  void absent;
  expect(() => configSchema.parse(withoutRules)).toThrow();
  for (const fixture of [v1, legacyV2Project(), v3, v4, v5, v6, v7])
    expect(() => migrateConfig({ ...fixture, rules: defaultConfig.rules })).toThrow();
});

it('preserves configured rules in seed recipes without changing automatic layout minimums', () => {
  const rules: TileConfig['rules'] = {
    minFieldArea: 0.5,
    requireFieldConnectivity: true,
    requirePathConnectivity: true,
    exportPolicy: 'block',
  };
  const before = structuredClone(rules);
  const strict = createSeededProject('wald-123', { fieldCount: 13, rules });
  const ordinary = createSeededProject('wald-123', { fieldCount: 13 });
  expect(strict.rules).toEqual(rules);
  expect(rules).toEqual(before);
  const strictTile = generateTile(strict),
    ordinaryTile = generateTile(ordinary);
  expect(strictTile.fields).toEqual(ordinaryTile.fields);
  expect(strictTile.cells).toEqual(ordinaryTile.cells);
  expect(strictTile.decorations).toEqual(ordinaryTile.decorations);
  expect(
    strictTile.fields
      .filter((field) => !field.isCenter)
      .every((field) => field.area >= MIN_FIELD_AREA && field.area < 0.5),
  ).toBe(true);
  expect(evaluateTileRules(strict, strictTile).some((issue) => issue.code === 'minimum-area')).toBe(
    true,
  );
  expect(getExportRuleIssues(strict, strictTile).length).toBeGreaterThan(0);
  strict.rules.exportPolicy = 'warn';
  expect(getExportRuleIssues(strict, strictTile)).toEqual([]);
  expect(ordinary.rules.exportPolicy).toBe('block');
});

it('migrates V8 with an inactive border, noise coordinates and disabled color profiles', () => {
  const legacy = structuredClone(v8) as unknown as Omit<
    TileConfig,
    'border' | 'editing' | 'actions' | 'schemaVersion' | 'generatorVersion'
  > & { schemaVersion: 8; generatorVersion: '8.0.0' };
  legacy.rules = {
    minFieldArea: 0.17,
    requireFieldConnectivity: false,
    requirePathConnectivity: true,
    exportPolicy: 'warn',
  };
  legacy.paths.auto = false;
  legacy.paths.fields = [
    {
      id: 'v8-saved-field',
      cellIds: ['h:3:0', 'h:-3:0'],
      action: 'custom',
      color: '#Ad71bC',
      label: 'Unverändert',
      heightMode: 'terraced',
      heightOffset: 0.13,
    },
  ];
  legacy.decoration.placements = [
    {
      id: 'v8-saved-object',
      kind: 'quartz',
      cellId: 'h:7:0',
      offset: { x: 0.15, y: -0.3 },
      scale: 2,
      rotation: 21,
    },
  ];
  Object.assign(legacy.decoration, { modelSlots: { quartz: 'model-original' } });
  legacy.palette = ['#12ab34', '#cd5678'];
  const before = JSON.stringify(legacy);
  const result = migrateConfig(legacy);
  expect(result.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    border: { enabled: false, width: 0.015, mode: 'black', color: '#000000' },
  });
  expect(result.migrated).toBe(true);
  expect(result.notices.join(' ')).toContain('Projekt auf Generator 19 umgestellt');
  expect(result.notices.join(' ')).toContain('gespeicherte Platzierungen bleiben erhalten');
  expect(JSON.stringify(legacy)).toBe(before);
  result.config.border.enabled = true;
  result.config.decoration.placements[0]!.scale = 0.5;
  expect(defaultConfig.border.enabled).toBe(false);
  expect(legacy.decoration.placements[0]!.scale).toBe(2);
});

it('validates every border setting strictly and excludes border from every frozen format', () => {
  for (const mode of ['black', 'custom', 'fields', 'transparent'] as const)
    for (const width of [0, 0.015, 0.1])
      expect(
        configSchema.parse({
          ...defaultConfig,
          border: { enabled: true, mode, width, color: '#aB09fF' },
        }).border,
      ).toEqual({ enabled: true, mode, width, color: '#aB09fF' });
  for (const border of [
    { ...defaultConfig.border, enabled: 'false' },
    { ...defaultConfig.border, width: -0.001 },
    { ...defaultConfig.border, width: 0.101 },
    { ...defaultConfig.border, width: Infinity },
    { ...defaultConfig.border, width: NaN },
    { ...defaultConfig.border, mode: 'none' },
    { ...defaultConfig.border, color: '#fff' },
    { ...defaultConfig.border, color: '#12345678' },
    { ...defaultConfig.border, extra: true },
    null,
  ])
    expect(() => configSchema.parse({ ...defaultConfig, border })).toThrow();
  const { border, ...withoutBorder } = defaultConfig;
  expect(border.enabled).toBe(false);
  expect(() => configSchema.parse(withoutBorder)).toThrow();
  for (const fixture of [v1, legacyV2Project(), v3, v4, v5, v6, v7, v8])
    expect(() => migrateConfig({ ...fixture, border: defaultConfig.border })).toThrow();
  expect(() => migrateConfig({ ...v8, generatorVersion: '10.1.0' })).toThrow();
  expect(() => migrateConfig({ ...v8, rules: { ...v8.rules, extra: true } })).toThrow();
});

it('retains explicit border preferences in the full seed recipe without mutating options', () => {
  const border: TileConfig['border'] = {
    enabled: true,
    width: 0.06,
    mode: 'transparent',
    color: '#cD5678',
  };
  const before = structuredClone(border);
  const project = createSeededProject('wald-123', { border });
  expect(project.border).toEqual(before);
  expect(border).toEqual(before);
  expect(createSeededProject('wald-123', { border })).toEqual(project);
  project.border.width = 0.02;
  expect(border.width).toBe(0.06);
  expect(createSeededProject('wald-123').border).toEqual(defaultConfig.border);
});

it('migrates V9 by adding editing and action defaults without changing any saved content', () => {
  const legacy = {
    ...structuredClone(v9),
    border: { enabled: true, width: 0.07, mode: 'transparent', color: '#4f56aB' },
    rules: { ...v9.rules, minFieldArea: 0.19, exportPolicy: 'warn' },
    paths: {
      ...structuredClone(v9.paths),
      auto: false,
      fields: [
        {
          id: 'v9-edited-field',
          cellIds: ['h:3:0', 'h:4:0'],
          action: 'custom',
          color: '#aA39fF',
          label: 'Meine Form',
          heightMode: 'terraced',
          heightOffset: 0.16,
        },
      ],
    },
    decoration: {
      ...structuredClone(v9.decoration),
      placements: [
        {
          id: 'v9-manual-object',
          kind: 'quartz',
          cellId: 'h:8:0',
          offset: { x: 0.2, y: -0.3 },
          scale: 1.2,
          rotation: 35,
        },
      ],
      modelSlots: { quartz: 'model-v9-quartz' },
    },
    palette: ['#aabbcc', '#12ab34'],
  };
  const before = JSON.stringify(legacy);
  const result = migrateConfig(legacy);
  expect(result.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: { regeneratePathsOnCenterChange: false },
    actions: defaultConfig.actions,
  });
  expect(result.migrated).toBe(true);
  expect(result.notices.join(' ')).toContain('Projekt auf Generator 19 umgestellt');
  expect(result.notices.join(' ')).toContain('vorhandene Aktionen werden nicht neu ausgewürfelt');
  expect(JSON.stringify(legacy)).toBe(before);
  result.config.actions.biome = 'nebelmoor';
  result.config.editing.regeneratePathsOnCenterChange = true;
  expect(defaultConfig.actions.biome).toBe(null);
  expect(defaultConfig.editing.regeneratePathsOnCenterChange).toBe(false);
});

it('stores only a strict biome reference and bounded integer roll revision per tile', () => {
  expect(defaultConfig.actions).toEqual({ biome: null, revision: 0 });
  expect(
    configSchema.parse({ ...defaultConfig, actions: { biome: 'mosslight', revision: 2147483647 } })
      .actions.biome,
  ).toBe('mosslight');
  for (const actions of [
    {},
    { revision: 0 },
    { biome: 'unknown', revision: 0 },
    { biome: 42, revision: 0 },
    { biome: null, revision: 0, weights: {} },
    { biome: null, revision: 0, extra: true },
    ...[-1, 0.5, 2147483648, Infinity, '0'].map((revision) => ({ biome: null, revision })),
  ])
    expect(() => configSchema.parse({ ...defaultConfig, actions })).toThrow();
});

it('keeps editing settings strict and prevents new preferences from leaking into historical schemas', () => {
  expect(
    configSchema.parse({ ...defaultConfig, editing: { regeneratePathsOnCenterChange: true } })
      .editing.regeneratePathsOnCenterChange,
  ).toBe(true);
  for (const editing of [
    {},
    { regeneratePathsOnCenterChange: 'false' },
    { regeneratePathsOnCenterChange: false, extra: true },
    null,
  ])
    expect(() => configSchema.parse({ ...defaultConfig, editing })).toThrow();
  const { editing, actions, ...withoutPreferences } = defaultConfig;
  expect(editing.regeneratePathsOnCenterChange).toBe(false);
  expect(actions.revision).toBe(0);
  expect(() => configSchema.parse({ ...withoutPreferences, editing })).toThrow();
  expect(() => configSchema.parse({ ...withoutPreferences, actions })).toThrow();
  for (const fixture of [v1, legacyV2Project(), v3, v4, v5, v6, v7, v8, v9]) {
    expect(() => migrateConfig({ ...fixture, editing })).toThrow();
    expect(() => migrateConfig({ ...fixture, actions })).toThrow();
  }
});

it('preserves the roll revision while the generated biome supplies its own action buffs', () => {
  const ordinary = createSeededProject('wald-123');
  const actions: TileConfig['actions'] = {
    biome: 'nebelmoor',
    revision: 2147483647,
  };
  const editing = { regeneratePathsOnCenterChange: true };
  const before = structuredClone({ actions, editing });
  const custom = createSeededProject('wald-123', { actions, editing });
  expect(custom.actions).toEqual({ ...ordinary.actions, revision: actions.revision });
  expect(custom.editing).toEqual(editing);
  expect(custom.paths.fields).toEqual(ordinary.paths.fields);
  expect(generateTile(custom)).toEqual(generateTile(ordinary));
  expect({ actions, editing }).toEqual(before);
  custom.actions.biome = 'frostgrat';
  custom.editing.regeneratePathsOnCenterChange = false;
  expect({ actions, editing }).toEqual(before);
});
