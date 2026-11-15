import { defineConfig, devices } from '@playwright/test';

const localUrl = 'http://127.0.0.1:4174';
const externalUrl = process.env.QA_GAME_URL;

export default defineConfig({
  testDir: '.',
  testMatch: '*.browser.e2e.ts',
  timeout: 35_000,
  expect: { timeout: 8_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './artifacts/report', open: 'never' }]],
  outputDir: './artifacts/results',
  use: {
    baseURL: externalUrl ?? localUrl,
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    channel: process.env.QA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalUrl ? undefined : {
    command: 'corepack pnpm dev --host 127.0.0.1 --port 4174 --strictPort',
    url: localUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
