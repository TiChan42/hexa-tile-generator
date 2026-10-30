import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  boundaryCells,
  createSeededProject,
  defaultConfig,
  evaluateTileRules,
  generateTile,
  isConnectedSelection,
  prepareFieldShapeEdit,
} from '../../src/core';
import type { GameField, GeneratedTile } from '../../src/core';
import { clickWorld, editableExtension, importProject, project } from './helpers';
import { landscapeSelectionColor } from '../../src/render/selection';
import { PROJECT_STORAGE_KEY } from '../../src/editor/storage';

test.setTimeout(90000);

test('quick actions stay reachable, highlight the selected union and keep the highlight out of PNG', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.export.size = 256;
  config.decoration.enabled = false;
  const tile = generateTile(config);
  const fields = tile.fields.filter((field) => !field.isCenter);
  await page.goto('/');
  await importProject(page, config);
  const png = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
    return readFile((await (await download).path())!);
  };
  const original = await png();
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await page.getByLabel('Spielfeld auswählen').selectOption(fields[0].id);
  await expect(page.locator('canvas')).toHaveAttribute('data-selected-field', fields[0].id);
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-selection-color',
    landscapeSelectionColor(tile),
  );
  await expect(page.locator('canvas')).toHaveAttribute('data-selection-visible', 'true');
  expect((await png()).equals(original)).toBe(true);
  await page.getByLabel('Spielfeld auswählen').selectOption(fields[1].id);
  await expect(page.locator('canvas')).toHaveAttribute('data-selected-field', fields[1].id);
  expect((await png()).equals(original)).toBe(true);
  await page.locator('.inspector-content').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const quick = page.getByRole('complementary', { name: 'Schnellaktionen' });
  await expect(
    quick.getByRole('button', { name: 'Feldform bearbeiten', exact: true }),
  ).toBeInViewport();
  await expect(
    quick.getByRole('button', { name: 'Neues Spielfeld', exact: true }),
  ).toBeInViewport();
  await quick.getByRole('button', { name: 'Feldform bearbeiten', exact: true }).click();
  const lineTools = quick.getByRole('group', { name: 'Feldform nach Rasterlinien' });
  await expect(
    lineTools.getByRole('button', { name: 'Horizontale Rasterlinie hinzufügen' }),
  ).toBeVisible();
  await expect(
    lineTools.getByRole('button', { name: 'Vertikale Rasterlinie hinzufügen' }),
  ).toBeVisible();
  await quick.getByRole('button', { name: 'Platzieren beenden', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('quick-actions.png') });
  await quick.getByRole('button', { name: 'Neues Spielfeld', exact: true }).click();
  await expect(quick.getByRole('button', { name: 'Anwenden', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toHaveCount(1);
  const free = tile.cells.find(
    (cell) =>
      !cell.fieldId &&
      !cell.landscapeOnly &&
      cell.surfacePolygons.length &&
      cell.entranceSide === undefined &&
      cell.centerPort === undefined &&
      Math.hypot(cell.center.x, cell.center.y) < 0.65,
  )!;
  await clickWorld(page, free.center);
  await quick.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Spielfeld erstellt');
  await expect
    .poll(async () =>
      (await project(page)).paths.fields.some(
        (field) => field.cellIds.length === 1 && field.cellIds[0] === free.id,
      ),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
});

for (const width of [1280, 390]) {
  test(`one quick-action sidebar saves small fields without scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const config = structuredClone(defaultConfig);
    config.camera.mode = 'top';
    config.export.size = 256;
    config.decoration.enabled = false;
    const tile = generateTile(config);
    const normalFields = tile.fields.filter((field) => !field.isCenter),
      minimum = Math.min(...normalFields.map((field) => field.area));
    let fixture: { field: GameField; removed: string; threshold: number } | undefined;
    for (const field of [...normalFields].sort((a, b) => a.area - b.area)) {
      for (const removed of field.cellIds) {
        const ids = field.cellIds.filter((id) => id !== removed);
        if (!isConnectedSelection(ids, tile.cells)) continue;
        try {
          const edited = generateTile(prepareFieldShapeEdit(config, tile, field.id, ids)),
            area = edited.fields.find((candidate) => candidate.id === field.id)!.area;
          if (area >= minimum - 1e-10 || !edited.stats.connected) continue;
          // Isolate the configurable area rule: every original field is valid,
          // and this legal one-cell edit crosses the threshold without disconnecting paths.
          const threshold = (minimum + area) / 2,
            rules = { ...config.rules, minFieldArea: threshold },
            issues = evaluateTileRules({ ...config, rules }, edited);
          if (
            issues.length !== 1 ||
            issues[0]!.code !== 'minimum-area' ||
            issues[0]!.fieldId !== field.id
          )
            continue;
          fixture = { field, removed, threshold };
          break;
        } catch {
          /* Preserve fixed mouths and complete portals; try a different interior cell. */
        }
      }
      if (fixture) break;
    }
    expect(fixture).toBeDefined();
    const { field, removed, threshold } = fixture!;
    config.rules.minFieldArea = threshold;
    expect(evaluateTileRules(config, tile)).toEqual([]);
    await page.goto('/');
    await importProject(page, config);
    await editField(page, field.id);
    const quick = page.getByRole('complementary', { name: 'Schnellaktionen' });
    await expect(quick.getByRole('button', { name: 'Anwenden', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toHaveCount(1);
    await clickWorld(page, tile.cells.find((cell) => cell.id === removed)!.center);
    await expect(page.getByTestId('field-shape-feedback')).toContainText('mindestens');
    await expect(quick.getByRole('button', { name: 'Anwenden', exact: true })).toBeEnabled();
    await quick.getByRole('button', { name: 'Anwenden', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Feldform angepasst');
    await expect
      .poll(
        async () =>
          (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.cellIds,
      )
      .not.toContain(removed);
    const saved = await project(page),
      edited = generateTile(saved);
    expect(edited.stats.connected).toBe(true);
    expect(evaluateTileRules(saved, edited)).toMatchObject([
      { code: 'minimum-area', fieldId: field.id },
    ]);
    await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
    await expect(quick).toContainText('Export gesperrt');
    await quick.getByText('Prüfregeln', { exact: true }).click();
    await page.getByLabel('Regelverstöße beim Export').selectOption('warn');
    await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
    await expect(quick).toContainText('Export erlaubt');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
    expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
    await page.getByLabel('Regelverstöße beim Export').selectOption('block');
    await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
    await page.getByLabel('Mindestfläche (% der Kachel)').fill('0');
    await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
    await expect.poll(async () => (await project(page)).rules.minFieldArea).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('field shapes can be applied while a custom object model is unavailable', async ({ page }) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.modelSlots = { tree: 'model-unavailable' };
  const tile = generateTile(config);
  const { field, cell: free } = editableExtension(config, tile);
  config.paths.fields.push({ id: field.id, cellIds: [], action: field.action, label: '' });
  await page.route('**/api/models/model-unavailable', (route) =>
    route.fulfill({ status: 404, json: { error: 'Modell nicht vorhanden.' } }),
  );
  await page.addInitScript((args) => localStorage.setItem(args.key, JSON.stringify(args.value)), {
    key: PROJECT_STORAGE_KEY,
    value: config,
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('konnte nicht geladen werden');
  await expect(page.getByRole('button', { name: 'Modelle laden…', exact: true })).toBeDisabled();
  await editField(page, field.id);
  await clickWorld(page, free.center);
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Feldform angepasst');
  await expect
    .poll(
      async () => (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.cellIds,
    )
    .toContain(free.id);
  expect(generateTile(await project(page)).stats.connected).toBe(true);
});

async function editField(page: Page, id: string) {
  await expect(page.getByTestId('generation-status')).toBeHidden();
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await page.getByLabel('Spielfeld auswählen').selectOption(id);
  await page.getByRole('button', { name: 'Feldform bearbeiten', exact: true }).click();
}

function otherFields(tile: GeneratedTile, id: string) {
  return tile.fields.filter((field) => field.id !== id);
}

for (const source of ['auto', 'complete-seed'] as const) {
  test(`${source} fields can gain and lose raster cells without rebuilding their neighbors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const config =
      source === 'auto' ? structuredClone(defaultConfig) : createSeededProject('wald-123');
    config.camera.mode = 'top';
    config.decoration.enabled = false;
    const initial = generateTile(config);
    const { field, cell: free } = editableExtension(config, initial);
    const metadata = {
      id: field.id,
      cellIds: config.paths.fields.find((edit) => edit.id === field.id)?.cellIds ?? [],
      action: 'shop' as const,
      label: 'Mein bearbeitbares Feld',
      color: '#bf8e64',
      heightOffset: 0.075,
      heightMode: 'terraced' as const,
    };
    config.paths.fields = config.paths.fields.filter((edit) => edit.id !== field.id);
    config.paths.fields.push(metadata);
    const before = generateTile(config);
    await page.goto('/');
    await importProject(page, config);
    await editField(page, field.id);
    await expect(
      page.getByText(`${field.cellIds.length} ausgewählt`, { exact: true }),
    ).toBeVisible();
    await clickWorld(page, free.center);
    await expect(
      page.getByText(`${field.cellIds.length + 1} ausgewählt`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Anwenden',
        exact: true,
      })
      .click();
    await expect(page.getByRole('status')).toContainText('Feldform angepasst.');
    await expect
      .poll(
        async () =>
          (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.cellIds,
      )
      .toContain(free.id);
    const added = await project(page);
    expect(added.paths.auto).toBe(false);
    expect(added.paths.fieldCount).toBe(config.paths.fieldCount);
    expect(added.paths.fields.find((edit) => edit.id === field.id)).toMatchObject({
      ...metadata,
      cellIds: expect.arrayContaining([...field.cellIds, free.id]),
    });
    const expanded = generateTile(added);
    expect(expanded.stats.connected).toBe(true);
    expect(expanded.warnings).toEqual([]);
    expect(otherFields(expanded, field.id)).toEqual(otherFields(before, field.id));

    await page.getByLabel('Rückgängig', { exact: true }).click();
    await expect.poll(() => project(page)).toEqual(config);
    await page.getByLabel('Wiederholen', { exact: true }).click();
    await expect.poll(() => project(page)).toEqual(added);

    await editField(page, field.id);
    await clickWorld(page, free.center);
    await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.cellIds.length,
      )
      .toBe(field.cellIds.length);
    const reduced = await project(page);
    const reducedTile = generateTile(reduced);
    expect(reducedTile.fields.find((candidate) => candidate.id === field.id)?.cellIds).toEqual(
      field.cellIds,
    );
    expect(otherFields(reducedTile, field.id)).toEqual(otherFields(before, field.id));
    expect(reduced.paths.fields.find((edit) => edit.id === field.id)).toMatchObject({
      ...metadata,
      cellIds: field.cellIds,
    });
    await page.reload();
    await expect.poll(() => project(page)).toEqual(reduced);
    await editField(page, field.id);
    await expect(
      page.getByText(`${field.cellIds.length} ausgewählt`, { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

test('entrance interiors can be reshaped while their original middle mouth stays protected', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  const before = generateTile(config);
  const outer = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(before.cells, side))
      .flat()
      .map((cell) => cell.id),
  );
  const entrance = before.entrances[0];
  const field = before.fields.find((field) => field.id === entrance.fieldId)!;
  let pair: { add: string; remove: string } | undefined;
  for (const add of before.cells.filter(
    (cell) =>
      !cell.fieldId &&
      !cell.reserved &&
      !cell.landscapeOnly &&
      !outer.has(cell.id) &&
      cell.neighbors.some((id) => field.cellIds.includes(id)),
  )) {
    for (const remove of field.cellIds.filter((id) => !entrance.cellIds.includes(id))) {
      try {
        const draft = prepareFieldShapeEdit(config, before, field.id, [
          ...field.cellIds.filter((id) => id !== remove),
          add.id,
        ]);
        const result = generateTile(draft);
        if (result.stats.connected && result.warnings.length === 0) {
          pair = { add: add.id, remove };
          break;
        }
      } catch {
        /* Try another locally valid connected shape. */
      }
    }
    if (pair) break;
  }
  expect(pair).toBeDefined();
  await page.goto('/');
  await importProject(page, config);
  await editField(page, field.id);
  await clickWorld(page, before.cells.find((cell) => cell.id === entrance.cellIds[0])!.center);
  await expect(page.getByRole('status')).toContainText('Die mittigen Eingangszellen bleiben fest');
  await expect(page.getByText(`${field.cellIds.length} ausgewählt`, { exact: true })).toBeVisible();
  await clickWorld(page, before.cells.find((cell) => cell.id === pair!.add)!.center);
  await clickWorld(page, before.cells.find((cell) => cell.id === pair!.remove)!.center);
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Feldform angepasst.');
  await expect.poll(async () => (await project(page)).paths.auto).toBe(false);
  const saved = await project(page);
  const edited = saved.paths.fields.find((edit) => edit.id === field.id)!;
  expect(edited.cellIds).toContain(pair!.add);
  expect(edited.cellIds).not.toContain(pair!.remove);
  expect(edited.cellIds).toEqual(expect.arrayContaining(entrance.cellIds));
  const after = generateTile(saved);
  expect(after.stats.connected).toBe(true);
  expect(after.warnings).toEqual([]);
  expect(after.entrances).toEqual(before.entrances);
  expect(otherFields(after, field.id)).toEqual(otherFields(before, field.id));
  await editField(page, field.id);
  await page.getByRole('button', { name: 'Auswahl aufheben', exact: true }).click();
  await expect(
    page.getByText(`${entrance.cellIds.length} ausgewählt`, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Platzieren beenden', exact: true }).click();
  expect(await project(page)).toEqual(saved);
});

test('foreign cells stay protected while disconnected fields can be saved with warnings', async ({
  page,
}) => {
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  const tile = generateTile(config);
  const field = tile.fields.find((field) => !field.isCenter)!;
  const foreign = tile.cells.find(
    (cell) => cell.fieldId && cell.fieldId !== field.id && !cell.reserved,
  )!;
  const outer = new Set(
    Array.from({ length: 6 }, (_, side) => boundaryCells(tile.cells, side)).flatMap((cells) =>
      cells.map((cell) => cell.id),
    ),
  );
  const distant = tile.cells.find(
    (cell) =>
      !cell.fieldId &&
      !cell.reserved &&
      !cell.landscapeOnly &&
      !outer.has(cell.id) &&
      !cell.neighbors.some((id) => field.cellIds.includes(id)) &&
      cell.centerPort === undefined,
  )!;
  await page.goto('/');
  await importProject(page, config);
  await editField(page, field.id);
  await clickWorld(page, foreign.center);
  await expect(page.getByRole('status')).toContainText('gehört zu einem anderen Spielfeld');
  await expect(page.getByText(`${field.cellIds.length} ausgewählt`, { exact: true })).toBeVisible();
  await clickWorld(page, distant.center);
  await expect(page.getByTestId('field-shape-feedback')).toContainText('nicht zusammenhängend');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Feldform angepasst');
  await expect
    .poll(
      async () => (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.cellIds,
    )
    .toContain(distant.id);
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
  await page
    .getByRole('complementary', { name: 'Schnellaktionen' })
    .getByText('Prüfregeln', { exact: true })
    .click();
  await page.getByRole('checkbox', { name: 'Felder müssen zusammenhängen', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Wegenetz muss verbunden sein', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  await expect
    .poll(async () => (await project(page)).rules)
    .toMatchObject({ requireFieldConnectivity: false, requirePathConnectivity: false });
  const saved = await project(page);
  expect(
    generateTile(saved).fields.find((candidate) => candidate.id === field.id)?.cellIds,
  ).toContain(distant.id);
  await editField(page, field.id);
  await page.keyboard.press('Escape');
  expect(await project(page)).toEqual(saved);
});

test('switching layers cancels a pending shape validation before its worker reply arrives', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pending: (() => void)[] = [];
    window.Worker = new Proxy(window.Worker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        worker.addEventListener('message', (event) => {
          if (document.documentElement.dataset.holdWorkerReply !== 'true') return;
          event.stopImmediatePropagation();
          pending.push(() =>
            worker.dispatchEvent(new MessageEvent('message', { data: event.data })),
          );
          document.documentElement.dataset.workerReplyHeld = 'true';
        });
        return worker;
      },
    });
    window.addEventListener('release-test-worker', () => {
      delete document.documentElement.dataset.holdWorkerReply;
      for (const release of pending.splice(0)) release();
    });
  });
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.decoration.enabled = false;
  const tile = generateTile(config);
  const field = tile.fields.find((field) => !field.isCenter)!;
  const free = tile.cells.find(
    (cell) =>
      !cell.fieldId &&
      !cell.reserved &&
      !cell.landscapeOnly &&
      cell.entranceSide === undefined &&
      cell.centerPort === undefined &&
      cell.neighbors.some((id) => field.cellIds.includes(id)),
  )!;
  await page.goto('/');
  await importProject(page, config);
  await editField(page, field.id);
  await clickWorld(page, free.center);
  await page.evaluate(() => {
    document.documentElement.dataset.holdWorkerReply = 'true';
  });
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-worker-reply-held', 'true');
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Auswahl aufheben', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-test-worker')));
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Landschaft', exact: true })).toBeVisible();
  expect(await project(page)).toEqual(config);
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toHaveCount(0);
});
