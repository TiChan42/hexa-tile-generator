import { preV11Materials } from '../fixtures/migration';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  configSchema,
  defaultConfig,
  generateTile,
  decorationSlots,
  createSeededProject,
  DECORATION_CATALOG,
} from '../../src/core';
import { clickWorld, editableExtension, importProject, project } from './helpers';
import legacyV1 from '../fixtures/v1.json' with { type: 'json' };
import { buildTileSurfaces } from '../../src/render/surfaces';
test.setTimeout(60000);

test('editor renders, edits seed, supports undo, gradients, grid and autosave', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  const software =
    process.platform !== 'darwin' ||
    !!process.env.CI ||
    process.env.PLAYWRIGHT_SOFTWARE_GPU === '1';
  await expect(page.locator('canvas')).toHaveAttribute('data-pixel-ratio', software ? '0.5' : '1');
  await expect(page.getByText('3D-Vorschau nicht verfügbar')).toHaveCount(0);
  await expect(
    page.getByText(`GENERATOR ${defaultConfig.generatorVersion}`, { exact: true }),
  ).toBeVisible();
  expect((await project(page)).grid.divisions).toBe(18);
  await page.getByLabel('Seed', { exact: true }).fill('regression-42');
  await expect.poll(async () => (await project(page)).seed).toBe('regression-42');
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect(page.getByLabel('Seed', { exact: true })).toHaveValue(defaultConfig.seed);
  await page.getByLabel('Wiederholen', { exact: true }).click();
  await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('regression-42');
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('button', { name: 'Farbstopp', exact: true }).first().click();
  await expect(page.getByLabel('Höhenfarben Farbe 5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Raster Die Grundlage/ }).click();
  await page.getByRole('button', { name: 'Rauten', exact: true }).click();
  await expect(page.getByText(/Rautenraster ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Draufsicht', exact: true }).click();
  await expect.poll(async () => (await project(page)).grid.kind).toBe('diamond');
  await page.reload();
  await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('regression-42');
  expect(errors).toEqual([]);
});

test('mobile layout fits a narrow screen and renders a complete preview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('manual field placement, field actions and subgrid objects survive JSON round trip', async ({
  page,
}) => {
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.paths.auto = false;
  config.grid.divisions = 10;
  config.decoration.density = 0;
  config.camera.mode = 'top';
  await importProject(page, config);
  const tile = generateTile(config);
  const first = tile.cells.find(
    (c) =>
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined &&
      c.center.x > 0.25 &&
      c.center.x < 0.5 &&
      Math.abs(c.center.y) < 0.16,
  )!;
  const second = tile.cells.find(
    (c) =>
      first.neighbors.includes(c.id) &&
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined,
  )!;
  const third = tile.cells.find(
    (c) =>
      c.id !== first.id &&
      second.neighbors.includes(c.id) &&
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined &&
      c.polygon.length === 6,
  )!;
  await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
  await page.getByRole('button', { name: 'Neues Spielfeld', exact: true }).click();
  await clickWorld(page, first.center);
  await clickWorld(page, second.center);
  await expect(page.getByText('2 ausgewählt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toBeEnabled();
  await clickWorld(page, third.center);
  await expect(page.getByText('3 ausgewählt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Feldaktionen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Laden', exact: true }).click();
  await page.getByLabel('Feldbeschriftung', { exact: true }).fill('');
  await page.getByLabel('Feldbeschriftung', { exact: true }).pressSequentially('Waldladen');
  const color = page.getByLabel('Feldfarbe Hexwert', { exact: true });
  await color.fill('#c18394');
  await color.press('Tab');
  await expect
    .poll(
      async () => (await project(page)).paths.fields.find((f) => f.label === 'Waldladen')?.color,
    )
    .toBe('#c18394');
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await page.getByRole('button', { name: 'Objekte platzieren', exact: true }).click();
  const free = tile.cells.find(
    (c) =>
      c.id !== first.id &&
      c.id !== second.id &&
      !c.reserved &&
      c.center.x < -0.3 &&
      c.center.x > -0.65 &&
      Math.abs(c.center.y) < 0.25,
  )!;
  const slots = decorationSlots(free, config.grid)
    .filter((slot) => Math.abs(slot.position.y - free.center.y) < 0.04)
    .sort((a, b) => a.position.x - b.position.x);
  await clickWorld(page, slots[1].position);
  await clickWorld(page, slots.at(-2)!.position);
  await expect.poll(async () => (await project(page)).decoration.placements.length).toBe(2);
  const saved = await project(page);
  const field = generateTile(saved).fields.find((field) => field.label === 'Waldladen')!;
  await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
  await page.getByRole('button', { name: 'Neues Spielfeld', exact: true }).click();
  await clickWorld(page, field.center);
  await expect(page.getByRole('status')).toContainText('gehört zu einem anderen Spielfeld');
  await expect(page.getByText('0 ausgewählt', { exact: true })).toBeVisible();
  expect(generateTile(saved).decorations).toHaveLength(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Konfiguration speichern', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const parsed = configSchema.parse(JSON.parse(await readFile(path!, 'utf8')));
  expect(generateTile(parsed)).toEqual(generateTile(saved));
  await page.getByLabel('Konfiguration importieren').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole('status')).toContainText('Ungültige Konfiguration');
});

test('PNG is stable, correctly sized, transparent and saved with config to working', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.name = `browser-abnahme-${randomUUID()}`;
  config.seed = 'browser-export';
  config.export.size = 512;
  config.camera.mode = 'top';
  await importProject(page, config);
  const previewRatio = await page.locator('canvas').getAttribute('data-pixel-ratio');
  async function png() {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
    const downloaded = await waiting;
    return readFile((await downloaded.path())!);
  }
  const first = await png();
  const second = await png();
  await expect(page.locator('canvas')).toHaveAttribute('data-pixel-ratio', previewRatio!);
  expect(first.equals(second)).toBe(true);
  expect(first.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(first.readUInt32BE(16)).toBe(512);
  expect(first.readUInt32BE(20)).toBe(512);
  const alpha = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return {
      corner: ctx.getImageData(0, 0, 1, 1).data[3],
      center: ctx.getImageData(256, 256, 1, 1).data[3],
    };
  }, first.toString('base64'));
  expect(alpha).toEqual({ corner: 0, center: 255 });
  await page.getByRole('button', { name: /Export Bereit/ }).click();
  await page.getByRole('button', { name: 'Im Working-Ordner speichern', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/Gespeichert|Bereits gespeichert/);
  const list = (await (await request.get('/api/tiles')).json()) as {
    id: string;
    name: string;
    pngUrl: string;
    generatorVersion: string;
  }[];
  const saved = list.find(
    (item) => item.name === config.name && item.generatorVersion === config.generatorVersion,
  )!;
  expect(saved).toBeTruthy();
  const returned = configSchema.parse(await (await request.get(`/api/tiles/${saved.id}`)).json());
  expect(returned).toEqual(config);
  const savedPng = await request.get(saved.pngUrl);
  expect(savedPng.ok()).toBe(true);
  expect((await savedPng.body()).equals(first)).toBe(true);
  await page.getByRole('button', { name: 'Meine Tiles', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .locator('button')
    .filter({ has: page.locator(`img[src="${saved.pngUrl}"]`) })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('voxel JSON imports, normalizes and persists model assignment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  // File input is visually hidden by its accessible label, so select by parent instead.
  await page.locator('.file-button input').setInputFiles({
    name: 'voxel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        name: 'Browser Baum',
        size: [4, 6, 4],
        palette: ['#326c44'],
        voxels: [
          [1, 1, 1, 0],
          [1, 2, 1, 0],
          [2, 1, 1, 0],
        ],
      }),
    ),
  });
  await expect(page.getByRole('status')).toContainText('importiert und normalisiert');
  await expect(page.getByLabel('Modell zuweisen')).toHaveValue(/^model-/);
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await expect
    .poll(async () => (await project(page)).decoration.modelSlots?.tree)
    .toMatch(/^model-/);
});

test('right-button orbit and zoom can be captured; signed perspective stays centered overhead', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.export.size = 256;
  config.decoration.density = 0;
  await importProject(page, config);
  async function png() {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG exportieren', exact: true }).click();
    return readFile((await (await waiting).path())!);
  }
  const before = await png();
  const bounds = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.6);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.68, {
    steps: 12,
  });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -300);
  const after = await png();
  expect(before.equals(after)).toBe(true);
  await page.getByRole('button', { name: 'Ansicht übernehmen', exact: true }).click();
  await expect
    .poll(async () => (await project(page)).camera.azimuth)
    .not.toBe(config.camera.azimuth);
  await expect.poll(async () => (await project(page)).camera.zoom).not.toBe(config.camera.zoom);
  const captured = await png();
  expect(before.equals(captured)).toBe(false);
  await page.getByRole('button', { name: /Export Bereit/ }).click();
  for (const fov of [-60, 0, 55]) {
    await page.getByLabel('Exportprojektion').selectOption('perspective');
    const variant = await project(page);
    variant.camera.mode = 'perspective';
    variant.camera.fov = fov;
    variant.camera.elevation = fov === 0 ? -55 : 45;
    await importProject(page, variant);
    const image = await png();
    expect(image.readUInt32BE(16)).toBe(256);
    const visiblePixels = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const bytes = context.getImageData(0, 0, 256, 256).data;
      let count = 0;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i] > 0) count++;
      return count;
    }, image.toString('base64'));
    expect(visiblePixels).toBeGreaterThan(6000);
    const sameProjection = structuredClone(variant);
    sameProjection.camera.azimuth = 123;
    sameProjection.camera.elevation = -70;
    sameProjection.camera.zoom = 2.4;
    await importProject(page, sameProjection);
    expect((await png()).equals(image)).toBe(true);
  }
});

test('full seed generation is repeatable, editable in field shape and material layers, and undoable', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  const base = structuredClone(defaultConfig);
  base.camera.mode = 'top';
  base.export.size = 512;
  await importProject(page, base);
  await page.getByLabel('Seed', { exact: true }).fill('wald-123');
  await page.getByRole('button', { name: 'Komplett aus Seed generieren', exact: true }).click();
  const expected = createSeededProject('wald-123', {
    camera: base.camera,
    export: base.export,
    fieldCount: base.paths.fieldCount,
    grid: base.grid,
    heightMode: base.paths.heightMode,
    centerPortalWidth: base.center.portalWidth,
  });
  await expect.poll(async () => await project(page)).toEqual(expected);
  const generated = generateTile(expected);
  const { field, cell: free } = editableExtension(expected, generated);
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await page.getByLabel('Spielfeld auswählen').selectOption(field.id);
  await page.getByLabel('Feldbeschriftung').fill('Mein Seed-Feld');
  await page.getByRole('button', { name: 'Feldform bearbeiten', exact: true }).click();
  await clickWorld(page, free.center);
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect
    .poll(
      async () => (await project(page)).paths.fields.find((f) => f.id === field.id)?.cellIds.length,
    )
    .toBe(field.cellIds.length + 1);
  await page.getByRole('button', { name: 'Feldform bearbeiten', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Neues Spielfeld', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anwenden', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await page.getByLabel('Gesetztes Objekt').selectOption(expected.decoration.placements[0].id);
  await page.getByRole('slider', { name: 'Objektdrehung', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).decoration.placements[0].rotation).toBe(360);
  await page.getByRole('button', { name: 'Komplett aus Seed generieren', exact: true }).click();
  await expect.poll(async () => await project(page)).toEqual(expected);
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect
    .poll(async () => (await project(page)).paths.fields.find((f) => f.id === field.id)?.label)
    .toBe('Mein Seed-Feld');
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('slider', { name: 'Grobes Perlin · Stärke', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).terrain.texture.strength).toBe(0.4);
  await page.getByRole('slider', { name: 'Feines Perlin · Stärke', exact: true }).press('Home');
  await expect.poll(async () => (await project(page)).terrain.texture.detailStrength).toBe(0);
  await page.getByRole('button', { name: /Raster Die Grundlage/ }).click();
  await page.getByRole('button', { name: 'Rauten', exact: true }).click();
  await expect.poll(async () => (await project(page)).paths.auto).toBe(true);
  await expect
    .poll(async () => (await project(page)).decoration.density)
    .toBe(expected.decoration.sourceDensity);
  await expect(page.getByText('Wege verbunden', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('legacy browser projects migrate with an explicit notice and keep their presentation options', async ({
  page,
}) => {
  const legacy = structuredClone(legacyV1);
  await page.addInitScript(
    (value) => localStorage.setItem('hexa-studio-project-v1', JSON.stringify(value)),
    legacy,
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Projekt auf Generator 18 umgestellt');
  const migrated = await project(page);
  expect(migrated.schemaVersion).toBe(18);
  expect(migrated.center.shape).toBe('regular');
  expect(migrated.export).toEqual(defaultConfig.export);
  await expect(page.locator('canvas')).toBeVisible();
});

test('field count, offset, path details and forests stay responsive with bounded draw calls', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.grid.divisions = 18;
  config.grid.showGrid = false;
  config.decoration.density = 0.85;
  config.decoration.maxPerCell = 8;
  config.decoration.species = DECORATION_CATALOG.map((object) => object.kind);
  config.paths.fieldCount = 15;
  config.export.size = 256;
  config.center.offset = { x: 0.18, y: -0.16 };
  await importProject(page, config);
  const canvas = page.locator('canvas');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-draw-calls')))
    .toBeGreaterThan(0);
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(40);
  const revision = await canvas.getAttribute('data-geometry-revision');
  expect(revision).not.toBeNull();
  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page.getByRole('slider', { name: 'Grobes Perlin · Stärke', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).terrain.texture.strength).toBe(0.4);
  expect(await canvas.getAttribute('data-geometry-revision')).toBe(revision);
  await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
  await page.getByRole('slider', { name: 'Anzahl Spielfelder', exact: true }).press('Home');
  await page.getByRole('slider', { name: 'Anzahl Spielfelder', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await project(page)).paths.fieldCount).toBe(8);
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  const tile = generateTile(await project(page));
  expect(tile.fields).toHaveLength(8);
  expect(tile.entrances.every((entrance) => entrance.fieldId !== null)).toBe(true);
  expect(tile.stats.connected).toBe(true);
  await page.getByRole('slider', { name: 'Kiesel am Wegrand', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).paths.detail.pebbleDensity).toBe(1);
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await page.getByRole('slider', { name: 'Objekte je Rasterzelle', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).decoration.maxPerCell).toBe(12);
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(40);
  expect(errors).toEqual([]);
});

for (const version of [4, 5, 6, 7, 8, 9] as const) {
  test(`V${version} autosaves retain edited fields, elevations and objects in the current editor`, async ({
    page,
  }) => {
    const expected = structuredClone(defaultConfig);
    expected.legacyLayout = true;
    expected.name = `V${version} bearbeitet`;
    expected.decoration.colorProfiles.trees.enabled = false;
    expected.decoration.colorProfiles.mushrooms.enabled = false;
    expected.export.size = 256;
    expected.decoration.species =
      version >= 5
        ? DECORATION_CATALOG.map((object) => object.kind)
        : ['tree', 'pine', 'oak', 'birch', 'deadTree', 'bush', 'rock', 'crystal'];
    expected.decoration.density = 0;
    const original = generateTile(expected);
    expected.paths.auto = false;
    expected.paths.fields = original.fields.map((field) => ({
      id: field.id,
      cellIds: field.isCenter ? [] : [...field.cellIds],
      action: field.action,
    }));
    Object.assign(
      expected.paths.fields.find((field) => field.id !== 'center')!,
      {
        action: 'shop',
        color: '#ae735a',
        label: 'Mein Waldladen',
        heightOffset: 0.065,
        heightMode: 'terraced',
      },
    );
    const free = original.cells.find(
      (cell) => !cell.fieldId && !cell.reserved && cell.polygon.length === 6,
    )!;
    expected.decoration.placements = [
      {
        id: `v${version}-crystal`,
        kind: version >= 5 ? 'quartz' : 'crystal',
        cellId: free.id,
        offset: { x: 0, y: 0 },
        scale: 0.8,
        rotation: 37,
      },
    ];
    const { legacyLayout, rules, border, editing, actions, ...historical } = expected;
    void legacyLayout;
    void editing;
    void actions;
    const legacy = {
      ...historical,
      ...preV11Materials(expected),
      ...(version >= 8 ? { rules } : {}),
      ...(version >= 9 ? { border } : {}),
      schemaVersion: version,
      generatorVersion: `${version}.0.0`,
      paths: { ...expected.paths, ...(version < 6 ? { transitionWidth: 0.045 } : {}) },
    };
    const key = `hexa-studio-project-v${version}`;
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key,
      value: legacy,
    });
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('Projekt auf Generator 18 umgestellt');
    expect(await project(page)).toEqual({ ...expected, actionRecipe: 16 });
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(
      legacy,
    );
    await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  });
}

test('the expanded object library previews, filters and places both crystal models', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.grid.divisions = 10;
  config.camera.mode = 'top';
  config.decoration.density = 0;
  config.decoration.species = DECORATION_CATALOG.map((object) => object.kind);
  config.export.size = 256;
  await importProject(page, config);
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  for (const object of DECORATION_CATALOG) {
    const card = page.getByRole('button', { name: object.label, exact: true });
    await expect(card).toHaveCount(1);
    await expect
      .poll(() => card.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.getByRole('checkbox', { name: object.label, exact: true })).toBeChecked();
  }
  expect(await page.locator('canvas').count()).toBe(1);
  const search = page.getByRole('searchbox', { name: 'Objekte durchsuchen', exact: true });
  await search.fill('Amethystgruppe');
  await page.getByRole('button', { name: 'Amethystgruppe', exact: true }).click();
  await page.getByRole('button', { name: 'Objekte platzieren', exact: true }).click();
  const tile = generateTile(config);
  const cell = tile.cells.find(
    (cell) =>
      !cell.fieldId &&
      !cell.reserved &&
      cell.polygon.length === 6 &&
      decorationSlots(cell, config.grid).length >= 3,
  )!;
  // Pick interior slots: a point exactly on a cell corner can belong to its neighboring field.
  const slots = decorationSlots(cell, config.grid)
    .filter((slot) => Math.abs(slot.offset.x) < 0.9 && Math.abs(slot.offset.y) < 0.9)
    .sort((a, b) => a.position.x - b.position.x);
  await clickWorld(page, slots[1]!.position);
  await expect
    .poll(async () => (await project(page)).decoration.placements.map((object) => object.kind))
    .toEqual(['crystal']);
  await search.fill('Bergkristall');
  await expect(page.getByRole('button', { name: 'Amethystgruppe', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bergkristall', exact: true }).click();
  await clickWorld(page, slots.at(-2)!.position);
  await expect
    .poll(async () => (await project(page)).decoration.placements.map((object) => object.kind))
    .toEqual(['crystal', 'quartz']);
  await search.fill('nichts-gefunden');
  await expect(page.getByRole('button', { name: 'Bergkristall', exact: true })).toHaveCount(0);
  await search.clear();
  await expect(page.getByRole('button', { name: 'Bergkristall', exact: true })).toHaveCount(1);
  const saved = await project(page);
  await importProject(page, saved);
  expect((await project(page)).decoration).toEqual(saved.decoration);
  await page.screenshot({ path: test.info().outputPath('object-library.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('a late complete seed recipe preserves newer edits and releases the worker queue', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: StructuredSerializeOptions | Transferable[],
    ) {
      const args = options === undefined ? [message] : [message, options];
      if ((message as { input?: { kind?: string } }).input?.kind === 'project')
        window.setTimeout(() => Reflect.apply(send, this, args), 500);
      else Reflect.apply(send, this, args);
    };
  });
  await page.goto('/');
  await importProject(page, structuredClone(defaultConfig));
  await page.getByRole('button', { name: 'Komplett aus Seed generieren', exact: true }).click();
  await page.getByLabel('Seed', { exact: true }).fill('newer-edit');
  await expect(page.getByRole('status')).toContainText('inzwischen geändert');
  await expect.poll(async () => (await project(page)).seed).toBe('newer-edit');
  expect((await project(page)).paths.auto).toBe(true);
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
});

test('Escape cancels a field commit that is still being validated', async ({ page }) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: StructuredSerializeOptions | Transferable[],
    ) {
      const request = message as {
        input?: { kind?: string; config?: { paths: { fields: { id: string }[] } } };
      };
      const args = options === undefined ? [message] : [message, options];
      if (
        request.input?.kind === 'tile' &&
        request.input.config?.paths.fields.some((f) => f.id.startsWith('field-'))
      )
        window.setTimeout(() => Reflect.apply(send, this, args), 500);
      else Reflect.apply(send, this, args);
    };
  });
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.paths.auto = false;
  config.grid.divisions = 10;
  config.camera.mode = 'top';
  config.decoration.density = 0;
  await importProject(page, config);
  const tile = generateTile(config);
  const first = tile.cells.find(
    (c) =>
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined &&
      c.center.x > 0.25 &&
      c.center.x < 0.5 &&
      Math.abs(c.center.y) < 0.16,
  )!;
  const second = tile.cells.find(
    (c) =>
      first.neighbors.includes(c.id) &&
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined,
  )!;
  const third = tile.cells.find(
    (c) =>
      c.id !== first.id &&
      second.neighbors.includes(c.id) &&
      !c.reserved &&
      !c.landscapeOnly &&
      c.entranceSide === undefined &&
      c.polygon.length === 6,
  )!;
  await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
  await page.getByRole('button', { name: 'Neues Spielfeld', exact: true }).click();
  for (const cell of [first, second, third]) await clickWorld(page, cell.center);
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.main-workspace')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
  expect((await project(page)).paths.fields).toEqual([]);
});

test('a blocked Worker shows an actionable error without crashing the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Worker blockiert');
      }
    } as unknown as typeof Worker;
  });
  await page.goto('/');
  await expect(page.getByText('Worker blockiert', { exact: true })).toBeVisible();
  await expect(page.getByTestId('generation-status')).toBeHidden();
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('center portals keep landscape corners and fields support editable terraces', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.camera.mode = 'top';
  config.export.size = 256;
  await importProject(page, config);
  await page.getByRole('button', { name: /Wege Verbindungen/ }).click();
  await expect(
    page.getByRole('slider', { name: 'Übergang zum Pentagon', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('slider', { name: 'Breite der Pentagon-Anschlüsse', exact: true })
    .press('Home');
  await expect.poll(async () => (await project(page)).center.portalWidth).toBe(0.25);
  await page.getByLabel('Standard-Höhenprofil', { exact: true }).selectOption('terraced');
  await expect.poll(async () => (await project(page)).paths.heightMode).toBe('terraced');
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  const initial = generateTile(await project(page));
  expect(initial.cells.filter((cell) => cell.landscapeOnly).every((cell) => !cell.fieldId)).toBe(
    true,
  );
  expect(
    initial.center.sides.every(
      (side) =>
        Math.hypot(side.portalEnd.x - side.portalStart.x, side.portalEnd.y - side.portalStart.y) <
        Math.hypot(side.end.x - side.start.x, side.end.y - side.start.y) * 0.3,
    ),
  ).toBe(true);
  const field = initial.fields.find(
    (field) =>
      !field.isCenter &&
      !initial.entrances.some((entrance) => entrance.fieldId === field.id) &&
      field.maxHeight > field.height + 0.001,
  )!;
  expect(field).toBeDefined();
  await page.getByRole('button', { name: /Feldaktionen Dem Spiel/ }).click();
  await page.getByLabel('Spielfeld auswählen').selectOption(field.id);
  await page.getByRole('slider', { name: 'Feldhöhe · Versatz', exact: true }).press('End');
  await page.getByRole('slider', { name: 'Feldhöhe · Versatz', exact: true }).press('ArrowLeft');
  await expect
    .poll(
      async () =>
        (await project(page)).paths.fields.find((edit) => edit.id === field.id)?.heightOffset,
    )
    .toBe(0.295);
  await expect(page.getByTestId('generation-status')).toBeHidden({ timeout: 30000 });
  const current = await project(page);
  const final = generateTile(current),
    raised = final.fields.find((value) => value.id === field.id)!;
  expect(raised.height).toBeCloseTo(field.height + 0.295, 10);
  expect(raised.maxHeight).toBeCloseTo(field.maxHeight + 0.295, 10);
  expect(raised.cellIds).toEqual(field.cellIds);
  const surface = buildTileSurfaces(final, current).geometry;
  const normals = surface.getAttribute('normal');
  let sloped = 0,
    vertical = 0;
  for (let index = 0; index < normals.count; index += 3) {
    const y = Math.abs(normals.getY(index));
    if (y < 1e-6) vertical++;
    else if (Math.abs(y - 1) > 1e-6) sloped++;
  }
  expect(vertical).toBeGreaterThan(0);
  expect(sloped).toBe(0);
  surface.dispose();
  await page.getByRole('button', { name: '3D-Ansicht', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  const icon = page.locator('.action-card img').first();
  await expect
    .poll(async () => icon.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(288);
});
