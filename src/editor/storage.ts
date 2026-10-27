import { configSchema, defaultConfig, migrateConfig } from '../core/config';
import type { ConfigMigration } from '../core/config';
import type { TileConfig } from '../core/types';

export const PROJECT_STORAGE_KEY = 'hexa-studio-project-v15';
export const PROJECT_STORAGE_KEYS = [
  PROJECT_STORAGE_KEY,
  'hexa-studio-project-v14',
  'hexa-studio-project-v13',
  'hexa-studio-project-v12',
  'hexa-studio-project-v11',
  'hexa-studio-project-v10',
  'hexa-studio-project-v9',
  'hexa-studio-project-v8',
  'hexa-studio-project-v7',
  'hexa-studio-project-v6',
  'hexa-studio-project-v5',
  'hexa-studio-project-v4',
  'hexa-studio-project-v3',
  'hexa-studio-project-v2',
  'hexa-studio-project-v1',
] as const;

/** Reads in priority order; migrations never modify the original autosave entries. */
export function loadStoredProject(storage: Pick<Storage, 'getItem'> | null): ConfigMigration {
  for (const key of PROJECT_STORAGE_KEYS) {
    try {
      const stored = storage?.getItem(key);
      if (stored) return migrateConfig(JSON.parse(stored));
    } catch {
      // A malformed newer entry or unavailable storage must not hide valid older work.
    }
  }
  return { config: structuredClone(defaultConfig), migrated: false, notices: [] };
}

/** Browser storage writes are atomic; failures leave previous and historical entries intact. */
export function saveStoredProject(
  storage: Pick<Storage, 'setItem'> | null,
  config: TileConfig,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(configSchema.parse(config)));
    return true;
  } catch {
    return false;
  }
}
