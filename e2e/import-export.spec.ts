import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { gotoReady } from './helpers/app';
import { addPrimitive, addToSelection, selectNode, getNodeCount } from './helpers/scene';
import { setNumField } from './helpers/properties';
import { parseBinaryStl } from './helpers/stl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

for (const file of ['cube.obj', 'cube.3mf', 'cube.stl']) {
  test(`importing ${file} adds a new node to the scene`, async ({ page }) => {
    await gotoReady(page);
    const before = await getNodeCount(page);

    await page.getByTestId('toolbar-import').click();
    // data-* attrs on Upload.Dragger forward straight to its hidden <input type="file">
    // (rc-upload's pickAttrs({ aria: true, data: true })) — the testid IS the input.
    await page.getByTestId('toolbar-import-dragger').setInputFiles(fixture(file));

    await expect.poll(() => getNodeCount(page)).toBe(before + 1);
    const nodes = await page.evaluate(() => window.__E2E__!.store.getState().nodes);
    expect(nodes.at(-1)!.geometry.type).toBe('imported');
  });
}

test('importing an OBJ with no mesh geometry shows an error and adds nothing', async ({ page }) => {
  await gotoReady(page);
  const before = await getNodeCount(page);

  const dialogPromise = page.waitForEvent('dialog');
  await page.getByTestId('toolbar-import').click();
  await page.getByTestId('toolbar-import-dragger').setInputFiles(fixture('empty.obj'));

  const dialog = await dialogPromise;
  expect(dialog.message()).toBe('No mesh geometry found in OBJ file.');
  await dialog.accept();

  expect(await getNodeCount(page)).toBe(before);
});

const EXPORT_CASES: { testId: string; filename: string }[] = [
  { testId: 'toolbar-export-stl', filename: 'export.stl' },
  { testId: 'toolbar-export-obj', filename: 'export.obj' },
  { testId: 'toolbar-export-gltf', filename: 'export.glb' },
  { testId: 'toolbar-export-3mf', filename: 'export.3mf' },
];

for (const { testId, filename } of EXPORT_CASES) {
  test(`exporting as ${filename} triggers a download`, async ({ page }) => {
    await gotoReady(page);
    await addPrimitive(page, 'box');

    await page.getByTestId('toolbar-export').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(testId).click(),
    ]);
    expect(download.suggestedFilename()).toBe(filename);
  });
}

// A 20×20×20 box has 6 faces × 2 triangles = 12 triangles, 36 non-indexed vertices
// (matches the fixtures used by src/lib/exportScene.test.ts's unit tests).
const BOX_TRIANGLES = 12;
const BOX_VERTICES = 36;

test('STL export contains exactly the triangles of a single box', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');

  await page.getByTestId('toolbar-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-export-stl').click(),
  ]);
  const filePath = await download.path();
  const { triangleCount } = parseBinaryStl(fs.readFileSync(filePath!));
  expect(triangleCount).toBe(BOX_TRIANGLES);
});

test('OBJ export contains the correct vertex and face counts for a single box', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');

  await page.getByTestId('toolbar-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-export-obj').click(),
  ]);
  const filePath = await download.path();
  const text = fs.readFileSync(filePath!, 'utf-8');
  const vertexLines = text.split('\n').filter((l) => l.startsWith('v '));
  const faceLines = text.split('\n').filter((l) => l.startsWith('f '));
  expect(vertexLines).toHaveLength(BOX_VERTICES);
  expect(faceLines).toHaveLength(BOX_TRIANGLES);
});

test('3MF export contains the correct vertex and triangle counts for a single box', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');

  await page.getByTestId('toolbar-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-export-3mf').click(),
  ]);
  const filePath = await download.path();
  const zipped = new Uint8Array(fs.readFileSync(filePath!));
  const files = unzipSync(zipped);
  const modelXml = new TextDecoder().decode(files['3D/3dmodel.model']);
  expect(modelXml.match(/<vertex /g) ?? []).toHaveLength(BOX_VERTICES);
  expect(modelXml.match(/<triangle /g) ?? []).toHaveLength(BOX_TRIANGLES);
});

test('exporting a selection excludes unselected objects', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box'); // becomes unselected once the second box is added
  await addPrimitive(page, 'box'); // auto-selected

  // Only the second box is selected at this point (addPrimitive replaces the selection).
  await page.getByTestId('toolbar-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-export-stl').click(),
  ]);
  const filePath = await download.path();
  const { triangleCount } = parseBinaryStl(fs.readFileSync(filePath!));
  // If both boxes were exported (selection scope ignored) this would be 24.
  expect(triangleCount).toBe(BOX_TRIANGLES);
});

test('exporting a selected grouped child bakes the full ancestor-chain world transform (regression: group-export bug)', async ({ page }) => {
  await gotoReady(page);

  const idA = await addPrimitive(page, 'box');
  await addPrimitive(page, 'box'); // idB, auto-selected
  await addToSelection(page, idA); // both selected, same default position → group centroid ≈ origin

  await page.getByTestId('toolbar-group').click();
  const groupId = await page.evaluate(() => {
    const { nodes } = window.__E2E__!.store.getState();
    return nodes.find((n) => n.geometry.type === 'group')!.id;
  });

  // Move the group container far from the origin — its children's LOCAL transforms
  // stay untouched (≈0), so only walking the parent chain reveals the true world position.
  await selectNode(page, groupId);
  await setNumField(page, 'prop-position-x', 100);

  // Export just one grouped child. Before the fix, exportScene.ts's buildWorldGeometry
  // baked only the child's own (near-zero) local transform and ignored the group's
  // +100 offset, so exported vertices would incorrectly still cluster near x=0.
  // Selected via the store directly rather than the ScenePanel tree: the group node
  // didn't exist at initial mount, so its row starts collapsed and its child row
  // isn't in the DOM — irrelevant to what this test is actually verifying (export math).
  await page.evaluate((id) => window.__E2E__!.store.getState().selectNode(id), idA);
  await page.getByTestId('toolbar-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-export-stl').click(),
  ]);
  const filePath = await download.path();
  const { bounds, triangleCount } = parseBinaryStl(fs.readFileSync(filePath!));

  expect(triangleCount).toBe(BOX_TRIANGLES); // exactly the one selected child, not the whole group
  expect(bounds.min.x).toBeGreaterThan(50); // reflects the group's +100 world offset
});
