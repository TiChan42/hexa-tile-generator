import { defineConfig, devices } from '@playwright/test';

const gpuBackend =
  process.platform === 'darwin' && !process.env.CI && process.env.PLAYWRIGHT_SOFTWARE_GPU !== '1'
    ? 'metal'
    : 'swiftshader';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // GPU timing checks share the renderer; keep suites serial across spec files too.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', `--use-angle=${gpuBackend}`, '--enable-webgl'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
