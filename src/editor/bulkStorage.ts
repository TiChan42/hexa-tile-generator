import { migrateBulkProject, type BulkProject } from '../core';

export const BULK_STORAGE_KEY = 'hexa-studio-bulk-v3';
const LEGACY_BULK_STORAGE_KEYS = ['hexa-studio-bulk-v2', 'hexa-studio-bulk-v1'] as const;

export function loadStoredBulkProject(
  storage: Pick<Storage, 'getItem'> | null,
): BulkProject | null {
  if (!storage) return null;
  for (const key of [BULK_STORAGE_KEY, ...LEGACY_BULK_STORAGE_KEYS])
    try {
      const value = storage.getItem(key);
      if (value) return migrateBulkProject(JSON.parse(value));
    } catch {
      // Keep trying older storage after a damaged newer entry.
    }
  return null;
}

export function saveStoredBulkProject(
  storage: Pick<Storage, 'setItem'> | null,
  project: BulkProject,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BULK_STORAGE_KEY, JSON.stringify(migrateBulkProject(project)));
    return true;
  } catch {
    return false;
  }
}
