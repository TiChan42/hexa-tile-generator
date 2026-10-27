import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { defaultConfig, generateTile, type BulkProject } from '../../src/core';
import { buildTileSurfaces } from '../../src/render/surfaces';
import { BULK_STORAGE_KEY } from '../../src/editor/bulkStorage';
import { importProject, project } from './helpers';

interface Gltf {
  nodes: {
    name?: string;
    mesh?: number;
    children?: number[];
    matrix?: number[];
    extras?: { tileId: string };
  }[];
  meshes: {
    primitives: {
      attributes: { POSITION: number; NORMAL: number; COLOR_0?: number; TEXCOORD_0?: number };
    }[];
  }[];
  accessors: { count: number; min?: number[]; max?: number[] }[];
  images?: { bufferView: number; mimeType: string }[];
  extensionsRequired?: string[];
  cameras?: unknown[];
}
function glb(bytes: Uint8Array): Gltf {
  const buffer = Buffer.from(bytes);
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);
  expect(buffer.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12))) as Gltf;
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const result = await pending;
  return { name: result.suggestedFilename(), bytes: await readFile((await result.path())!) };
}
function fixture(): BulkProject {
  const tiles = Array.from({ length: 3 }, (_, index) => {
    const config = structuredClone(defaultConfig);
    config.name = `Export-Kachel ${index + 1}`;
    config.seed = `model-export-${index}`;
    config.export = { size: 128, transparent: true };
    config.terrain.noise.seed = config.seed;
    config.rules.exportPolicy = 'warn';
    config.decoration.density = 0.04;
    return { id: `tile-${index}`, biomeId: null, config };
  });
  return {
    version: 4,
    seed: 'model-export',
    rows: 1,
    columns: 3,
    continuousNoise: false,
    uniformGrid: true,
    uniformBorder: true,
    biomeMode: 'random',
    biomeId: 'mosslight',
    gridTemplate: structuredClone(defaultConfig.grid),
    borderTemplate: structuredClone(defaultConfig.border),
    tiles,
    order: ['tile-1', 'tile-0', 'tile-2'],
    shuffleRevision: 1,
  };
}

test('single GLB contains terrain, vertical walls, colored objects and embedded action icons', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const config = fixture().tiles[0]!.config;
  await importProject(page, config);
  const before = await project(page);
  const tile = generateTile(before);
  const surfaces = buildTileSurfaces(tile, before).geometry;
  await page.getByRole('button', { name: /Export Bereit/ }).click();
  const result = await download(page, '3D-Modell (GLB) herunterladen');
  expect(result.name).toMatch(/\.glb$/);
  const model = glb(result.bytes);
  expect(model.extensionsRequired ?? []).not.toContain('EXT_mesh_gpu_instancing');
  expect(model.cameras).toBeUndefined();
  expect(model.images!.length).toBeGreaterThan(0);
  expect(model.images!.every((image) => image.mimeType === 'image/png')).toBe(true);
  const terrainGroup = model.nodes.find((node) => node.name === 'Terrain und Spielfelder')!;
  const terrainParts = terrainGroup.children!.flatMap(
    (index) => model.meshes[model.nodes[index]!.mesh!]!.primitives,
  );
  expect(
    terrainParts.reduce((sum, part) => sum + model.accessors[part.attributes.POSITION]!.count, 0),
  ).toBe(surfaces.getAttribute('position').count);
  for (const { attributes } of terrainParts) {
    expect(model.accessors[attributes.NORMAL]!.count).toBe(
      model.accessors[attributes.POSITION]!.count,
    );
    expect(attributes.TEXCOORD_0).toBeDefined();
    expect(attributes.COLOR_0).toBeUndefined();
  }
  expect(model.nodes.filter((node) => node.mesh !== undefined).length).toBeGreaterThan(
    tile.decorations.length,
  );
  const roundTrip = await page.evaluate(async (base64) => {
    const url = '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
    const { GLTFLoader } = await import(/* @vite-ignore */ url);
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const loaded = await new GLTFLoader().parseAsync(bytes.buffer, '');
    let meshes = 0;
    loaded.scene.traverse((object: { isMesh?: boolean; isLine?: boolean }) => {
      if (object.isMesh || object.isLine) meshes++;
    });
    return { meshes };
  }, result.bytes.toString('base64'));
  expect(roundTrip.meshes).toBe(model.nodes.filter((node) => node.mesh !== undefined).length);
  expect(await project(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled();
  surfaces.dispose();
  const blocked = structuredClone(before);
  blocked.rules.minFieldArea = 0.5;
  blocked.rules.exportPolicy = 'block';
  await importProject(page, blocked);
  await expect(
    page.getByRole('button', { name: '3D-Modell (GLB) herunterladen', exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test('series GLBs include each tile and the ordered whole board; every image view includes an overview', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const series = fixture();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: BULK_STORAGE_KEY,
    value: series,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const bulk = page.getByRole('region', { name: 'Bulk-Modus' });
  await bulk.getByRole('checkbox', { name: '3D-Modell (GLB)', exact: true }).check();
  await bulk.getByRole('checkbox', { name: '3D-Ansicht', exact: true }).check();
  await bulk.getByRole('checkbox', { name: 'Perspektive', exact: true }).check();
  const result = await download(page, 'ZIP herunterladen');
  const files = unzipSync(result.bytes);
  expect(Object.keys(files)).toHaveLength(16);
  const board = glb(files['gesamtfeld/modell.glb']!);
  const tiles = board.nodes.filter((node) => node.extras?.tileId);
  expect(tiles.map((node) => node.extras!.tileId)).toEqual(series.order);
  expect(tiles[0]!.name).toBe('Export-Kachel 2');
  expect(tiles[1]!.matrix![12]).toBe(1.5);
  expect(tiles[1]!.matrix![14]).toBeCloseTo(Math.sqrt(3) / 2);
  expect(tiles[2]!.matrix![12]).toBe(3);
  expect(tiles[2]!.matrix![14]).toBe(0);
  for (const path of [
    '01-export-kachel-2/modell.glb',
    '02-export-kachel-1/modell.glb',
    '03-export-kachel-3/modell.glb',
  ]) {
    const tile = glb(files[path]!);
    expect(tile.nodes.find((node) => node.extras?.tileId)?.matrix).toBeUndefined();
  }
  for (const view of ['draufsicht', '3d-ansicht', 'perspektive']) {
    const bytes = Buffer.from(files[`gesamtfeld/${view}.png`]!);
    expect(bytes.readUInt32BE(16)).toBe(128);
    const coverage = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, 128, 128).data;
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index]! > 0) opaque++;
      return { opaque, corner: data[3] };
    }, bytes.toString('base64'));
    expect(coverage.corner).toBe(0);
    expect(coverage.opaque).toBeGreaterThan(1500);
  }
  // A model-only selection must also produce a valid board, without requiring PNG views.
  for (const name of ['Draufsicht', '3D-Ansicht', 'Perspektive'])
    await bulk.getByRole('checkbox', { name, exact: true }).uncheck();
  const models = unzipSync((await download(page, 'ZIP herunterladen')).bytes);
  expect(Object.keys(models)).toHaveLength(4);
  expect(models['gesamtfeld/modell.glb']).toBeDefined();
  const pending = page.waitForResponse(
    (response) => response.url().endsWith('/api/series') && response.request().method() === 'POST',
  );
  await bulk.getByRole('button', { name: 'Working speichern', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  const saved = (await response.json()) as { pngUrl: string };
  expect((await request.get(saved.pngUrl)).status()).toBe(200);
  await expect(bulk.getByText(/Kachel-PNGs und ein Gesamtbild/)).toBeVisible();
  expect(errors).toEqual([]);
});
