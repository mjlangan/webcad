import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode } from './helpers/scene';
import { GIZMO_SIZE, canvasCenter } from './helpers/gizmo';

// Calibrated against a plain box's scale-mode gizmo at the default camera
// framing (grabbing along +X from the object's screen center) — lands on the
// single-axis X scale handle's picker, not the uniform-scale cube or a
// planar handle. Scaled by GIZMO_SIZE so it stays correct if that changes.
const GRAB_OFFSET_PX = 21.5 * GIZMO_SIZE;
const DRAG_DISTANCE_PX = 64 * GIZMO_SIZE;

async function dragScaleHandle(page: import('@playwright/test').Page): Promise<void> {
  const { x: cx, y: cy } = await canvasCenter(page);
  await page.mouse.move(cx + GRAB_OFFSET_PX, cy);
  await page.mouse.down();
  await page.mouse.move(cx + GRAB_OFFSET_PX + DRAG_DISTANCE_PX, cy, { steps: 8 });
  await page.mouse.up();
}

test('scale-dragging a box bakes the resize into its dimensions, not a scale multiplier', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box'); // default 20x20x20, Move is the default transform mode
  await page.getByTestId('shape-library-handle').click();
  await expect(page.getByTestId('shape-library-list')).toBeHidden();

  await page.getByTestId('toolbar-transform-scale').click();
  await dragScaleHandle(page);

  const node = await getNode(page, id);
  const geometry = node!.geometry as { width: number; height: number; depth: number };
  // Which handle (single-axis, planar, or uniform) the drag lands on isn't
  // pinned down here — the invariant this is testing is that the resize
  // lands in geometry, not a separate scale multiplier.
  expect([geometry.width, geometry.height, geometry.depth].some((v) => Math.abs(v - 20) > 0.5)).toBe(true);
  // The whole point: scale stays at identity — the Properties panel's W/H/D
  // fields (and this stored geometry) are always the true, effective size.
  expect(node!.transform.scale).toEqual([1, 1, 1]);
});

test('undo after a scale-drag reverts both the dimension and the scale reset together', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');
  await page.getByTestId('shape-library-handle').click();
  await expect(page.getByTestId('shape-library-list')).toBeHidden();

  await page.getByTestId('toolbar-transform-scale').click();
  await dragScaleHandle(page);

  const dragged = await getNode(page, id);
  expect((dragged!.geometry as { width: number }).width).not.toBeCloseTo(20, 1);

  await page.getByTestId('toolbar-undo').click();

  const reverted = await getNode(page, id);
  expect((reverted!.geometry as { width: number }).width).toBeCloseTo(20, 5);
  expect(reverted!.transform.scale).toEqual([1, 1, 1]);
});

test('scale-dragging a sphere (no direct-dimension mapping) still uses transform.scale', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'sphere'); // default radius 10
  await page.getByTestId('shape-library-handle').click();
  await expect(page.getByTestId('shape-library-list')).toBeHidden();

  await page.getByTestId('toolbar-transform-scale').click();
  await dragScaleHandle(page);

  const node = await getNode(page, id);
  expect((node!.geometry as { radius: number }).radius).toBeCloseTo(10, 5);
  expect(node!.transform.scale).not.toEqual([1, 1, 1]);
});
