import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode, selectNode } from './helpers/scene';
import { setNumField } from './helpers/properties';
import { worldToPage, dragMouse } from './helpers/gizmo';

// Box geometry is bottom-aligned (buildGeometry translates it up by height/2): local X/Z
// are centered (±10 for a 20mm box) but local Y runs from 0 (the pivot, at the bottom
// face) to +20. So a box's real corner vertices have Y ∈ {pivot.y, pivot.y+20}, never
// pivot.y+10 — the mistake that broke this spec's first draft.
//
// Sets up box A at (0,0,10) and box B at (50,0,0): B's bottom face has a real corner at
// exactly (40,0,10) (50-10, bottom=0, 0+10), reachable from A's start by moving purely
// along world X. Returns A's id; leaves A selected in translate mode.
async function setupTwoBoxes(page: import('@playwright/test').Page) {
  const idA = await addPrimitive(page, 'box');
  await setNumField(page, 'prop-position-z', 10);

  await addPrimitive(page, 'box'); // idB, now selected
  await setNumField(page, 'prop-position-x', 50);

  await selectNode(page, idA);
  await page.getByTestId('toolbar-transform-translate').click();
  return idA;
}

const GRAB_OFFSET_X = 20; // world units along +X from A's pivot — lands on the X-axis arrow
const PIXEL_SLOP = 6; // deliberate aim imprecision, in screen px — comfortably inside VERTEX_SNAP_PX (20)

/**
 * Dragging a gizmo arrow moves the pivot by the same world-space delta as the mouse (the
 * point you grab stays under the cursor) — it does not snap the pivot to wherever you aim.
 * So landing the pivot exactly on a target vertex means aiming at (target + grabOffset),
 * then nudging the resulting *pixel* a little to create controlled imprecision.
 */
async function computeAim(page: import('@playwright/test').Page, targetX: number, y: number, z: number) {
  const exact = await worldToPage(page, targetX + GRAB_OFFSET_X, y, z);
  return { x: exact.x + PIXEL_SLOP, y: exact.y + PIXEL_SLOP };
}

test('vertex snap pulls the dragged object exactly onto a nearby vertex', async ({ page }) => {
  await gotoReady(page);
  const idA = await setupTwoBoxes(page);
  await page.getByTestId('toolbar-snap-verts').click();

  const grab = await worldToPage(page, GRAB_OFFSET_X, 0, 10);
  const aim = await computeAim(page, 40, 0, 10); // B's real corner (40,0,10)

  await dragMouse(page, grab, aim);

  const node = await getNode(page, idA);
  expect(node!.transform.position[0]).toBeCloseTo(40, 3);
  expect(node!.transform.position[1]).toBeCloseTo(0, 3);
  expect(node!.transform.position[2]).toBeCloseTo(10, 3);
});

test('without vertex snap enabled, the same imprecise drag does not land exactly on the vertex', async ({ page }) => {
  await gotoReady(page);
  const idA = await setupTwoBoxes(page);
  // Vertex snap left off (default).

  const grab = await worldToPage(page, GRAB_OFFSET_X, 0, 10);
  const aim = await computeAim(page, 40, 0, 10);

  await dragMouse(page, grab, aim);

  const node = await getNode(page, idA);
  expect(node!.transform.position[0]).not.toBeCloseTo(40, 3);
});
