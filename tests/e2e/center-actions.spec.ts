import { expect, test } from '@playwright/test';
import {
  ACTION_PROBABILITIES,
  defaultConfig,
  generateTile,
  rollFieldActions,
} from '../../src/core';
import type { GameField, GeneratedTile } from '../../src/core';
import { importProject, project } from './helpers';

test.setTimeout(90000);

function metadata(tile: GeneratedTile) {
  return tile.fields.map(({ id, action, color, label }) => ({ id, action, color, label }));
}
function field(tile: GeneratedTile, id: string): GameField {
  const value = tile.fields.find((candidate) => candidate.id === id);
  expect(value).toBeDefined();
  return value!;
}
function fixedOuterFields(before: GeneratedTile, after: GeneratedTile) {
  expect(after.entrances).toEqual(before.entrances);
  for (const entrance of before.entrances)
    expect(field(after, entrance.fieldId!)).toEqual(field(before, entrance.fieldId!));
  const map = new Map(after.cells.map((cell) => [cell.id, cell]));
  for (const cell of before.cells.filter(
    (cell) => Math.hypot(cell.center.x, cell.center.y) > 0.4,
  )) {
    expect(map.get(cell.id)?.fieldId).toBe(cell.fieldId);
    expect(map.get(cell.id)?.polygon).toEqual(cell.polygon);
  }
}

for (const kind of ['hex', 'diamond'] as const) {
  test(`${kind} center controls preserve automatic fields unless rebuilding is explicitly enabled`, async ({
    page,
  }) => {
    const config = structuredClone(defaultConfig);
    config.camera.mode = 'top';
    config.grid.kind = kind;
    config.decoration.density = 0;
    const initial = generateTile(config);
    const outer = initial.entrances[0].fieldId!;
    config.paths.fields = [
      {
        id: outer,
        cellIds: [],
        action: 'shop',
        label: 'Mein Eingang',
        color: '#b78291',
        heightOffset: 0.045,
        heightMode: 'terraced',
      },
      {
        id: 'center',
        cellIds: [],
        action: 'gold',
        label: 'Mein Zentrum',
        color: '#e6c777',
        heightOffset: 0.02,
      },
    ];
    const free = initial.cells.find(
      (cell) => !cell.fieldId && !cell.reserved && Math.hypot(cell.center.x, cell.center.y) > 0.55,
    )!;
    config.decoration.placements = [
      {
        id: 'kept-tree',
        kind: 'oak',
        cellId: free.id,
        offset: { x: 0, y: 0 },
        scale: 0.65,
        rotation: 17,
      },
    ];
    const before = generateTile(config);
    await page.goto('/');
    await importProject(page, config);
    await page.getByRole('button', { name: 'Pentagon einstellen', exact: true }).click();
    const regenerate = page.getByRole('checkbox', {
      name: 'Spielfelder bei Pentagonänderung neu generieren',
      exact: true,
    });
    await expect(regenerate).not.toBeChecked();
    await page.getByRole('slider', { name: 'Pentagon-Drehung', exact: true }).press('ArrowRight');
    await expect.poll(async () => (await project(page)).center.rotation).toBe(1);
    await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false');
    const changed = await project(page);
    expect(changed.paths.auto).toBe(false);
    expect(changed.paths.fieldCount).toBe(config.paths.fieldCount);
    expect(changed.decoration).toEqual(config.decoration);
    expect(changed.actions).toEqual(config.actions);
    expect(changed.paths.fields.find((edit) => edit.id === outer)).toEqual({
      ...config.paths.fields[0],
      cellIds: field(before, outer).cellIds,
    });
    expect(changed.paths.fields.find((edit) => edit.id === 'center')).toEqual(
      config.paths.fields[1],
    );
    const after = generateTile(changed);
    expect(metadata(after)).toEqual(metadata(before));
    fixedOuterFields(before, after);
    expect(after.decorations.find((object) => object.id === 'kept-tree')).toEqual(
      before.decorations.find((object) => object.id === 'kept-tree'),
    );
    await page.getByLabel('Rückgängig', { exact: true }).click();
    await expect.poll(() => project(page)).toEqual(config);
    await page.getByLabel('Wiederholen', { exact: true }).click();
    await expect.poll(() => project(page)).toEqual(changed);
    await page.getByRole('slider', { name: 'Pentagon-Drehung', exact: true }).press('ArrowRight');
    await page.getByRole('slider', { name: 'Pentagon-Drehung', exact: true }).press('ArrowRight');
    await page
      .getByRole('slider', { name: 'Breite der Pentagon-Anschlüsse', exact: true })
      .press('ArrowLeft');
    await expect.poll(async () => (await project(page)).center.rotation).toBe(3);
    await expect.poll(async () => (await project(page)).center.portalWidth).toBe(0.4);
    await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false');
    const advanced = await project(page);
    expect(advanced.decoration).toEqual(config.decoration);
    expect(metadata(generateTile(advanced))).toEqual(metadata(before));
    fixedOuterFields(before, generateTile(advanced));
    await regenerate.check();
    await expect
      .poll(async () => (await project(page)).editing.regeneratePathsOnCenterChange)
      .toBe(true);
    expect((await project(page)).paths.fields).toEqual(advanced.paths.fields);
    await page.getByRole('slider', { name: 'Pentagongröße', exact: true }).press('Home');
    await expect.poll(async () => (await project(page)).paths.auto).toBe(true);
    const rebuilt = await project(page);
    expect(rebuilt.paths.fields).toEqual([]);
    expect(rebuilt.decoration.placements).toEqual([]);
    await expect(page.getByText('Generierung fehlgeschlagen', { exact: true })).toHaveCount(0);
  });
}

test('global action probabilities apply fixed biome buffs and roll in one undo step', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  config.actions.biome = 'amethysthain';
  const initial = generateTile(config),
    first = initial.fields.find((field) => !field.isCenter)!;
  config.paths.fields = [
    {
      id: first.id,
      cellIds: [],
      action: 'shop',
      label: 'Behalte meine Eigenschaften',
      color: '#ad9ac1',
      heightOffset: 0.07,
      heightMode: 'terraced',
    },
  ];
  const before = generateTile(config);
  await page.goto('/');
  await importProject(page, config);
  const quick = page.getByRole('complementary', { name: 'Schnellaktionen' });
  await quick.getByText('Aktionswahrscheinlichkeiten', { exact: true }).click();
  const table = quick.getByRole('table', { name: 'Globale Aktionswahrscheinlichkeiten' });
  await expect(table.locator('input')).toHaveCount(0);
  await expect(quick.getByTestId('action-biome')).toHaveText('Biom: Amethysthain');
  const baseCells = await table.locator('tbody tr td:first-of-type').allTextContents();
  expect(baseCells).toContain(String(ACTION_PROBABILITIES.baseWeights.rotate));
  await expect(table.locator('[data-action="amethyst"]')).toContainText('+100 %');
  await expect(table.locator('[data-action="gem"]')).toContainText('+50 %');
  const chances = await table.locator('tbody tr td:last-child').allTextContents();
  const changedSeed = structuredClone(config);
  changedSeed.seed = 'anderer-seed-gleiche-basis';
  await importProject(page, changedSeed);
  expect(await table.locator('tbody tr td:first-of-type').allTextContents()).toEqual(baseCells);
  expect(await table.locator('tbody tr td:last-child').allTextContents()).toEqual(chances);
  await importProject(page, config);
  const roll = quick.getByRole('button', { name: 'Alle Aktionen würfeln', exact: true });
  await roll.click();
  const expected = rollFieldActions(config, before);
  await expect.poll(() => project(page)).toEqual(expected);
  const rolled = generateTile(expected);
  const geometry = (tile: GeneratedTile) =>
    tile.fields.map(({ action: _action, resourceAmount: _amount, ...rest }) => {
      void _action;
      void _amount;
      return rest;
    });
  expect(geometry(rolled)).toEqual(geometry(before));
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect.poll(() => project(page)).toEqual(config);
  await page.getByLabel('Wiederholen', { exact: true }).click();
  await expect.poll(() => project(page)).toEqual(expected);
  await page.getByRole('button', { name: 'Pentagon einstellen', exact: true }).click();
  await page.getByRole('slider', { name: 'Pentagon-Drehung', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await project(page)).center.rotation).toBe(1);
  const centered = await project(page);
  expect(centered.actions).toEqual(expected.actions);
  expect(
    Object.fromEntries(
      centered.paths.fields.map(({ id, action, resourceAmount }) => [
        id,
        { action, resourceAmount },
      ]),
    ),
  ).toEqual(
    Object.fromEntries(
      expected.paths.fields.map(({ id, action, resourceAmount }) => [
        id,
        { action, resourceAmount },
      ]),
    ),
  );
  await page.reload();
  await expect.poll(() => project(page)).toEqual(centered);
  await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('button', { name: 'Biomprofil Sonnensteppe anwenden', exact: true }).click();
  await expect.poll(async () => (await project(page)).actions.biome).toBe('sonnensteppe');
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await quick.getByText('Aktionswahrscheinlichkeiten', { exact: true }).click();
  expect(await table.locator('tbody tr td:first-of-type').allTextContents()).toEqual(baseCells);
  await expect(table.locator('[data-action="gold"]')).toContainText('+50 %');
  expect((await project(page)).paths.fields).toEqual(centered.paths.fields);
});
