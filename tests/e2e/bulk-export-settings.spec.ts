import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { expect, test } from './fixtures';
import { bulkProjectSchema } from '../../src/core';
import { BULK_STORAGE_KEY } from '../../src/editor/bulkStorage';

test('creates and edits a series with independent grid visibility, chosen PNG size and real SVGs', async ({
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
  await bulk.getByLabel('Seed', { exact: true }).fill('bulk-vector-export');
  await bulk.getByRole('checkbox', { name: 'Einheitliche Rastergröße', exact: false }).uncheck();
  await bulk.getByLabel('Rasterlinien anzeigen', { exact: true }).uncheck();
  await bulk.getByLabel('Subrasterlinien anzeigen', { exact: true }).uncheck();
  await bulk.getByLabel('Exportauflösung (px)', { exact: true }).fill('256');
  await bulk.getByRole('checkbox', { name: 'SVG-Draufsicht', exact: true }).check();
  await bulk.getByRole('button', { name: 'Serie generieren', exact: true }).click();
  await expect(bulk.getByRole('heading', { name: '2 Kacheln', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const stored = async () =>
    bulkProjectSchema.parse(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), BULK_STORAGE_KEY),
    );
  const initial = await stored();
  expect(initial.uniformGrid).toBe(false);
  for (const { config } of initial.tiles) {
    expect(config.grid.showGrid).toBe(false);
    expect(config.grid.showSubgrid).toBe(false);
    expect(config.export.size).toBe(256);
  }
  const archive = async () => {
    const pending = page.waitForEvent('download');
    await bulk.getByRole('button', { name: 'ZIP herunterladen', exact: true }).click();
    const result = await pending;
    return unzipSync(await readFile((await result.path())!));
  };
  const files = await archive();
  expect(Object.keys(files)).toHaveLength(6);
  const pngs = Object.entries(files).filter(([name]) => name.endsWith('.png'));
  const svgs = Object.entries(files).filter(([name]) => name.endsWith('.svg'));
  expect(pngs).toHaveLength(3);
  expect(svgs).toHaveLength(3);
  for (const [, bytes] of pngs) {
    expect(Buffer.from(bytes).readUInt32BE(16)).toBe(256);
    expect(Buffer.from(bytes).readUInt32BE(20)).toBe(256);
  }
  for (const [, bytes] of svgs) {
    const svg = strFromU8(bytes);
    const result = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      return {
        invalid: doc.querySelectorAll('parsererror').length,
        width: doc.documentElement.getAttribute('width'),
        height: doc.documentElement.getAttribute('height'),
        paths: doc.querySelectorAll('path').length,
        icons: doc.querySelectorAll('use').length,
        images: doc.querySelectorAll('image').length,
        lines: doc.querySelectorAll('path[fill="none"]').length,
      };
    }, svg);
    expect(result).toMatchObject({ invalid: 0, width: '256', height: '256', images: 0, lines: 0 });
    expect(result.paths).toBeGreaterThan(20);
    expect(result.icons).toBeGreaterThan(5);
  }
  const firstSvg = strFromU8(svgs.find(([name]) => !name.startsWith('gesamtfeld/'))![1]);
  await writeFile('working/bulk-vector-preview.svg', firstSvg);
  const png = await page.evaluate(async (svg) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 768;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 768, 768);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, firstSvg);
  await writeFile('working/bulk-vector-preview.png', Buffer.from(png, 'base64'));
  await bulk.getByLabel('Rasterlinien anzeigen', { exact: true }).check();
  await bulk.getByLabel('Exportauflösung (px)', { exact: true }).fill('512');
  await expect.poll(async () => (await stored()).tiles[0]!.config.export.size).toBe(512);
  const changed = await stored();
  for (const [i, { config }] of changed.tiles.entries()) {
    expect(config.paths).toEqual(initial.tiles[i]!.config.paths);
    expect(config.decoration).toEqual(initial.tiles[i]!.config.decoration);
    expect(config.terrain).toEqual(initial.tiles[i]!.config.terrain);
    expect(config.grid).toEqual({ ...initial.tiles[i]!.config.grid, showGrid: true });
    expect(config.export.size).toBe(512);
  }
  await bulk.getByRole('checkbox', { name: 'Draufsicht', exact: true }).uncheck();
  const vectors = await archive();
  expect(Object.keys(vectors)).toHaveLength(3);
  for (const [name, bytes] of Object.entries(vectors)) {
    expect(name).toMatch(/\.svg$/);
    expect(strFromU8(bytes)).toContain('width="512" height="512"');
    expect(strFromU8(bytes)).toContain('stroke-opacity="0.11"');
  }
  await page.reload();
  await expect(bulk.getByLabel('Exportauflösung (px)', { exact: true })).toHaveValue('512');
  await expect(bulk.getByRole('checkbox', { name: 'SVG-Draufsicht', exact: true })).toBeChecked();
  await expect(bulk.getByRole('checkbox', { name: 'Draufsicht', exact: true })).not.toBeChecked();
  await expect(bulk.getByLabel('Rasterlinien anzeigen', { exact: true })).toBeChecked();
  await page.screenshot({ path: 'working/bulk-export-settings.png' });
  expect(errors).toEqual([]);
});
