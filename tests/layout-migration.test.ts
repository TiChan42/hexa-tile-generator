import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { defaultConfig, generateTile, migrateConfig } from '../src/core';
import frozenV14 from './fixtures/v14.json' with { type: 'json' };

it('keeps the actual V14 generated geometry and metadata unchanged on migration', () => {
  const original = JSON.stringify(frozenV14);
  const migration = migrateConfig(frozenV14);
  expect(migration.migrated).toBe(true);
  expect(migration.config.layoutVersion).toBe(14);
  expect(migration.config.schemaVersion).toBe(19);
  const config = structuredClone(migration.config);
  config.decoration.enabled = false;
  const digest = createHash('sha256')
    .update(JSON.stringify(generateTile(config)))
    .digest('hex');
  expect(digest).toBe('c9c993b59d502dc32e1edcfe90b759df0ee3fda369b7dd72d29f0ec8df5d3ac2');
  expect(JSON.stringify(frozenV14)).toBe(original);
  expect(migrateConfig(migration.config)).toEqual({
    config: migration.config,
    migrated: false,
    notices: [],
  });
});

it('strictly validates frozen V14 and current version pairs', () => {
  expect(() => migrateConfig({ ...frozenV14, layoutVersion: 14 })).toThrow();
  expect(() => migrateConfig({ ...frozenV14, generatorVersion: '16.0.0' })).toThrow();
  expect(() => migrateConfig({ ...defaultConfig, generatorVersion: '14.0.0' })).toThrow();
  expect(() => migrateConfig({ ...defaultConfig, layoutVersion: 15 })).toThrow();
});
