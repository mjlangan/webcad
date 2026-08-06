import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';

test('app boots, WebGL context is live, empty-state UI renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await gotoReady(page);

  await expect(page.locator('canvas.viewport-canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__E2E__!.three !== null)).toBe(true);
  await expect(page.getByText('Select an object to edit its properties.')).toBeVisible();
  expect(errors).toEqual([]);
});
