import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode, getNodeCount } from './helpers/scene';
import { setNumField } from './helpers/properties';

// App.tsx's keydown handler ignores shortcuts while an <input>/<textarea> has focus.
// Blur directly rather than clicking the canvas — a canvas click on empty space would
// deselect the current scene node (via raycasting-miss), which we don't want here.
async function blurActiveElement(page: import('@playwright/test').Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('undo/redo round-trips a position edit', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await setNumField(page, 'prop-position-x', 42);
  expect((await getNode(page, id))!.transform.position[0]).toBe(42);

  await blurActiveElement(page);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await getNode(page, id))!.transform.position[0]).toBe(0);

  // Control+y (rather than Control+Shift+Z) — unambiguous redo shortcut per App.tsx's
  // keydown handler, which checks e.key === 'y' directly.
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await getNode(page, id))!.transform.position[0]).toBe(42);
});

test('undo restores a deleted node', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');
  const countAfterAdd = await getNodeCount(page);

  await blurActiveElement(page);
  await page.keyboard.press('Delete');
  await expect.poll(() => getNodeCount(page)).toBe(countAfterAdd - 1);
  expect(await getNode(page, id)).toBeNull();

  await page.keyboard.press('Control+z');
  await expect.poll(() => getNodeCount(page)).toBe(countAfterAdd);
  expect(await getNode(page, id)).not.toBeNull();
});
