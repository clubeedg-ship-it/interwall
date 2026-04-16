import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const STATE_PATH = join(__dirname, '.auth', 'state.json');

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  globalSetup: require.resolve('./fixtures/auth.ts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:1441',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'unauth',
      testMatch: /smoke\.spec\.ts$/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'authenticated',
      testMatch: /(parts-stock-truth|wall-occupancy-truth|profit-summary-truth|batches-truth|health-truth|builds-truth)\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        storageState: STATE_PATH,
      },
    },
  ],
});
