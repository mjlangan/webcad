import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 }, // waitForFunction/expect.poll against store+RAF state needs slack
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined, // start conservative under SwiftShader; loosen once the suite has a track record
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Required for a WebGL context in headless Chromium — confirmed firsthand: without these,
          // THREE.WebGLRenderer throws "Error creating WebGL context" and the app crashes to its error boundary.
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
    // Builds against the real production bundle shape (workers included) rather than the
    // dev server, in its own --mode e2e / --outDir so it never collides with `npm run build`'s
    // `dist/` output used for the actual GitHub Pages deploy.
    command: 'npm run build:e2e && npm run preview -- --outDir dist-e2e --port 4173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
