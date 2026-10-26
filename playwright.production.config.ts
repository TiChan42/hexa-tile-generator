import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = '4174';
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'npm start',
    env: { PORT: port },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
