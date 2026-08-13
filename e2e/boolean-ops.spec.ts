import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, addToSelection, selectNode, getNode, getNodeCount } from './helpers/scene';
import { setNumField } from './helpers/properties';

const OPS: { op: 'union' | 'subtract' | 'intersect' }[] = [
  { op: 'union' }, { op: 'subtract' }, { op: 'intersect' },
];

for (const { op } of OPS) {
  test(`boolean ${op} of two overlapping boxes produces a result node adopting both sources`, async ({ page }) => {
    await gotoReady(page);
    // Default workplane spawn places every primitive at the origin, so these two boxes fully overlap.
    const idA = await addPrimitive(page, 'box');
    const idB = await addPrimitive(page, 'box');
    await addToSelection(page, idA); // idB is already selected from the add; this makes it a 2-selection

    await expect(page.getByTestId(`toolbar-boolean-${op}`)).toBeEnabled();
    await page.getByTestId(`toolbar-boolean-${op}`).click();

    await expect.poll(
      () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
      { timeout: 15_000 },
    ).toBe('idle');

    expect(await getNodeCount(page)).toBe(3); // two sources + one result, sources are adopted (not removed)
    const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
    const resultNode = nodes.find((n) => n.childIds.includes(idA) && n.childIds.includes(idB));
    expect(resultNode).toBeDefined();
    expect(resultNode!.csgOperation).toBe(op);
    expect(resultNode!.geometry.type).toBe('imported');

    const sourceA = await getNode(page, idA);
    expect(sourceA!.parentId).toBe(resultNode!.id);
  });
}

test('boolean union works over more than 2 shapes, while subtract/intersect stay gated to exactly 2', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'box');
  const idC = await addPrimitive(page, 'box');
  await selectNode(page, idA);
  await addToSelection(page, idB);
  await addToSelection(page, idC);

  await expect(page.getByTestId('toolbar-boolean-union')).toBeEnabled();
  await expect(page.getByTestId('toolbar-boolean-subtract')).toBeDisabled();
  await expect(page.getByTestId('toolbar-boolean-intersect')).toBeDisabled();

  await page.getByTestId('toolbar-boolean-union').click();

  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
    { timeout: 15_000 },
  ).toBe('idle');

  expect(await getNodeCount(page)).toBe(4); // three sources + one result
  const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const resultNode = nodes.find((n) => [idA, idB, idC].every((id) => n.childIds.includes(id)));
  expect(resultNode).toBeDefined();
  expect(resultNode!.csgOperation).toBe('union');
  expect(resultNode!.childIds).toHaveLength(3);

  for (const id of [idA, idB, idC]) {
    const source = await getNode(page, id);
    expect(source!.parentId).toBe(resultNode!.id);
    expect(source!.visible).toBe(false);
  }
});

test('a 3-way union auto-recomputes when one of its sources moves', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'box');
  const idC = await addPrimitive(page, 'box');
  await selectNode(page, idA);
  await addToSelection(page, idB);
  await addToSelection(page, idC);
  await page.getByTestId('toolbar-boolean-union').click();
  await expect.poll(
    () => page.evaluate(() => window.__E2E__!.store.getState().csgStatus),
    { timeout: 15_000 },
  ).toBe('idle');

  const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const resultNode = nodes.find((n) => [idA, idB, idC].every((id) => n.childIds.includes(id)))!;
  const meshIdBefore = (resultNode.geometry as { meshId: string }).meshId;

  // The result's tree row isn't auto-expanded (that only happens at mount), so expand it.
  await page.locator('.ant-tree-switcher').first().click();

  await selectNode(page, idC);
  await setNumField(page, 'prop-position-x', 30);

  await expect.poll(async () => {
    const n = await getNode(page, resultNode.id);
    return (n!.geometry as { meshId: string }).meshId;
  }, { timeout: 15_000 }).not.toBe(meshIdBefore);

  const after = await getNode(page, resultNode.id);
  expect(after!.csgError).toBeNull();
});
