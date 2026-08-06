import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNodeCount } from './helpers/scene';
import { stubOutFileSystemAccessApi, acceptAllDialogs } from './helpers/dialogs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Save falls back to prompt + Blob download when the File System Access API is unavailable', async ({ page }) => {
  await stubOutFileSystemAccessApi(page);
  await gotoReady(page);
  await addPrimitive(page, 'box');

  page.once('dialog', (d) => { void d.accept('my-scene'); }); // window.prompt('Save as:', ...)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('toolbar-file-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('my-scene.webcad');
});

test('Open loads a .webcad file, replacing the current scene', async ({ page }) => {
  acceptAllDialogs(page); // openProject() always confirms before replacing the scene
  await gotoReady(page);
  await addPrimitive(page, 'box');
  await addPrimitive(page, 'sphere');
  expect(await getNodeCount(page)).toBe(2);

  await page.getByTestId('toolbar-open-file-input').setInputFiles(
    path.join(__dirname, 'fixtures', 'sample-scene.webcad'),
  );

  await expect.poll(() => getNodeCount(page)).toBe(1);
  await expect(page.getByText('Fixture Box')).toBeVisible();
});
