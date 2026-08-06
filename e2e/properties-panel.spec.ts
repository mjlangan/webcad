import { test, expect } from '@playwright/test';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNode } from './helpers/scene';
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

test('editing Scale X updates the stored scale', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await setNumField(page, 'prop-scale-x', 2);

  const node = await getNode(page, id);
  expect(node!.transform.scale[0]).toBeCloseTo(2, 5);
});

test('editing box Geometry W resizes it', async ({ page }) => {
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await setNumField(page, 'prop-geometry-box-w', 50);

  const geometry = (await getNode(page, id))!.geometry;
  expect(geometry.type).toBe('box');
  expect((geometry as { width: number }).width).toBe(50);
});
