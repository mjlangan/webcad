import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, selectNode, addToSelection } from './helpers/scene';
import { setNumField } from './helpers/properties';

// Regression test for a real bug report: union(cone, wedge), then subtract that
// union from a cylinder, then edit the cone (nested two CSG levels deep) via the
// Scene panel tree. The cone's auto-recompute updated the *union* result's own
// node — and updateCsgResult unconditionally set visible:true on a successful
// recompute, ignoring that the union was itself an adopted (hidden) child of the
// outer subtract. The union popped back into view, showing the un-subtracted
// cone+wedge shape floating alongside the (still-correct) final result, with no
// UI control to hide it again (CSG children don't get a visibility toggle).
test('editing a shape nested two CSG levels deep does not re-reveal the intermediate result', async ({ page }) => {
  await gotoReady(page);

  const idCylinder = await addPrimitive(page, 'cylinder');
  const idCone = await addPrimitive(page, 'cone');
  await selectNode(page, idCone);
  await setNumField(page, 'prop-position-x', 8);

  const idWedge = await addPrimitive(page, 'wedge');
  await selectNode(page, idWedge);
  await setNumField(page, 'prop-position-z', 8);

  // Union cone + wedge
  await selectNode(page, idCone);
  await addToSelection(page, idWedge);
  await page.getByTestId('toolbar-boolean-union').click();
  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
    { timeout: 15_000 },
  ).toBe('idle');

  let nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const unionResult = nodes.find((n) => n.childIds.includes(idCone) && n.childIds.includes(idWedge))!;
  const meshIdBefore = (unionResult.geometry as { meshId: string }).meshId;

  // Subtract the union result from the cylinder
  await selectNode(page, idCylinder);
  await addToSelection(page, unionResult.id);
  await page.getByTestId('toolbar-boolean-subtract').click();
  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
    { timeout: 15_000 },
  ).toBe('idle');

  nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  expect(nodes.find((n) => n.id === unionResult.id)!.visible).toBe(false);

  // Expand tree rows to reach the cone (nested 2 levels deep) and select it.
  // Leaf nodes (e.g. the cylinder) render a non-functional ".-noop" switcher
  // placeholder, so exclude those to land on the real expand arrows.
  const switchers = page.locator('.ant-tree-switcher:not(.ant-tree-switcher-noop)');
  await switchers.nth(0).click();
  await expect(page.getByTestId(`scene-node-${unionResult.id}`)).toBeVisible();
  await switchers.nth(1).click();
  await expect(page.getByTestId(`scene-node-${idCone}`)).toBeVisible();
  await selectNode(page, idCone);
  await setNumField(page, 'prop-position-y', 2);

  // Wait for the debounced auto-recompute of the union to actually complete.
  await expect.poll(async () => {
    const n = await page.evaluate(
      (id) => window.__E2E__!.store.getState().nodes.find((x) => x.id === id),
      unionResult.id,
    );
    return (n!.geometry as { meshId: string }).meshId;
  }, { timeout: 15_000 }).not.toBe(meshIdBefore);

  const unionFinal = (await page.evaluate(
    (id) => window.__E2E__!.store.getState().nodes.find((x) => x.id === id),
    unionResult.id,
  ))!;
  expect(unionFinal.visible).toBe(false);
});
