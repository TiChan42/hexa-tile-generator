import { test as base } from '@playwright/test';
import { ACTION_PROBABILITIES } from '../../src/core/action-probabilities';

/** Browser checks use their own settings; the developer's saved global balance stays independent. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/action-probabilities', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({
          status: 405,
          json: { error: 'Global settings writes require a test-specific route.' },
        });
        return;
      }
      await route.fulfill({
        json: { version: 1, revision: '0'.repeat(64), probabilities: ACTION_PROBABILITIES },
      });
    });
    await use(page);
  },
});
export { expect } from '@playwright/test';
