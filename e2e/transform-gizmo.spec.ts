import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode } from './helpers/scene';
import { canvasCenter, worldToPage } from './helpers/gizmo';

test('rotate-drag snaps to the nearest 15° tick when hovering near it', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');
  await page.getByTestId('toolbar-transform-rotate').click();

  // A point in world space that sits on the Y-axis ring (which lies in the XZ plane at
  // the object's position) for the app's default camera framing — grabbing here reliably
  // starts a Y-axis rotate drag without the test needing to re-derive the gizmo's own
  // screen-space ring radius (that's exactly what window.__E2E__.rotateMarkers is for).
  const grab = await worldToPage(page, 25, 0, 0);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  // Small nudge to trigger TransformControls' drag-start (which populates rotateMarkers).
  await page.mouse.move(grab.x, grab.y - 5);

  await page.waitForFunction(() => window.__E2E__!.rotateMarkers !== null);
  const markers = await page.evaluate(() => window.__E2E__!.rotateMarkers!);
  expect(markers).toHaveLength(24); // 360 / 15

  // Aim for the marker closest to +90°.
  const target = markers.reduce((best, m) =>
    Math.abs(m.angleDeg - 90) < Math.abs(best.angleDeg - 90) ? m : best,
  );

  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();

  const node = await getNode(page, id);
  const deg = (node!.transform.rotation[1] * 180) / Math.PI;
  // Snapped to an exact 15° multiple, i.e. no fractional residue.
  expect(Math.abs(deg % 15)).toBeLessThan(0.5);
  // And it actually rotated — not a no-op left at 0.
  expect(Math.abs(deg)).toBeGreaterThan(1);
});

test('translate-drag via the gizmo moves the object (position stays a clean number, not NaN)', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box'); // Move is the default transform mode

  const center = await canvasCenter(page);
  const before = (await getNode(page, id))!.transform.position;

  await page.mouse.move(center.x + 30, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 90, center.y, { steps: 8 });
  await page.mouse.up();

  const after = (await getNode(page, id))!.transform.position;
  expect(after).not.toEqual(before);
  expect(Number.isFinite(after[0]) && Number.isFinite(after[1]) && Number.isFinite(after[2])).toBe(true);
});
