import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, addToSelection, getNode, getNodeCount } from './helpers/scene';

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
