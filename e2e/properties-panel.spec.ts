import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, addToSelection, selectNode, getNode } from './helpers/scene';
import { setNumField } from './helpers/properties';

test('editing Position X in the Properties panel moves the object', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box'); // add auto-selects the new node

  await setNumField(page, 'prop-position-x', 42);

  const node = await getNode(page, id);
  expect(node!.transform.position[0]).toBe(42);
});

test('editing Rotation Y in degrees updates the stored radians', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await setNumField(page, 'prop-rotation-y', 45);

  const node = await getNode(page, id);
  expect(node!.transform.rotation[1]).toBeCloseTo(Math.PI / 4, 5);
});

test('editing Scale X updates the stored scale (sphere has no direct-dimension mapping)', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'sphere');

  await setNumField(page, 'prop-scale-x', 2);

  const node = await getNode(page, id);
  expect(node!.transform.scale[0]).toBeCloseTo(2, 5);
});

test('the Scale section is hidden for shapes with direct-dimension scaling, shown for shapes without it', async ({ page }) => {
  await gotoReady(page);

  const boxId = await addPrimitive(page, 'box');
  await selectNode(page, boxId);
  await expect(page.getByTestId('section-scale')).toBeHidden();

  const sphereId = await addPrimitive(page, 'sphere');
  await selectNode(page, sphereId);
  await expect(page.getByTestId('section-scale')).toBeVisible();
});

test('editing box Geometry W resizes it', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await setNumField(page, 'prop-geometry-box-w', 50);

  const geometry = (await getNode(page, id))!.geometry;
  expect(geometry.type).toBe('box');
  expect((geometry as { width: number }).width).toBe(50);
});

test('rename a shape via the Properties panel Name field', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  const nameField = page.getByTestId('prop-name');
  await expect(nameField).toHaveValue('Box 1');

  await nameField.fill('My Renamed Box');
  await nameField.press('Enter');

  const node = await getNode(page, id);
  expect(node!.name).toBe('My Renamed Box');
  await expect(nameField).toHaveValue('My Renamed Box');

  // Undo reverts it
  await page.getByTestId('toolbar-undo').click();
  const after = await getNode(page, id);
  expect(after!.name).toBe('Box 1');
});

test('renaming a group via the Properties panel works too', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'sphere');
  await selectNode(page, idA);
  await addToSelection(page, idB);
  await page.getByTestId('toolbar-group').click();

  const groupId = (await page.evaluate(() => window.__E2E__!.store.getState().selectedIds))[0];
  const nameField = page.getByTestId('prop-name');
  await expect(nameField).toHaveValue('Group 1');

  await nameField.fill('My Group');
  await nameField.blur();

  const node = await getNode(page, groupId);
  expect(node!.name).toBe('My Group');
});

test('Escape reverts an in-progress Name edit without committing', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  const nameField = page.getByTestId('prop-name');
  await nameField.fill('Should not stick');
  await nameField.press('Escape');

  await expect(nameField).toHaveValue('Box 1');
  const node = await getNode(page, id);
  expect(node!.name).toBe('Box 1');
});

test('multi-selection shows a count instead of the Name field', async ({ page }) => {
  await gotoReady(page);
  const idA = await addPrimitive(page, 'box');
  const idB = await addPrimitive(page, 'sphere');
  await selectNode(page, idA);
  await addToSelection(page, idB);

  await expect(page.getByText('2 objects selected')).toBeVisible();
  await expect(page.getByTestId('prop-name')).toBeHidden();
});

test('renaming via double-click in the scene panel stays in sync with the Properties Name field', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  const row = page.getByTestId(`scene-node-${id}`);
  await row.getByText('Box 1', { exact: true }).dblclick();
  const treeInput = row.locator('input');
  await treeInput.fill('Renamed From Tree');
  await treeInput.press('Enter');

  await expect(page.getByTestId('prop-name')).toHaveValue('Renamed From Tree');
});
