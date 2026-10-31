import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { unzipSync, strFromU8 } from 'fflate';
import { EVENT_STORAGE_KEY } from '../../src/cards/storage';
import { eventProjectSchema } from '../../src/core/events';
import { PROJECT_STORAGE_KEY } from '../../src/editor/storage';
import { defaultConfig } from '../../src/core';
import type { Page } from '@playwright/test';

async function saved(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), EVENT_STORAGE_KEY))
    .not.toBeNull();
  return eventProjectSchema.parse(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), EVENT_STORAGE_KEY),
  );
}

async function expectExportedFront(page: Page, svg: Uint8Array, png: Uint8Array) {
  const result = await page.evaluate(
    async ({ svg, png }) => {
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const artwork = document.querySelector<SVGImageElement>('image[data-landscape]')!;
      if (!artwork.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))
        throw new Error('Standalone SVG images must also support SVG 1.1 readers.');
      async function pixels(source: string, scale = 1) {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = window.document.createElement('canvas');
        canvas.width = image.naturalWidth * scale;
        canvas.height = image.naturalHeight * scale;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      }
      const expected = await pixels(artwork.href.baseVal);
      const actual = await pixels(`data:image/png;base64,${png}`);
      const standalone = await pixels(`data:image/svg+xml,${encodeURIComponent(svg)}`, 2);
      let samples = 0;
      let matches = 0;
      let svgMatches = 0;
      // Stay below the effects and above the footer, where the landscape is unobscured.
      for (let y = 1800; y < 1900; y += 8)
        for (let x = 100; x < 1412; x += 8) {
          const source = ((y - 1400) * expected.width + x) * 4;
          if (expected.data[source + 3] !== 255) continue;
          samples++;
          const destination = (y * actual.width + x) * 4;
          if (
            [0, 1, 2, 3].every(
              (channel) =>
                Math.abs(expected.data[source + channel]! - actual.data[destination + channel]!) <=
                3,
            )
          )
            matches++;
          if (
            [0, 1, 2, 3].every(
              (channel) =>
                Math.abs(
                  expected.data[source + channel]! - standalone.data[destination + channel]!,
                ) <= 3,
            )
          )
            svgMatches++;
        }
      return {
        samples,
        ratio: matches / samples,
        svgRatio: svgMatches / samples,
        width: actual.width,
        height: actual.height,
      };
    },
    { svg: strFromU8(svg), png: Buffer.from(png).toString('base64') },
  );
  expect(result.width).toBe(1512);
  expect(result.height).toBe(2112);
  expect(result.samples).toBeGreaterThan(100);
  expect(result.ratio).toBeGreaterThan(0.99);
  expect(result.svgRatio).toBeGreaterThan(0.99);
}

test('combines monster, movement and resource effects with costs and retains independent data', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: PROJECT_STORAGE_KEY,
    value: defaultConfig,
  });
  await page.goto('/cards');
  await expect(page.getByRole('heading', { name: 'Ereigniskarten', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  await page.getByLabel('Kartentitel').fill('Der Alb und die Beute');
  await page.getByLabel('Bewegung des Albs begrenzen').check();
  await expect(page.getByLabel('Effekt 1: Bewegungslimit')).toHaveValue('2');
  await expect(page.getByLabel('Effekt 1: Einheit')).toHaveValue('pentagons');
  await page.getByRole('button', { name: 'Effekt hinzufügen', exact: true }).click();
  await page.getByLabel('Effekt 2: Aktion').selectOption('alb-steal');
  await page.getByLabel('Effekt 2: Spielerrang').fill('2');
  await page.getByLabel('Effekt 2: Zielrichtung').selectOption('previous');
  await page.getByLabel('Effekt 2: Ressourcenart').selectOption('gem');
  await page.getByRole('button', { name: 'Effekt hinzufügen', exact: true }).click();
  await page.getByLabel('Effekt 3: Aktion').selectOption('move');
  await page.getByLabel('Effekt 3: Anzahl').fill('3');
  await page.getByLabel('Effekt 3: Einheit').selectOption('pentagons');
  await page.getByLabel('Effekt 3: Feldaktionen').selectOption('each');
  const third = page.getByRole('group', { name: 'Effekt 3', exact: true });
  await third.getByLabel('Kosten vor diesem Effekt bezahlen').check();
  await page.getByLabel('Effekt 3: Kostenressource').selectOption('gold');
  await expect.poll(async () => (await saved(page)).cards.at(-1)?.steps.length).toBe(3);
  const project = await saved(page),
    created = project.cards.at(-1)!;
  expect(created.title).toBe('Der Alb und die Beute');
  expect(created.steps[0]!.effect).toMatchObject({
    kind: 'alb-move',
    limit: { amount: 2, unit: 'pentagons' },
  });
  expect(created.steps[1]!.effect).toMatchObject({
    kind: 'alb-steal',
    target: { kind: 'turn-order', direction: 'previous', rank: 2 },
    resource: 'gem',
  });
  expect(created.steps[2]).toMatchObject({
    effect: { kind: 'move', unit: 'pentagons', fieldActions: 'each' },
    cost: { resource: 'gold' },
  });
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROJECT_STORAGE_KEY),
  ).toEqual(defaultConfig);
  await expect(page.getByRole('img', { name: 'Vorderseite: Der Alb und die Beute' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Gemeinsame Kartenrückseite' })).toBeVisible();
  await expect
    .poll(
      async () =>
        decodeURIComponent(
          (await page
            .getByRole('img', { name: 'Vorderseite: Der Alb und die Beute' })
            .getAttribute('src')) ?? '',
        ).includes('data-landscape="webgl-tile"'),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.screenshot({ path: 'working/event-card-editor.png' });
  await page.getByRole('button', { name: 'Karten rückgängig' }).click();
  await expect(page.getByLabel('Effekt 3: Kostenressource')).toHaveValue('scrap');
  await page.getByRole('button', { name: 'Karten wiederholen' }).click();
  await expect(page.getByLabel('Effekt 3: Kostenressource')).toHaveValue('gold');
  await page.reload();
  await page.getByRole('button', { name: /Der Alb und die Beute/ }).click();
  await expect(page.getByLabel('Effekt 3: Kostenressource')).toHaveValue('gold');
  expect(errors).toEqual([]);
});

test('generates an Alb deck, exports fronts and back, and saves through the API', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.goto('/cards');
  await page.getByRole('button', { name: 'Zufallstopf', exact: true }).click();
  await page.getByLabel('Anzahl Karten').fill('3');
  await page.getByLabel('Kartenfamilie').selectOption('alb');
  await page.getByLabel('Effekte je Karte: Minimum').fill('2');
  await page.getByLabel('Effekte je Karte: Maximum').fill('2');
  await page.getByRole('button', { name: 'Kartenset würfeln', exact: true }).click();
  await expect.poll(async () => (await saved(page)).cards.length).toBe(3);
  const project = await saved(page);
  expect(
    project.cards.every(
      (card) =>
        card.steps.length === 2 && card.steps.every((step) => step.effect.kind.startsWith('alb-')),
    ),
  ).toBe(true);
  const api = await request.post('/api/cards/generate', {
    data: { version: 1, generator: project.generator },
  });
  expect(api.ok()).toBe(true);
  expect((await api.json()).cards).toEqual(project.cards);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Kartenset exportieren', exact: true }).click();
  const archive = await pending;
  const entries = unzipSync(await readFile((await archive.path())!));
  expect(
    Object.keys(entries).filter(
      (name) => name.startsWith('vorderseiten/') && name.endsWith('.png'),
    ),
  ).toHaveLength(3);
  expect(entries['rueckseite.png']).toBeDefined();
  expect(Buffer.from(entries['rueckseite.png']!).readUInt32BE(16)).toBe(1512);
  for (const name of Object.keys(entries).filter(
    (name) => name.startsWith('vorderseiten/') && name.endsWith('.svg'),
  ))
    await expectExportedFront(page, entries[name]!, entries[name.replace(/\.svg$/, '.png')]!);
  expect(strFromU8(entries['druckbogen.html']!)).toContain('63mm');
  expect(JSON.parse(strFromU8(entries['project.json']!))).toEqual(project);
  await page.getByRole('button', { name: 'Design & Export', exact: true }).click();
  const singleDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aktuelle Kartenseite als PNG', exact: true }).click();
  const single = await singleDownload;
  const firstFront = Object.keys(entries).find((name) => name.startsWith('vorderseiten/'))!;
  await expectExportedFront(page, entries[firstFront]!, await readFile((await single.path())!));
  await page.getByRole('button', { name: 'Kartenset in Working speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Gespeichert unter working/cards/');
  await page.getByRole('button', { name: 'Gespeicherte Sets' }).click();
  await expect(page.getByRole('dialog', { name: 'Gespeicherte Kartensets' })).toContainText(
    'Alb & Abenteuer',
  );
});

test('direct card entry and mobile layout work without creating tile state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cards');
  await expect(page.getByRole('heading', { name: 'Ereigniskarten', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), PROJECT_STORAGE_KEY)).toBeNull();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  await expect(page.getByLabel('Kartentitel')).toBeVisible();
});

test('edits rare gifts, donor selection, protection and bonus rolls with independent weights', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/cards');
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  await page.getByLabel('Kartentitel').fill('Seltenes Glück');
  await page.getByLabel('Effekt 1: Aktion').selectOption('alb-give');
  await page.getByLabel('Effekt 1: Anzahl').fill('5');
  await page.getByLabel('Effekt 1: Ressourcenart').selectOption('gold');
  await expect(page.getByLabel('Effekt 1: Annäherung des Albs')).toHaveValue('1');
  await expect(page.getByLabel('Effekt 1: Einheit der Gegenleistung')).toHaveValue('pentagons');
  await page.getByLabel('Effekt 1: Annäherung des Albs').fill('2');
  await page.getByLabel('Effekt 1: Einheit der Gegenleistung').selectOption('fields');
  await page.getByRole('button', { name: 'Effekt hinzufügen', exact: true }).click();
  await page.getByLabel('Effekt 2: Aktion').selectOption('gift');
  await page.getByLabel('Effekt 2: Geschenk von').selectOption('players');
  await page.getByLabel('Effekt 2: Geber: Zielbezug').selectOption('board');
  await page.getByLabel('Effekt 2: Geber: Spielerrang').fill('2');
  await page.getByLabel('Effekt 2: Vorrat des Gebers').selectOption('stored');
  await page.getByLabel('Effekt 2: Geschenk ablegen').selectOption('stored');
  await page.getByRole('button', { name: 'Effekt hinzufügen', exact: true }).click();
  await page.getByLabel('Effekt 3: Aktion').selectOption('protection');
  await page.getByLabel('Effekt 3: Schutz vor').selectOption('alb');
  await page.getByLabel('Effekt 3: Eigene Züge bis Schutzende').fill('2');
  await page.getByRole('button', { name: 'Effekt hinzufügen', exact: true }).click();
  await page.getByLabel('Effekt 4: Aktion').selectOption('bonus-roll');
  await page.getByLabel('Effekt 4: Feldaktionen').selectOption('each');
  const combined = (await saved(page)).cards.at(-1)!;
  expect(combined.steps.map((step) => step.effect)).toMatchObject([
    { kind: 'alb-give', amount: 5, resource: 'gold', approach: { amount: 2, unit: 'fields' } },
    {
      kind: 'gift',
      destination: 'stored',
      source: {
        kind: 'players',
        inventory: 'stored',
        target: { kind: 'board', rank: 2 },
      },
    },
    { kind: 'protection', turns: 2, against: 'alb' },
    { kind: 'bonus-roll', fieldActions: 'each' },
  ]);
  await page.getByLabel('Effekt 2: Geschenk von').selectOption('bank');
  await expect(page.getByLabel('Effekt 2: Geber: Zielbezug')).toHaveCount(0);
  expect((await saved(page)).cards.at(-1)!.steps[1]!.effect).toMatchObject({
    source: { kind: 'bank' },
  });
  await page.getByRole('button', { name: 'Karten rückgängig' }).click();
  await expect(page.getByLabel('Effekt 2: Geber: Spielerrang')).toHaveValue('2');
  await page.getByRole('button', { name: 'Zufallstopf', exact: true }).click();
  await expect(page.getByLabel('Kartengewicht Pakt mit dem Alb')).toHaveValue('1');
  await expect(page.getByLabel('Kartengewicht Geschenk erhalten')).toHaveValue('2');
  await expect(page.getByLabel('Alb-Geschenk: Ressourcenmenge: Minimum')).toHaveValue('4');
  await expect(page.getByLabel('Alb-Geschenk: Ressourcenmenge: Maximum')).toHaveValue('9');
  await page.getByLabel('Kartengewicht Geschenk erhalten').fill('0');
  expect((await saved(page)).generator.weights.gift).toBe(0);
  expect((await saved(page)).cards.at(-1)).toEqual(combined);
});

test('navigation between both editors preserves their separate projects', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ereigniskarten-Editor' })).toBeVisible();
  await page.getByRole('link', { name: 'Ereigniskarten-Editor' }).click();
  await expect(page).toHaveURL(/\/cards$/);
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  await page.getByLabel('Kartentitel').fill('Reise zwischen Editoren');
  await expect
    .poll(async () => (await saved(page)).cards.at(-1)?.title)
    .toBe('Reise zwischen Editoren');
  await page.getByRole('link', { name: 'Tile-Editor' }).click();
  await expect(page.getByRole('link', { name: 'Ereigniskarten-Editor' })).toBeVisible();
  await page.getByRole('link', { name: 'Ereigniskarten-Editor' }).click();
  await expect(page.getByRole('button', { name: /Reise zwischen Editoren/ })).toBeVisible();
});

test('offers backward movement directly and preserves its amount when switching direction', async ({
  page,
}) => {
  await page.goto('/cards');
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  await page.getByLabel('Effekt 1: Aktion').selectOption({ label: 'Rückwärts ziehen' });
  await page.getByLabel('Effekt 1: Anzahl').fill('4');
  await page.getByLabel('Effekt 1: Feldaktionen').selectOption('each');
  expect((await saved(page)).cards.at(-1)!.steps[0]!.effect).toMatchObject({
    kind: 'move',
    direction: 'backward',
    amount: 4,
    unit: 'fields',
    fieldActions: 'each',
  });
  await page.getByLabel('Effekt 1: Aktion').selectOption({ label: 'Vorwärts ziehen' });
  await expect(page.getByLabel('Effekt 1: Anzahl')).toHaveValue('4');
  await expect(page.getByLabel('Effekt 1: Bewegungsrichtung')).toHaveValue('forward');
  await page.getByLabel('Effekt 1: Bewegungsrichtung').selectOption('backward');
  await expect(page.getByLabel('Effekt 1: Aktion')).toHaveValue('move-backward');
  await page.getByLabel('Effekt 1: Aktion').selectOption({ label: 'Zum vorherigen Pentagon' });
  await page.getByLabel('Effekt 1: Wie viele Pentagone weiter').fill('3');
  expect((await saved(page)).cards.at(-1)!.steps[0]!.effect).toMatchObject({
    kind: 'pentagon',
    direction: 'backward',
    ordinal: 3,
  });
  await page.getByRole('button', { name: 'Zufallstopf', exact: true }).click();
  await expect(page.getByLabel('Rückwärts ziehen und vorherige Spieler zulassen')).toBeChecked();
});

test('preserves the rear silhouette, fills the foreground and adds editable event ideas', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/cards');
  await page.getByRole('button', { name: 'Neue Ereigniskarte' }).click();
  const front = page.getByRole('img', { name: 'Vorderseite: Neue Ereigniskarte' });
  await expect
    .poll(
      async () =>
        decodeURIComponent((await front.getAttribute('src')) ?? '').includes(
          'data-landscape="webgl-tile"',
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const original = await front.getAttribute('src');
  const pixels = await front.evaluate(async (element) => {
    const svg = decodeURIComponent((element as HTMLImageElement).src)
      .split(',')
      .slice(1)
      .join(',');
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const url = parsed.querySelector<SVGImageElement>('image[data-landscape="webgl-tile"]')!.href
      .baseVal;
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, image.height - 1, image.width, 1).data;
    const rear = context.getImageData(0, 0, image.width, 1).data;
    return {
      width: image.width,
      height: image.height,
      rearUncut: [...rear].filter((_, i) => i % 4 === 3).every((value) => value === 0),
      opaque: [...data].filter((_, i) => i % 4 === 3).every((value) => value === 255),
    };
  });
  expect(pixels).toEqual({ width: 1512, height: 712, opaque: true, rearUncut: true });
  expect(JSON.stringify(await saved(page))).not.toContain('data:image/png');
  await page.screenshot({ path: 'working/event-card-landscapes.png' });
  await page.getByLabel('Ereignisidee auswählen').selectOption('3');
  await page.getByRole('button', { name: 'Idee als Effekt hinzufügen', exact: true }).click();
  await expect(page.getByLabel('Effekt 2: Eigener Text')).toHaveValue(/Diebstahl/);
  await page.getByLabel('Kartentitel').fill('Schutz vor Diebstahl');
  const updated = page.getByRole('img', { name: 'Vorderseite: Schutz vor Diebstahl' });
  const beforeSvg = decodeURIComponent(original!)
    .split('href="data:image/png;base64,')[1]
    ?.split('"')[0];
  const afterSvg = decodeURIComponent((await updated.getAttribute('src'))!)
    .split('href="data:image/png;base64,')[1]
    ?.split('"')[0];
  expect(beforeSvg).toBeTruthy();
  expect(afterSvg).toBe(beforeSvg);
});

test('rerolls a real top-down back separately and together with the card set', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/cards');
  const back = page.getByRole('img', { name: 'Gemeinsame Kartenrückseite' });
  await expect
    .poll(
      async () =>
        decodeURIComponent((await back.getAttribute('src')) ?? '').includes(
          'data-landscape="webgl-map"',
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  const before = await saved(page);
  const firstBack = await back.getAttribute('src');
  const front = page.getByRole('img', { name: `Vorderseite: ${before.cards[0]!.title}` });
  await expect
    .poll(
      async () =>
        decodeURIComponent((await front.getAttribute('src')) ?? '').includes(
          'data-landscape="webgl-tile"',
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const firstFront = await front.getAttribute('src');
  await page.getByRole('button', { name: 'Rückseite würfeln', exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).design.backRevision)
    .toBe(before.design.backRevision + 1);
  expect((await saved(page)).cards).toEqual(before.cards);
  await expect
    .poll(
      async () => {
        const src = await back.getAttribute('src');
        return (
          src !== firstBack && decodeURIComponent(src ?? '').includes('data-landscape="webgl-map"')
        );
      },
      { timeout: 60000 },
    )
    .toBe(true);
  expect(await front.getAttribute('src')).toBe(firstFront);
  await page.screenshot({ path: 'working/event-card-map-back.png' });
  await page.getByRole('button', { name: 'Karten rückgängig' }).click();
  await expect
    .poll(async () => (await saved(page)).design.backRevision)
    .toBe(before.design.backRevision);
  await expect(back).toHaveAttribute('src', firstBack!);
  await page.getByRole('button', { name: 'Karten wiederholen' }).click();
  await expect
    .poll(async () => (await saved(page)).design.backRevision)
    .toBe(before.design.backRevision + 1);
  const rerolledBack = await back.getAttribute('src');
  await page.getByRole('button', { name: 'Diese Karte würfeln', exact: true }).click();
  expect((await saved(page)).design.backRevision).toBe(before.design.backRevision + 1);
  expect(await back.getAttribute('src')).toBe(rerolledBack);
  await page.getByRole('button', { name: 'Zufallstopf', exact: true }).click();
  await page.getByLabel('Anzahl Karten').fill('2');
  await page.getByRole('button', { name: 'Kartenset würfeln', exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).design.backRevision)
    .toBe(before.design.backRevision + 2);
  await expect.poll(async () => (await saved(page)).cards.length).toBe(2);
});
