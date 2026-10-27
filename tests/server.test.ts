import { v13MigrationAdditions } from './fixtures/migration';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, migrateConfig, parseConfig } from '../src/core/config.js';
import { createApiHandler } from '../server/api.js';
import { normalizeModel } from '../server/models.js';
import { decodePng } from '../server/png.js';
import frozenV3 from './fixtures/v3.json' with { type: 'json' };
import frozenV4 from './fixtures/v4.json' with { type: 'json' };
import frozenV5 from './fixtures/v5.json' with { type: 'json' };
import frozenV6 from './fixtures/v6.json' with { type: 'json' };
import frozenV7 from './fixtures/v7.json' with { type: 'json' };
import frozenV8 from './fixtures/v8.json' with { type: 'json' };
import frozenV9 from './fixtures/v9.json' with { type: 'json' };
import { generateTile } from '../src/core/generate.js';
import { DECORATION_KINDS } from '../src/core/objects.js';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, bytes: Buffer): Buffer {
  const output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length);
  output.write(type, 4, 'ascii');
  bytes.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, 8 + bytes.length)), 8 + bytes.length);
  return output;
}
function pngData(size = 128): string {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((size * 4 + 1) * size))), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
}
const modelInput = {
  name: 'Test oak',
  size: [8, 12, 4],
  palette: ['#aabbcc', '#123456'],
  voxels: [
    [0, 0, 0, 0],
    [7, 11, 3, 1],
  ],
};

let root: string;
let server: Server;
let base: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hexa-api-'));
  const api = createApiHandler(root);
  server = createServer((request, response) => {
    void api(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((accept) => {
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('No test server address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>((accept, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else accept();
    });
  });
  await rm(root, { recursive: true, force: true });
});
function post(path: string, value: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });
}

describe('working artifact API', () => {
  it('writes config + PNG + manifest and reloads without overwriting repeated exports', async () => {
    const config = structuredClone(defaultConfig);
    config.name = '../../Äther & Tile';
    config.seed = '../seed';
    config.export.size = 128;
    const saved = await post('/api/tiles', { config, png: pngData() });
    expect(saved.status).toBe(201);
    const manifest = (await saved.json()) as { id: string; existing: boolean; pngHash: string };
    expect(manifest.id).toMatch(/^ather-tile-seed-[a-f0-9]{16}$/);
    expect(manifest.existing).toBe(false);
    expect(
      JSON.parse(await readFile(join(root, 'working', manifest.id, 'config.json'), 'utf8')),
    ).toEqual(config);
    const repeated = (await (await post('/api/tiles', { config, png: pngData() })).json()) as {
      id: string;
      existing: boolean;
    };
    expect(repeated.id).toBe(manifest.id);
    expect(repeated.existing).toBe(true);
    expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(config);
    expect(await (await fetch(`${base}/api/tiles/${manifest.id}/config.json`)).json()).toEqual(
      config,
    );
    const image = await fetch(`${base}/api/tiles/${manifest.id}/tile.png`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(decodePng(pngData(), 128));
    const listed = (await (await fetch(`${base}/api/tiles`)).json()) as { id: string }[];
    expect(listed.map((entry) => entry.id)).toEqual([manifest.id]);
    expect(await (await fetch(`${base}/api/tiles/missing`)).json()).toEqual({
      error: 'Datei nicht gefunden.',
    });
  });
  it('validates schemas, image dimensions, paths, methods, origins, and bounded content', async () => {
    expect((await fetch(`${base}/api/tiles`)).status).toBe(200);
    expect((await post('/api/tiles', { config: {}, png: pngData() })).status).toBe(400);
    expect((await post('/api/tiles', { config: defaultConfig, png: pngData() })).status).toBe(400);
    expect((await post('/api/tiles', { config: defaultConfig, png: 'invalid' })).status).toBe(400);
    expect((await fetch(`${base}/api/tiles/%2e%2e%2foutside/tile.png`)).status).toBe(400);
    expect((await fetch(`${base}/api/tiles/UPPERCASE`)).status).toBe(400);
    expect((await fetch(`${base}/api/not-a-route`)).status).toBe(404);
    expect((await fetch(`${base}/api/tiles`, { method: 'DELETE' })).status).toBe(405);
    expect((await post('/api/tiles', {}, { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await fetch(`${base}/api/tiles`, { method: 'POST', body: '{}' })).status).toBe(415);
    expect(
      (
        await fetch(`${base}/api/tiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400);
    expect((await post('/api/models', { padding: 'x'.repeat(2 * 1024 * 1024) })).status).toBe(413);
    expect((await fetch(`${base}/missing`)).status).toBe(404);
  });
});

describe('voxel model API', () => {
  it('normalizes a standard footprint, persists, lists, and retrieves user and built-in models', async () => {
    const saved = await post('/api/models', modelInput);
    expect(saved.status).toBe(201);
    const model = (await saved.json()) as {
      id: string;
      scale: number;
      pivot: number[];
      builtin: boolean;
    };
    expect(model.scale).toBe(1 / 8);
    expect(model.pivot).toEqual([4, 0, 2]);
    expect(model.builtin).toBe(false);
    expect(await (await post('/api/models', modelInput)).json()).toEqual(model);
    await mkdir(join(root, 'public', 'models'), { recursive: true });
    await writeFile(
      join(root, 'public', 'models', 'tree.json'),
      JSON.stringify({ ...modelInput, id: 'tree' }),
    );
    await writeFile(join(root, 'public', 'models', 'manifest.json'), '{}');
    await writeFile(join(root, 'public', 'models', 'README.txt'), 'Ignored');
    const listed = (await (await fetch(`${base}/api/models`)).json()) as {
      id: string;
      builtin: boolean;
    }[];
    expect(listed).toHaveLength(2);
    expect(listed[0]?.builtin).toBe(true);
    expect(await (await fetch(`${base}/api/models/${model.id}`)).json()).toEqual(model);
    expect((await fetch(`${base}/api/models/missing`)).status).toBe(404);
    expect((await fetch(`${base}/api/models/UPPERCASE`)).status).toBe(404);
    expect((await fetch(`${base}/api/models`, { method: 'DELETE' })).status).toBe(405);
    expect((await post(`/api/models/${model.id}`, {})).status).toBe(405);
  });
  it('uses occupied bounds and recomputes derived normalization when reimporting exported models', async () => {
    const sparse = {
      name: 'Offset rock',
      size: [20, 20, 20],
      palette: ['#abcdef'],
      voxels: [
        [3, 7, 11, 0],
        [6, 8, 12, 0],
      ],
    };
    const model = normalizeModel(sparse);
    expect(model.scale).toBe(1 / 4);
    expect(model.pivot).toEqual([5, 7, 12]);
    const saved = await post('/api/models', {
      ...model,
      scale: 1,
      pivot: [0, 0, 0],
      builtin: true,
    });
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual(model);
  });
  it('rejects invalid coordinates, palette references, duplicates, and excessive dimensions', async () => {
    expect((await post('/api/models', { ...modelInput, size: [65, 1, 1] })).status).toBe(400);
    expect((await post('/api/models', { ...modelInput, voxels: [[8, 0, 0, 0]] })).status).toBe(400);
    expect((await post('/api/models', { ...modelInput, voxels: [[0, 0, 0, 9]] })).status).toBe(400);
    expect(
      (
        await post('/api/models', {
          ...modelInput,
          voxels: [
            [0, 0, 0, 0],
            [0, 0, 0, 1],
          ],
        })
      ).status,
    ).toBe(400);
    expect((await post('/api/models', { ...modelInput, palette: ['transparent'] })).status).toBe(
      400,
    );
    expect(normalizeModel({ ...modelInput, voxels: [...modelInput.voxels].reverse() }).id).toBe(
      normalizeModel(modelInput).id,
    );
  });
});

describe('PNG envelope validation', () => {
  it('rejects base64 errors, invalid signatures, truncated chunks, missing image data, and trailing data', () => {
    expect(() => decodePng('data:image/png;base64,abcd=', 128)).toThrow();
    expect(() => decodePng('data:image/png;base64,', 128)).toThrow();
    expect(() =>
      decodePng(`data:image/png;base64,${Buffer.alloc(64).toString('base64')}`, 128),
    ).toThrow();
    const valid = Buffer.from(pngData().slice(22), 'base64');
    expect(() =>
      decodePng(`data:image/png;base64,${valid.subarray(0, -1).toString('base64')}`, 128),
    ).toThrow();
    expect(() =>
      decodePng(
        `data:image/png;base64,${Buffer.concat([valid, Buffer.from([0])]).toString('base64')}`,
        128,
      ),
    ).toThrow();
    const missingImage = Buffer.from(valid);
    missingImage.write('FAKE', 37);
    expect(() =>
      decodePng(`data:image/png;base64,${missingImage.toString('base64')}`, 128),
    ).toThrow();
  });
});

/** Independent chunk builder makes malformed PNG fixtures retain valid CRCs. */
function rebuildPng(chunks: [string, Buffer][]): string {
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks.map(([type, data]) => chunk(type, data))]).toString('base64')}`;
}
function pngChunks(): [string, Buffer][] {
  const bytes = Buffer.from(pngData().slice(22), 'base64');
  const result: [string, Buffer][] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    result.push([
      bytes.toString('ascii', offset + 4, offset + 8),
      Buffer.from(bytes.subarray(offset + 8, offset + 8 + length)),
    ]);
    offset += length + 12;
  }
  return result;
}

describe('PNG chunk integrity and image headers', () => {
  it('accepts intact data including legal ancillary chunks and detects changed payloads', () => {
    const parts = pngChunks();
    parts.splice(1, 0, ['tEXt', Buffer.from('Author\0Hexa Tile Studio')]);
    const encoded = rebuildPng(parts);
    expect(decodePng(encoded, 128)).toEqual(Buffer.from(encoded.slice(22), 'base64'));
    const damaged = Buffer.from(pngData().slice(22), 'base64');
    damaged[41] ^= 1;
    expect(() => decodePng(`data:image/png;base64,${damaged.toString('base64')}`, 128)).toThrow(
      'Prüfsumme',
    );
  });
  it('rejects invalid chunk types, duplicate headers, incomplete files, and malformed lengths', () => {
    const parts = pngChunks();
    expect(() => decodePng(rebuildPng([parts[0], ['ID1T', parts[1][1]], parts[2]]), 128)).toThrow(
      'Chunktyp',
    );
    expect(() => decodePng(rebuildPng([parts[0], ['IDaT', parts[1][1]], parts[2]]), 128)).toThrow(
      'Chunktyp',
    );
    expect(() => decodePng(rebuildPng([parts[0], ['FAKE', parts[1][1]], parts[2]]), 128)).toThrow(
      'kritischer',
    );
    expect(() => decodePng(rebuildPng([parts[0], parts[0], parts[1], parts[2]]), 128)).toThrow(
      'Doppelter',
    );
    expect(() => decodePng(rebuildPng([parts[0], parts[1]]), 128)).toThrow('Unvollständige');
    expect(() => decodePng(rebuildPng([parts[0], ['tEXt', parts[1][1]], parts[2]]), 128)).toThrow(
      'Unvollständige',
    );
    expect(() =>
      decodePng(
        rebuildPng([parts[0], ['IDAT', Buffer.alloc(0)], ['tEXt', Buffer.alloc(10)], parts[2]]),
        128,
      ),
    ).toThrow('Unvollständige');
    expect(() =>
      decodePng(rebuildPng([parts[0], parts[1], ['IEND', Buffer.from([0])]]), 128),
    ).toThrow('PNG-Ende');
    const truncated = Buffer.from(pngData().slice(22), 'base64');
    truncated.writeUInt32BE(0xffffffff, 33);
    expect(() => decodePng(`data:image/png;base64,${truncated.toString('base64')}`, 128)).toThrow(
      'Abgeschnittene',
    );
  });
  it('rejects illegal dimensions, header ordering, bit depth, color, compression, filtering, and interlace', () => {
    const parts = pngChunks();
    for (const index of [0, 4]) {
      const header = Buffer.from(parts[0][1]);
      header.writeUInt32BE(127, index);
      expect(() => decodePng(rebuildPng([['IHDR', header], parts[1], parts[2]]), 128)).toThrow(
        'Abmessungen',
      );
    }
    expect(() => decodePng(rebuildPng([['tEXt', parts[0][1]], parts[1], parts[2]]), 128)).toThrow(
      'Abmessungen',
    );
    expect(() =>
      decodePng(rebuildPng([['IHDR', parts[0][1].subarray(0, 12)], parts[1], parts[2]]), 128),
    ).toThrow('Abmessungen');
    for (const [index, value] of [
      [8, 3],
      [9, 1],
      [10, 1],
      [11, 1],
      [12, 2],
    ]) {
      const header = Buffer.from(parts[0][1]);
      header[index] = value;
      expect(() => decodePng(rebuildPng([['IHDR', header], parts[1], parts[2]]), 128)).toThrow(
        'Bildformat',
      );
    }
  });
});

/** Frozen v1 fixture: never derive legacy input from a future default configuration. */
function legacyV1Config() {
  return {
    schemaVersion: 1,
    generatorVersion: '1.0.0',
    name: 'Legacy Gebiet',
    seed: 'legacy-safe',
    grid: { kind: 'hex', divisions: 10, subDivisions: 3, showGrid: true, showSubgrid: false },
    terrain: {
      scale: 2.5,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2,
      elevation: 0.23,
      terraces: 7,
      grain: 0.09,
      gradient: [
        { at: 0, color: '#344c49' },
        { at: 0.35, color: '#617c59' },
        { at: 0.7, color: '#9ba96d' },
        { at: 1, color: '#d6cc98' },
      ],
      wallGradient: [
        { at: 0, color: '#373e38' },
        { at: 0.5, color: '#6d6552' },
        { at: 1, color: '#b6a27c' },
      ],
    },
    paths: {
      enabled: true,
      auto: true,
      enabledSides: [true, true, true, true, true, true],
      loop: true,
      fieldSize: 3,
      gradient: [
        { at: 0, color: '#b69462' },
        { at: 0.5, color: '#d4bb83' },
        { at: 1, color: '#eee0b1' },
      ],
      fields: [],
    },
    decoration: { enabled: true, density: 0.22, placements: [] },
    camera: { mode: 'top', azimuth: -25, elevation: 52, fov: 35, zoom: 1 },
    export: { size: 128, transparent: true },
    palette: ['#d4bb83', '#af7864', '#7e9a91', '#b6a3c9'],
  };
}

describe('versioned exports and explicit legacy migration', () => {
  it('keeps legacy artifacts immutable and saves an explicitly migrated project under a new versioned identity', async () => {
    const legacy = legacyV1Config();
    const oldJson = `${JSON.stringify(legacy, null, 2)}\n`;
    const oldPng = Buffer.from(pngData().slice(22), 'base64');
    const configHash = createHash('sha256').update(oldJson).digest('hex');
    const id = `legacy-gebiet-legacy-safe-${configHash.slice(0, 16)}`;
    const directory = join(root, 'working', id);
    const oldManifest = `${JSON.stringify({ id, name: legacy.name, seed: legacy.seed, size: 128, generatorVersion: '1.0.0', configHash, pngHash: createHash('sha256').update(oldPng).digest('hex'), path: `working/${id}`, pngUrl: `/api/tiles/${id}/tile.png` }, null, 2)}\n`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'config.json'), oldJson);
    await writeFile(join(directory, 'tile.png'), oldPng);
    await writeFile(join(directory, 'manifest.json'), oldManifest);

    // Reading an old tile returns its original recipe, not a silent migration.
    expect(await (await fetch(`${base}/api/tiles/${id}`)).text()).toBe(oldJson);
    expect(
      Buffer.from(await (await fetch(`${base}/api/tiles/${id}/tile.png`)).arrayBuffer()),
    ).toEqual(oldPng);
    const migration = migrateConfig(legacy);
    expect(migration.migrated).toBe(true);
    expect(migration.notices.length).toBeGreaterThan(0);
    expect(migration.notices.join(' ')).toContain('Generator 15');
    const migrated = parseConfig(legacy);
    expect(migrated).toEqual(migration.config);
    expect(migrated.center).toEqual({
      shape: 'regular',
      scale: 1,
      rotation: 0,
      irregularity: 0,
      offset: { x: 0, y: 0 },
      portalWidth: 0.45,
    });
    expect(migrated.schemaVersion).toBe(15);
    expect(migrated.generatorVersion).toBe('15.0.0');
    expect(migrated.seed).toBe(legacy.seed);
    const saved = await post('/api/tiles', { config: migrated, png: pngData() });
    expect(saved.status).toBe(201);
    const manifest = (await saved.json()) as { id: string; generatorVersion: string };
    expect(manifest.id).not.toBe(id);
    expect(manifest.generatorVersion).toBe('15.0.0');
    expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(migrated);
    expect(await readFile(join(directory, 'config.json'), 'utf8')).toBe(oldJson);
    expect(await readFile(join(directory, 'tile.png'))).toEqual(oldPng);
    expect(await readFile(join(directory, 'manifest.json'), 'utf8')).toBe(oldManifest);
    const listed = (await (await fetch(`${base}/api/tiles`)).json()) as {
      generatorVersion: string;
    }[];
    expect(listed.map((entry) => entry.generatorVersion).sort()).toEqual(['1.0.0', '15.0.0']);
  });

  it('rejects legacy or mismatched versions during save instead of pairing an old PNG with changed generator semantics', async () => {
    expect((await post('/api/tiles', { config: legacyV1Config(), png: pngData() })).status).toBe(
      400,
    );
    const current = structuredClone(defaultConfig);
    current.export.size = 128;
    for (const config of [
      { ...frozenV3, export: { size: 128, transparent: true } },
      { ...frozenV4, export: { size: 128, transparent: true } },
      { ...frozenV5, export: { size: 128, transparent: true } },
      { ...frozenV6, export: { size: 128, transparent: true } },
      { ...frozenV7, export: { size: 128, transparent: true } },
      { ...frozenV8, export: { size: 128, transparent: true } },
      { ...frozenV9, export: { size: 128, transparent: true } },
      { ...current, schemaVersion: 1 },
      { ...current, generatorVersion: '1.0.0' },
      { ...legacyV1Config(), schemaVersion: 2, generatorVersion: '2.0.0' },
      { ...current, schemaVersion: 11, generatorVersion: '11.0.0' },
    ]) {
      expect((await post('/api/tiles', { config, png: pngData() })).status).toBe(400);
    }
    expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
  });
});

it('preserves camel-case built-in species IDs in the model library and GET route', async () => {
  await mkdir(join(root, 'public', 'models'), { recursive: true });
  await writeFile(
    join(root, 'public', 'models', 'deadTree.json'),
    JSON.stringify({ ...modelInput, id: 'deadTree', name: 'Totholz' }),
  );
  const list = (await (await fetch(`${base}/api/models`)).json()) as { id: string }[];
  expect(list.map((model) => model.id)).toEqual(['deadTree']);
  const response = await fetch(`${base}/api/models/deadTree`);
  expect(response.status).toBe(200);
  const model = (await response.json()) as { id: string; builtin: boolean };
  expect(model.id).toBe('deadTree');
  expect(model.builtin).toBe(true);
  expect((await fetch(`${base}/api/models/deadTree%2F..%2Fsecret`)).status).toBe(400);
});

it('saves current eighteen-kind projects and requires explicit lossless migration for V4 PNGs', async () => {
  const legacy = {
    ...structuredClone(frozenV4),
    export: { size: 128, transparent: true },
    paths: {
      ...structuredClone(frozenV4.paths),
      auto: false,
      fields: [
        {
          id: 'kept-field',
          cellIds: ['h:2:0'],
          action: 'custom',
          label: 'Original',
          color: '#8855aa',
          heightMode: 'terraced',
          heightOffset: 0.15,
        },
      ],
    },
    decoration: {
      ...structuredClone(frozenV4.decoration),
      density: 0,
      sourceDensity: 0.6,
      placements: [
        {
          id: 'kept-crystal',
          kind: 'crystal',
          cellId: 'h:3:0',
          offset: { x: 0.1, y: -0.2 },
          scale: 1.5,
          rotation: 70,
        },
      ],
      modelSlots: { crystal: 'model-old-crystal' },
    },
  };
  const before = JSON.stringify(legacy);
  expect((await post('/api/tiles', { config: legacy, png: pngData() })).status).toBe(400);
  const migrated = migrateConfig(legacy).config;
  const { transitionWidth: obsoleteWidth, ...paths } = legacy.paths;
  expect(obsoleteWidth).toBeGreaterThan(0);
  expect(migrated).toEqual({
    ...legacy,
    paths,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    rules: defaultConfig.rules,
    border: defaultConfig.border,
  });
  migrated.rules.exportPolicy = 'warn';
  const saved = await post('/api/tiles', { config: migrated, png: pngData() });
  expect(saved.status).toBe(201);
  const manifest = (await saved.json()) as { id: string; generatorVersion: string };
  expect(manifest.generatorVersion).toBe('15.0.0');
  expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(migrated);
  expect(JSON.stringify(legacy)).toBe(before);
  const expanded = structuredClone(migrated);
  expanded.decoration.species = [...DECORATION_KINDS];
  expanded.decoration.modelSlots = Object.fromEntries(
    DECORATION_KINDS.map((kind) => [kind, `model-${kind}`]),
  );
  expect((await post('/api/tiles', { config: expanded, png: pngData() })).status).toBe(201);
});

it('keeps saved V5 ramp configs byte-identical and stores migrated stepped configs separately', async () => {
  const legacy = { ...structuredClone(frozenV5), export: { size: 128, transparent: true } };
  const oldJson = `${JSON.stringify(legacy, null, 2)}\n`;
  const png = Buffer.from(pngData().slice(22), 'base64');
  const id = 'legacy-v5-preserved';
  const directory = join(root, 'working', id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'config.json'), oldJson);
  await writeFile(join(directory, 'tile.png'), png);
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      id,
      generatorVersion: '5.0.0',
      name: legacy.name,
      pngUrl: `/api/tiles/${id}/tile.png`,
    }),
  );
  expect(await (await fetch(`${base}/api/tiles/${id}`)).text()).toBe(oldJson);
  expect((await post('/api/tiles', { config: legacy, png: pngData() })).status).toBe(400);
  const current = migrateConfig(legacy).config;
  expect(current.paths).not.toHaveProperty('transitionWidth');
  const response = await post('/api/tiles', { config: current, png: pngData() });
  expect(response.status).toBe(201);
  const manifest = (await response.json()) as { id: string; generatorVersion: string };
  expect(manifest.generatorVersion).toBe('15.0.0');
  expect(manifest.id).not.toBe(id);
  expect(await readFile(join(directory, 'config.json'), 'utf8')).toBe(oldJson);
  expect(await readFile(join(directory, 'tile.png'))).toEqual(png);
  expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(current);
});

it('requires explicit V6 migration and stores the unchanged editable field configuration as V13', async () => {
  const legacy = {
    ...structuredClone(frozenV6),
    export: { size: 128, transparent: true },
    paths: {
      ...structuredClone(frozenV6.paths),
      auto: false,
      fields: [
        {
          id: 'v6-kept',
          cellIds: ['h:2:0', 'h:2:1'],
          action: 'custom',
          label: 'V6-Handarbeit',
          color: '#9988bb',
          heightMode: 'terraced',
          heightOffset: 0.15,
        },
      ],
    },
    decoration: {
      ...structuredClone(frozenV6.decoration),
      density: 0,
      placements: [
        {
          id: 'v6-object',
          kind: 'quartz',
          cellId: 'h:4:0',
          offset: { x: 0.2, y: -0.1 },
          scale: 1.3,
          rotation: 45,
        },
      ],
      modelSlots: { quartz: 'model-v6-custom' },
    },
  };
  const before = JSON.stringify(legacy);
  expect((await post('/api/tiles', { config: legacy, png: pngData() })).status).toBe(400);
  const migrated = migrateConfig(legacy).config;
  expect(migrated).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    rules: defaultConfig.rules,
    border: defaultConfig.border,
  });
  migrated.rules.exportPolicy = 'warn';
  const response = await post('/api/tiles', { config: migrated, png: pngData() });
  expect(response.status).toBe(201);
  const manifest = (await response.json()) as { id: string; generatorVersion: string };
  expect(manifest.generatorVersion).toBe('15.0.0');
  expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(migrated);
  expect(JSON.stringify(legacy)).toBe(before);
});

describe('server-enforced persistent export rules', () => {
  it('blocks valid PNGs for failing field-area rules and permits an explicit warning-only export', async () => {
    const config = structuredClone(defaultConfig);
    config.export.size = 128;
    config.rules.minFieldArea = 0.5;
    const blocked = await post('/api/tiles', { config, png: pngData() });
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toContain(
      'Export durch Prüfregeln blockiert',
    );
    expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
    config.rules.exportPolicy = 'warn';
    const allowed = await post('/api/tiles', { config, png: pngData() });
    expect(allowed.status).toBe(201);
    const manifest = (await allowed.json()) as { id: string };
    expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(config);
  });
  it('checks local field connectivity and global paths independently instead of trusting the client', async () => {
    const config = structuredClone(defaultConfig);
    config.export.size = 128;
    const original = generateTile(config);
    const available = original.cells.filter(
      (cell) =>
        !cell.reserved &&
        !cell.fieldId &&
        !cell.landscapeOnly &&
        cell.entranceSide === undefined &&
        Math.hypot(cell.center.x, cell.center.y) < 0.72,
    );
    const first = available[0],
      second = [...available]
        .reverse()
        .find(
          (cell) =>
            Math.hypot(cell.center.x - first.center.x, cell.center.y - first.center.y) > 0.7,
        )!;
    config.paths.auto = false;
    config.paths.fields = [
      {
        id: 'split-manual',
        cellIds: [first.id, second.id],
        action: 'event',
        label: 'Geteiltes Feld',
      },
    ];
    config.rules.minFieldArea = 0;
    config.rules.requirePathConnectivity = false;
    const local = await post('/api/tiles', { config, png: pngData() });
    expect(local.status).toBe(400);
    expect(((await local.json()) as { error: string }).error).toContain('Geteiltes Feld');
    config.rules.requireFieldConnectivity = false;
    config.rules.requirePathConnectivity = true;
    const global = await post('/api/tiles', { config, png: pngData() });
    expect(global.status).toBe(400);
    expect(((await global.json()) as { error: string }).error).toContain(
      'Export durch Prüfregeln blockiert',
    );
    config.rules.requirePathConnectivity = false;
    expect((await post('/api/tiles', { config, png: pngData() })).status).toBe(201);
  });
  it('migrates V7 without discarding drafts, rejects rules hidden inside old formats and requires the current schema', async () => {
    const old = { ...structuredClone(frozenV7), export: { size: 128, transparent: true } };
    expect((await post('/api/tiles', { config: old, png: pngData() })).status).toBe(400);
    expect(() => migrateConfig({ ...old, rules: defaultConfig.rules })).toThrow();
    const migrated = migrateConfig(old).config;
    expect(migrated).toEqual({
      ...old,
      ...v13MigrationAdditions(old),
      editing: defaultConfig.editing,
      actions: defaultConfig.actions,
      rules: defaultConfig.rules,
      border: defaultConfig.border,
    });
    expect((await post('/api/tiles', { config: migrated, png: pngData() })).status).toBe(201);
  });
});

it('reports impossible geometry as an explicit export validation error before writing artifacts', async () => {
  const config = structuredClone(defaultConfig);
  config.export.size = 128;
  config.center = { ...config.center, shape: 'regular', scale: 1.2, offset: { x: 0.45, y: 0.45 } };
  const response = await post('/api/tiles', { config, png: pngData() });
  expect(response.status).toBe(400);
  expect(((await response.json()) as { error: string }).error).toContain('Export nicht möglich');
  expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
});

it('requires explicit V8 migration and preserves its rules and placements when saving V13', async () => {
  const old = {
    ...structuredClone(frozenV8),
    export: { size: 128, transparent: true },
    rules: { ...frozenV8.rules, minFieldArea: 0.2, exportPolicy: 'warn' },
    decoration: {
      ...structuredClone(frozenV8.decoration),
      placements: [
        {
          id: 'v8-edge-placement',
          kind: 'quartz',
          cellId: 'h:8:0',
          offset: { x: 0.25, y: -0.1 },
          scale: 1.5,
          rotation: 40,
        },
      ],
      modelSlots: { quartz: 'model-kept-v8' },
    },
  };
  const before = JSON.stringify(old);
  expect((await post('/api/tiles', { config: old, png: pngData() })).status).toBe(400);
  const current = migrateConfig(old).config;
  expect(current).toEqual({
    ...old,
    ...v13MigrationAdditions(old),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
    border: defaultConfig.border,
  });
  current.border = { enabled: true, width: 0.1, mode: 'transparent', color: '#45ab67' };
  const response = await post('/api/tiles', { config: current, png: pngData() });
  expect(response.status).toBe(201);
  const manifest = (await response.json()) as { id: string; generatorVersion: string };
  expect(manifest.generatorVersion).toBe('15.0.0');
  expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(current);
  expect(JSON.stringify(old)).toBe(before);
});

it('rejects malformed or missing border settings before persisting a current export', async () => {
  const config = { ...structuredClone(defaultConfig), export: { size: 128, transparent: true } };
  const { border, ...withoutBorder } = config;
  for (const invalid of [
    withoutBorder,
    { ...config, border: { ...border, width: 0.101 } },
    { ...config, border: { ...border, mode: 'none' } },
    { ...config, border: { ...border, color: '#fff' } },
    { ...config, border: { ...border, extra: true } },
    { ...frozenV8, border },
  ])
    expect((await post('/api/tiles', { config: invalid, png: pngData() })).status).toBe(400);
  expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
});

it('requires V9 migration before persisting new preferences and accepts all-zero action drafts', async () => {
  const legacy = {
    ...structuredClone(frozenV9),
    export: { size: 128, transparent: true },
    rules: { ...frozenV9.rules, exportPolicy: 'warn' },
    border: { enabled: true, width: 0.04, mode: 'fields', color: '#123456' },
  };
  const before = JSON.stringify(legacy);
  expect((await post('/api/tiles', { config: legacy, png: pngData() })).status).toBe(400);
  const config = migrateConfig(legacy).config;
  expect(config).toEqual({
    ...legacy,
    ...v13MigrationAdditions(legacy),
    editing: defaultConfig.editing,
    actions: defaultConfig.actions,
  });
  config.editing.regeneratePathsOnCenterChange = true;
  for (const id of Object.keys(config.actions.weights) as (keyof typeof config.actions.weights)[])
    config.actions.weights[id] = 0;
  config.actions.revision = 2147483647;
  const response = await post('/api/tiles', { config, png: pngData() });
  expect(response.status).toBe(201);
  const manifest = (await response.json()) as { id: string; generatorVersion: string };
  expect(manifest.generatorVersion).toBe('15.0.0');
  expect(await (await fetch(`${base}/api/tiles/${manifest.id}`)).json()).toEqual(config);
  expect(JSON.stringify(legacy)).toBe(before);
});

it('rejects incomplete, unknown and out-of-range editing or action settings', async () => {
  const config = { ...structuredClone(defaultConfig), export: { size: 128, transparent: true } };
  const { actions, editing, ...withoutPreferences } = config;
  const { rotate, ...missingWeight } = actions.weights;
  expect(rotate).toBe(10);
  for (const invalid of [
    { ...withoutPreferences, actions },
    { ...withoutPreferences, editing },
    { ...config, editing: { regeneratePathsOnCenterChange: 'false' } },
    { ...config, actions: { ...actions, weights: missingWeight } },
    { ...config, actions: { ...actions, weights: { ...actions.weights, event: 101 } } },
    { ...config, actions: { ...actions, weights: { ...actions.weights, unknown: 1 } } },
    { ...config, actions: { ...actions, revision: 2147483648 } },
    { ...config, actions: { ...actions, revision: 0.5 } },
    { ...frozenV9, editing, actions },
  ])
    expect((await post('/api/tiles', { config: invalid, png: pngData() })).status).toBe(400);
  expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
});
