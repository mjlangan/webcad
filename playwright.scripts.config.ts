import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Separate config for one-off/dev scripts (e.g. thumbnail generation) that
// reuse Playwright + the E2E bridge to drive the real app, but aren't part
// of the regular test suite (playwright.config.ts's testDir is `./e2e`,
// which intentionally excludes `./scripts`).
export default defineConfig({
  testDir: './scripts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build:e2e && npm run preview -- --outDir dist-e2e --port 4173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
