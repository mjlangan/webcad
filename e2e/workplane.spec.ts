import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode } from './helpers/scene';
import { worldToPage } from './helpers/gizmo';
import { setNumField, setToolbarNumber } from './helpers/properties';

test('Set Plane on a face updates the workplane origin/normal, then Reset Plane restores default', async ({ page }) => {
  await gotoReady(page);
  // 20mm box at the origin, centered in X/Z, bottom-aligned in Y (spans y:[0,20]) —
  // the +X face center is at (10, 10, 0), not (10, 0, 0) which sits on the shared
  // edge with the bottom face and can miss the raycast depending on exact pixel rounding.
  await addPrimitive(page, 'box');

  await page.getByTestId('toolbar-workplane-set-plane').click();
  const facePoint = await worldToPage(page, 10, 10, 0);
  await page.mouse.click(facePoint.x, facePoint.y);

  const workplane = await page.evaluate(() => window.__E2E__!.store.getState().workplane);
  expect(workplane.origin[0]).toBeCloseTo(10, 0);
  expect(Math.abs(workplane.normal[0])).toBeCloseTo(1, 1);
  expect(await page.evaluate(() => window.__E2E__!.store.getState().workplanePlacementMode)).toBe(false);

  await page.getByTestId('toolbar-workplane-reset-plane').click();
  const reset = await page.evaluate(() => window.__E2E__!.store.getState().workplane);
  expect(reset.origin).toEqual([0, 0, 0]);
  expect(reset.normal).toEqual([0, 1, 0]);
});

test('workplane offset input moves the workplane along its normal', async ({ page }) => {
  await gotoReady(page);

  await setToolbarNumber(page, 'toolbar-workplane-offset-1', 25); // default workplane normal is world +Y

  const workplane = await page.evaluate(() => window.__E2E__!.store.getState().workplane);
  expect(workplane.origin[1]).toBeCloseTo(25, 3);
});

test('Drop moves a selected object down onto the workplane surface', async ({ page }) => {
  await gotoReady(page);
  // Box geometry is bottom-aligned (buildGeometry translates it up by height/2), so the
  // pivot Y IS the bottom face already — dropping onto the default y=0 workplane always
  // lands the pivot at exactly y=0, regardless of where it started.
  const id = await addPrimitive(page, 'box');
  await setNumField(page, 'prop-position-y', 50);

  await expect(page.getByTestId('toolbar-workplane-drop')).toBeEnabled();
  await page.getByTestId('toolbar-workplane-drop').click();

  const node = await getNode(page, id);
  expect(node!.transform.position[1]).toBeCloseTo(0, 3);
});
