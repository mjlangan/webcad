import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, addToSelection, getNode, selectNode } from './helpers/scene';

test('grouping two root objects nests them under a new group node', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'sphere');
  await addToSelection(page, idA); // idB already selected from add — now both are selected

  await expect(page.getByTestId('toolbar-group')).toBeEnabled();
  await page.getByTestId('toolbar-group').click();

  const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const groupNode = nodes.find((n) => n.geometry.type === 'group');
  expect(groupNode).toBeDefined();
  expect(groupNode!.childIds.sort()).toEqual([idA, idB].sort());

  const childA = await getNode(page, idA);
  expect(childA!.parentId).toBe(groupNode!.id);
});

test('ungrouping restores children to root with their world transform preserved', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  await addPrimitive(page, 'sphere'); // auto-selected; idA gets added to the selection below
  await addToSelection(page, idA);
  await page.getByTestId('toolbar-group').click();

  const nodesAfterGroup = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
  const groupNode = nodesAfterGroup.find((n) => n.geometry.type === 'group')!;
  const worldPosBefore = (await getNode(page, idA))!.transform.position;

  await selectNode(page, groupNode.id);
  await expect(page.getByTestId('toolbar-ungroup')).toBeEnabled();
  await page.getByTestId('toolbar-ungroup').click();

  const childA = await getNode(page, idA);
  expect(childA!.parentId).toBeNull();
  expect(childA!.transform.position[0]).toBeCloseTo(worldPosBefore[0], 4);
  expect(childA!.transform.position[1]).toBeCloseTo(worldPosBefore[1], 4);
  expect(childA!.transform.position[2]).toBeCloseTo(worldPosBefore[2], 4);
});
