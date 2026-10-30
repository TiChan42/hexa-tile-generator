import { preV18Actions } from '../fixtures/migration';
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { unzipSync } from 'fflate';
import { bulkProjectSchema, defaultConfig, type BulkProject } from '../../src/core';
import { BULK_STORAGE_KEY } from '../../src/editor/bulkStorage';
import { project } from './helpers';

test('bulk generation, both viewers, tile edits, historical import and PNG ZIP views work together', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Bulk-Modus', exact: true }).click();
  const bulk = page.getByRole('region', { name: 'Bulk-Modus' });
  await bulk.getByLabel('Reihen', { exact: true }).fill('1');
  await bulk.getByLabel('Spalten', { exact: true }).fill('2');
  await bulk.getByLabel('Seed', { exact: true }).fill('bulk-browser-acceptance');
  await bulk.getByRole('button', { name: 'Serie generieren', exact: true }).click();
  await expect(bulk.getByRole('heading', { name: '2 Kacheln', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const stored = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BULK_STORAGE_KEY);
  const generated = bulkProjectSchema.parse(await stored());
  expect(generated.biomeMode).toBe('random');
  expect(generated.tiles.every(({ config }) => config.decoration.colorProfiles !== undefined)).toBe(
    true,
  );

  // Exercise a V3 collection that still contains the former V12 tile schema.
  const historical = {
    ...generated,
    version: 3,
    tiles: generated.tiles.map((tile) => ({
      ...tile,
      config: {
        ...tile.config,
        actions: preV18Actions(tile.config.actions.revision),
        schemaVersion: 12,
        generatorVersion: '12.0.0',
        export: { size: 128, transparent: true },
        paths: { ...tile.config.paths, auto: true, fields: [] },
        decoration: {
          ...Object.fromEntries(
            Object.entries(tile.config.decoration).filter(([key]) => key !== 'sizeProfiles'),
          ),
          enabled: false,
          placements: [],
        },
      },
    })),
  };
  await bulk.getByLabel('Serie importieren', { exact: true }).setInputFiles({
    name: 'series.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(historical)),
  });
  await expect.poll(async () => (await stored()).tiles[0].config.export.size).toBe(128);
  expect((await stored()).tiles[0].config.schemaVersion).toBe(19);
  await bulk.getByRole('tab', { name: '2D-Draufsicht', exact: true }).click();
  await expect(bulk.locator('.bulk-map-tile')).toHaveCount(2, { timeout: 30000 });
  await bulk.getByRole('tab', { name: '3D-Brett', exact: true }).click();
  const canvas = bulk.getByLabel('3D-Ansicht der gesamten Kachelserie', { exact: true });
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 20, {
    steps: 4,
  });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -100);
  await bulk.getByRole('tab', { name: '2D-Draufsicht', exact: true }).click();
  await bulk.locator('.bulk-map-tile').first().click();
  await bulk.getByRole('button', { name: 'Kachel bearbeiten', exact: true }).click();
  await page.getByLabel('Projektname', { exact: true }).fill('Meine Bulk-Kachel');
  await expect.poll(async () => (await project(page)).name).toBe('Meine Bulk-Kachel');
  await page.getByRole('button', { name: 'Zur Serie', exact: true }).click();
  await expect(bulk.getByText('Meine Bulk-Kachel', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Bulk-Modus' })).toBeVisible();
  expect((await stored()).tiles[0].config.name).toBe('Meine Bulk-Kachel');
  await bulk.getByRole('button', { name: 'Zufällig anordnen', exact: true }).click();
  await expect.poll(async () => (await stored()).shuffleRevision).toBe(1);

  const downloadZip = async () => {
    const pending = page.waitForEvent('download');
    await bulk.getByRole('button', { name: 'ZIP herunterladen', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    return unzipSync(await readFile((await download.path())!));
  };
  const flat = await downloadZip();
  expect(Object.keys(flat)).toHaveLength(3);
  expect(flat['gesamtfeld/draufsicht.png']).toBeDefined();
  expect(
    Object.keys(flat)
      .filter((name) => !name.startsWith('gesamtfeld/'))
      .every((name) => name.endsWith('.png') && !name.includes('/')),
  ).toBe(true);
  for (const bytes of Object.values(flat)) {
    expect(Buffer.from(bytes.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
    expect(Buffer.from(bytes).readUInt32BE(16)).toBe(128);
    expect(Buffer.from(bytes).readUInt32BE(20)).toBe(128);
  }
  await bulk.getByRole('checkbox', { name: '3D-Ansicht', exact: true }).check();
  await bulk.getByRole('checkbox', { name: 'Perspektive', exact: true }).check();
  const views = await downloadZip();
  expect(Object.keys(views)).toHaveLength(9);
  expect(new Set(Object.keys(views).map((name) => name.split('/')[0])).size).toBe(3);
  for (const name of ['draufsicht.png', '3d-ansicht.png', 'perspektive.png'])
    expect(Object.keys(views).filter((path) => path.endsWith(`/${name}`))).toHaveLength(3);
  expect(errors).toEqual([]);
});

for (const columns of [1, 3, 4, 7]) {
  test(`merged 2D board fits adjoining tiles across ${columns} columns and supports selection, pan and zoom`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const rows = columns === 7 ? 7 : 2;
    const config = structuredClone(defaultConfig);
    config.decoration.enabled = false;
    const tiles = Array.from({ length: columns * rows }, (_, index) => ({
      id: `tile-${index}`,
      biomeId: null,
      config: { ...structuredClone(config), name: `Kachel ${index + 1}` },
    }));
    const series: BulkProject = {
      version: 4,
      seed: 'alternating-series',
      rows,
      columns,
      continuousNoise: false,
      uniformGrid: true,
      uniformBorder: true,
      biomeMode: 'random',
      biomeId: 'mosslight',
      gridTemplate: config.grid,
      borderTemplate: config.border,
      tiles,
      order: tiles.map(({ id }) => id),
      shuffleRevision: 0,
    };
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: BULK_STORAGE_KEY,
      value: series,
    });
    await page.goto('/');
    const bulk = page.getByRole('region', { name: 'Bulk-Modus' });
    await expect(bulk.getByRole('tab')).toHaveCount(2);
    await expect(bulk.getByRole('tab', { name: 'Kachelliste', exact: true })).toHaveCount(0);
    const canvas = bulk.getByLabel('2D-Ansicht der gesamten Kachelserie', { exact: true });
    await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]\d*$/, { timeout: 60000 });
    const items = bulk.locator('.bulk-map-tile');
    await expect(items).toHaveCount(columns * rows);
    const before = await page.evaluate((key) => localStorage.getItem(key), BULK_STORAGE_KEY);
    const bounds = await items.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return {
          x,
          y,
          width,
          height,
          exactWidth: parseFloat((element as HTMLElement).style.width),
          exactHeight: parseFloat((element as HTMLElement).style.height),
        };
      }),
    );
    const viewport = (await canvas.boundingBox())!;
    const { exactWidth: width, exactHeight: height } = bounds[0]!;
    for (let index = 0; index < bounds.length; index++) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      expect(bounds[index]!.y - bounds[0]!.y).toBeCloseTo(
        row * height + ((column % 2) * height) / 2,
        1,
      );
      expect(bounds[index]!.x - bounds[0]!.x).toBeCloseTo(column * width * 0.75, 1);
      expect(bounds[index]!.x).toBeGreaterThanOrEqual(viewport.x);
      expect(bounds[index]!.y).toBeGreaterThanOrEqual(viewport.y);
      expect(bounds[index]!.x + width).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
      expect(bounds[index]!.y + height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
    }
    await items.first().click();
    await expect(items.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(
      bulk.getByRole('button', { name: 'Kachel bearbeiten', exact: true }),
    ).toBeEnabled();
    const nameStyle = await items
      .first()
      .locator('strong')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, shadow: style.textShadow };
      });
    expect(nameStyle.color).toBe('rgb(255, 214, 92)');
    expect(nameStyle.shadow).toContain('rgb(0, 0, 0)');
    if (columns === 3) {
      const start = (await items.nth(1).boundingBox())!;
      const x = start.x + start.width / 2,
        y = start.y + start.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 65, y + 30, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => (await items.first().boundingBox())!.x)
        .toBeCloseTo(bounds[0]!.x + 65, 0);
      await expect(items.first()).toHaveAttribute('aria-pressed', 'true');
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'false');
      await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
      await page.mouse.wheel(0, -350);
      await expect
        .poll(async () => (await items.first().boundingBox())!.width)
        .toBeGreaterThan(width * 1.1);
      await bulk.getByRole('button', { name: 'Gesamte Serie einpassen', exact: true }).click();
      await expect
        .poll(async () => (await items.first().boundingBox())!.width)
        .toBeCloseTo(width, 1);
      await expect
        .poll(async () => (await items.first().boundingBox())!.x)
        .toBeCloseTo(bounds[0]!.x, 1);
      await items.nth(1).focus();
      await page.keyboard.press('Enter');
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(items.first()).toHaveAttribute('aria-pressed', 'false');
    }
    expect(await page.evaluate((key) => localStorage.getItem(key), BULK_STORAGE_KEY)).toBe(before);
  });
}
