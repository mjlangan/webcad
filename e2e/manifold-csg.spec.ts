import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, selectNode, addToSelection } from './helpers/scene';
import { setNumField } from './helpers/properties';
import { countNonManifoldEdges } from './helpers/manifold';

interface MeshLike {
  userData: { nodeId?: string };
  isMesh?: boolean;
  geometry?: { attributes: { position: { array: ArrayLike<number> } } };
}

/** Reads the live position array of the mesh backing the given scene node. */
async function getNodePositions(page: import('@playwright/test').Page, nodeId: string): Promise<number[] | null> {
  return page.evaluate((id) => {
    let found: MeshLike | null = null;
    window.__E2E__!.three!.scene.traverse((obj) => {
      const m = obj as unknown as MeshLike;
      if (!found && m.isMesh && m.userData.nodeId === id) found = m;
    });
    if (!found || !(found as MeshLike).geometry) return null;
    return Array.from((found as MeshLike).geometry!.attributes.position.array);
  }, nodeId);
}

// Regression test for a real-world bug: an STL exported after CSG-subtracting
// cylinders from a shape came out with non-manifold "open edges" that a slicer
// (Bambu Studio) had to repair. Root cause was the old three-bvh-csg-based
// worker producing T-junction defects at curved cut boundaries — fixed by
// migrating the CSG worker to manifold-3d, which explicitly welds coincident
// vertices and rejects genuinely non-manifold results outright.
test('CSG subtract of a cylinder from a box produces a watertight (manifold) result', async ({ page }) => {
  await gotoReady(page);

  const idBox = await addPrimitive(page, 'box');
  const idCyl = await addPrimitive(page, 'cylinder');

  // Make the cylinder taller than the box so it pierces all the way through,
  // producing a genuine curved through-hole cut boundary — the shape of the
  // original bug report, rather than a cut that stays fully inside one face.
  // Shrink its radius below the box's default 10mm half-width so the hole's
  // wall has real clearance from the box's side faces — at the default 10mm
  // radius the cylinder is exactly tangent to the box's 4 vertical edges,
  // a degenerate configuration that would confuse any CSG kernel and isn't
  // representative of the bug being regression-tested here.
  await selectNode(page, idCyl);
  await setNumField(page, 'prop-geometry-cylinder-height', 40);
  await setNumField(page, 'prop-geometry-cylinder-radius', 6);

  await selectNode(page, idBox);
  await addToSelection(page, idCyl);
  await page.getByTestId('toolbar-boolean-subtract').click();

  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
    { timeout: 15_000 },
  ).toBe('idle');

  const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const resultNode = nodes.find((n) => n.childIds.includes(idBox) && n.childIds.includes(idCyl));
  expect(resultNode).toBeDefined();

  const positions = await getNodePositions(page, resultNode!.id);
  expect(positions).not.toBeNull();
  expect(positions!.length).toBeGreaterThan(0);

  expect(countNonManifoldEdges(positions!)).toBe(0);
});
