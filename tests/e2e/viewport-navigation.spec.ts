import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { defaultConfig } from '../../src/core';
import { importProject, project } from './helpers';

test('single-tile 2D pan and zoom stay transient, ignore drags for selection and preserve exports', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.export.size = 128;
  await importProject(page, config);
  const saved = await project(page);
  const canvas = page.getByTestId('viewport').locator('canvas');
  await expect(canvas).toHaveAttribute('data-camera-zoom', '1');
  const png = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const before = await png();
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width * 0.55,
    y = bounds.y + bounds.height * 0.55;
  const selected = await canvas.getAttribute('data-selected-field');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-x'))).not.toBe(0);
  await expect(canvas).toHaveAttribute('data-selected-field', selected!);
  await page.mouse.wheel(0, -350);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-zoom')))
    .toBeGreaterThan(1.1);
  const moved = await canvas.evaluate((element) => ({
    x: element.dataset.cameraX,
    z: element.dataset.cameraZ,
    zoom: element.dataset.cameraZoom,
  }));
  expect((await png()).equals(before)).toBe(true);
  await expect(canvas).toHaveAttribute('data-camera-x', moved.x!);
  await expect(canvas).toHaveAttribute('data-camera-z', moved.z!);
  await expect(canvas).toHaveAttribute('data-camera-zoom', moved.zoom!);
  expect(await project(page)).toEqual(saved);
  await page.getByRole('button', { name: 'Ansicht zurücksetzen', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-camera-zoom', '1');
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-x'))).toBeCloseTo(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-z'))).toBeCloseTo(0);
  expect(errors).toEqual([]);
});
