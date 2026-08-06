import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { worldToPage } from './helpers/gizmo';

test('measuring two points on the workplane shows the correct distance, Escape exits', async ({ page }) => {
  await gotoReady(page);

  await page.getByTestId('toolbar-measure-distance').click();
  expect(await page.evaluate(() => window.__E2E__!.store.getState().measureMode)).toBe(true);

  // Two points on the default workplane (world XZ plane, y=0) — 20mm apart.
  const p1 = await worldToPage(page, 0, 0, 0);
  const p2 = await worldToPage(page, 20, 0, 0);
  await page.mouse.click(p1.x, p1.y);
  await page.mouse.click(p2.x, p2.y);

  const label = page.getByTestId('measure-label');
  await expect(label).toBeVisible();
  const text = await label.textContent();
  const value = parseFloat(text ?? '');
  expect(value).toBeCloseTo(20, 0);

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__E2E__!.store.getState().measureMode)).toBe(false);
});
