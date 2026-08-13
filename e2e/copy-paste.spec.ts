import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode, selectNode, addToSelection, getNodeCount } from './helpers/scene';

test('Copy/Paste buttons: disabled states, single-object copy+paste, undo', async ({ page }) => {
  await gotoReady(page);

  const copyBtn = page.getByTestId('toolbar-copy');
  const pasteBtn = page.getByTestId('toolbar-paste');

  await expect(copyBtn).toBeDisabled();
  await expect(pasteBtn).toBeDisabled();

  const id = await addPrimitive(page, 'box');
  await expect(copyBtn).toBeEnabled();
  await expect(pasteBtn).toBeDisabled();

  await copyBtn.click();
  await expect(pasteBtn).toBeEnabled();

  expect(await getNodeCount(page)).toBe(1);
  await pasteBtn.click();
  expect(await getNodeCount(page)).toBe(2);

  const nodeIds = await page.evaluate(() => window.__E2E__!.store.getState().nodes.map((n) => n.id));
  const pastedId = nodeIds.find((n) => n !== id)!;
  const original = (await getNode(page, id))!;
  const pasted = (await getNode(page, pastedId))!;

  expect(pasted.name).toBe(`${original.name} (copy)`);
  expect(pasted.transform.position[0]).toBeCloseTo(original.transform.position[0], 3);
  expect(pasted.transform.position[1]).toBeCloseTo(original.transform.position[1], 3);
  expect(pasted.transform.position[2]).toBeCloseTo(original.transform.position[2], 3);

  // Pasted node should be selected
  const selectedIds = await page.evaluate(() => window.__E2E__!.store.getState().selectedIds);
  expect(selectedIds).toEqual([pastedId]);

  // Undo removes the pasted node
  await page.getByTestId('toolbar-undo').click();
  expect(await getNodeCount(page)).toBe(1);

  // Pasting again re-uses the clipboard (paste count grows independently of copy count)
  await pasteBtn.click();
  await pasteBtn.click();
  expect(await getNodeCount(page)).toBe(3);
});

test('Ctrl+C / Ctrl+V keyboard shortcuts, multi-select copy', async ({ page }) => {
  await gotoReady(page);

  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'sphere');
  await selectNode(page, idA);
  await addToSelection(page, idB);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');

  expect(await getNodeCount(page)).toBe(4);
  const selectedIds = await page.evaluate(() => window.__E2E__!.store.getState().selectedIds);
  expect(selectedIds).toHaveLength(2);
  for (const id of selectedIds) {
    expect([idA, idB]).not.toContain(id);
  }
});

test('Copying a group pastes the group with its children intact', async ({ page }) => {
  await gotoReady(page);

  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'sphere');
  await selectNode(page, idA);
  await addToSelection(page, idB);
  await page.getByTestId('toolbar-group').click();

  const groupId = (await page.evaluate(() => window.__E2E__!.store.getState().selectedIds))[0];
  const group = (await getNode(page, groupId))!;
  expect(group.geometry.type).toBe('group');
  expect(group.childIds).toHaveLength(2);

  expect(await getNodeCount(page)).toBe(3); // box, sphere, group

  await page.getByTestId('toolbar-copy').click();
  await page.getByTestId('toolbar-paste').click();

  expect(await getNodeCount(page)).toBe(6); // + pasted group and its 2 pasted children

  const selectedIds = await page.evaluate(() => window.__E2E__!.store.getState().selectedIds);
  expect(selectedIds).toHaveLength(1);
  const pastedGroup = (await getNode(page, selectedIds[0]))!;
  expect(pastedGroup.geometry.type).toBe('group');
  expect(pastedGroup.id).not.toBe(groupId);
  expect(pastedGroup.childIds).toHaveLength(2);
  expect(pastedGroup.name).toBe(`${group.name} (copy)`);
  expect(pastedGroup.transform.position[0]).toBeCloseTo(group.transform.position[0], 3);

  for (const childId of pastedGroup.childIds) {
    const child = (await getNode(page, childId))!;
    expect(child.parentId).toBe(pastedGroup.id);
    expect([idA, idB]).not.toContain(child.id);
  }
});
