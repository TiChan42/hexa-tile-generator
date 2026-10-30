import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApiHandler } from '../server/api';
import {
  DEFAULT_EVENT_GENERATOR,
  EVENT_KINDS,
  createEventProject,
  defaultEffect,
  generateEventCards,
} from '../src/core/events';
import type { EventProject } from '../src/core/events';
let root: string, server: Server, base: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hexa-cards-'));
  const api = createApiHandler(root);
  server = createServer((request, response) => {
    void api(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});
const post = (path: string, value: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
const project = (): EventProject => {
  const value = createEventProject();
  value.cards = value.cards.slice(0, 2);
  return value;
};

it('exposes the strict card schemas and generates the same deterministic cards as the editor', async () => {
  const schema = await fetch(`${base}/api/cards/schema`);
  expect(schema.status).toBe(200);
  const definitions = (await schema.json()) as {
    version: number;
    project: { additionalProperties: boolean };
  };
  expect(definitions.version).toBe(1);
  expect(await (await fetch(`${base}/api/cards/default`)).json()).toEqual(createEventProject());
  expect(definitions.project.additionalProperties).toBe(false);
  const input = { ...structuredClone(DEFAULT_EVENT_GENERATOR), theme: 'alb' as const, count: 5 };
  const result = await post('/api/cards/generate', { version: 1, generator: input });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ version: 1, cards: generateEventCards(input) });
  expect((await fetch(`${base}/api/cards/schema`, { method: 'DELETE' })).status).toBe(405);
  expect((await fetch(`${base}/api/cards/generate`)).status).toBe(405);
});
it('renders both self-contained card sides and printable sheets through the API', async () => {
  const value = project();
  for (const side of ['front', 'back']) {
    const result = await post('/api/cards/render', {
      version: 1,
      card: value.cards[0],
      design: value.design,
      side,
      landscapeSeed: value.generator.seed,
    });
    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await result.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain(side === 'back' ? value.design.backTitle : value.cards[0]!.title);
  }
  const print = await post('/api/cards/print', value);
  expect(print.status).toBe(200);
  expect(print.headers.get('content-type')).toContain('text/html');
  expect(await print.text()).toContain('class="sheet"');
  expect((await fetch(`${base}/api/cards/render`)).status).toBe(405);
  expect((await fetch(`${base}/api/cards/print`)).status).toBe(405);
  expect((await post('/api/cards/print', { ...value, cards: [] })).status).toBe(400);
});
it('generates rare gifts and accepts their explicit sources and combined effects through the API', async () => {
  const generator = structuredClone(DEFAULT_EVENT_GENERATOR);
  generator.count = 6;
  for (const kind of EVENT_KINDS) generator.weights[kind] = kind === 'gift' ? 1 : 0;
  const generated = await post('/api/cards/generate', { version: 1, generator });
  expect(generated.status).toBe(200);
  expect(await generated.json()).toEqual({ version: 1, cards: generateEventCards(generator) });
  const value = project();
  value.cards = value.cards.slice(0, 1);
  value.cards[0]!.steps = (['alb-give', 'gift', 'protection', 'bonus-roll'] as const).map(
    (kind, index) => ({
      id: `rare-${index}`,
      effect: defaultEffect(kind),
      cost: null,
    }),
  );
  value.cards[0]!.steps[1]!.effect = {
    kind: 'gift',
    amount: 2,
    resource: 'gold',
    destination: 'stored',
    source: { kind: 'players', inventory: 'carried', target: { kind: 'all' } },
  };
  const print = await post('/api/cards/print', value);
  expect(print.status).toBe(200);
  expect(await print.text()).toContain('Jeder andere Spieler');
  const saved = await post('/api/card-projects', value);
  expect(saved.status).toBe(201);
  const manifest = (await saved.json()) as { projectUrl: string };
  expect(await (await fetch(`${base}${manifest.projectUrl}`)).json()).toEqual(value);
  const invalid = structuredClone(value);
  const effect = invalid.cards[0]!.steps[1]!.effect;
  if (effect.kind !== 'gift' || effect.source.kind !== 'players') throw new Error();
  const result = await post('/api/cards/render', {
    version: 1,
    side: 'front',
    design: value.design,
    card: {
      ...invalid.cards[0],
      steps: [
        {
          ...invalid.cards[0]!.steps[1],
          effect: { ...effect, source: { ...effect.source, target: { kind: 'active' } } },
        },
      ],
    },
  });
  expect(result.status).toBe(400);
});
it('stores independent immutable card projects with fronts, back, rules and duplex sheets', async () => {
  expect(await (await fetch(`${base}/api/card-projects`)).json()).toEqual([]);
  const value = project(),
    before = JSON.stringify(value);
  const saved = await post('/api/card-projects', value);
  expect(saved.status).toBe(201);
  const manifest = (await saved.json()) as {
    id: string;
    path: string;
    projectUrl: string;
    existing: boolean;
  };
  expect(manifest.id).toMatch(/^deck-[a-f\d]{24}$/);
  expect(manifest.existing).toBe(false);
  expect(await (await fetch(`${base}${manifest.projectUrl}`)).json()).toEqual(value);
  expect(await (await fetch(`${base}${manifest.projectUrl}/project.json`)).json()).toEqual(value);
  expect(JSON.parse(await readFile(join(root, manifest.path, 'project.json'), 'utf8'))).toEqual(
    value,
  );
  const repeated = (await (await post('/api/card-projects', value)).json()) as {
    id: string;
    existing: boolean;
  };
  expect(repeated).toMatchObject({ id: manifest.id, existing: true });
  for (const [file, type] of [
    [`fronts/${value.cards[0]!.id}.svg`, 'image/svg+xml'],
    ['back.svg', 'image/svg+xml'],
    ['print.html', 'text/html'],
    ['rules.txt', 'text/plain'],
  ]) {
    const response = await fetch(`${base}${manifest.projectUrl}/${file}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(type);
    expect((await response.text()).length).toBeGreaterThan(50);
  }
  value.cards[0]!.title = 'Bearbeitete Karte';
  const edited = (await (await post('/api/card-projects', value)).json()) as { id: string };
  expect(edited.id).not.toBe(manifest.id);
  expect((await (await fetch(`${base}/api/card-projects`)).json()) as unknown[]).toHaveLength(2);
  expect(await (await fetch(`${base}/api/tiles`)).json()).toEqual([]);
  expect(await readFile(join(root, manifest.path, 'project.json'), 'utf8')).toBe(
    `${JSON.stringify(JSON.parse(before), null, 2)}\n`,
  );
  const invalidFolder = join(root, 'working', 'cards', 'deck-000000000000000000000000');
  await mkdir(invalidFolder);
  await writeFile(join(invalidFolder, 'manifest.json'), '{');
  expect((await (await fetch(`${base}/api/card-projects`)).json()) as unknown[]).toHaveLength(2);
});
it('rejects invalid versions, unknown properties, invalid paths, empty decks and disallowed methods', async () => {
  const value = project();
  for (const input of [
    { ...value, schemaVersion: 5 },
    { ...value, tile: 'x' },
    { ...value, cards: [] },
    { ...value, cards: [value.cards[0], value.cards[0]] },
  ])
    expect((await post('/api/card-projects', input)).status).toBe(400);
  expect((await fetch(`${base}/api/card-projects`, { method: 'DELETE' })).status).toBe(405);
  expect((await fetch(`${base}/api/card-projects/not-a-deck`)).status).toBe(400);
  expect((await fetch(`${base}/api/card-projects/deck-000000000000000000000000`)).status).toBe(404);
  expect((await post('/api/card-projects/deck-000000000000000000000000', value)).status).toBe(405);
  expect(
    (await fetch(`${base}/api/card-projects/deck-000000000000000000000000/unknown`)).status,
  ).toBe(404);
  expect((await fetch(`${base}/api/cards/unknown`)).status).toBe(404);
  expect((await fetch(`${base}/api/card-projects/%2e%2e%2foutside`)).status).toBe(400);
  expect(
    (
      await post('/api/cards/generate', {
        version: 1,
        generator: {
          ...DEFAULT_EVENT_GENERATOR,
          weights: Object.fromEntries(EVENT_KINDS.map((kind) => [kind, 0])),
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (await post('/api/cards/generate', { version: 2, generator: DEFAULT_EVENT_GENERATOR })).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${base}/api/cards/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://external.example' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect((await fetch(`${base}/api/cards/generate`, { method: 'POST', body: '{}' })).status).toBe(
    415,
  );
  expect((await post('/api/cards/generate', { padding: 'x'.repeat(2 * 1024 * 1024) })).status).toBe(
    413,
  );
});
it('reports text overflow before persisting anything and reports filesystem failures honestly', async () => {
  const value = project();
  value.cards[0]!.steps = Array.from({ length: 6 }, (_, index) => ({
    id: `step-${index}`,
    effect: { ...defaultEffect('custom'), text: 'W'.repeat(240) } as ReturnType<
      typeof defaultEffect
    >,
    cost: {
      amount: 9,
      resource: 'random' as const,
      source: 'either' as const,
      failure: 'skip-card' as const,
    },
  }));
  const result = await post('/api/card-projects', value);
  expect(result.status).toBe(400);
  expect(await result.text()).toContain('Kartentext ist zu lang');
  expect(await (await fetch(`${base}/api/card-projects`)).json()).toEqual([]);
  await mkdir(join(root, 'working'));
  await writeFile(join(root, 'working', 'cards'), 'not a directory');
  expect((await post('/api/card-projects', project())).status).toBe(500);
});

it('validates transient 3D captures and keeps image data out of project JSON', async () => {
  const { crc32, deflateSync } = await import('node:zlib');
  const chunk = (kind: string, data: Buffer) => {
    const bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    bytes.write(kind, 4);
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, 8 + data.length)), 8 + data.length);
    return bytes;
  };
  const capture = (height: number) => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1512);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((1512 * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
  };
  const png = capture(712),
    backImage = capture(2112);
  const value = project();
  value.cards = value.cards.slice(0, 1);
  const art = { [value.cards[0]!.id]: png };
  const rendered = await post('/api/cards/render', {
    version: 1,
    card: value.cards[0],
    design: value.design,
    side: 'front',
    frontImage: png,
  });
  expect(rendered.status).toBe(200);
  expect((await rendered.text()).includes('data-landscape="webgl-tile"')).toBe(true);
  const back = await post('/api/cards/render', {
    version: 1,
    card: value.cards[0],
    design: value.design,
    side: 'back',
    backImage,
  });
  expect(back.status).toBe(200);
  expect(await back.text()).toContain('data-landscape="webgl-map"');
  const saved = await post('/api/card-projects', { project: value, artwork: art, backImage });
  expect(saved.status).toBe(201);
  const result = (await saved.json()) as { projectUrl: string };
  expect(await (await fetch(`${base}${result.projectUrl}`)).json()).toEqual(value);
  expect(
    (
      await (await fetch(`${base}${result.projectUrl}/fronts/${value.cards[0]!.id}.svg`)).text()
    ).includes(png),
  ).toBe(true);
  expect(await (await fetch(`${base}${result.projectUrl}/back.svg`)).text()).toContain(backImage);
  expect(
    (await post('/api/card-projects', { project: value, artwork: art, backImage: png })).status,
  ).toBe(400);
  expect((await post('/api/card-projects', { project: value, artwork: {} })).status).toBe(400);
  expect(
    (
      await post('/api/card-projects', {
        project: value,
        artwork: { [value.cards[0]!.id]: 'data:image/png;base64,AAAA' },
      })
    ).status,
  ).toBe(400);
  const print = await post('/api/cards/print', { project: value, artwork: art, backImage });
  expect(print.status).toBe(200);
  expect(await print.text()).toContain(backImage);
});
