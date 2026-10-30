import { expect, test } from './fixtures';
import { ACTION_PROBABILITIES, SELECTABLE_ACTIONS, defaultConfig } from '../../src/core';
import { importProject, project } from './helpers';

test('edits global base weights and biome bonuses, saves, reloads and rolls without changing existing fields', async ({
  page,
}) => {
  test.setTimeout(90000);
  let probabilities = structuredClone(ACTION_PROBABILITIES);
  let revision = 'a'.repeat(64);
  await page.route('**/api/action-probabilities', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as {
        expectedRevision: string;
        probabilities: typeof probabilities;
      };
      expect(input.expectedRevision).toBe(revision);
      probabilities = input.probabilities;
      revision = 'b'.repeat(64);
    }
    await route.fulfill({ json: { version: 1, revision, probabilities } });
  });
  const config = structuredClone(defaultConfig);
  config.decoration.enabled = false;
  config.actions.biome = 'mosslight';
  await page.goto('/');
  await importProject(page, config);
  const quick = page.getByRole('complementary', { name: 'Schnellaktionen' });
  await quick.getByRole('button', { name: 'Wahrscheinlichkeiten bearbeiten', exact: true }).click();
  const table = quick.getByRole('table', { name: 'Globale Aktionswahrscheinlichkeiten' });
  await expect(table.getByLabel('Basisgewicht Gold')).toBeEnabled();
  const before = await project(page);
  for (const { id, label } of SELECTABLE_ACTIONS)
    await table
      .getByLabel(`Basisgewicht ${label}`, { exact: true })
      .fill(id === 'gold' ? '100' : '0');
  await table.getByLabel('Biom-Bonus Gold in Prozent', { exact: true }).fill('125');
  await expect(table.locator('[data-action="gold"] td:last-child')).toHaveText('100.0 %');
  expect(await project(page)).toEqual(before);
  await quick.getByRole('button', { name: 'Verteilung speichern', exact: true }).click();
  await expect(quick.getByText('Global gespeichert.', { exact: false })).toBeVisible();
  expect(await project(page)).toEqual(before);
  await page.reload();
  await quick.getByRole('button', { name: 'Wahrscheinlichkeiten bearbeiten', exact: true }).click();
  await expect(table.getByLabel('Basisgewicht Gold')).toHaveValue('100');
  await expect(table.getByLabel('Biom-Bonus Gold in Prozent')).toHaveValue('125');
  await quick.getByRole('button', { name: 'Alle Aktionen würfeln', exact: true }).click();
  await expect
    .poll(async () => (await project(page)).actions.revision)
    .toBe(before.actions.revision + 1);
  const rolled = await project(page);
  expect(rolled.actions.distribution).toEqual(probabilities);
  expect(rolled.paths.fields.every((field) => field.action === 'gold')).toBe(true);
  expect(rolled.terrain).toEqual(before.terrain);
  expect(rolled.center).toEqual(before.center);
  expect(rolled.decoration).toEqual(before.decoration);
  await page.getByLabel('Rückgängig', { exact: true }).click();
  await expect.poll(() => project(page)).toEqual(before);
  await page.screenshot({ path: 'working/action-probability-editor.png' });
});

test('rejects all-zero drafts and shows save failures without losing entered weights', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.route('**/api/action-probabilities', async (route) => {
    await route.fulfill(
      route.request().method() === 'GET'
        ? { json: { version: 1, revision: 'c'.repeat(64), probabilities: ACTION_PROBABILITIES } }
        : { status: 409, json: { error: 'Die globale Verteilung wurde inzwischen geändert.' } },
    );
  });
  await page.goto('/');
  const quick = page.getByRole('complementary', { name: 'Schnellaktionen' });
  await quick.getByRole('button', { name: 'Wahrscheinlichkeiten bearbeiten', exact: true }).click();
  const table = quick.getByRole('table', { name: 'Globale Aktionswahrscheinlichkeiten' });
  await expect(table.getByLabel('Basisgewicht Gold')).toBeEnabled();
  for (const { label } of SELECTABLE_ACTIONS)
    await table.getByLabel(`Basisgewicht ${label}`, { exact: true }).fill('0');
  await expect(
    quick.getByRole('button', { name: 'Verteilung speichern', exact: true }),
  ).toBeDisabled();
  await expect(quick.getByRole('alert')).toContainText('positives Basisgewicht');
  await table.getByLabel('Basisgewicht Gold').fill('88');
  await quick.getByRole('button', { name: 'Verteilung speichern', exact: true }).click();
  await expect(quick.getByRole('alert')).toContainText('inzwischen geändert');
  await expect(table.getByLabel('Basisgewicht Gold')).toHaveValue('88');
  await quick.getByRole('button', { name: 'Globale Verteilung neu laden', exact: true }).click();
  await quick.getByRole('button', { name: 'Änderungen verwerfen', exact: true }).click();
  await expect(table.getByLabel('Basisgewicht Gold')).toHaveValue('12');
});
