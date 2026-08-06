import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNodeCount } from './helpers/scene';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

for (const file of ['cube.obj', 'cube.3mf']) {
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
