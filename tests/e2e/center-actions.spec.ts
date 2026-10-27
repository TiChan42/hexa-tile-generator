import { expect, test } from '@playwright/test';
import { ACTIONS, defaultConfig, generateTile } from '../../src/core';
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

test('action weights roll every field including the center in one undo step without changing the layout', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  for (const action of ACTIONS)
    config.actions.weights[action.id] = action.id === 'rotate' ? 100 : 0;
  const initial = generateTile(config);
  const first = initial.fields.find((field) => !field.isCenter)!;
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
  const roll = quick.getByRole('button', { name: 'Alle Aktionen würfeln', exact: true });
  await expect(roll).toBeInViewport();
  await roll.click();
  await expect.poll(async () => (await project(page)).actions.revision).toBe(1);
  const rotated = await project(page);
  expect(rotated.paths.auto).toBe(config.paths.auto);
  expect(generateTile(rotated).fields.every((field) => field.action === 'rotate')).toBe(true);
  expect(
    generateTile(rotated).fields.map(({ action: _action, ...rest }) => {
      void _action;
      return rest;
    }),
  ).toEqual(
    before.fields.map(({ action: _action, ...rest }) => {
      void _action;
      return rest;
    }),
  );
  expect(rotated.paths.fields.find((edit) => edit.id === first.id)).toEqual({
    ...config.paths.fields[0],
    action: 'rotate',
  });
  await quick.getByText('Aktionswahrscheinlichkeiten', { exact: true }).click();
  await page.getByLabel('Wahrscheinlichkeit Drehen', { exact: true }).fill('0');
  await expect(roll).toBeDisabled();
  await expect(quick).toContainText('mindestens einer Aktion');
  await expect
    .poll(async () =>
      Object.values((await project(page)).actions.weights).reduce((sum, value) => sum + value, 0),
    )
    .toBe(0);
  expect(generateTile(await project(page)).fields.every((field) => field.action === 'rotate')).toBe(
    true,
  );
  await page.getByLabel('Wahrscheinlichkeit Gold', { exact: true }).fill('100');
  await expect.poll(async () => (await project(page)).actions.weights.gold).toBe(100);
  const beforeGold = await project(page);
  await expect(roll).toBeInViewport();
  await roll.click();
  await expect.poll(async () => (await project(page)).actions.revision).toBe(2);
  const gold = await project(page);
  expect(generateTile(gold).fields.every((field) => field.action === 'gold')).toBe(true);
  expect(gold.seed).toBe(config.seed);
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect.poll(() => project(page)).toEqual(beforeGold);
  await page.getByLabel('Wiederholen', { exact: true }).click();
  await expect.poll(() => project(page)).toEqual(gold);
  await page.getByRole('button', { name: 'Pentagon einstellen', exact: true }).click();
  await page.getByRole('slider', { name: 'Pentagon-Drehung', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await project(page)).center.rotation).toBe(1);
  const centered = await project(page);
  expect(generateTile(centered).fields.every((field) => field.action === 'gold')).toBe(true);
  expect(centered.actions).toEqual(gold.actions);
  await page.reload();
  await expect.poll(() => project(page)).toEqual(centered);
});
