import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { configSchema, prepareFieldShapeEdit } from '../../src/core';
import type { GeneratedTile, Point, TileConfig } from '../../src/core';
import { PROJECT_STORAGE_KEY } from '../../src/editor/storage';

export async function project(page: Page): Promise<TileConfig> {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PROJECT_STORAGE_KEY))
    .not.toBeNull();
  return configSchema.parse(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROJECT_STORAGE_KEY),
  );
}

export async function importProject(page: Page, config: TileConfig) {
  await page.getByLabel('Konfiguration importieren').setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByRole('status')).toContainText('Konfiguration geladen');
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function clickWorld(page: Page, point: Point) {
  const bounds = await page.getByTestId('viewport').boundingBox();
  if (!bounds) throw new Error('Viewport fehlt');
  // Top preview fits the whole flat-top hex with a 12% inspection margin.
  const scale = Math.min(bounds.width / 2.24, bounds.height / (Math.sqrt(3) * 1.12));
  await page.mouse.click(
    bounds.x + bounds.width / 2 + point.x * scale,
    bounds.y + bounds.height / 2 + point.y * scale,
  );
}

/** Choose legal edit data rather than assuming the first neighboring cell is an interior cell. */
export function editableExtension(config: TileConfig, tile: GeneratedTile) {
  for (const field of tile.fields) {
    if (field.isCenter || tile.entrances.some((entrance) => entrance.fieldId === field.id))
      continue;
    for (const cell of tile.cells) {
      if (
        cell.fieldId ||
        cell.reserved ||
        cell.landscapeOnly ||
        !cell.neighbors.some((id) => field.cellIds.includes(id))
      )
        continue;
      try {
        prepareFieldShapeEdit(config, tile, field.id, [...field.cellIds, cell.id]);
        return { field, cell };
      } catch {
        /* Try the next structurally editable neighbor. */
      }
    }
  }
  throw new Error('Kein freier, strukturell gültiger Nachbar für die Feldformprüfung.');
}
