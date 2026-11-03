import { defineConfig, devices } from '@playwright/test';
import { DEMO_URL, REAL_URL } from './support/constants';

export default defineConfig({
  testDir: './tests',
  // The backend allows a single active call at a time, so tests run serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: 'npx tsx support/server.ts',
    url: `${REAL_URL}/api/health`,
    reuseExistingServer: false,
    stdout: 'pipe',
    timeout: 30_000,
  },
  metadata: { demoUrl: DEMO_URL, realUrl: REAL_URL },
});
