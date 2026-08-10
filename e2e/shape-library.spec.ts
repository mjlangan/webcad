import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';

test('a shown tooltip does not intercept clicks aimed at whatever is beneath it', async ({ page }) => {
  await gotoReady(page);
  await page.getByTestId('shape-library-handle').click();

  await page.getByTestId('toolbar-add-cylinder').hover();
  // The drawer-handle tooltip ("Close shape library") can still be mid-fade-out,
  // so scope specifically to the "Add Cylinder" one we just triggered.
  const tooltip = page.locator('.ant-tooltip', { hasText: 'Add Cylinder' }).first();
  await tooltip.waitFor({ state: 'visible' });

  const box = await tooltip.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;

  // Hit-test at the tooltip's own on-screen position: with pointer-events:none
  // this resolves to whatever real element is underneath; without it, the
  // browser returns the tooltip itself (or a descendant), which is exactly
  // what silently swallows the click in the reported bug (densely packed
  // shape-library tiles where a tooltip lingers over the neighboring tile).
  const topElementIsTooltip = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return !!el?.closest('.ant-tooltip');
  }, [x, y]);

  expect(topElementIsTooltip).toBe(false);
});
