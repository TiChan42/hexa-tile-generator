import { test, expect } from '@playwright/test';
import frozenV13 from '../fixtures/v13.json' with { type: 'json' };
import frozenV14 from '../fixtures/v14.json' with { type: 'json' };
import { generateTile } from '../../src/core';
import { longestThinChain } from '../../src/core/organic-topology';
import { PROJECT_STORAGE_KEY } from '../../src/editor/storage';
import { project } from './helpers';

for (const frozen of [frozenV13, frozenV14]) {
  test(`explicit organic rebuild upgrades a saved V${frozen.schemaVersion} layout and undo restores its exact shapes`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const source = structuredClone(frozen);
    source.decoration.enabled = false;
    source.export.size = 256;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      (value) =>
        localStorage.setItem(`hexa-studio-project-v${value.schemaVersion}`, JSON.stringify(value)),
      source,
    );
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('Generator 18');
    const legacy = await project(page);
    expect(legacy.legacyLayout === true || legacy.layoutVersion === 14).toBe(true);
    const before = generateTile(legacy);
    await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
    await page
      .getByRole('button', { name: 'Organisches Wegenetz neu erzeugen', exact: true })
      .click();
    await expect
      .poll(async () => {
        const c = await project(page);
        return c.legacyLayout ?? c.layoutVersion;
      })
      .toBeUndefined();
    await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
    const upgraded = await project(page),
      tile = generateTile(upgraded);
    expect(tile.fields).toHaveLength(13);
    expect(tile.warnings).toEqual([]);
    expect(tile.stats.connected).toBe(true);
    expect(tile.fields.some((field) => field.id.startsWith('auto:blob:'))).toBe(true);
    const cells = new Map(tile.cells.map((cell) => [cell.id, cell]));
    for (const field of tile.fields.filter((field) => field.id.startsWith('auto:blob:')))
      expect(
        longestThinChain(new Set(field.cellIds), cells, upgraded.grid.kind),
      ).toBeLessThanOrEqual(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => {
        const c = await project(page);
        return c.legacyLayout === true || c.layoutVersion === 14;
      })
      .toBe(true);
    expect(generateTile(await project(page))).toEqual(before);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect
      .poll(async () => {
        const c = await project(page);
        return c.legacyLayout ?? c.layoutVersion;
      })
      .toBeUndefined();
    await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
    expect(
      await page.evaluate(
        (version) => JSON.parse(localStorage.getItem(`hexa-studio-project-v${version}`)!),
        source.schemaVersion,
      ),
    ).toEqual(source);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).schemaVersion,
        PROJECT_STORAGE_KEY,
      ),
    ).toBe(18);
    await page.getByRole('button', { name: 'Draufsicht', exact: true }).click();
    await page
      .getByTestId('viewport')
      .screenshot({ path: 'working/path-review/editor-organic-top.png' });
    await page.getByRole('button', { name: '3D-Ansicht', exact: true }).click();
    await page
      .getByTestId('viewport')
      .screenshot({ path: 'working/path-review/editor-organic-3d.png' });
    expect(errors).toEqual([]);
  });
}
