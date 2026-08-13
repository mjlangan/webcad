import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';

test('manifold-3d WASM loads and runs a boolean op inside a Vite-bundled worker', async ({ page }) => {
  await gotoReady(page);
  const result = await page.evaluate(() => window.__E2E__!.runManifoldSpike());
  expect(result).toEqual({ success: true, triangleCount: expect.any(Number), vertCount: expect.any(Number) });
});
