import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode, type PrimitiveType } from './helpers/scene';

const CASES: { type: PrimitiveType; sectionTestId: string; checkTestId: string; expected: number }[] = [
  { type: 'box',      sectionTestId: 'section-geometry-box',      checkTestId: 'prop-geometry-box-w',       expected: 20 },
  { type: 'sphere',   sectionTestId: 'section-geometry-sphere',   checkTestId: 'prop-geometry-sphere-radius', expected: 10 },
  { type: 'cylinder', sectionTestId: 'section-geometry-cylinder', checkTestId: 'prop-geometry-cylinder-height', expected: 20 },
  { type: 'cone',     sectionTestId: 'section-geometry-cone',     checkTestId: 'prop-geometry-cone-radius',   expected: 10 },
  { type: 'torus',    sectionTestId: 'section-geometry-torus',    checkTestId: 'prop-geometry-torus-radius',  expected: 10 },
  { type: 'beerglass', sectionTestId: 'section-geometry-beer-glass', checkTestId: 'prop-geometry-beer-glass-r-rim', expected: 37.5 },
];

for (const { type, sectionTestId, checkTestId, expected } of CASES) {
  test(`add ${type}: appears in scene, panel, and store`, async ({ page }) => {
    await gotoReady(page);
    const before = await page.evaluate(() => window.__E2E__!.store.getState().nodes.length);

    const id = await addPrimitive(page, type);

    const after = await page.evaluate(() => window.__E2E__!.store.getState().nodes.length);
    expect(after).toBe(before + 1);

    await expect(page.getByTestId(`scene-node-${id}`)).toBeVisible();
    await expect(page.getByTestId(sectionTestId)).toBeVisible();

    const fieldValue = await page.getByTestId(checkTestId).locator('input').inputValue();
    expect(parseFloat(fieldValue)).toBeCloseTo(expected, 3);

    const node = await getNode(page, id);
    expect(node?.geometry.type).toBe(type);
  });
}
