import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import {
  defaultConfig,
  generateTile,
  hexagon,
  pointInPolygon,
  decorationSlots,
  decorationClearsBorder,
  decorationScale,
  inTileBorder,
} from '../../src/core';
import type { Point } from '../../src/core';
import { FIELD_BORDER_COLOR } from '../../src/render/borders';
import { clickWorld, importProject, project } from './helpers';

test.setTimeout(90000);

async function png(page: Page) {
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
  return readFile((await (await pending).path())!);
}

async function pixels(page: Page, bytes: Buffer, points: Point[], size = 512) {
  return page.evaluate(
    async ({ base64, points, size }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return points.map((point) =>
        Array.from(
          context.getImageData(
            Math.floor(((1 + point.x) * size) / 2),
            Math.floor(((1 + point.y) * size) / 2),
            1,
            1,
          ).data,
        ),
      );
    },
    { base64: bytes.toString('base64'), points, size },
  );
}

test('outer border settings retain a thin field contour and exclude the thick rim from path mouths', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.export.size = 512;
  config.decoration.enabled = false;
  config.grid.showGrid = false;
  config.terrain.elevation = 0;
  config.terrain.grain = 0;
  config.terrain.overhang = 0;
  config.terrain.texture.strength = config.terrain.texture.detailStrength = 0;
  config.terrain.gradient = [
    { at: 0, color: '#6b8356' },
    { at: 1, color: '#6b8356' },
  ];
  config.paths.detail = { pebbleDensity: 0, centerLight: 0, edgeShade: 0 };
  const tile = generateTile(config);
  const boundary = hexagon();
  const inward = (side: number, fraction: number, depth: number): Point => {
    const a = boundary[side],
      b = boundary[(side + 1) % 6];
    return {
      x: a.x + (b.x - a.x) * fraction - (b.y - a.y) * depth,
      y: a.y + (b.y - a.y) * fraction + (b.x - a.x) * depth,
    };
  };
  const landscape = Array.from({ length: 6 }, (_, side) => inward(side, 0.15, 0.035)).find(
    (point) =>
      tile.cells.some(
        (cell) =>
          !cell.fieldId && cell.surfacePolygons.some((polygon) => pointInPolygon(point, polygon)),
      ),
  )!;
  const mouths = tile.entrances.map((entrance) => inward(entrance.side, 0.5, 0.014));
  const contours = tile.entrances.map((entrance) => inward(entrance.side, 0.5, 0.0035));
  await page.goto('/');
  await importProject(page, config);
  const before = await png(page);
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('button', { name: 'Außenrand einstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tile-Außenrand', exact: true })).toBeInViewport();
  await page.getByRole('checkbox', { name: 'Außenrand aktivieren', exact: true }).check();
  await page.getByRole('slider', { name: 'Randdicke', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).border.width).toBe(0.1);
  const black = await png(page);
  await writeFile(test.info().outputPath('border-black.png'), black);
  expect(
    Number(await page.locator('canvas').getAttribute('data-tile-border-triangles')),
  ).toBeGreaterThan(0);
  const revision = await page.locator('canvas').getAttribute('data-geometry-revision');
  const [ink, ...openings] = await pixels(page, black, [landscape, ...mouths]);
  expect(ink).toEqual([0, 0, 0, 255]);
  for (const opening of openings) {
    expect(opening[3]).toBe(255);
    expect(opening[0] + opening[1] + opening[2]).toBeGreaterThan(160);
  }
  const contourPixels = await pixels(page, black, contours);
  for (const contour of contourPixels) {
    expect(contour[3]).toBe(255);
    contour.slice(0, 3).forEach((value) => expect(value).toBeLessThan(12));
  }
  await page.getByLabel('Randfarbe', { exact: true }).selectOption('custom');
  await page.getByLabel('Außenrand Hexwert').fill('#ff3344');
  await page.getByLabel('Außenrand Hexwert').press('Tab');
  const [red] = await pixels(page, await png(page), [landscape]);
  expect(red).toEqual([255, 51, 68, 255]);
  expect(await page.locator('canvas').getAttribute('data-geometry-revision')).toBe(revision);
  await page.getByLabel('Randfarbe', { exact: true }).selectOption('fields');
  const [matching] = await pixels(page, await png(page), [landscape]);
  expect(matching).toEqual(
    [1, 3, 5].map((at) => parseInt(FIELD_BORDER_COLOR.slice(at, at + 2), 16)).concat(255),
  );
  expect(await page.locator('canvas').getAttribute('data-geometry-revision')).toBe(revision);
  await page.getByLabel('Randfarbe', { exact: true }).selectOption('transparent');
  const [clear] = await pixels(page, await png(page), [landscape]);
  expect(clear[3]).toBe(255);
  expect(clear[1]).toBeGreaterThan(30);
  await page.getByRole('checkbox', { name: 'Außenrand aktivieren', exact: true }).uncheck();
  expect((await png(page)).equals(before)).toBe(true);
  await expect
    .poll(async () => (await project(page)).border)
    .toEqual({ ...config.border, width: 0.1, mode: 'transparent', color: '#ff3344' });
});

test('the complete object footprint avoids even transparent borders and saved objects return when disabled', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.border = { ...config.border, enabled: true, width: 0.025, mode: 'transparent' };
  config.decoration.density = 0.8;
  config.decoration.sizeProfiles.tree.variation = 0;
  const tile = generateTile(config);
  expect(
    tile.decorations.every((object) =>
      decorationClearsBorder(config, object.position, object.scale, object.rotation),
    ),
  ).toBe(true);
  const free = tile.cells.filter((cell) => !cell.fieldId && !cell.reserved);
  const slots = free.flatMap((cell) =>
    decorationSlots(cell, config.grid).map((slot) => ({ ...slot, cellId: cell.id })),
  );
  const forbidden = slots.find((slot) => inTileBorder(config, slot.position))!;
  const wide = { ...config, border: { ...config.border, width: 0.1 } };
  const placedScale = decorationScale(config, 'tree', 'border-placement', 0.8);
  const allowed = slots.find(
    (slot) =>
      decorationClearsBorder(config, slot.position, placedScale, 0) &&
      !decorationClearsBorder(wide, slot.position, placedScale, 0),
  )!;
  expect(forbidden).toBeDefined();
  expect(allowed).toBeDefined();
  await page.goto('/');
  await importProject(page, config);
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await page.getByRole('button', { name: 'Objekte platzieren', exact: true }).click();
  await clickWorld(page, forbidden.position);
  await expect(page.getByRole('status')).toContainText('Randzone bleibt frei');
  expect((await project(page)).decoration.placements).toHaveLength(0);
  await clickWorld(page, allowed.position);
  await expect.poll(async () => (await project(page)).decoration.placements.length).toBe(1);
  const placed = (await project(page)).decoration.placements[0];
  expect(
    generateTile(await project(page)).decorations.some((object) => object.id === placed.id),
  ).toBe(true);
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('button', { name: 'Außenrand einstellen', exact: true }).click();
  await page.getByRole('slider', { name: 'Randdicke', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).border.width).toBe(0.1);
  const widened = await project(page);
  expect(widened.decoration.placements).toEqual([placed]);
  expect(generateTile(widened).decorations.some((object) => object.id === placed.id)).toBe(false);
  await page.getByRole('checkbox', { name: 'Außenrand aktivieren', exact: true }).uncheck();
  await expect.poll(async () => (await project(page)).border.enabled).toBe(false);
  const disabled = await project(page);
  expect(disabled.decoration.placements).toEqual([placed]);
  expect(generateTile(disabled).decorations.some((object) => object.id === placed.id)).toBe(true);
  await page.reload();
  await expect.poll(() => project(page)).toEqual(disabled);
});
