import { test, expect } from './fixtures';
import { defaultConfig, DECORATION_KINDS } from '../../src/core';
import { PROJECT_STORAGE_KEY } from '../../src/editor/storage';

test.setTimeout(60000);

test('HTML entry, module resources and persistence APIs use the correct content types', async ({
  request,
  baseURL,
}) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  const html = await response.text();
  expect(html).toContain('id="root"');
  const paths = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1]!,
  );
  expect(paths.length).toBeGreaterThan(1);
  for (const path of paths) {
    const url = new URL(path, baseURL);
    expect(url.origin).toBe(new URL(baseURL!).origin);
    const asset = await request.get(url.href);
    expect(asset.status(), path).toBe(200);
    const type = asset.headers()['content-type'];
    expect(type, path).not.toContain('text/html');
    if (url.pathname.endsWith('.css')) expect(type).toContain('text/css');
    else if (url.pathname.endsWith('.svg')) expect(type).toContain('image/svg+xml');
    else expect(type).toContain('javascript');
  }
  const tiles = await request.get('/api/tiles');
  expect(tiles.headers()['content-type']).toContain('application/json');
  expect(Array.isArray(await tiles.json())).toBe(true);
  const models = await request.get('/api/models');
  expect(models.headers()['content-type']).toContain('application/json');
  const ids = ((await models.json()) as { id: string }[]).map((model) => model.id);
  expect(ids).toEqual(expect.arrayContaining([...DECORATION_KINDS]));
  const crystal = await request.get('/models/crystal.json');
  expect(crystal.status()).toBe(200);
  expect(crystal.headers()['content-type']).toContain('application/json');
  expect((await crystal.json()).id).toBe('crystal');
  expect(
    (
      await request.get('/assets/missing-entry-check.js', {
        headers: { Accept: 'application/javascript' },
      })
    ).status(),
  ).toBe(404);
});

for (const path of ['/', '/index.html', '/editor']) {
  test(`entry point ${path} starts the worker and preserves edits through the home link`, async ({
    page,
    request,
    baseURL,
  }) => {
    const errors: string[] = [],
      failedResponses: string[] = [],
      workers: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('worker', (worker) => workers.push(worker.url()));
    await page.goto(path);
    await expect(page).toHaveTitle('Hexa Studio · Tile Editor');
    await expect(page.getByRole('navigation', { name: 'Editor-Ebenen' })).toBeVisible();
    const exportButton = page.getByRole('button', { name: 'PNG exportieren', exact: true });
    await expect(exportButton).toBeEnabled({ timeout: 30000 });
    expect(Number(await page.locator('canvas').getAttribute('data-draw-calls'))).toBeGreaterThan(0);
    expect(workers.length).toBeGreaterThan(0);
    const workerUrl = new URL(workers.at(-1)!);
    expect(workerUrl.origin).toBe(new URL(baseURL!).origin);
    expect((await request.get(workerUrl.href)).headers()['content-type']).toContain('javascript');
    const seed = 'entrypoint-check';
    await page.getByLabel('Seed', { exact: true }).fill(seed);
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.seed,
          PROJECT_STORAGE_KEY,
        ),
      )
      .toBe(seed);
    await page.getByRole('link', { name: 'Hexa Studio Startseite' }).click();
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(page.getByLabel('Seed', { exact: true })).toHaveValue(seed);
    await expect(exportButton).toBeEnabled({ timeout: 30000 });
    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
}

test('pending autosaves survive immediate home navigation and reload', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      Reflect.apply(original, window, [
        handler,
        timeout === 400 ? 60000 : timeout,
        ...args,
      ])) as typeof window.setTimeout;
  });
  await page.goto('/editor');
  const exportButton = page.getByRole('button', { name: 'PNG exportieren', exact: true });
  await expect(exportButton).toBeEnabled({ timeout: 30000 });
  const seed = page.getByLabel('Seed', { exact: true });
  await seed.fill('pending-home-link');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.seed,
      PROJECT_STORAGE_KEY,
    ),
  ).not.toBe('pending-home-link');
  await page.getByRole('link', { name: 'Hexa Studio Startseite' }).click();
  await expect(seed).toHaveValue('pending-home-link');
  await expect(exportButton).toBeEnabled({ timeout: 30000 });
  await seed.fill('pending-reload');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.seed,
      PROJECT_STORAGE_KEY,
    ),
  ).not.toBe('pending-reload');
  await page.reload();
  await expect(seed).toHaveValue('pending-reload');
  await expect(exportButton).toBeEnabled({ timeout: 30000 });
});

test('an invalid browser autosave falls back to a usable default project', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((key) => localStorage.setItem(key, '{broken-json'), PROJECT_STORAGE_KEY);
  await page.goto('/');
  await expect(page.getByLabel('Seed', { exact: true })).toHaveValue(defaultConfig.seed);
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect
    .poll(async () => {
      const value = await page.evaluate((key) => localStorage.getItem(key), PROJECT_STORAGE_KEY);
      try {
        return JSON.parse(value ?? 'null');
      } catch {
        return null;
      }
    })
    .toEqual(defaultConfig);
  expect(errors).toEqual([]);
});

test('an unavailable WebGL context leaves a usable editor with an explicit preview error', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (kind.includes('webgl')) return null;
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('3D-Vorschau nicht verfügbar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNG exportieren', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Objekte Details/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Objekte durchsuchen' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Objekte durchsuchen' }).fill('Bergkristall');
  await expect(page.getByRole('button', { name: 'Bergkristall', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
