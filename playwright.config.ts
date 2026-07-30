import { defineConfig, devices } from '@playwright/test';

const PORT = 4351;
const BASE = '/crypto-lab-dp-noise/';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // The sweep drives every exhibit and scans a dozen states per theme; the
  // exact samplers behind the histograms are genuinely slower than a static
  // page, and slower still on a shared CI runner.
  timeout: 240_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    colorScheme: 'dark',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
