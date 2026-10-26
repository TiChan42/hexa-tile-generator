import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { configSchema } from '../../src/core';
import type { Point, TileConfig } from '../../src/core';

export async function project(page: Page): Promise<TileConfig> {
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('hexa-studio-project-v10')))
    .not.toBeNull();
  return configSchema.parse(
    await page.evaluate(() => JSON.parse(localStorage.getItem('hexa-studio-project-v10')!)),
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
