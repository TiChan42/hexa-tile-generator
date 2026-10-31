import { migrateBulkProject, type BulkProject } from '../core';
import { z } from 'zod';
import { BULK_EXPORT_OPTIONS } from './bulkArchive';
import type { BulkExportOption } from './bulkArchive';

export const BULK_EXPORT_STORAGE_KEY = 'hexa-studio-bulk-export-v1';
const exportPreferencesSchema = z
  .object({
    version: z.literal(1),
    options: z
      .array(z.enum(BULK_EXPORT_OPTIONS))
      .max(BULK_EXPORT_OPTIONS.length)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export function loadBulkExportOptions(
  storage: Pick<Storage, 'getItem'> | null,
): BulkExportOption[] {
  try {
    const value = storage?.getItem(BULK_EXPORT_STORAGE_KEY);
    return value ? exportPreferencesSchema.parse(JSON.parse(value)).options : ['top'];
  } catch {
    return ['top'];
  }
}
export function saveBulkExportOptions(
  storage: Pick<Storage, 'setItem'> | null,
  options: BulkExportOption[],
): void {
  try {
    storage?.setItem(
      BULK_EXPORT_STORAGE_KEY,
      JSON.stringify(exportPreferencesSchema.parse({ version: 1, options })),
    );
  } catch {
    /* Export remains available if preference storage is unavailable. */
  }
}

export const BULK_STORAGE_KEY = 'hexa-studio-bulk-v4';
const LEGACY_BULK_STORAGE_KEYS = [
  'hexa-studio-bulk-v3',
  'hexa-studio-bulk-v2',
  'hexa-studio-bulk-v1',
] as const;

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
