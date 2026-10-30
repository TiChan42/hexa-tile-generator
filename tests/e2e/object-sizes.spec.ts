import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import {
  biomeObjectSizeProfiles,
  defaultConfig,
  generateTile,
  pointInPolygon,
} from '../../src/core';
import type { DecorationKind } from '../../src/core';
import { importProject, project } from './helpers';

test('species sizes and variation update placed objects, PNG and GLB; biome profiles persist and undo preserves edits', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const config = structuredClone(defaultConfig);
  config.export.size = 256;
  config.camera.mode = 'top';
  config.decoration.density = 0;
  const tile = generateTile(config);
  const cells = tile.cells.filter(
    (cell) =>
      !cell.fieldId &&
      !cell.reserved &&
      Math.hypot(cell.center.x, cell.center.y) < 0.7 &&
      cell.surfacePolygons.some((polygon) => pointInPolygon(cell.center, polygon)),
  );
  config.decoration.placements = (['tree', 'mushrooms', 'rock', 'quartz'] as DecorationKind[]).map(
    (kind, index) => ({
      id: `sized-${kind}`,
      kind,
      cellId: cells[index]!.id,
      offset: { x: 0, y: 0 },
      scale: 0.7,
      rotation: 0,
    }),
  );
  await importProject(page, config);
  const before = await project(page);
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const png = await download('PNG exportieren');
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await page.getByLabel('Größenprofil', { exact: true }).selectOption('tree');
  await page.getByRole('slider', { name: 'Basisgröße der Art', exact: true }).press('End');
  await expect.poll(async () => (await project(page)).decoration.sizeProfiles.tree.scale).toBe(3);
  await page
    .getByRole('slider', { name: 'Individuelle Größenschwankung', exact: true })
    .press('Home');
  await expect
    .poll(async () => (await project(page)).decoration.sizeProfiles.tree.variation)
    .toBe(0);
  await expect(page.getByTestId('generation-status')).toBeHidden();
  const edited = await project(page);
  expect(edited.decoration.placements).toEqual(before.decoration.placements);
  expect(edited.paths).toEqual(before.paths);
  expect(edited.terrain).toEqual(before.terrain);
  expect((await download('PNG exportieren')).equals(png)).toBe(false);

  await page.getByRole('button', { name: /Export Bereit/ }).click();
  const model = await download('3D-Modell (GLB) herunterladen');
  const json = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12))) as {
    nodes: { matrix?: number[]; mesh?: number; children?: number[] }[];
  };
  for (const object of generateTile(edited).decorations) {
    // Baked texture meshes inherit their instance transform from a parent group.
    // Instanced rendering stores this transform in Float32, which the GLB preserves exactly.
    const node = json.nodes.find(
      ({ matrix }) =>
        matrix &&
        matrix[12] === Math.fround(object.position.x) &&
        matrix[14] === Math.fround(object.position.y),
    );
    expect(node).toBeDefined();
    const size = Math.fround(object.scale);
    expect(node!.matrix).toEqual([
      size,
      0,
      0,
      0,
      0,
      size,
      0,
      0,
      0,
      0,
      size,
      0,
      Math.fround(object.position.x),
      Math.fround(object.height),
      Math.fround(object.position.y),
      1,
    ]);
    expect(node!.children?.some((index) => json.nodes[index]!.mesh !== undefined)).toBe(true);
  }

  await page.getByRole('button', { name: /Landschaft Höhen/ }).click();
  await page
    .getByRole('button', { name: 'Biomprofil Pilz-Kristallgrotte anwenden', exact: true })
    .click();
  await expect
    .poll(async () => (await project(page)).decoration.sizeProfiles)
    .toEqual(biomeObjectSizeProfiles('pilzkristallgrotte'));
  const cave = await project(page);
  expect(cave.paths.fields).toEqual(before.paths.fields);
  expect(cave.decoration.placements.map(({ id }) => id)).toEqual([
    'sized-mushrooms',
    'sized-quartz',
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(async () => await project(page)).toEqual(edited);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect.poll(async () => await project(page)).toEqual(cave);
  await page.reload();
  expect((await project(page)).decoration.sizeProfiles).toEqual(
    biomeObjectSizeProfiles('pilzkristallgrotte'),
  );
  expect(errors).toEqual([]);
});
