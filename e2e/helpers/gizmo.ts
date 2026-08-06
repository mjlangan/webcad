import type { Page } from '@playwright/test';

/** Projects a world-space point (via the app's live camera) to page pixel coordinates. */
export async function worldToPage(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  const pt = await page.evaluate(([x, y, z]) => window.__E2E__!.worldToPagePx(x, y, z), [x, y, z]);
  if (!pt) throw new Error('worldToPagePx: three setup not ready');
  return pt;
}

export async function dragMouse(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Center (in page px) of the main viewport canvas. */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas.viewport-canvas').boundingBox();
  if (!box) throw new Error('viewport canvas has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
