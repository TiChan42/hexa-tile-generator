import { expect, test } from '@playwright/test';
import { defaultConfig, generateTile } from '../../src/core';
import { importProject, project } from './helpers';

test('resource icons expose amounts, preserve edits and survive undo, export and reload', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  config.export.size = 256;
  config.paths.fields = [{ id: 'center', cellIds: [], action: 'gold', resourceAmount: 1 }];
  await page.goto('/');
  await importProject(page, config);
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await expect(page.getByRole('button', { name: 'Eigene Aktion', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gold', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const image = page.getByRole('button', { name: 'Gold', exact: true }).locator('img');
  const initialIcon = await image.getAttribute('src');
  const amount = page.getByLabel('Ressourcenmenge', { exact: true });
  await expect(amount).toHaveValue('1');
  await amount.selectOption('3');
  await expect.poll(async () => (await project(page)).paths.fields[0].resourceAmount).toBe(3);
  await expect(image).not.toHaveAttribute('src', initialIcon!);
  await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false');
  const beforeDownload = await project(page);
  const tile = generateTile(beforeDownload);
  expect(tile.fields[0].resourceAmount).toBe(3);
  expect(tile.cells).toEqual(generateTile(config).cells);
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect(amount).toHaveValue('1');
  await page.getByLabel('Wiederholen', { exact: true }).click();
  await expect(amount).toHaveValue('3');
  await page.reload();
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await expect(amount).toHaveValue('3');
  await page.getByRole('button', { name: 'Ereignis', exact: true }).click();
  await expect(amount).toHaveCount(0);
  await expect.poll(async () => (await project(page)).paths.fields[0].action).toBe('event');
  expect((await project(page)).paths.fields[0].resourceAmount).toBeUndefined();
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect(amount).toHaveValue('3');
  await page.getByRole('button', { name: /Export Bereit/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '3D-Modell (GLB) herunterladen', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.glb$/);
  expect(await download.failure()).toBeNull();
  expect(await project(page)).toEqual(beforeDownload);
  expect(errors).toEqual([]);
});

test('native icon atlas has distinct quantity variants and a reviewable contact sheet', async ({
  page,
}) => {
  await page.goto('/');
  const dimensions = await page.evaluate(async () => {
    const iconUrl = '/src/render/icons.ts',
      typesUrl = '/src/core/types.ts';
    const { actionCanvas } = await import(/* @vite-ignore */ iconUrl);
    const { SELECTABLE_ACTIONS } = await import(/* @vite-ignore */ typesUrl);
    const actions = SELECTABLE_ACTIONS.filter(
      (entry: { id: string }) =>
        !['none', 'scrap', 'gem', 'platinum', 'amethyst', 'gold'].includes(entry.id),
    );
    const canvas = document.createElement('canvas');
    canvas.id = 'action-atlas';
    canvas.width = 1120;
    canvas.height = 1080;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#172c3b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff6dd';
    context.font = 'bold 24px sans-serif';
    context.fillText('Feldaktionen · 72 × 72 Pixel', 28, 36);
    context.imageSmoothingEnabled = false;
    actions.forEach((action: { id: string; label: string }, index: number) => {
      context.drawImage(actionCanvas(action.id), 30 + index * 155, 55, 112, 112);
      context.font = '14px sans-serif';
      context.fillText(action.label, 25 + index * 155, 192);
    });
    const resources = ['scrap', 'gem', 'platinum', 'amethyst', 'gold'];
    const names = ['Altmetall', 'Edelstein', 'Platin', 'Amethyst', 'Gold'];
    const amounts = [1, 2, 3, 5, 9];
    const sizes: number[] = [],
      unique: number[] = [];
    for (const [row, action] of resources.entries()) {
      context.fillStyle = '#fff6dd';
      context.font = 'bold 18px sans-serif';
      context.fillText(names[row], 30, 245 + row * 163);
      const urls: string[] = [];
      for (const [column, amount] of amounts.entries()) {
        const icon = actionCanvas(action, undefined, amount);
        context.drawImage(icon, 225 + column * 165, 215 + row * 163, 132, 132);
        sizes.push(icon.width, icon.height);
        urls.push(icon.toDataURL());
      }
      unique.push(new Set(urls).size);
    }
    document.body.replaceChildren(canvas);
    document.body.style.margin = '0';
    return { sizes, unique };
  });
  expect(new Set(dimensions.sizes)).toEqual(new Set([288]));
  expect(dimensions.unique).toEqual([5, 5, 5, 5, 5]);
  await page.locator('#action-atlas').screenshot({ path: 'working/action-icons-v17.png' });
});
