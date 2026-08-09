import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoReady } from './helpers/app';
import { addPrimitive, getNodeCount } from './helpers/scene';
import {
  stubOutFileSystemAccessApi,
  acceptAllDialogs,
  mockFileSystemAccessApiSave,
  getMockedSavedContent,
} from './helpers/dialogs';

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

test('Save uses the File System Access API directly (no download) when it is available', async ({ page }) => {
  await mockFileSystemAccessApiSave(page);
  await gotoReady(page);
  const id = await addPrimitive(page, 'box');

  await page.getByTestId('toolbar-file-save').click();

  const saved = await getMockedSavedContent(page);
  expect(saved).toBeDefined();
  const payload = JSON.parse(saved!);
  expect(payload.version).toBe(1);
  expect(payload.data.nodes).toHaveLength(1);
  expect(payload.data.nodes[0].id).toBe(id);
});

// openProject() always shows a confirm() before it even reads the file, then (on
// parse/validation failure) an alert() with the error. Auto-accept the confirm so
// we can isolate and read the message of the alert that follows it.
function waitForOpenErrorAlert(page: import('@playwright/test').Page) {
  page.on('dialog', (d) => { if (d.type() === 'confirm') void d.accept(); });
  return page.waitForEvent('dialog', (d) => d.type() === 'alert');
}

test('Open shows an error and leaves the scene unchanged for a non-JSON file', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');
  const before = await getNodeCount(page);

  const alertPromise = waitForOpenErrorAlert(page);
  await page.getByTestId('toolbar-open-file-input').setInputFiles(
    path.join(__dirname, 'fixtures', 'invalid.webcad'),
  );
  const alert = await alertPromise;
  expect(alert.message()).toBe('Failed to open file: invalid JSON.');
  await alert.accept();

  expect(await getNodeCount(page)).toBe(before);
});

test('Open shows an error and leaves the scene unchanged for an unrecognized file version', async ({ page }) => {
  await gotoReady(page);
  await addPrimitive(page, 'box');
  const before = await getNodeCount(page);

  const alertPromise = waitForOpenErrorAlert(page);
  await page.getByTestId('toolbar-open-file-input').setInputFiles(
    path.join(__dirname, 'fixtures', 'wrong-version.webcad'),
  );
  const alert = await alertPromise;
  expect(alert.message()).toBe('Unrecognized file version: 999');
  await alert.accept();

  expect(await getNodeCount(page)).toBe(before);
});
