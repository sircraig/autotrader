import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://192.168.20.20:3000';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  timeout: 20_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
