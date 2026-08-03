import { defineConfig, devices } from '@playwright/test';

const PORT = 4627;
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
    // Build first: `vite preview` only serves whatever is already in `dist/`.
    // Without the build, a source change that fails to compile leaves the last
    // good bundle in place and the suite passes green against code that no
    // longer builds — which silently invalidates mutation checks.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
