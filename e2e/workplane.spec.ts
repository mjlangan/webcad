import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode } from './helpers/scene';
import { worldToPage, dragMouse, gizmoYArmPoint, GIZMO_SIZE } from './helpers/gizmo';
import { setNumField } from './helpers/properties';

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

  await page.getByTestId('scene-node-reference-plane').click();
  await page.getByTestId('prop-workplane-reset').click();
  const reset = await page.evaluate(() => window.__E2E__!.store.getState().workplane);
  expect(reset.origin).toEqual([0, 0, 0]);
  expect(reset.normal).toEqual([0, 1, 0]);
});

test('workplane origin field moves the workplane along its normal', async ({ page }) => {
  await gotoReady(page);

  await page.getByTestId('scene-node-reference-plane').click();
  await setNumField(page, 'prop-origin-y', 25); // default workplane normal is world +Y

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

test('single-axis Y drag does not snap X/Z onto a non-default workplane (face-aligned cylinder)', async ({ page }) => {
  await gotoReady(page);

  const id = await addPrimitive(page, 'cylinder');
  const spawned = (await getNode(page, id))!;
  const geo = spawned.geometry as { radiusTop: number; height: number };
  const radius = geo.radiusTop;

  // Pick the point on the curved side that directly faces the camera (dead-center
  // of the visible silhouette), to avoid grazing/tangent hits near segment edges.
  const camDir = await page.evaluate(() => {
    const cam = window.__E2E__!.three!.camera;
    const len = Math.hypot(cam.position.x, cam.position.z);
    return { x: cam.position.x / len, z: cam.position.z / len };
  });
  const sideWorld: [number, number, number] = [camDir.x * radius, geo.height / 2, camDir.z * radius];

  // Set the workplane on the curved side of the cylinder.
  await page.getByTestId('toolbar-workplane-set-plane').click();
  const sidePoint = await worldToPage(page, ...sideWorld);
  await page.mouse.click(sidePoint.x, sidePoint.y);
  const workplane = await page.evaluate(() => window.__E2E__!.store.getState().workplane);
  expect(workplane.normal[0]).toBeCloseTo(camDir.x, 1);
  expect(workplane.normal[2]).toBeCloseTo(camDir.z, 1);
  expect(Math.abs(workplane.normal[1])).toBeLessThan(0.05);

  // Face-align the cylinder's top cap flush with that side workplane.
  await page.getByTestId('toolbar-workplane-face-align').click();
  const topPoint = await worldToPage(page, 0, geo.height, 0);
  await page.mouse.click(topPoint.x, topPoint.y);

  const before = (await getNode(page, id))!.transform.position;

  // Grab the world-Y translate arrow (world-space gizmo) and drag purely along +Y.
  const grab = await gizmoYArmPoint(page, before);
  const grabPage = await worldToPage(page, ...grab.world);
  const dropWorld: [number, number, number] = [before[0], before[1] + 0.24 * grab.factor, before[2]];
  const dropPage = await worldToPage(page, ...dropWorld);
  await dragMouse(page, grabPage, dropPage);

  const after = (await getNode(page, id))!.transform.position;

  expect(Math.abs(after[1] - before[1])).toBeGreaterThan(1); // Y actually moved
  expect(after[0]).toBeCloseTo(before[0], 1); // X unchanged
  expect(after[2]).toBeCloseTo(before[2], 1); // Z unchanged
});

test('planar/free translate drag does not snap the object back onto a tilted workplane', async ({ page }) => {
  await gotoReady(page);

  // Tilt and offset the workplane so it no longer passes through the world origin
  // along the world Y axis, then spawn a box directly on it (workplaneSpawn places
  // new nodes exactly on the active plane).
  await page.getByTestId('scene-node-reference-plane').click();
  await setNumField(page, 'prop-origin-y', 30);
  await setNumField(page, 'prop-rotation-x', 30);
  const workplane = await page.evaluate(() => window.__E2E__!.store.getState().workplane);

  const id = await addPrimitive(page, 'box');
  // Close the Shape Library drawer — its open/close CSS transition resizes the
  // viewport canvas, and computing screen coordinates while that's still settling
  // produces stale projections that don't match the eventually-rendered frame.
  await page.getByTestId('shape-library-handle').click();
  await expect(page.getByTestId('shape-library-list')).toBeHidden();

  const before = (await getNode(page, id))!.transform.position;

  const distToPlane = (p: [number, number, number]) =>
    (p[0] - workplane.origin[0]) * workplane.normal[0] +
    (p[1] - workplane.origin[1]) * workplane.normal[1] +
    (p[2] - workplane.origin[2]) * workplane.normal[2];
  expect(Math.abs(distToPlane(before))).toBeLessThan(0.5); // spawned flush on the plane

  // Grab the XZ planar handle (a diagonal world-space offset in X and Z together,
  // calibrated against a plain box to reliably land on that handle's picker rather
  // than a single-axis arrow) and drag it further along the same diagonal. Moving
  // in X/Z is generally NOT coplanar with a workplane tilted about the X axis, so
  // if the object gets snapped back onto the workplane, dist-to-plane stays ~0.
  const factor = await page.evaluate((p) => {
    const cam = window.__E2E__!.three!.camera;
    const dist = Math.hypot(cam.position.x - p[0], cam.position.y - p[1], cam.position.z - p[2]);
    return dist * Math.min((1.9 * Math.tan((Math.PI * cam.fov) / 360)) / cam.zoom, 7);
  }, before);
  const off = 0.05 * GIZMO_SIZE * factor;
  const grabPage = await worldToPage(page, before[0] + off, before[1], before[2] + off);
  const dropPage = await worldToPage(page, before[0] + 2 * off, before[1], before[2] + 2 * off);
  await dragMouse(page, grabPage, dropPage);

  const after = (await getNode(page, id))!.transform.position;
  expect(after).not.toEqual(before); // it actually moved
  expect(Math.abs(distToPlane(after))).toBeGreaterThan(2); // and was NOT pulled back onto the plane
});
