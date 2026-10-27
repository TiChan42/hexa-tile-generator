import { v13MigrationAdditions } from './fixtures/migration';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/core/config';
import type { TileConfig } from '../src/core/types';
import {
  loadStoredProject,
  PROJECT_STORAGE_KEY,
  PROJECT_STORAGE_KEYS,
  saveStoredProject,
} from '../src/editor/storage';
import v1 from './fixtures/v1.json' with { type: 'json' };
import v3 from './fixtures/v3.json' with { type: 'json' };
import v4 from './fixtures/v4.json' with { type: 'json' };
import v5 from './fixtures/v5.json' with { type: 'json' };
import v6 from './fixtures/v6.json' with { type: 'json' };
import v7 from './fixtures/v7.json' with { type: 'json' };
import v8 from './fixtures/v8.json' with { type: 'json' };
import v9 from './fixtures/v9.json' with { type: 'json' };

class MemoryStorage {
  entries = new Map<string, string>();
  reads: string[] = [];
  writes: string[] = [];
  getItem(key: string): string | null {
    this.reads.push(key);
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.entries.set(key, value);
  }
}
const v2 = {
  ...v1,
  schemaVersion: 2,
  generatorVersion: '2.0.0',
  center: { shape: 'organic', scale: 0.8, rotation: 0, irregularity: 0.18 },
  terrain: { ...v1.terrain, texture: v3.terrain.texture },
};
const fixtures = [v1, v2, v3, v4, v5, v6, v7, v8, v9];

describe('versioned browser project storage', () => {
  it('prioritizes V16 and keeps every older storage key as a fallback', () => {
    expect(PROJECT_STORAGE_KEY).toBe('hexa-studio-project-v16');
    expect(PROJECT_STORAGE_KEYS).toEqual(
      Array.from({ length: 16 }, (_, index) => `hexa-studio-project-v${16 - index}`),
    );
    const storage = new MemoryStorage();
    const current = { ...structuredClone(defaultConfig), seed: 'current-v7' };
    storage.entries.set(PROJECT_STORAGE_KEY, JSON.stringify(current));
    storage.entries.set('hexa-studio-project-v6', JSON.stringify(v6));
    expect(loadStoredProject(storage)).toEqual({ config: current, migrated: false, notices: [] });
    expect(storage.reads).toEqual([PROJECT_STORAGE_KEY]);
    expect(storage.writes).toEqual([]);
  });
  it.each(fixtures)(
    'loads and explicitly migrates the frozen schema $schemaVersion autosave without overwriting it',
    (fixture) => {
      const storage = new MemoryStorage();
      const key = `hexa-studio-project-v${fixture.schemaVersion}`;
      const original = JSON.stringify(fixture);
      storage.entries.set(key, original);
      const result = loadStoredProject(storage);
      expect(result.config.schemaVersion).toBe(16);
      expect(result.config.generatorVersion).toBe('16.0.0');
      expect(result.migrated).toBe(true);
      expect(result.notices.join(' ')).toContain('Projekt auf Generator 16 umgestellt');
      expect(storage.entries.get(key)).toBe(original);
      expect(storage.writes).toEqual([]);
    },
  );
  it('keeps complete V6 field and object edits while ignoring malformed newer entries', () => {
    const storage = new MemoryStorage();
    const legacy = {
      ...structuredClone(v6),
      paths: {
        ...structuredClone(v6.paths),
        auto: false,
        fields: [
          {
            id: 'manual',
            cellIds: ['h:3:0'],
            action: 'custom',
            label: 'Nicht verlieren',
            color: '#aabbcc',
            heightMode: 'terraced',
            heightOffset: 0.12,
          },
        ],
      },
      decoration: {
        ...structuredClone(v6.decoration),
        density: 0,
        placements: [
          {
            id: 'old-quartz',
            kind: 'quartz',
            cellId: 'h:5:0',
            offset: { x: 0.1, y: -0.2 },
            scale: 1.4,
            rotation: 75,
          },
        ],
        modelSlots: { quartz: 'model-old-custom' },
      },
    };
    storage.entries.set(PROJECT_STORAGE_KEY, '{broken-json');
    const original = JSON.stringify(legacy);
    storage.entries.set('hexa-studio-project-v6', original);
    expect(loadStoredProject(storage).config).toEqual({
      ...legacy,
      ...v13MigrationAdditions(legacy),
      editing: defaultConfig.editing,
      actions: defaultConfig.actions,
      rules: defaultConfig.rules,
      border: defaultConfig.border,
    });
    expect(storage.entries.get(PROJECT_STORAGE_KEY)).toBe('{broken-json');
    expect(storage.entries.get('hexa-studio-project-v6')).toBe(original);
    expect(storage.writes).toEqual([]);
  });
  it('skips invalid frozen V6 input instead of silently accepting obsolete ramp settings', () => {
    const storage = new MemoryStorage();
    storage.entries.set(
      'hexa-studio-project-v6',
      JSON.stringify({ ...v6, paths: { ...v6.paths, transitionWidth: 0.045 } }),
    );
    storage.entries.set('hexa-studio-project-v5', JSON.stringify(v5));
    const result = loadStoredProject(storage);
    expect(result.config.schemaVersion).toBe(16);
    expect(result.config.paths).not.toHaveProperty('transitionWidth');
    expect(storage.reads.at(-1)).toBe('hexa-studio-project-v5');
  });
  it('falls back safely when storage is unavailable and never shares mutable defaults', () => {
    const blocked = {
      getItem() {
        throw new Error('blocked');
      },
    };
    const unavailable = loadStoredProject(blocked);
    expect(unavailable).toEqual({ config: defaultConfig, migrated: false, notices: [] });
    unavailable.config.seed = 'changed';
    expect(defaultConfig.seed).not.toBe('changed');
    expect(loadStoredProject(null).config).toEqual(defaultConfig);
  });
  it('writes only current valid projects into V13 while preserving all historical entries', () => {
    const storage = new MemoryStorage();
    for (const fixture of fixtures)
      storage.entries.set(`hexa-studio-project-v${fixture.schemaVersion}`, JSON.stringify(fixture));
    const before = new Map(storage.entries);
    const current = { ...structuredClone(defaultConfig), seed: 'save-v7' };
    expect(saveStoredProject(storage, current)).toBe(true);
    expect(storage.writes).toEqual([PROJECT_STORAGE_KEY]);
    expect(JSON.parse(storage.entries.get(PROJECT_STORAGE_KEY)!)).toEqual(current);
    for (const [key, value] of before) expect(storage.entries.get(key)).toBe(value);
    expect(saveStoredProject(storage, v6 as unknown as TileConfig)).toBe(false);
    expect(storage.writes).toEqual([PROJECT_STORAGE_KEY]);
  });
  it('reports quota failures without deleting the last save', () => {
    expect(saveStoredProject(null, defaultConfig)).toBe(false);
    expect(
      saveStoredProject(
        {
          setItem() {
            throw new Error('quota exceeded');
          },
        },
        defaultConfig,
      ),
    ).toBe(false);
  });
});

it('loads frozen V7 autosaves without resetting manual work and writes their new rules only to V13', () => {
  const storage = new MemoryStorage();
  const legacy = {
    ...structuredClone(v7),
    paths: {
      ...structuredClone(v7.paths),
      auto: false,
      fields: [
        {
          id: 'v7-split',
          cellIds: ['h:3:0', 'h:-3:0'],
          action: 'custom',
          label: 'Behalten',
          heightOffset: 0.1,
        },
      ],
    },
  };
  const before = JSON.stringify(legacy);
  storage.entries.set('hexa-studio-project-v7', before);
  const migrated = loadStoredProject(storage);
  expect(migrated.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    rules: defaultConfig.rules,
    border: defaultConfig.border,
  });
  migrated.config.rules = {
    minFieldArea: 0,
    requireFieldConnectivity: false,
    requirePathConnectivity: false,
    exportPolicy: 'warn',
  };
  expect(saveStoredProject(storage, migrated.config)).toBe(true);
  expect(storage.entries.get('hexa-studio-project-v7')).toBe(before);
  expect(JSON.parse(storage.entries.get(PROJECT_STORAGE_KEY)!).rules).toEqual(
    migrated.config.rules,
  );
  expect(loadStoredProject(storage).config.rules).toEqual(migrated.config.rules);
});

it('preserves V8 rules and objects while saving border settings exclusively into V13', () => {
  const storage = new MemoryStorage();
  const legacy = {
    ...structuredClone(v8),
    rules: {
      minFieldArea: 0.2,
      requireFieldConnectivity: false,
      requirePathConnectivity: false,
      exportPolicy: 'warn',
    },
    decoration: {
      ...structuredClone(v8.decoration),
      placements: [
        {
          id: 'edge-object',
          kind: 'quartz',
          cellId: 'h:8:0',
          offset: { x: 0.2, y: 0 },
          scale: 1.4,
          rotation: 17,
        },
      ],
    },
  };
  const before = JSON.stringify(legacy);
  storage.entries.set('hexa-studio-project-v8', before);
  const result = loadStoredProject(storage);
  expect(result.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    border: defaultConfig.border,
  });
  result.config.border = { enabled: true, width: 0.09, mode: 'transparent', color: '#345678' };
  expect(saveStoredProject(storage, result.config)).toBe(true);
  expect(storage.entries.get('hexa-studio-project-v8')).toBe(before);
  expect(storage.writes).toEqual(['hexa-studio-project-v16']);
  expect(loadStoredProject(storage)).toEqual({
    config: result.config,
    migrated: false,
    notices: [],
  });
});

it('migrates V9 preferences into V13 without replacing the historical autosave', () => {
  const storage = new MemoryStorage();
  const legacy = {
    ...structuredClone(v9),
    border: { enabled: true, width: 0.08, mode: 'fields', color: '#345678' },
    rules: { ...v9.rules, exportPolicy: 'warn' },
    paths: {
      ...structuredClone(v9.paths),
      auto: false,
      fields: [
        { id: 'saved-v9', cellIds: ['h:3:0'], action: 'gold', label: 'Alt', heightOffset: 0.1 },
      ],
    },
  };
  const original = JSON.stringify(legacy);
  storage.entries.set('hexa-studio-project-v9', original);
  const result = loadStoredProject(storage);
  expect(result.config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
  });
  result.config.editing.regeneratePathsOnCenterChange = true;
  result.config.actions.weights.event = 75;
  result.config.actions.revision = 42;
  expect(saveStoredProject(storage, result.config)).toBe(true);
  expect(storage.entries.get('hexa-studio-project-v9')).toBe(original);
  expect(storage.writes).toEqual(['hexa-studio-project-v16']);
  expect(loadStoredProject(storage)).toEqual({
    config: result.config,
    migrated: false,
    notices: [],
  });
});
